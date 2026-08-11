import React, { useEffect, useMemo, useState } from 'react';
import SettingsModal from './components/SettingsModal';
import type { ExtensionMessage } from '../../src/messaging/protocol';
import type { ChatTarget, CoinglassSection, CoinglassSettings, CoinglassSnapshot, CoinglassSymbol, PromptSettings, ScreenshotMeta, TargetStatus, TradingViewTelemetrySnapshot } from '../../src/types';
import * as db from '../../src/storage/db';
import { COINGLASS_STORAGE_KEYS, DEFAULT_COINGLASS_SETTINGS, enabledCoinglassSections, mergeCoinglassSettings } from '../../src/providers/coinglass/config';
import { loadCoinglassSnapshot } from '../../src/providers/coinglass/storage';
import { isTradingViewScreenshot, validateTelemetryIntegrity, type TelemetryIntegrityResult } from '../../src/tradingview/telemetry-integrity';
import { resolveMatchingTargets } from '../../src/routing/target-resolver';
import { formatDuration, marketSessionStatuses, nextFourHourCandleClose } from '../../src/tradingview/session-clock';
import { pluginSessionActiveMetrics } from '../../src/tradingview/telemetry';
import { buildScreenshotKey, computeHash, generateId, normalizeSymbol } from '../../src/utils/symbols';

const DEFAULT_PROMPT =
  'You are an expert multi-timeframe market analyst. Analyze the attached TradingView charts professionally and identify key support/resistance levels, trend direction, potential entries, exits, and risk management recommendations.';

export default function SidePanelApp(): JSX.Element {
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => new Date());
  const [screenshots, setScreenshots] = useState<ScreenshotMeta[]>([]);
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const [additionalPrompt, setAdditionalPrompt] = useState('');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [chatTargets, setChatTargets] = useState<ChatTarget[]>([]);
  const [promptSettings, setPromptSettings] = useState<PromptSettings>({ basePrompt: DEFAULT_PROMPT });
  const [targetStatuses, setTargetStatuses] = useState<Record<string, TargetStatus>>({});
  const [autosubmit, setAutosubmit] = useState(false);
  const [includeScrapedData, setIncludeScrapedData] = useState(true);
  const [includeCoinglassData, setIncludeCoinglassData] = useState(false);
  const [coinglassSettings, setCoinglassSettings] = useState<CoinglassSettings>(DEFAULT_COINGLASS_SETTINGS);
  const [coinglassSnapshot, setCoinglassSnapshot] = useState<CoinglassSnapshot | null>(null);
  const [coinglassState, setCoinglassState] = useState<'idle' | 'scraping' | 'success' | 'partial' | 'error'>('idle');
  const [coinglassMessage, setCoinglassMessage] = useState('');
  const [manualCoinglassSymbols, setManualCoinglassSymbols] = useState<CoinglassSymbol[]>(['BTC']);
  const [telemetryScrapeState, setTelemetryScrapeState] = useState<'idle' | 'scraping' | 'success' | 'warning' | 'error'>('idle');
  const [telemetryScrapeMessage, setTelemetryScrapeMessage] = useState('');
  const [manualTelemetryPreview, setManualTelemetryPreview] = useState<TradingViewTelemetrySnapshot | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  useEffect(() => {
    void loadState();

    const onMessageReceived = (message: ExtensionMessage) => {
      if (message.type === 'SCREENSHOT_UPDATE') {
        void loadScreenshots();
      }

      if (message.type === 'DISPATCH_STATUS_UPDATE') {
        setTargetStatuses((prev) => ({
          ...prev,
          [message.targetId]: {
            targetId: message.targetId,
            state: message.state,
            message: message.message,
            progress: message.progress,
          },
        }));
      }

      if (message.type === 'CG_SCRAPE_PROGRESS') {
        setCoinglassState('scraping');
        setCoinglassMessage(message.progress.message);
      }

      if (message.type === 'CG_SCRAPE_COMPLETE' || message.type === 'CG_SCRAPE_FAILED') {
        setCoinglassSnapshot(message.snapshot);
        setCoinglassState(message.snapshot.status === 'partial' ? 'partial' : message.snapshot.status === 'success' ? 'success' : 'error');
        setCoinglassMessage(coinglassSummaryMessage(message.snapshot));
      }
    };

    chrome.runtime.onMessage.addListener(onMessageReceived);
    return () => chrome.runtime.onMessage.removeListener(onMessageReceived);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const urls: Record<string, string> = {};
    let cancelled = false;

    void Promise.all(
      screenshots.map(async (screenshot) => {
        const blob = await db.getBlob(screenshot.blobId);
        if (blob && !cancelled) {
          urls[screenshot.key] = URL.createObjectURL(blob);
        }
      })
    ).then(() => {
      if (!cancelled) setPreviewUrls(urls);
    });

    return () => {
      cancelled = true;
      for (const url of Object.values(urls)) URL.revokeObjectURL(url);
    };
  }, [screenshots]);

  async function loadState(): Promise<void> {
    try {
      await Promise.all([
        loadScreenshots(),
        loadAdditionalPrompt(),
        loadAutosubmit(),
        loadIncludeScrapedData(),
        loadCoinglassState(),
        loadChatTargets(),
        loadPromptSettings(),
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function loadScreenshots(): Promise<void> {
    const records = await db.listScreenshots();
    setScreenshots(sortScreenshots(records));
  }

  async function loadAdditionalPrompt(): Promise<void> {
    const result = await chrome.storage.local.get(['additional_prompt']);
    setAdditionalPrompt(typeof result.additional_prompt === 'string' ? result.additional_prompt : '');
  }

  async function loadAutosubmit(): Promise<void> {
    const result = await chrome.storage.local.get(['autosubmit_agents']);
    setAutosubmit(result.autosubmit_agents === true);
  }

  async function loadIncludeScrapedData(): Promise<void> {
    const result = await chrome.storage.local.get(['include_scraped_data']);
    setIncludeScrapedData(result.include_scraped_data !== false);
  }

  async function loadCoinglassState(): Promise<void> {
    const result = await chrome.storage.local.get([
      COINGLASS_STORAGE_KEYS.include,
      COINGLASS_STORAGE_KEYS.settings,
      COINGLASS_STORAGE_KEYS.manualSymbols,
    ]);
    setIncludeCoinglassData(result[COINGLASS_STORAGE_KEYS.include] === true);
    setCoinglassSettings(mergeCoinglassSettings(result[COINGLASS_STORAGE_KEYS.settings]));
    setManualCoinglassSymbols(normalizeCoinglassSymbols(result[COINGLASS_STORAGE_KEYS.manualSymbols]));
    const snapshot = await loadCoinglassSnapshot();
    setCoinglassSnapshot(snapshot);
    setCoinglassState(snapshot?.status === 'partial' ? 'partial' : snapshot?.status === 'success' ? 'success' : snapshot?.status === 'error' ? 'error' : 'idle');
  }

  async function loadChatTargets(): Promise<void> {
    const result = await chrome.storage.local.get(['chat_targets']);
    setChatTargets(Array.isArray(result.chat_targets) ? result.chat_targets : []);
  }

  async function loadPromptSettings(): Promise<void> {
    const result = await chrome.storage.local.get(['prompt_settings']);
    if (result.prompt_settings?.basePrompt) {
      setPromptSettings(result.prompt_settings as PromptSettings);
    }
  }

  const groupedScreenshots = useMemo(() => groupBySymbol(screenshots), [screenshots]);
  const telemetryIntegrity = useMemo(() => validateTelemetryIntegrity(screenshots), [screenshots]);
  const tradingViewScreenshots = useMemo(() => screenshots.filter(isTradingViewScreenshot), [screenshots]);
  const enabledTargets = chatTargets.filter((target) => target.enabled);
  const matchingTargets = resolveMatchingTargets(screenshots, enabledTargets);
  const dispatchTargets = screenshots.length > 0 ? matchingTargets : enabledTargets;
  const coinglassSymbols = useMemo(() => (
    screenshots.length > 0 ? symbolsFromScreenshots(screenshots) : manualCoinglassSymbols
  ), [screenshots, manualCoinglassSymbols]);

  async function persistChatTargets(nextTargets: ChatTarget[]): Promise<void> {
    setChatTargets(nextTargets);
    await chrome.storage.local.set({ chat_targets: nextTargets });
  }

  async function handleSaveChatTarget(target: ChatTarget): Promise<void> {
    const existingIndex = chatTargets.findIndex((existing) => existing.id === target.id);
    const nextTargets = existingIndex >= 0
      ? chatTargets.map((existing) => existing.id === target.id ? target : existing)
      : [...chatTargets, target];
    await persistChatTargets(nextTargets);
  }

  async function handleToggleChatTarget(targetId: string, enabled: boolean): Promise<void> {
    const nextTargets = chatTargets.map((target) => target.id === targetId ? { ...target, enabled } : target);
    await persistChatTargets(nextTargets);
  }

  async function handleDeleteChatTarget(targetId: string): Promise<void> {
    await persistChatTargets(chatTargets.filter((target) => target.id !== targetId));
  }

  async function handleUpdatePromptSettings(settings: PromptSettings): Promise<void> {
    setPromptSettings(settings);
    await chrome.storage.local.set({ prompt_settings: settings });
  }

  async function handleAdditionalPromptChange(value: string): Promise<void> {
    setAdditionalPrompt(value);
    await chrome.storage.local.set({ additional_prompt: value });
  }

  async function handleAutosubmitChange(value: boolean): Promise<void> {
    setAutosubmit(value);
    await chrome.storage.local.set({ autosubmit_agents: value });
  }

  async function handleIncludeScrapedDataChange(value: boolean): Promise<void> {
    setIncludeScrapedData(value);
    await chrome.storage.local.set({ include_scraped_data: value });
  }

  async function handleIncludeCoinglassDataChange(value: boolean): Promise<void> {
    setIncludeCoinglassData(value);
    await chrome.storage.local.set({ [COINGLASS_STORAGE_KEYS.include]: value });
  }

  async function handleCoinglassSettingChange(section: CoinglassSection, value: boolean): Promise<void> {
    const nextSettings = { ...coinglassSettings, [section]: value };
    setCoinglassSettings(nextSettings);
    await chrome.storage.local.set({ [COINGLASS_STORAGE_KEYS.settings]: nextSettings });
  }

  async function handleManualCoinglassSymbolChange(symbol: CoinglassSymbol, enabled: boolean): Promise<void> {
    const nextSymbols = enabled
      ? [...new Set([...manualCoinglassSymbols, symbol])]
      : manualCoinglassSymbols.filter((candidate) => candidate !== symbol);
    const normalized = nextSymbols.length > 0 ? nextSymbols : ['BTC'] satisfies CoinglassSymbol[];
    setManualCoinglassSymbols(normalized);
    await chrome.storage.local.set({ [COINGLASS_STORAGE_KEYS.manualSymbols]: normalized });
  }

  async function handleScrapeCoinglass(): Promise<void> {
    const sections = enabledCoinglassSections(coinglassSettings);
    if (coinglassSymbols.length === 0 || sections.length === 0) {
      setCoinglassState('error');
      setCoinglassMessage('Select at least one symbol and one Coinglass section.');
      return;
    }

    setCoinglassSnapshot(null);
    setCoinglassState('scraping');
    setCoinglassMessage('Clearing old Coinglass data and opening Coinglass...');
    await chrome.storage.local.remove(COINGLASS_STORAGE_KEYS.snapshot);
    await chrome.runtime.sendMessage({
      type: 'CG_SCRAPE_REQUEST',
      request: {
        symbols: coinglassSymbols,
        sections,
      },
    } satisfies ExtensionMessage);
  }

  async function scrapeActiveTradingViewTelemetry(): Promise<TradingViewTelemetrySnapshot> {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !isTradingViewUrl(tab.url)) {
      throw new Error('Make the TradingView chart the active tab first');
    }

    const response = await chrome.tabs.sendMessage(tab.id, {
      type: 'TV_SCRAPE_TELEMETRY',
    } satisfies ExtensionMessage) as {
      success: boolean;
      telemetry?: TradingViewTelemetrySnapshot;
      error?: string;
    };

    if (!response.success || !response.telemetry) {
      throw new Error(response.error || 'TradingView returned no CTX telemetry');
    }

    return response.telemetry;
  }

  async function handleScrapeTelemetry(): Promise<boolean> {
    setTelemetryScrapeState('scraping');
    setTelemetryScrapeMessage('Reading active TradingView chart...');

    try {
      const telemetry = await scrapeActiveTradingViewTelemetry();
      const metricCount = Object.keys(telemetry.metrics).length;
      setManualTelemetryPreview(telemetry);
      await updateMatchingScreenshotTelemetry(telemetry);

      setTelemetryScrapeState(telemetry.valid ? telemetry.quality === 'partial' ? 'warning' : 'success' : 'error');
      if (telemetry.valid) {
        setIncludeScrapedData(true);
        await chrome.storage.local.set({ include_scraped_data: true });
        setTelemetryScrapeMessage(telemetry.quality === 'partial'
          ? `Ready to include partial ${telemetry.symbol} ${telemetry.timeframe} CTX data with ${metricCount} metrics.`
          : `Ready to include ${telemetry.symbol} ${telemetry.timeframe} CTX data with ${metricCount} metrics.`);
      } else {
        setTelemetryScrapeMessage(`Scraped ${metricCount} metrics, but validation failed: ${telemetry.errors.join('; ')}`);
      }
      return telemetry.valid;
    } catch (error) {
      setTelemetryScrapeState('error');
      setTelemetryScrapeMessage(error instanceof Error ? error.message : String(error));
      return false;
    }
  }

  async function handleRemoveScreenshot(key: string): Promise<void> {
    await db.deleteScreenshot(key);
    await loadScreenshots();
  }

  async function updateMatchingScreenshotTelemetry(telemetry: TradingViewTelemetrySnapshot): Promise<void> {
    const matchingScreenshot = screenshots.find((screenshot) => (
      isTradingViewScreenshot(screenshot) &&
      normalizeSymbol(screenshot.normalizedSymbol || screenshot.symbol) === normalizeSymbol(telemetry.symbol) &&
      screenshot.timeframe === telemetry.timeframe
    ));

    if (!matchingScreenshot) return;
    await db.updateScreenshotTelemetry(matchingScreenshot.key, telemetry);
    await loadScreenshots();
  }

  async function handleClearAnalysis(): Promise<void> {
    await db.clearScreenshots();
    await chrome.storage.local.set({ additional_prompt: '' });
    setAdditionalPrompt('');
    setTargetStatuses({});
    await loadScreenshots();
  }

  async function handlePrepareChats(): Promise<void> {
    const canDispatchCoinglassOnly = screenshots.length === 0 && includeCoinglassData && coinglassSnapshot;
    if ((!canDispatchCoinglassOnly && screenshots.length === 0) || dispatchTargets.length === 0) return;
    if (includeCoinglassData && !coinglassSnapshot) {
      setCoinglassState('error');
      setCoinglassMessage('Scrape Coinglass before including it in the prompt.');
      return;
    }

    setIsSubmitting(true);
    try {
      let dispatchTelemetry: TradingViewTelemetrySnapshot | undefined;
      if (includeScrapedData && screenshots.length > 0) {
        setTelemetryScrapeState('scraping');
        setTelemetryScrapeMessage('Refreshing CTX data before submit...');
        const telemetry = await scrapeActiveTradingViewTelemetry().catch((error) => {
          if (manualTelemetryPreview?.valid) return manualTelemetryPreview;
          throw error;
        });
        dispatchTelemetry = telemetry;
        await updateMatchingScreenshotTelemetry(telemetry);
        const metricCount = Object.keys(telemetry.metrics).length;
        setTelemetryScrapeState(telemetry.valid ? telemetry.quality === 'partial' ? 'warning' : 'success' : 'error');
        setTelemetryScrapeMessage(telemetry.valid
          ? telemetry.quality === 'partial'
            ? `Including partial ${telemetry.symbol} ${telemetry.timeframe} CTX data with ${metricCount} metrics.`
            : `Including fresh ${telemetry.symbol} ${telemetry.timeframe} CTX data with ${metricCount} metrics.`
          : `Fresh scrape failed validation: ${telemetry.errors.join('; ')}`);
        if (!telemetry.valid) return;
      }

      await chrome.runtime.sendMessage({
        type: 'DISPATCH_REQUEST',
        screenshotKeys: screenshots.map((screenshot) => screenshot.key),
        additionalPrompt,
        targetIds: dispatchTargets.map((target) => target.id),
        basePrompt: promptSettings.basePrompt,
        autosubmit,
        includeScrapedData,
        telemetry: dispatchTelemetry,
        includeCoinglassData,
        coinglassSnapshot: coinglassSnapshot ?? undefined,
      } satisfies ExtensionMessage);
    } catch (error) {
      setTelemetryScrapeState('error');
      setTelemetryScrapeMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handlePasteFiles(files: FileList | File[]): Promise<void> {
    const imageFiles = Array.from(files).filter((file) => file.type.startsWith('image/'));
    if (imageFiles.length === 0) return;

    for (const file of imageFiles) {
      const id = generateId();
      const labels = labelsFromFilename(file.name);
      const hash = await computeHash(await file.arrayBuffer());
      const key = buildScreenshotKey(labels.symbol, labels.timeframe);
      const meta: ScreenshotMeta = {
        id,
        key,
        symbol: labels.symbol,
        normalizedSymbol: normalizeSymbol(labels.symbol),
        timeframe: labels.timeframe,
        blobId: generateId(),
        hash,
        mimeType: file.type || 'image/png',
        capturedAt: Date.now(),
        rawTradingView: {},
      };

      await db.putScreenshotReplacingChart(meta, file);
    }

    await loadScreenshots();
  }

  if (loading) {
    return <div className="loading-screen">Loading bare meat🧸🥩...</div>;
  }

  return (
    <div
      className={`app-root${isDragOver ? ' app-root--drag-over' : ''}`}
      onPaste={(event) => {
        if (event.clipboardData.files.length > 0) {
          event.preventDefault();
          void handlePasteFiles(event.clipboardData.files);
        }
      }}
      onDragOver={(event) => {
        event.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setIsDragOver(false);
        void handlePasteFiles(event.dataTransfer.files);
      }}
    >
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        chatTargets={chatTargets}
        promptSettings={promptSettings}
        onSaveChatTarget={handleSaveChatTarget}
        onDeleteChatTarget={handleDeleteChatTarget}
        onUpdateChatTarget={handleSaveChatTarget}
        onUpdatePromptSettings={handleUpdatePromptSettings}
        onClearScreenshots={handleClearAnalysis}
      />

      <div className="app-header">
        <h1 className="app-header__title">bare meat🧸🥩</h1>
      </div>

      <div className="agents-panel">
        <div className="section-title">
          Agents:
        </div>
        {chatTargets.length === 0 ? (
          <div className="empty-warning">
            No chat targets configured.
          </div>
        ) : (
          <div className="agent-list">
            {chatTargets.map((target) => (
              <div key={target.id} className={`agent-row${target.enabled ? '' : ' agent-row--disabled'}`}>
                <div className="agent-row__top">
                  <label className="agent-row__toggle">
                    <input
                      className="control-checkbox"
                      type="checkbox"
                      checked={target.enabled}
                      onChange={(event) => void handleToggleChatTarget(target.id, event.target.checked)}
                    />
                    <span className="agent-row__name">{target.name}</span>
                  </label>
                  <span className={`target-status ${getStatusClass(targetStatuses[target.id]?.state)}`}>
                    {target.enabled ? getStatusText(targetStatuses[target.id]) : 'Disabled'}
                  </span>
                </div>
                <div className="agent-row__meta">{target.provider.toUpperCase()} · sends selected screenshots</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="screenshots-panel">
        {screenshots.length === 0 ? (
          <div className="empty-state">
            No screenshots yet.<br />Go to TradingView and press Shift+Ctrl+S on Windows or Shift+Cmd+S on Mac.
          </div>
        ) : (
          <>
            {Object.entries(groupedScreenshots).map(([symbol, group]) => (
              <div key={symbol} className="screenshot-group">
                <h3 className="screenshot-group__title">{symbol}</h3>
                <div className="screenshot-grid">
                  {group.map((screenshot) => (
                    <div key={screenshot.key} className="screenshot-card">
                      <div className="screenshot-card__header">
                        <span>{screenshot.timeframe}</span>
                        <button className="remove-button" onClick={() => handleRemoveScreenshot(screenshot.key)}>Remove</button>
                      </div>
                      {previewUrls[screenshot.key] ? (
                        <a href={previewUrls[screenshot.key]} target="_blank" rel="noreferrer">
                          <img className="screenshot-card__image" src={previewUrls[screenshot.key]} alt={`${screenshot.symbol} ${screenshot.timeframe}`} />
                        </a>
                      ) : (
                        <div className="screenshot-card__placeholder" />
                      )}
                      <div className="screenshot-card__time">{new Date(screenshot.capturedAt).toLocaleTimeString()}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <div className="screenshot-summary">
              {screenshots.length} screenshot(s) · {Object.keys(groupedScreenshots).length} symbol(s)
            </div>
          </>
        )}
      </div>

      <div className="prompt-panel">
        <label className="option-row option-row--stacked">
          <input
            className="option-row__checkbox"
            type="checkbox"
            checked={includeScrapedData}
            onChange={(event) => void handleIncludeScrapedDataChange(event.target.checked)}
          />
          <span>
            Add scraped TradingView CTX data to prompt
          </span>
        </label>
        <div className="telemetry-preview">
          <div className="telemetry-preview__header">
            <span>Preview scraped data</span>
            <span className={includeScrapedData ? 'telemetry-preview__state telemetry-preview__state--included' : 'telemetry-preview__state'}>
              {includeScrapedData ? 'Included' : 'Not included'}
            </span>
          </div>
          <div className="telemetry-preview__actions">
            <button
              className="telemetry-preview__button"
              type="button"
              disabled={telemetryScrapeState === 'scraping' || isSubmitting}
              onClick={() => void handleScrapeTelemetry()}
            >
              {telemetryScrapeState === 'scraping' ? 'Scraping...' : 'Scrape CTX now'}
            </button>
            {telemetryScrapeMessage && (
              <span className={`telemetry-preview__message telemetry-preview__message--${telemetryScrapeState}`}>
                {telemetryScrapeMessage}
              </span>
            )}
          </div>
          <TelemetryStatusList
            screenshots={tradingViewScreenshots}
            integrity={telemetryIntegrity}
            manualPreview={manualTelemetryPreview}
          />
        </div>
        <label className="option-row option-row--stacked">
          <input
            className="option-row__checkbox"
            type="checkbox"
            checked={includeCoinglassData}
            onChange={(event) => void handleIncludeCoinglassDataChange(event.target.checked)}
          />
          <span>
            Add scraped Coinglass JSON data to prompt
          </span>
        </label>
        <div className="coinglass-preview">
          <div className="coinglass-preview__header">
            <span>Coinglass data</span>
            <span className={includeCoinglassData ? 'coinglass-preview__state coinglass-preview__state--included' : 'coinglass-preview__state'}>
              {includeCoinglassData ? 'Included' : 'Not included'}
            </span>
          </div>
          {screenshots.length === 0 && (
            <div className="coinglass-symbols">
              {(['BTC', 'ETH', 'SOL'] as CoinglassSymbol[]).map((symbol) => (
                <label key={symbol} className="coinglass-chip">
                  <input
                    className="control-checkbox"
                    type="checkbox"
                    checked={manualCoinglassSymbols.includes(symbol)}
                    onChange={(event) => void handleManualCoinglassSymbolChange(symbol, event.target.checked)}
                  />
                  {symbol}
                </label>
              ))}
            </div>
          )}
          <div className="coinglass-settings">
            {Object.entries(coinglassSettings).map(([section, enabled]) => (
              <label key={section} className="coinglass-setting">
                <input
                  className="control-checkbox"
                  type="checkbox"
                  checked={enabled}
                  onChange={(event) => void handleCoinglassSettingChange(section as CoinglassSection, event.target.checked)}
                />
                {formatCoinglassSection(section as CoinglassSection)}
              </label>
            ))}
          </div>
          <div className="coinglass-preview__actions">
            <button
              className="coinglass-preview__button"
              type="button"
              disabled={coinglassState === 'scraping' || isSubmitting}
              onClick={() => void handleScrapeCoinglass()}
            >
              {coinglassState === 'scraping' ? 'Scraping...' : 'Scrape Coinglass'}
            </button>
            {coinglassMessage && (
              <span className={`coinglass-preview__message coinglass-preview__message--${coinglassState}`}>
                {coinglassMessage}
              </span>
            )}
          </div>
          <CoinglassSnapshotPreview snapshot={coinglassSnapshot} />
        </div>
        <label className="field-label field-label--prompt">Additional prompt</label>
        <textarea
          className="prompt-input"
          value={additionalPrompt}
          onChange={(event) => void handleAdditionalPromptChange(event.target.value)}
          placeholder="Any special context for this analysis..."
        />
      </div>

      <div className="action-bar">
        <button
          className="action-button action-button--submit"
          disabled={dispatchTargets.length === 0 || isSubmitting || (screenshots.length === 0 && (!includeCoinglassData || !coinglassSnapshot))}
          onClick={() => void handlePrepareChats()}
        >
          {isSubmitting ? 'Preparing...' : 'Submit'}
        </button>
        <label className="option-row option-row--nowrap">
          <input
            className="control-checkbox"
            type="checkbox"
            checked={autosubmit}
            onChange={(event) => void handleAutosubmitChange(event.target.checked)}
          />
          Autosubmit
        </label>
        <button
          className="action-button"
          disabled={screenshots.length === 0}
          onClick={() => void handleClearAnalysis()}
        >
          Clear analysis
        </button>
        <button
          className="action-button action-button--settings"
          onClick={() => setIsSettingsOpen(true)}
        >
          Settings ⚙️
        </button>
      </div>

      <SessionStatusBlock now={now} />
    </div>
  );
}

function CoinglassSnapshotPreview({ snapshot }: { snapshot: CoinglassSnapshot | null }): JSX.Element {
  if (!snapshot) {
    return (
      <div className="coinglass-preview__empty">
        No Coinglass data scraped for this request.
      </div>
    );
  }

  return (
    <details className="coinglass-result" open>
      <summary className="coinglass-result__summary">
        <span>{snapshot.symbols.join(', ')} · {snapshot.sections.length} section(s)</span>
        <span className={`coinglass-result__status coinglass-result__status--${snapshot.status}`}>
          {snapshot.status}
        </span>
      </summary>
      <div className="coinglass-result__meta">
        Captured {new Date(snapshot.capturedAt).toLocaleTimeString()}
      </div>
      {snapshot.warnings.length > 0 && (
        <div className="coinglass-result__warning">
          {snapshot.warnings.join('; ')}
        </div>
      )}
      {snapshot.errors.length > 0 && (
        <div className="coinglass-result__error">
          {snapshot.errors.join('; ')}
        </div>
      )}
      <pre className="coinglass-result__json">{JSON.stringify(snapshot.data, null, 2)}</pre>
    </details>
  );
}

function TelemetryStatusList({
  screenshots,
  integrity,
  manualPreview,
}: {
  screenshots: ScreenshotMeta[];
  integrity: Map<string, TelemetryIntegrityResult>;
  manualPreview: TradingViewTelemetrySnapshot | null;
}): JSX.Element {
  if (screenshots.length === 0 && !manualPreview) {
    return (
      <div className="telemetry-list telemetry-list--empty">
        No TradingView screenshots captured yet.
      </div>
    );
  }

  const generalTelemetry = pickGeneralTelemetry(screenshots, manualPreview);

  return (
    <div className="telemetry-list">
      {generalTelemetry && (
        <details className="telemetry-row telemetry-row--general" open>
          <summary className="telemetry-row__summary">
            <span className="telemetry-row__chart">General data</span>
            <span className="telemetry-row__status telemetry-row__status--scraped">
              {generalTelemetry.metricCount}
            </span>
          </summary>
          <div className="telemetry-row__body">
            <TelemetryMetricTable telemetry={generalTelemetry.telemetry} scopes={['shared']} />
          </div>
        </details>
      )}

      {screenshots.map((screenshot) => {
        const result = integrity.get(screenshot.key) ?? {
          status: 'missing',
          promptEligible: false,
          metricCount: 0,
          reason: 'No CTX telemetry was captured with this screenshot.',
        } satisfies TelemetryIntegrityResult;
        const telemetry = screenshot.tradingViewTelemetry;
        const currency = telemetry?.quoteCurrency || quoteCurrencyFromSymbol(screenshot.normalizedSymbol || screenshot.symbol);

        return (
          <details key={screenshot.key} className="telemetry-row" open>
            <summary className="telemetry-row__summary">
              <span className="telemetry-row__chart">
                {screenshot.normalizedSymbol || screenshot.symbol} · {screenshot.timeframe} · {currency}
              </span>
              <span className={`telemetry-row__status telemetry-row__status--${result.status}`}>
                {telemetryStatusLabel(result)}
              </span>
            </summary>
            <div className="telemetry-row__body">
              <div className="telemetry-row__meta">
                {result.metricCount} metric(s) · captured {new Date(screenshot.capturedAt).toLocaleTimeString()}
              </div>
              {result.reason && (
                <div className={`telemetry-row__reason${result.status === 'partial' ? ' telemetry-row__reason--warning' : ''}`}>
                  {result.reason}
                </div>
              )}
              {telemetry && <TelemetryMetricTable telemetry={telemetry} scopes={['chart']} />}
            </div>
          </details>
        );
      })}

      {manualPreview && (
        <details className="telemetry-row telemetry-row--manual" open>
          <summary className="telemetry-row__summary">
            <span className="telemetry-row__chart">
              Live · {manualPreview.symbol} · {manualPreview.timeframe}
            </span>
            <span className={`telemetry-row__status telemetry-row__status--${manualPreview.valid ? manualPreview.quality === 'partial' ? 'partial' : 'scraped' : 'invalid'}`}>
              {manualPreview.valid ? manualPreview.quality === 'partial' ? 'Partial' : 'Scraped' : 'Invalid'}
            </span>
          </summary>
          <div className="telemetry-row__body">
            <div className="telemetry-row__meta">
              {Object.keys(manualPreview.metrics).length} metric(s) · live preview only
            </div>
            {manualPreview.errors.length > 0 && (
              <div className="telemetry-row__reason">
                {manualPreview.errors.join('; ')}
              </div>
            )}
            {manualPreview.warnings && manualPreview.warnings.length > 0 && (
              <div className="telemetry-row__reason telemetry-row__reason--warning">
                {manualPreview.warnings.join('; ')}
              </div>
            )}
            <TelemetryMetricTable telemetry={manualPreview} scopes={['chart']} />
          </div>
        </details>
      )}
    </div>
  );
}

function TelemetryMetricTable({
  telemetry,
  scopes,
}: {
  telemetry: TradingViewTelemetrySnapshot;
  scopes: TelemetryMetricSection['scope'][];
}): JSX.Element {
  const sections = groupTelemetryMetrics(telemetry).filter((section) => scopes.includes(section.scope));

  return (
    <div className="telemetry-metrics">
      {sections.map((section) => (
        <details key={section.scope} className="telemetry-metric-scope" open>
          <summary className="telemetry-metric-scope__summary">
            <span>{section.scope === 'chart' ? 'Exact chart data' : 'General context'}</span>
            <span>{section.groups.reduce((total, group) => total + group.metrics.length, 0)}</span>
          </summary>
          {section.groups.map((group) => (
            <details key={group.name} className="telemetry-metric-group" open>
              <summary className="telemetry-metric-group__summary">
                <span>{formatTelemetryGroupName(group.name)}</span>
                <span>{group.metrics.length}</span>
              </summary>
              <div className="telemetry-metric-table">
                {group.metrics.map((metric) => (
                  <div key={metric.label} className="telemetry-metric-row">
                    <span className="telemetry-metric-row__label">{metric.label}</span>
                    <span className="telemetry-metric-row__value">{metric.rawValue}</span>
                  </div>
                ))}
              </div>
            </details>
          ))}
        </details>
      ))}
    </div>
  );
}

type TelemetryMetricGroup = {
  name: string;
  metrics: Array<{ label: string; rawValue: string }>;
};

type TelemetryMetricSection = {
  scope: 'chart' | 'shared';
  groups: TelemetryMetricGroup[];
};

function groupTelemetryMetrics(telemetry: TradingViewTelemetrySnapshot): TelemetryMetricSection[] {
  const groups = {
    chart: new Map<string, Array<{ label: string; rawValue: string }>>(),
    shared: new Map<string, Array<{ label: string; rawValue: string }>>(),
  };

  for (const metric of Object.values(pluginSessionActiveMetrics(telemetry.metrics)).sort((a, b) => a.label.localeCompare(b.label))) {
    const group = metric.label.split('|')[1] || 'OTHER';
    const scope = isSharedTelemetryGroup(group) ? 'shared' : 'chart';
    const entries = groups[scope].get(group) ?? [];
    entries.push({
      label: metric.label,
      rawValue: metric.rawValue,
    });
    groups[scope].set(group, entries);
  }

  const sections: TelemetryMetricSection[] = [
    { scope: 'chart', groups: mapTelemetryGroups(groups.chart) },
    { scope: 'shared', groups: mapTelemetryGroups(groups.shared) },
  ];

  return sections.filter((section) => section.groups.length > 0);
}

function mapTelemetryGroups(groups: Map<string, Array<{ label: string; rawValue: string }>>): TelemetryMetricGroup[] {
  return [...groups.entries()].map(([name, metrics]) => ({ name, metrics }));
}

function isSharedTelemetryGroup(group: string): boolean {
  return group === 'CME' || group === 'CROSS' || group === 'LEVEL';
}

function pickGeneralTelemetry(
  screenshots: ScreenshotMeta[],
  manualPreview: TradingViewTelemetrySnapshot | null
): { telemetry: TradingViewTelemetrySnapshot; metricCount: number } | null {
  const candidates = [
    ...(manualPreview ? [manualPreview] : []),
    ...screenshots
      .map((screenshot) => screenshot.tradingViewTelemetry)
      .filter((telemetry): telemetry is TradingViewTelemetrySnapshot => Boolean(telemetry)),
  ].sort((a, b) => b.capturedAt - a.capturedAt);

  for (const telemetry of candidates) {
    const sharedSection = groupTelemetryMetrics(telemetry).find((section) => section.scope === 'shared');
    const metricCount = sharedSection?.groups.reduce((total, group) => total + group.metrics.length, 0) ?? 0;
    if (metricCount > 0) return { telemetry, metricCount };
  }

  return null;
}

function formatTelemetryGroupName(group: string): string {
  const names: Record<string, string> = {
    CME: 'CME',
    CROSS: 'Cross market',
    DIST: 'Distances',
    EMA: 'EMAs',
    LEVEL: 'Levels',
    META: 'Meta',
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

function telemetryStatusLabel(result: TelemetryIntegrityResult): string {
  if (result.status === 'scraped') return 'Scraped';
  if (result.status === 'partial') return 'Partial';
  if (result.status === 'missing') return 'Missing';
  if (result.status === 'invalid') return 'Invalid';
  return 'Rejected';
}

function quoteCurrencyFromSymbol(symbol: string): string {
  if (/USDT/i.test(symbol)) return 'USDT';
  if (/USD/i.test(symbol)) return 'USD';
  return 'unknown';
}

function symbolsFromScreenshots(screenshots: ScreenshotMeta[]): CoinglassSymbol[] {
  const symbols = screenshots
    .map((screenshot) => coinglassSymbolFromText(screenshot.normalizedSymbol || screenshot.symbol))
    .filter((symbol): symbol is CoinglassSymbol => Boolean(symbol));
  return [...new Set(symbols)];
}

function normalizeCoinglassSymbols(value: unknown): CoinglassSymbol[] {
  if (!Array.isArray(value)) return ['BTC'];
  const symbols = value
    .map((item) => typeof item === 'string' ? coinglassSymbolFromText(item) : null)
    .filter((symbol): symbol is CoinglassSymbol => Boolean(symbol));
  return symbols.length > 0 ? [...new Set(symbols)] : ['BTC'];
}

function coinglassSymbolFromText(value: string): CoinglassSymbol | null {
  const normalized = normalizeSymbol(value);
  if (normalized.includes('BTC')) return 'BTC';
  if (normalized.includes('ETH')) return 'ETH';
  if (normalized.includes('SOL')) return 'SOL';
  return null;
}

function formatCoinglassSection(section: CoinglassSection): string {
  const names: Record<CoinglassSection, string> = {
    openInterest: 'Open interest',
    fundingRateSymbol: 'Funding by symbol',
    liquidationsTotals: 'Liquidations',
    fundingRate: 'Funding overview',
    longShortRatio: 'Long/short ratio',
    etf: 'ETF',
    basis: 'Basis',
    spotInflowOutflow: 'Spot inflow/outflow',
  };
  return names[section];
}

function coinglassSummaryMessage(snapshot: CoinglassSnapshot): string {
  const symbolCount = snapshot.symbols.length;
  const sectionCount = snapshot.sections.length;
  if (snapshot.status === 'success') return `Scraped ${symbolCount} symbol(s), ${sectionCount} section(s).`;
  if (snapshot.status === 'partial') return `Scraped with ${snapshot.warnings.length} warning(s).`;
  return snapshot.errors.join('; ') || 'Coinglass scrape failed.';
}

function labelsFromFilename(filename: string): { symbol: string; timeframe: string } {
  const basename = filename.replace(/\.[^.]+$/, '');
  const parts = basename.split(/[\s_-]+/).filter(Boolean);
  let timeframeIndex = -1;
  for (let index = parts.length - 1; index >= 0; index--) {
    const part = parts[index];
    if (part && isTimeframeToken(part)) {
      timeframeIndex = index;
      break;
    }
  }

  if (timeframeIndex > 0) {
    const timeframe = parts[timeframeIndex];
    return {
      symbol: parts.slice(0, timeframeIndex).join(''),
      timeframe: timeframe ? normalizeTimeframeToken(timeframe) : 'image',
    };
  }

  return {
    symbol: 'PASTED',
    timeframe: 'image',
  };
}

function isTradingViewUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    return new URL(url).hostname.endsWith('tradingview.com');
  } catch {
    return false;
  }
}

function isTimeframeToken(value: string): boolean {
  return /^\d+(m|h|d|w|M|H|D|W)$/.test(value);
}

function normalizeTimeframeToken(value: string): string {
  const match = value.match(/^(\d+)(m|h|d|w|M|H|D|W)$/);
  if (!match) return value;
  const amount = match[1] ?? '';
  const unit = match[2] ?? '';
  if (unit === 'm') return `${amount}m`;
  if (unit === 'M') return `${amount}M`;
  return `${amount}${unit.toUpperCase()}`;
}

function SessionStatusBlock({ now }: { now: Date }): JSX.Element {
  const sessions = marketSessionStatuses(now);
  const activeSessions = sessions.filter((session) => session.active);
  const nextFourHourClose = nextFourHourCandleClose(now);

  return (
    <div className="sessions-panel">
      <div className="section-title">
        Sessions
      </div>
      <div className="sessions-panel__active">
        Active: {activeSessions.length > 0 ? activeSessions.map((session) => session.name).join(', ') : 'none'}
      </div>
      <div className="session-grid">
        {sessions.map((session) => (
          <div key={session.name} className={`session-card${session.active ? ' session-card--active' : ''}`}>
            <div className="session-card__header">
              <span className="session-card__name">{session.name}</span>
              <span className={`session-card__state${session.active ? ' session-card__state--active' : ''}`}>{session.active ? 'open' : 'closed'}</span>
            </div>
            <div className="session-card__time">
              {session.active ? `closes in ${formatDuration(session.msUntilClose)}` : `opens in ${formatDuration(session.msUntilOpen)}`}
            </div>
          </div>
        ))}
      </div>
      <div className="candle-close">
        4H candle closes in <span className="candle-close__time">{formatDuration(nextFourHourClose.getTime() - now.getTime(), true)}</span>
      </div>
    </div>
  );
}

function sortScreenshots(screenshots: ScreenshotMeta[]): ScreenshotMeta[] {
  return [...screenshots].sort((a, b) => a.capturedAt - b.capturedAt);
}

function groupBySymbol(screenshots: ScreenshotMeta[]): Record<string, ScreenshotMeta[]> {
  const groups: Record<string, ScreenshotMeta[]> = {};
  for (const screenshot of screenshots) {
    const symbol = screenshot.normalizedSymbol || screenshot.symbol;
    groups[symbol] ??= [];
    groups[symbol].push(screenshot);
  }

  for (const group of Object.values(groups)) {
    group.sort((a, b) => compareTimeframes(a.timeframe, b.timeframe));
  }

  return groups;
}

function compareTimeframes(a: string, b: string): number {
  return timeframeRank(b) - timeframeRank(a);
}

function timeframeRank(timeframe: string): number {
  const match = timeframe.match(/^(\d+)(m|H|D|W|M)$/);
  if (!match) return 0;

  const amount = Number(match[1]);
  const unit = match[2];
  const unitMinutes: Record<string, number> = { m: 1, H: 60, D: 1440, W: 10080, M: 43200 };
  return amount * (unit ? unitMinutes[unit] ?? 0 : 0);
}

function getStatusClass(status: TargetStatus['state'] | undefined): string {
  if (status === 'ready' || status === 'submitted' || status === 'finished') return 'target-status--success';
  if (status === 'error') return 'target-status--error';
  if (status) return 'target-status--working';
  return 'target-status--idle';
}

function getStatusText(status: TargetStatus | undefined): string {
  if (!status) return 'Pending';
  if (status.state === 'ready') return '✓ Ready — send manually';
  if (status.state === 'submitted') return '✓ Submitted';
  if (status.state === 'working') return 'Working…';
  if (status.state === 'finished') return '✓ Finished';
  if (status.state === 'error') return `✗ ${status.message ?? 'Error'}`;
  return status.message ?? status.state.replaceAll('_', ' ');
}
