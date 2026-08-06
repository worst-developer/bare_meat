import type { ScreenshotMeta, TradingViewTelemetrySnapshot } from '../types';
import { normalizeSymbol } from '../utils/symbols';

export type TelemetryIntegrityStatus = 'scraped' | 'partial' | 'missing' | 'invalid' | 'rejected';

export interface TelemetryIntegrityResult {
  status: TelemetryIntegrityStatus;
  promptEligible: boolean;
  metricCount: number;
  fingerprint?: string;
  reason?: string;
}

export function telemetryFingerprint(telemetry: TradingViewTelemetrySnapshot): string {
  return Object.values(telemetry.metrics)
    .filter((metric) => !metric.label.startsWith('CTX|META|'))
    .sort((a, b) => a.label.localeCompare(b.label))
    .map((metric) => `${metric.label}=${metric.value === null ? 'na' : metric.rawValue}`)
    .join('|');
}

export function validateTelemetryIntegrity(screenshots: ScreenshotMeta[]): Map<string, TelemetryIntegrityResult> {
  const results = new Map<string, TelemetryIntegrityResult>();
  const candidates = screenshots
    .filter((screenshot) => isTradingViewScreenshot(screenshot))
    .filter((screenshot) => screenshot.tradingViewTelemetry);

  for (const screenshot of screenshots) {
    const telemetry = screenshot.tradingViewTelemetry;
    if (!isTradingViewScreenshot(screenshot)) continue;

    if (!telemetry) {
      results.set(screenshot.key, {
        status: 'missing',
        promptEligible: false,
        metricCount: 0,
        reason: 'No CTX telemetry was captured with this screenshot.',
      });
      continue;
    }

    const fingerprint = telemetry.fingerprint || telemetryFingerprint(telemetry);
    const metricCount = Object.keys(telemetry.metrics).length;
    if (hasLikelyCorruptedValues(telemetry)) {
      results.set(screenshot.key, {
        status: 'invalid',
        promptEligible: false,
        metricCount,
        fingerprint,
        reason: 'Saved CTX data was captured by the older broken scraper and has corrupted values. Click Scrape CTX now on the matching chart, or clear analysis and recapture.',
      });
      continue;
    }

    if (!telemetry.valid) {
      results.set(screenshot.key, {
        status: 'invalid',
        promptEligible: false,
        metricCount,
        fingerprint,
        reason: telemetry.errors.join('; ') || 'Telemetry validation failed.',
      });
      continue;
    }

    results.set(screenshot.key, {
      status: telemetry.quality === 'partial' ? 'partial' : 'scraped',
      promptEligible: true,
      metricCount,
      fingerprint,
      reason: telemetry.quality === 'partial' ? telemetry.warnings?.join('; ') : undefined,
    });
  }

  const groups = new Map<string, ScreenshotMeta[]>();
  for (const screenshot of candidates) {
    const telemetry = screenshot.tradingViewTelemetry;
    if (!telemetry?.valid) continue;

    const fingerprint = telemetry.fingerprint || telemetryFingerprint(telemetry);
    if (!fingerprint) continue;

    const groupKey = `${normalizeSymbol(screenshot.normalizedSymbol || screenshot.symbol)}::${fingerprint}`;
    const group = groups.get(groupKey) ?? [];
    group.push(screenshot);
    groups.set(groupKey, group);
  }

  for (const group of groups.values()) {
    const timeframes = new Set(group.map((screenshot) => screenshot.timeframe));
    if (timeframes.size < 2) continue;

    const ordered = [...group].sort((a, b) => a.capturedAt - b.capturedAt);
    const authoritativeTimeframe = ordered[0]?.timeframe;
    for (const screenshot of ordered.slice(1)) {
      if (screenshot.timeframe === authoritativeTimeframe) continue;

      const telemetry = screenshot.tradingViewTelemetry;
      const fingerprint = telemetry ? telemetry.fingerprint || telemetryFingerprint(telemetry) : undefined;
      results.set(screenshot.key, {
        status: 'rejected',
        promptEligible: false,
        metricCount: telemetry ? Object.keys(telemetry.metrics).length : 0,
        fingerprint,
        reason: 'Same CTX fingerprint already exists on another timeframe for this symbol.',
      });
    }
  }

  return results;
}

function hasLikelyCorruptedValues(telemetry: TradingViewTelemetrySnapshot): boolean {
  const values = Object.values(telemetry.metrics)
    .filter((metric) => !metric.label.startsWith('CTX|META|'))
    .filter((metric) => metric.value !== null);

  if (values.length < 30) return false;

  const oneCount = values.filter((metric) => metric.value === 1).length;
  return oneCount / values.length > 0.75;
}

export function isTradingViewScreenshot(screenshot: ScreenshotMeta): boolean {
  return Boolean(screenshot.rawTradingView.intervalValue || screenshot.rawTradingView.intervalTooltip);
}
