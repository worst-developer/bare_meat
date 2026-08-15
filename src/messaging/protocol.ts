import type {
  CoinglassScrapeProgress,
  CoinglassScrapeRequest,
  CoinglassSection,
  CoinglassHeatmapTimeframe,
  CoinglassSymbol,
  CoinglassSnapshot,
  IncomingScreenshot,
  PendingCapture,
  Provider,
  ScreenshotMeta,
  TargetDispatchState,
} from '../types';

export type ExtensionMessage =
  | { type: 'TV_CONTENT_READY'; href: string; frame: 'top' | 'child' }
  | { type: 'TV_CAPTURE_TRIGGERED'; capture: PendingCapture }
  | { type: 'TV_READ_CLIPBOARD_IMAGE' }
  | { type: 'TV_SCRAPE_TELEMETRY' }
  | { type: 'CG_SCRAPE_REQUEST'; request: CoinglassScrapeRequest }
  | { type: 'CG_SCRAPE_PROGRESS'; progress: CoinglassScrapeProgress }
  | { type: 'CG_SCRAPE_COMPLETE'; snapshot: CoinglassSnapshot }
  | { type: 'CG_SCRAPE_FAILED'; snapshot: CoinglassSnapshot }
  | { type: 'CG_SCRAPE_PAGE'; section: CoinglassSection; symbol: CoinglassSymbol; timeframe?: '1h' | '4h' | '12h' | '24h' }
  | {
    type: 'CG_PREPARE_SCREENSHOT_TARGET';
    target: {
      kind: 'liquidationHeatmap' | 'liquidationMapChart1' | 'liquidationMapChart2';
      symbol: CoinglassSymbol;
      timeframe: CoinglassHeatmapTimeframe;
    };
  }
  | { type: 'SCREENSHOT_UPDATE'; screenshot: ScreenshotMeta }
  | { type: 'DISPATCH_REQUEST'; screenshotKeys: string[]; additionalPrompt: string; targetIds: string[]; basePrompt: string; autosubmit: boolean; includeScrapedData: boolean; telemetry?: ScreenshotMeta['tradingViewTelemetry']; includeCoinglassData?: boolean; coinglassSnapshot?: CoinglassSnapshot }
  | { type: 'DISPATCH_STATUS_UPDATE'; targetId: string; state: TargetDispatchState; message?: string; progress?: number }
  | { type: 'PROVIDER_PING' }
  | { type: 'PROVIDER_READY'; provider: Provider }
  | { type: 'PROVIDER_PREPARE'; provider: Provider; prompt: string; screenshots: IncomingScreenshot[]; autosubmit: boolean };
