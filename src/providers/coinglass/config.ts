import type { CoinglassSection, CoinglassSettings, CoinglassSymbol } from './types';

export const DEFAULT_COINGLASS_SETTINGS: CoinglassSettings = {
  openInterest: true,
  fundingRateSymbol: true,
  liquidationsTotals: true,
  fundingRate: true,
  longShortRatio: true,
  etf: true,
  basis: true,
  spotInflowOutflow: true,
};

export const COINGLASS_STORAGE_KEYS = {
  include: 'include_coinglass_data',
  settings: 'coinglass_settings',
  snapshot: 'coinglass_snapshot',
  manualSymbols: 'coinglass_manual_symbols',
} as const;

export function enabledCoinglassSections(settings: CoinglassSettings): CoinglassSection[] {
  return Object.entries(settings)
    .filter((entry): entry is [CoinglassSection, boolean] => entry[1])
    .map(([section]) => section);
}

export function mergeCoinglassSettings(value: unknown): CoinglassSettings {
  return {
    ...DEFAULT_COINGLASS_SETTINGS,
    ...(isObject(value) ? value : {}),
  };
}

export function coinglassUrl(section: CoinglassSection, symbol: CoinglassSymbol): string {
  const upper = symbol.toUpperCase();
  if (section === 'openInterest') return `https://www.coinglass.com/open-interest/${upper}`;
  if (section === 'fundingRateSymbol') return `https://www.coinglass.com/FundingRate/${upper}`;
  if (section === 'fundingRate') return `https://www.coinglass.com/FundingRate`;
  if (section === 'liquidationsTotals') return 'https://www.coinglass.com/pro/futures/Liquidations';
  if (section === 'longShortRatio') return `https://www.coinglass.com/LongShortRatio/${upper}`;
  if (section === 'etf') return `https://www.coinglass.com/etf/${coinglassEtfSlug(symbol)}`;
  if (section === 'basis') return 'https://www.coinglass.com/Basis';
  if (section === 'spotInflowOutflow') return 'https://www.coinglass.com/spot-inflow-outflow';
  return 'https://www.coinglass.com/';
}

export function isSectionAvailableForSymbol(section: CoinglassSection, symbol: CoinglassSymbol): boolean {
  if (section === 'basis') return symbol === 'BTC' || symbol === 'ETH';
  return true;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function coinglassEtfSlug(symbol: CoinglassSymbol): string {
  if (symbol === 'BTC') return 'bitcoin';
  if (symbol === 'ETH') return 'ethereum';
  return 'solana';
}
