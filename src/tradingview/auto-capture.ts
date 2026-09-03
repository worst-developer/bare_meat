import type { TradingViewAutoCaptureSettings, TradingViewAutoTimeframe, TradingViewChartPreset } from '../types';

export const TRADINGVIEW_AUTO_TIMEFRAMES = ['15m', '30m', '1h', '4h', '1d', '1w'] as const;

export const TRADINGVIEW_AUTO_STORAGE_KEY = 'tradingview_auto_capture_settings';

export const DEFAULT_TRADINGVIEW_AUTO_SETTINGS: TradingViewAutoCaptureSettings = {
  presets: [
    defaultPreset('BTC', 'BTCUSDT.P', 'https://www.tradingview.com/chart/?symbol=BINANCE:BTCUSDT.P'),
    defaultPreset('ETH', 'ETHUSDT.P', 'https://www.tradingview.com/chart/?symbol=BINANCE:ETHUSDT.P'),
    defaultPreset('SOL', 'SOLUSDT.P', 'https://www.tradingview.com/chart/?symbol=BINANCE:SOLUSDT.P'),
  ],
};

export function mergeTradingViewAutoSettings(value: unknown): TradingViewAutoCaptureSettings {
  const incoming = isObject(value) && Array.isArray(value.presets) ? value.presets : null;
  if (!incoming) return DEFAULT_TRADINGVIEW_AUTO_SETTINGS;

  const presets = incoming
    .map(normalizePreset)
    .filter((preset): preset is TradingViewChartPreset => Boolean(preset));

  return { presets: presets.length > 0 ? presets : DEFAULT_TRADINGVIEW_AUTO_SETTINGS.presets };
}

export function enabledTradingViewTimeframes(
  preset: TradingViewChartPreset
): TradingViewAutoTimeframe[] {
  return TRADINGVIEW_AUTO_TIMEFRAMES.filter((timeframe) => preset.timeframes[timeframe]);
}

export function tradingViewUrlForTimeframe(url: string, timeframe: TradingViewAutoTimeframe): string {
  const parsed = new URL(url);
  parsed.searchParams.set('interval', tradingViewIntervalParam(timeframe));
  return parsed.toString();
}

export function tradingViewIntervalParam(timeframe: TradingViewAutoTimeframe): string {
  const intervals: Record<TradingViewAutoTimeframe, string> = {
    '15m': '15',
    '30m': '30',
    '1h': '60',
    '4h': '240',
    '1d': 'D',
    '1w': 'W',
  };
  return intervals[timeframe];
}

export interface TradingViewDateWindow {
  days?: number;
  months?: number;
  rightPaddingDays: number;
}

export function tradingViewDateWindow(timeframe: TradingViewAutoTimeframe): TradingViewDateWindow {
  const windows: Record<TradingViewAutoTimeframe, TradingViewDateWindow> = {
    '15m': { days: 2, rightPaddingDays: 1 },
    '30m': { days: 3, rightPaddingDays: 1 },
    '1h': { days: 5, rightPaddingDays: 1 },
    '4h': { days: 20, rightPaddingDays: 2 },
    '1d': { months: 6, rightPaddingDays: 21 },
    '1w': { months: 18, rightPaddingDays: 56 },
  };
  return windows[timeframe];
}

function defaultPreset(name: string, symbol: string, chartUrl: string): TradingViewChartPreset {
  return {
    id: `tv_${name.toLowerCase()}`,
    name,
    symbol,
    chartUrl,
    enabled: false,
    timeframes: Object.fromEntries(TRADINGVIEW_AUTO_TIMEFRAMES.map((timeframe) => [timeframe, true])) as Record<TradingViewAutoTimeframe, boolean>,
  };
}

function normalizePreset(value: unknown): TradingViewChartPreset | null {
  if (!isObject(value)) return null;
  const name = stringValue(value.name).trim();
  const symbol = stringValue(value.symbol).trim();
  const chartUrl = stringValue(value.chartUrl).trim();
  if (!name || !symbol || !isTradingViewUrl(chartUrl)) return null;

  return {
    id: stringValue(value.id).trim() || `tv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    name,
    symbol,
    chartUrl,
    enabled: value.enabled === true,
    timeframes: {
      ...Object.fromEntries(TRADINGVIEW_AUTO_TIMEFRAMES.map((timeframe) => [timeframe, true])) as Record<TradingViewAutoTimeframe, boolean>,
      ...(isObject(value.timeframes) ? value.timeframes : {}),
    },
  };
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function isTradingViewUrl(value: string): boolean {
  try {
    return new URL(value).hostname.endsWith('tradingview.com');
  } catch {
    return false;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
