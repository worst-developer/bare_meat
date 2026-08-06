import type { ScreenshotMeta, TradingViewTelemetrySnapshot } from '../types';
import { formatDuration, marketSessionStatuses, nextFourHourCandleClose } from '../tradingview/session-clock';
import { pluginSessionActiveMetrics } from '../tradingview/telemetry';
import { isTradingViewScreenshot, validateTelemetryIntegrity } from '../tradingview/telemetry-integrity';

export function buildAnalysisPrompt(
  screenshots: ScreenshotMeta[],
  _basePrompt: string,
  additionalPrompt: string,
  includeScrapedData = false,
  freshTelemetry?: TradingViewTelemetrySnapshot
): string {
  const now = new Date();
  const chartScreenshots = screenshots.filter(isTradingViewScreenshot);
  const counts = countScreenshotsByChart(chartScreenshots);
  const seen = new Map<string, number>();
  const chartLines = chartScreenshots
    .map((screenshot) => {
      const chartKey = chartIdentity(screenshot);
      const current = (seen.get(chartKey) ?? 0) + 1;
      seen.set(chartKey, current);
      const suffix = (counts.get(chartKey) ?? 0) > 1 ? ` #${current}` : '';
      return `- ${screenshot.symbol} — ${screenshot.timeframe}${suffix}`;
    })
    .join('\n');

  return [
    chartLines,
    includeScrapedData ? buildTradingViewTelemetryPreview(chartScreenshots, freshTelemetry) : '',
    additionalPrompt.trim(),
    activeSessionLines(now),
    `4H candle closes in ${formatDuration(nextFourHourCandleClose(now).getTime() - now.getTime())}`,
  ].filter(Boolean).join('\n');
}

export function buildTradingViewTelemetryPreview(
  screenshots: ScreenshotMeta[],
  freshTelemetry?: TradingViewTelemetrySnapshot
): string {
  const integrity = validateTelemetryIntegrity(screenshots);
  const seenTelemetry = new Set<string>();
  const snapshots: TelemetrySnapshotContext[] = [];
  if (freshTelemetry?.valid) {
    seenTelemetry.add(telemetryIdentity(freshTelemetry, freshTelemetry.symbol, freshTelemetry.timeframe));
    snapshots.unshift({ telemetry: freshTelemetry, symbol: freshTelemetry.symbol, timeframe: freshTelemetry.timeframe });
  }
  for (const screenshot of screenshots.filter(isTradingViewScreenshot)) {
    if (!integrity.get(screenshot.key)?.promptEligible || !screenshot.tradingViewTelemetry) continue;
    const identity = telemetryIdentity(screenshot.tradingViewTelemetry, screenshot.symbol, screenshot.timeframe);
    if (seenTelemetry.has(identity)) continue;
    seenTelemetry.add(identity);
    snapshots.push({
      telemetry: screenshot.tradingViewTelemetry,
      symbol: screenshot.symbol,
      timeframe: screenshot.timeframe,
    });
  }

  if (snapshots.length === 0) {
    return 'TradingView scraped context: no valid CTX telemetry is available for this capture.';
  }

  const lines = ['TradingView scraped context:'];
  const generalSnapshot = pickGeneralTelemetryContext(snapshots);
  if (generalSnapshot) appendGeneralTelemetryContext(lines, generalSnapshot.telemetry);
  lines.push(...snapshots.map((snapshot) => (
    formatTradingViewTelemetrySnapshot(snapshot.telemetry, snapshot.symbol, snapshot.timeframe, ['chart'])
  )));
  return lines.join('\n');
}

type TelemetrySnapshotContext = {
  telemetry: NonNullable<ScreenshotMeta['tradingViewTelemetry']>;
  symbol: string;
  timeframe: string;
};

function pickGeneralTelemetryContext(snapshots: TelemetrySnapshotContext[]): TelemetrySnapshotContext | null {
  const candidates = [...snapshots].sort((a, b) => b.telemetry.capturedAt - a.telemetry.capturedAt);
  return candidates.find((snapshot) => buildTelemetryGroups(snapshot.telemetry).general.size > 0) ?? null;
}

function telemetryIdentity(telemetry: TradingViewTelemetrySnapshot, symbol: string, timeframe: string): string {
  return telemetry.fingerprint || `${symbol}:${timeframe}:${telemetry.capturedAt}`;
}

export function formatTradingViewTelemetrySnapshot(
  telemetry: NonNullable<ScreenshotMeta['tradingViewTelemetry']>,
  symbol: string,
  timeframe: string,
  scopes: Array<'chart' | 'general'> = ['chart', 'general']
): string {
  const groups = buildTelemetryGroups(telemetry);
  const status = telemetry.valid
    ? telemetry.quality === 'partial' ? 'valid partial' : 'valid'
    : `invalid: ${telemetry.errors.join('; ') || 'unknown reason'}`;
  const lines = [`- ${symbol} ${timeframe}: ${status}`];
  if (telemetry.valid && telemetry.quality === 'partial') {
    lines.push(`  Telemetry note: ${formatTelemetryWarnings(telemetry.warnings)}.`);
  }

  if (scopes.includes('chart')) appendTelemetrySection(lines, `Exact chart data (${symbol} ${timeframe})`, groups.chart);
  if (scopes.includes('general')) appendTelemetrySection(lines, 'General context', groups.general);

  return lines.join('\n');
}

function appendGeneralTelemetryContext(lines: string[], telemetry: NonNullable<ScreenshotMeta['tradingViewTelemetry']>): void {
  appendTelemetrySection(lines, 'General context', buildTelemetryGroups(telemetry).general);
}

function buildTelemetryGroups(telemetry: NonNullable<ScreenshotMeta['tradingViewTelemetry']>): {
  chart: Map<string, Map<string, string[]>>;
  general: Map<string, Map<string, string[]>>;
} {
  const values = Object.values(pluginSessionActiveMetrics(telemetry.metrics))
    .filter((metric) => metric.value !== null)
    .filter((metric) => !metric.label.startsWith('CTX|META|'))
    .sort((a, b) => a.label.localeCompare(b.label));

  const groups = {
    chart: new Map<string, Map<string, string[]>>(),
    general: new Map<string, Map<string, string[]>>(),
  };

  for (const metric of values) {
    const parts = metric.label.split('|');
    const group = parts[1] ?? 'OTHER';
    const nested = parts.length > 3 ? parts[2] ?? 'VALUES' : 'VALUES';
    const name = parts.length > 3 ? parts.slice(3).join('.') : parts.slice(2).join('.');
    const scope = isGeneralTelemetryGroup(group) ? 'general' : 'chart';
    const groupEntries = groups[scope].get(group) ?? new Map<string, string[]>();
    const entries = groupEntries.get(nested) ?? [];
    entries.push(`${name}=${formatTelemetryValue(metric.value)}`);
    groupEntries.set(nested, entries);
    groups[scope].set(group, groupEntries);
  }

  return groups;
}

function appendTelemetrySection(
  lines: string[],
  title: string,
  groups: Map<string, Map<string, string[]>>
): void {
  if (groups.size === 0) return;

  lines.push(`  ${title}:`);
  for (const [group, nested] of groups.entries()) {
    lines.push(`    ${formatTelemetryGroup(group)}: ${formatTelemetryGroupEntries(nested)}`);
  }
}

function isGeneralTelemetryGroup(group: string): boolean {
  return group === 'CME' || group === 'CROSS' || group === 'LEVEL';
}

function formatTelemetryWarnings(warnings: string[] | undefined): string {
  const cleaned = (warnings ?? [])
    .map((warning) => warning.trim().replace(/[.]+$/g, ''))
    .filter(Boolean);

  return cleaned.length > 0
    ? cleaned.join('; ')
    : 'partial CTX validation warnings';
}

function formatTelemetryGroupEntries(entriesByName: Map<string, string[]>): string {
  const sections = [...entriesByName.entries()];
  if (sections.length === 1 && sections[0]?.[0] === 'VALUES') {
    return sections[0][1].join(', ');
  }

  return sections
    .map(([name, entries]) => `${name}{${entries.join(', ')}}`)
    .join('; ');
}

function formatTelemetryGroup(group: string): string {
  const names: Record<string, string> = {
    CME: 'CME',
    CROSS: 'Cross market',
    DIST: 'Distances',
    EMA: 'EMAs',
    LEVEL: 'Levels',
    PRICE: 'Price',
    RANGE: 'Range usage',
    SESSION: 'Sessions',
    STAT: 'Session stats',
    STRUCT: 'Structure',
    SWEEP: 'Sweeps',
    VOL: 'Volume',
    VOLATILITY: 'Volatility',
    VP: 'Volume profile',
    VWAP: 'VWAP',
  };

  return names[group] ?? group;
}

function formatTelemetryValue(value: number | null): string {
  if (value === null) return 'na';
  if (Number.isInteger(value)) return String(value);
  if (Math.abs(value) > 0 && Math.abs(value) < 1) {
    return Number(value.toFixed(8)).toString();
  }
  return Number(value.toPrecision(8)).toString();
}

function countScreenshotsByChart(screenshots: ScreenshotMeta[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const screenshot of screenshots) {
    const key = chartIdentity(screenshot);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function chartIdentity(screenshot: ScreenshotMeta): string {
  return `${screenshot.normalizedSymbol || screenshot.symbol}::${screenshot.timeframe}`;
}

function activeSessionLines(now: Date): string {
  const activeSessions = marketSessionStatuses(now)
    .map((session) => session.active ? `- ${session.name} session closes in ${formatDuration(session.msUntilClose)}` : null)
    .filter(Boolean);

  if (activeSessions.length === 0) {
    return 'Active sessions: none';
  }

  return ['Active sessions:', ...activeSessions].join('\n');
}
