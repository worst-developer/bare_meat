export const COINGLASS_SYMBOLS = ['BTC', 'ETH', 'SOL', 'HYPE'] as const;

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

export type CoinglassHeatmapTimeframe = '12h' | '24h' | '7d';

export interface CoinglassScreenshotSettings {
  liquidationHeatmap: boolean;
  liquidationMap: boolean;
  heatmapTimeframes: Record<CoinglassHeatmapTimeframe, boolean>;
}

export interface CoinglassScreenshotImage {
  id: string;
  filename: string;
  mimeType: string;
  dataUrl: string;
  symbol: CoinglassSymbol;
  timeframe: CoinglassHeatmapTimeframe;
  kind: 'liquidationHeatmap' | 'liquidationMapChart1' | 'liquidationMapChart2';
  title: string;
}

export interface CoinglassScrapeRequest {
  symbols: CoinglassSymbol[];
  sections: CoinglassSection[];
  screenshots?: CoinglassScreenshotSettings;
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
  screenshots?: CoinglassScreenshotImage[];
  warnings: string[];
  errors: string[];
}

export interface CoinglassExchangeFunding {
  rate?: number;
  nextSettlement?: string;
  raw?: string[];
}

export interface CoinglassFundingRateSymbol {
  average?: number;
  spread?: number;
  highest?: string;
  lowest?: string;
  binance?: CoinglassExchangeFunding;
  bybit?: CoinglassExchangeFunding;
  okx?: CoinglassExchangeFunding;
  rawCards: Record<string, string>;
}

export interface CoinglassOpenInterest {
  oiUsd?: number;
  change1hPct?: number;
  change4hPct?: number;
  change24hPct?: number;
  oi24hVol?: number;
  exchanges: Record<string, Record<string, string | number>>;
  rawRow?: string[];
}

export interface CoinglassLiquidationsTotals {
  '1h': { long?: number; short?: number };
  '4h': { long?: number; short?: number };
  '12h': { long?: number; short?: number };
  '24h': { long?: number; short?: number };
  rawRow?: string[];
}

export interface CoinglassLongShortRatio {
  timeframe: '1h' | '4h' | '12h' | '24h';
  longVolume?: number;
  shortVolume?: number;
  longPct?: number;
  shortPct?: number;
  exchanges: Record<string, Record<string, string | number>>;
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
