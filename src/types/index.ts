// Provider platforms for dispatch
export type Provider = 'chatgpt' | 'grok' | 'deepseek' | 'kimi';

// Single chat target configuration
export interface ChatTarget {
  id: string;
  name: string;
  provider: Provider;
  symbols: string[]; // Kept as internal wildcard/backward-compatible storage.
  chatUrl: string;
  enabled: boolean;
}

// Prompt settings configuration
export interface PromptSettings {
  basePrompt: string;
}

export interface DetectedSymbol {
  display: string;
  normalized: string;
}

export interface DetectedInterval {
  normalized: string;
  dataValue?: string;
  tooltip?: string;
  ariaLabel?: string;
  visibleText?: string;
}

export interface PendingCapture {
  id: string;
  symbol: DetectedSymbol;
  timeframe: DetectedInterval;
  sourceTabId: number;
  triggeredAt: number;
  status: 'pending';
  clipboardBaselineHash?: string;
  telemetry?: TradingViewTelemetrySnapshot;
}

// Storage wrapper interfaces
export interface AppStorage {
  chatTargets: ChatTarget[];
  promptSettings: PromptSettings;
}

// Target status during dispatch
export type TargetDispatchState =
  | 'pending'
  | 'finding_tab'
  | 'opening_tab'
  | 'waiting_for_provider'
  | 'transferring_images'
  | 'attaching_images'
  | 'writing_prompt'
  | 'verifying'
  | 'submitting'
  | 'working'
  | 'finished'
  | 'submitted'
  | 'ready'
  | 'error';

export interface TargetStatus {
  targetId: string;
  state: TargetDispatchState;
  message?: string;
  progress?: number;
}

// Screenshot metadata (keep for backward compatibility)
export interface ScreenshotMeta {
  id: string;
  key: string;
  symbol: string;
  normalizedSymbol: string;
  timeframe: string;
  blobId: string;
  hash: string;
  mimeType: string;
  capturedAt: number;
  rawTradingView: {
    intervalValue?: string;
    intervalTooltip?: string;
  };
  tradingViewTelemetry?: TradingViewTelemetrySnapshot;
}

export interface TradingViewTelemetryMetric {
  label: string;
  value: number | null;
  rawValue: string;
}

export interface TradingViewTelemetrySnapshot {
  indicatorTitle: string;
  indicatorTitles?: string[];
  indicatorSchemas?: Record<string, number | null | undefined>;
  schema?: number;
  symbol: string;
  timeframe: string;
  quoteCurrency?: string;
  capturedAt: number;
  fingerprint?: string;
  quality?: 'valid' | 'partial' | 'invalid';
  valid: boolean;
  errors: string[];
  warnings?: string[];
  metrics: Record<string, TradingViewTelemetryMetric>;
}

export interface AnalysisDraft {
  id: string;
  screenshots: ScreenshotMeta[];
  additionalPrompt: string;
  createdAt: number;
  updatedAt: number;
}

export interface DispatchSnapshot {
  id: string;
  screenshots: ScreenshotMeta[];
  prompt: string;
  targetIds: string[];
  createdAt: number;
}

export interface IncomingScreenshot {
  meta: ScreenshotMeta;
  filename: string;
  mimeType: string;
  dataUrl: string;
}
