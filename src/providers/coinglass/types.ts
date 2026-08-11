export const COINGLASS_SYMBOLS = ['BTC', 'ETH', 'SOL'] as const;

export type CoinglassSymbol = typeof COINGLASS_SYMBOLS[number];

export const COINGLASS_SECTIONS = [
  'openInterest',
  'fundingRateSymbol',
  'liquidationsTotals',
  'fundingRate',
  'longShortRatio',
  'etf',
  'basis',
  'spotInflowOutflow',
] as const;

export type CoinglassSection = typeof COINGLASS_SECTIONS[number];

export type CoinglassSettings = Record<CoinglassSection, boolean>;

export interface CoinglassScrapeRequest {
  symbols: CoinglassSymbol[];
  sections: CoinglassSection[];
  force?: boolean;
}

export interface CoinglassScrapeProgress {
  page: CoinglassSection;
  symbol?: CoinglassSymbol;
  message: string;
}

export interface CoinglassSnapshot {
  id: string;
  capturedAt: number;
  symbols: CoinglassSymbol[];
  sections: CoinglassSection[];
  status: 'idle' | 'scraping' | 'success' | 'partial' | 'error';
  data: Partial<Record<CoinglassSymbol, Partial<Record<CoinglassSection, unknown>>>>;
  warnings: string[];
  errors: string[];
}

export interface CoinglassExchangeFunding {
  rate?: number | null;
  nextSettlement?: string;
  raw?: string[];
}

export interface CoinglassFundingRateSymbol {
  average?: number | null;
  spread?: number | null;
  highest?: string;
  lowest?: string;
  binance?: CoinglassExchangeFunding;
  bybit?: CoinglassExchangeFunding;
  okx?: CoinglassExchangeFunding;
  rawCards: Record<string, string>;
}

export interface CoinglassOpenInterest {
  oiUsd?: number | null;
  change1hPct?: number | null;
  change4hPct?: number | null;
  change24hPct?: number | null;
  oi24hVol?: number | null;
  exchanges: Record<string, Record<string, string | number | null>>;
  rawRow?: string[];
}

export interface CoinglassLiquidationsTotals {
  '1h': { long: number | null; short: number | null };
  '4h': { long: number | null; short: number | null };
  '12h': { long: number | null; short: number | null };
  '24h': { long: number | null; short: number | null };
  rawRow?: string[];
}

export interface CoinglassLongShortRatio {
  timeframe: '1h' | '4h' | '12h' | '24h';
  longVolume?: number | null;
  shortVolume?: number | null;
  longPct?: number | null;
  shortPct?: number | null;
  exchanges: Record<string, Record<string, string | number | null>>;
}

export interface CoinglassGenericTable {
  title: string;
  headers: string[];
  rows: Array<Record<string, string>>;
}

export interface CoinglassGenericPage {
  title: string;
  selectedSymbol?: CoinglassSymbol;
  selectedTimeframe?: string;
  cards: Record<string, string>;
  tables: CoinglassGenericTable[];
  warnings: string[];
}
