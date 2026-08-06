import type {
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
  | { type: 'SCREENSHOT_UPDATE'; screenshot: ScreenshotMeta }
  | { type: 'DISPATCH_REQUEST'; screenshotKeys: string[]; additionalPrompt: string; targetIds: string[]; basePrompt: string; autosubmit: boolean; includeScrapedData: boolean; telemetry?: ScreenshotMeta['tradingViewTelemetry'] }
  | { type: 'DISPATCH_STATUS_UPDATE'; targetId: string; state: TargetDispatchState; message?: string; progress?: number }
  | { type: 'PROVIDER_PING' }
  | { type: 'PROVIDER_READY'; provider: Provider }
  | { type: 'PROVIDER_PREPARE'; provider: Provider; prompt: string; screenshots: IncomingScreenshot[]; autosubmit: boolean };
