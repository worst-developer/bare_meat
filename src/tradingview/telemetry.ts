import type { TradingViewTelemetryMetric, TradingViewTelemetrySnapshot } from '../types';
import { marketSessionStatuses } from './session-clock';
import { telemetryFingerprint } from './telemetry-integrity';

const PRIMARY_INDICATOR_TITLE = 'Market Context Telemetry [Agent]';
const CROSS_INDICATOR_TITLE = 'Agent Context - Cross Market';
const SUPPORTED_SCHEMAS = new Set([1, 2]);
const MIN_PRIMARY_EVIDENCE_ROWS = 10;
const LABEL_PATTERN = /^CTX(?:\|[A-Z0-9_-]+){2,5}$/;
const PRIMARY_EVIDENCE_PREFIXES = [
  'CTX|PRICE|',
  'CTX|LEVEL|',
  'CTX|SESSION|',
  'CTX|VOLATILITY|',
  'CTX|VOL|',
  'CTX|RANGE|',
  'CTX|VP|',
];
const DATA_WINDOW_TIMEOUT_MS = 2000;
export const MANUAL_DATA_WINDOW_TIMEOUT_MS = 15000;

export async function scrapeTradingViewTelemetryWithDataWindow(
  symbol: string,
  timeframe: string,
  timeoutMs = DATA_WINDOW_TIMEOUT_MS
): Promise<TradingViewTelemetrySnapshot | null> {
  await openDataWindowTab();

  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const telemetry = scrapeTradingViewTelemetry(symbol, timeframe);
    if (telemetry) return telemetry;
    await delay(100);
  }

  return null;
}

async function openDataWindowTab(): Promise<void> {
  let tab = findDataWindowTab();
  if (!tab) {
    const launcher = findDataWindowControl();
    if (!launcher) return;
    launcher.click();
    await delay(300);
    tab = findDataWindowTab();
  }

  if (!tab) return;
  tab.click();
  await delay(200);
}

export function scrapeTradingViewTelemetry(symbol: string, timeframe: string): TradingViewTelemetrySnapshot | null {
  const metrics = collectTelemetryMetrics();
  applyPluginSessionActiveMetrics(metrics);
  const indicatorState = inspectDataWindowIndicators();
  if (Object.keys(metrics).length === 0) return null;

  const errors: string[] = [];
  const warnings: string[] = [];
  const primarySchema = indicatorState.schemas[PRIMARY_INDICATOR_TITLE];
  const crossSchema = indicatorState.schemas[CROSS_INDICATOR_TITLE];
  const fallbackSchema = metrics['CTX|META|SCHEMA']?.value ?? undefined;
  const schema = primarySchema ?? fallbackSchema;
  const currentOnlyMetric = metrics['CTX|META|CURRENT_ONLY'];
  const barTimeMetric = metrics['CTX|META|BAR_TIME'];
  const currentOnly = currentOnlyMetric?.value;
  const barTime = barTimeMetric?.value;
  const priceClose = metrics['CTX|PRICE|CLOSE']?.value;
  const primaryEvidenceCount = countPrimaryEvidenceRows(metrics);
  const hasPrimaryIndicator = primaryEvidenceCount >= MIN_PRIMARY_EVIDENCE_ROWS;
  const hasCrossIndicator = Object.keys(metrics).some((label) => label.startsWith('CTX|CROSS|'));

  if (primarySchema === null) {
    errors.push('primary Market Context Telemetry schema could not be parsed; update the TradingView Pine script');
  }
  if (primarySchema !== undefined && primarySchema !== null && !isSupportedSchema(primarySchema)) {
    warnings.push(`primary Market Context Telemetry schema is ${formatSchema(primarySchema)}; update the TradingView Pine script`);
  }
  if (primarySchema === undefined && hasPrimaryIndicator) {
    warnings.push('primary schema row is not visible in TradingView Data Window');
  }
  if (primarySchema === undefined && !hasPrimaryIndicator) {
    errors.push('not enough primary Market Context Telemetry rows are visible in TradingView Data Window');
  }
  if (hasCrossIndicator && crossSchema === null) {
    errors.push('Cross Market schema could not be parsed; update the TradingView Pine script');
  }
  if (hasCrossIndicator && crossSchema !== undefined && crossSchema !== null && !isSupportedSchema(crossSchema)) {
    warnings.push(`Cross Market schema is ${formatSchema(crossSchema)}; update the TradingView Pine script`);
  }
  if (hasCrossIndicator && crossSchema === undefined && primarySchema === undefined) {
    warnings.push('Cross Market schema row is not visible in TradingView Data Window');
  }
  if (currentOnlyMetric && currentOnly !== 1) errors.push('latest-bar marker is missing; clear the TradingView crosshair and retry');
  if (barTimeMetric && (!barTime || !Number.isFinite(barTime))) errors.push('bar time is missing; clear the TradingView crosshair and retry');
  if (!currentOnlyMetric) warnings.push('latest-bar marker row is not visible in TradingView Data Window');
  if (!barTimeMetric) warnings.push('bar time row is not visible in TradingView Data Window');
  if (metrics['CTX|PRICE|CLOSE'] && !Number.isFinite(priceClose)) errors.push('latest primary close is missing; clear the TradingView crosshair and retry');
  if (indicatorState.primaryHidden) errors.push('primary Market Context Telemetry indicator is hidden in TradingView');
  if (indicatorState.crossHidden) errors.push('Agent Context - Cross Market indicator is hidden in TradingView');
  const quality = errors.length > 0 ? 'invalid' : warnings.length > 0 ? 'partial' : 'valid';

  const indicatorTitles = [
    hasPrimaryIndicator ? PRIMARY_INDICATOR_TITLE : '',
    hasCrossIndicator ? CROSS_INDICATOR_TITLE : '',
  ].filter(Boolean);

  const snapshot: TradingViewTelemetrySnapshot = {
    indicatorTitle: indicatorTitles.join(' + ') || PRIMARY_INDICATOR_TITLE,
    indicatorTitles,
    indicatorSchemas: indicatorState.schemas,
    schema: schema ?? undefined,
    symbol,
    timeframe,
    capturedAt: Date.now(),
    quality,
    valid: quality !== 'invalid',
    errors,
    warnings,
    metrics,
  };
  snapshot.fingerprint = telemetryFingerprint(snapshot);
  return snapshot;
}

function collectTelemetryMetrics(): Record<string, TradingViewTelemetryMetric> {
  return collectDataWindowRows();
}

export function pluginSessionActiveMetrics(
  metrics: Record<string, TradingViewTelemetryMetric>,
  now = new Date()
): Record<string, TradingViewTelemetryMetric> {
  const normalizedMetrics = Object.fromEntries(
    Object.entries(metrics).map(([label, metric]) => [label, { ...metric }])
  );
  applyPluginSessionActiveMetrics(normalizedMetrics, now);
  return normalizedMetrics;
}

function applyPluginSessionActiveMetrics(metrics: Record<string, TradingViewTelemetryMetric>, now = new Date()): void {
  for (const session of marketSessionStatuses(now)) {
    const label = `CTX|SESSION|${session.key}|ACTIVE`;
    const metric = metrics[label];
    if (!metric) continue;

    const value = session.active ? 1 : 0;
    metric.value = value;
    metric.rawValue = value.toFixed(1);
  }
}

function countPrimaryEvidenceRows(metrics: Record<string, TradingViewTelemetryMetric>): number {
  return Object.values(metrics).filter((metric) => (
    metric.value !== null &&
    PRIMARY_EVIDENCE_PREFIXES.some((prefix) => metric.label.startsWith(prefix))
  )).length;
}

function collectDataWindowRows(): Record<string, TradingViewTelemetryMetric> {
  const metrics: Record<string, TradingViewTelemetryMetric> = {};
  const titleElements = document.querySelectorAll<HTMLElement>('[data-test-id-value-title^="CTX|"]');

  for (const titleElement of titleElements) {
    const section = closestDataWindowSection(titleElement);
    if (section && isIndicatorSectionHidden(section)) continue;

    const rawLabel = titleElement.getAttribute('data-test-id-value-title') || titleElement.textContent || '';
    const label = rawLabel.trim().toUpperCase();
    if (!LABEL_PATTERN.test(label)) {
      continue;
    }

    const rawValue = findDataWindowRowValue(titleElement);
    if (rawValue === null) continue;

    metrics[label] = {
      label,
      value: parseNumericValue(rawValue),
      rawValue,
    };
  }

  return metrics;
}

function inspectDataWindowIndicators(): {
  primaryHidden: boolean;
  crossHidden: boolean;
  schemas: Record<string, number | null | undefined>;
} {
  const primary = findDataWindowIndicatorSection(PRIMARY_INDICATOR_TITLE);
  const cross = findDataWindowIndicatorSection(CROSS_INDICATOR_TITLE);
  return {
    primaryHidden: Boolean(primary && isIndicatorSectionHidden(primary)),
    crossHidden: Boolean(cross && isIndicatorSectionHidden(cross)),
    schemas: {
      ...(primary && !isIndicatorSectionHidden(primary) ? { [PRIMARY_INDICATOR_TITLE]: readSectionSchema(primary) } : {}),
      ...(cross && !isIndicatorSectionHidden(cross) ? { [CROSS_INDICATOR_TITLE]: readSectionSchema(cross) } : {}),
    },
  };
}

function findDataWindowIndicatorSection(title: string): HTMLElement | null {
  const sections = document.querySelectorAll<HTMLElement>('[role="row"][data-role="menuitem"]');
  for (const section of sections) {
    const header = section.querySelector<HTMLElement>('[class*="headerTitle"], [title]');
    const headerText = normalizedText(header?.innerText || header?.textContent || section.textContent || '');
    const headerTitle = header?.getAttribute('title') || '';
    if (headerText.includes(title) || headerTitle.includes(title)) return section;
  }

  return null;
}

function closestDataWindowSection(element: HTMLElement): HTMLElement | null {
  return element.closest<HTMLElement>('[role="row"][data-role="menuitem"]');
}

function isIndicatorSectionHidden(section: HTMLElement): boolean {
  if (section.getAttribute('aria-hidden') === 'true') return true;
  if (/\bhidden[-_]/.test(section.className)) return true;

  const action = section.querySelector<HTMLElement>('button[aria-label], button[data-tooltip]');
  const actionLabel = [
    action?.getAttribute('aria-label'),
    action?.getAttribute('data-tooltip'),
  ].filter(Boolean).join(' ');

  return /\bshow data\b/i.test(actionLabel);
}

function readSectionSchema(section: HTMLElement): number | null | undefined {
  const schemaTitle = section.querySelector<HTMLElement>('[data-test-id-value-title="CTX|META|SCHEMA"]');
  if (!schemaTitle) return undefined;
  const rawValue = findDataWindowRowValue(schemaTitle);
  return rawValue === null ? null : parseNumericValue(rawValue);
}

function formatSchema(schema: number | null): string {
  return schema === null ? 'missing' : String(schema);
}

function isSupportedSchema(schema: number): boolean {
  return SUPPORTED_SCHEMAS.has(schema);
}

function findDataWindowRowValue(titleElement: HTMLElement): string | null {
  const row = titleElement.parentElement;
  if (!row) return null;
  const label = normalizedText(
    titleElement.getAttribute('data-test-id-value-title') ||
    titleElement.innerText ||
    titleElement.textContent ||
    ''
  );

  const directValue = normalizedText(
    (titleElement.nextElementSibling as HTMLElement | null)?.innerText ||
    titleElement.nextElementSibling?.textContent ||
    ''
  );
  if (directValue && !LABEL_PATTERN.test(directValue.toUpperCase())) return directValue;

  for (const child of Array.from(row.children)) {
    if (child === titleElement) continue;
    const text = normalizedText((child as HTMLElement).innerText || child.textContent || '');
    if (text) return text;
  }

  const siblings = Array.from(row.querySelectorAll<HTMLElement>('span, div'));
  for (const sibling of siblings) {
    if (sibling === titleElement || titleElement.contains(sibling)) continue;
    const text = normalizedText(sibling.innerText || sibling.textContent || '');
    if (text && !LABEL_PATTERN.test(text.toUpperCase())) return text;
  }

  const rowText = normalizedText(row.innerText || row.textContent || '');
  const valueFromRowText = rowText.startsWith(label)
    ? normalizedText(rowText.slice(label.length))
    : '';
  if (valueFromRowText) return valueFromRowText;

  return null;
}

function parseNumericValue(value: string): number | null {
  const normalized = normalizeNumericText(value);

  if (!normalized || normalized === 'na' || normalized === 'n/a' || normalized === 'nan' || normalized === '-' || normalized === '—' || normalized === '∅') {
    return null;
  }

  const parsed = Number(normalized);
  if (Number.isFinite(parsed)) return parsed;

  const numericMatch = normalized.match(/-?\d+(?:\.\d+)?$/);
  if (!numericMatch) return null;

  const parsedTail = Number(numericMatch[0]);
  return Number.isFinite(parsedTail) ? parsedTail : null;
}

function normalizeNumericText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[−–]/g, '-')
    .replace(/[,'’\s]/g, '');
}

function normalizedText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function findDataWindowControl(): HTMLElement | null {
  const controls = document.querySelectorAll<HTMLElement>('button, [role="button"], [aria-label], [title], [data-tooltip]');
  for (const control of controls) {
    const description = [
      control.getAttribute('aria-label'),
      control.getAttribute('title'),
      control.getAttribute('data-tooltip'),
      control.getAttribute('data-name'),
      control.textContent,
    ].filter(Boolean).join(' ');

    if (/object tree|data window/i.test(description)) return control;
  }

  return null;
}

function findDataWindowTab(): HTMLElement | null {
  const candidates = document.querySelectorAll<HTMLElement>('button, [role="tab"], [role="button"], div, span');
  for (const candidate of candidates) {
    const text = normalizedText(candidate.innerText || candidate.textContent || '').toLowerCase();
    if (text === 'data window' && isVisible(candidate)) return candidate;
  }

  return null;
}

function isVisible(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect();
  const style = window.getComputedStyle(element);
  return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
