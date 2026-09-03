import { defineBackground } from 'wxt/utils/define-background';
import { captureQueue } from '../src/capture/capture-queue';
import { dispatchRequest } from '../src/dispatch/dispatcher';
import type { ExtensionMessage } from '../src/messaging/protocol';
import { coinglassLiquidationHeatmapUrl, coinglassLiquidationMapUrl, coinglassUrl, isSectionAvailableForSymbol } from '../src/providers/coinglass/config';
import { clearStoredCoinglassSnapshot, saveCoinglassSnapshot } from '../src/providers/coinglass/storage';
import * as db from '../src/storage/db';
import { enabledTradingViewTimeframes, tradingViewUrlForTimeframe } from '../src/tradingview/auto-capture';
import type {
  CoinglassHeatmapTimeframe,
  CoinglassScrapeProgress,
  CoinglassScrapeRequest,
  CoinglassSection,
  CoinglassScreenshotImage,
  CoinglassSnapshot,
  CoinglassSymbol,
  DetectedInterval,
  DetectedSymbol,
  PendingCapture,
  ScreenshotMeta,
  TradingViewAutoCaptureProgress,
  TradingViewAutoCaptureRequest,
  TradingViewAutoCaptureResult,
  TradingViewTelemetrySnapshot,
} from '../src/types';
import { buildScreenshotKey, computeHash, generateId } from '../src/utils/symbols';

const DEFAULT_CLIPBOARD_TIMEOUT_MS = 4000;
const CLIPBOARD_IMAGE_WAIT_MS = 6000;
const COINGLASS_PAGE_DELAY_MS = 1400;
const COINGLASS_LOAD_DELAY_MS = 2200;
const COINGLASS_MESSAGE_TIMEOUT_MS = 12000;
const TRADINGVIEW_LOAD_DELAY_MS = 1800;
const TRADINGVIEW_MESSAGE_TIMEOUT_MS = 75000;

let offscreenDocumentCreated = false;
let captureProcessorRunning = false;
let screenshotWorkQueue: Promise<void> = Promise.resolve();

function queueScreenshotWork<T>(work: () => Promise<T>): Promise<T> {
  const result = screenshotWorkQueue.then(work, work);
  screenshotWorkQueue = result.then(() => undefined, () => undefined);
  return result;
}

interface ClipboardReadResponse {
  success: boolean;
  dataUrl?: string;
  hash?: string;
  mimeType?: string;
  error?: string;
}

export default defineBackground(() => {
  if (chrome.sidePanel?.setPanelBehavior) {
    void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((error) => {
      console.error('[bare meat🧸🥩] Failed to enable side panel action click:', error);
    });
  }

  chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender, sendResponse) => {
    void handleRuntimeMessage(message, sender).then(sendResponse);
    return true;
  });

  chrome.commands?.onCommand.addListener((command) => {
    if (command === 'capture_tradingview') {
      void triggerActiveTradingViewCapture();
    }
  });

  console.log('[bare meat🧸🥩] Background service worker initialized');
});

async function handleRuntimeMessage(
  message: ExtensionMessage,
  sender: chrome.runtime.MessageSender
): Promise<{ success: boolean; error?: string }> {
  try {
    if (message.type === 'TV_CAPTURE_TRIGGERED') {
      const capture = message.capture;
      const tabId = sender.tab?.id ?? capture.sourceTabId ?? await activeTradingViewTabId();
      const pendingCapture = captureQueue.addToQueue(capture.symbol, capture.timeframe, tabId, capture.telemetry);

      console.log(`[bare meat🧸🥩] queued ${pendingCapture.symbol.normalized} ${pendingCapture.timeframe.normalized}`);
      void processCaptureQueue();
      return { success: true };
    }

    if (message.type === 'TV_CONTENT_READY') {
      console.log(`[bare meat🧸🥩] TradingView content ready (${message.frame}) ${message.href}`);
      return { success: true };
    }

    if (message.type === 'TV_AUTO_CAPTURE_REQUEST') {
      const result = await queueScreenshotWork(() => autoCaptureTradingView(message.request));
      return result.errors.length > 0
        ? { success: false, error: result.errors.join('; ') }
        : { success: true };
    }

    if (message.type === 'DISPATCH_REQUEST') {
      void dispatchRequest(message);
      return { success: true };
    }

    if (message.type === 'CG_SCRAPE_REQUEST') {
      void scrapeCoinglass(message.request);
      return { success: true };
    }

    return { success: false, error: `Unsupported message type: ${message.type}` };
  } catch (error) {
    console.error('[bare meat🧸🥩] Message handler error:', error);
    return { success: false, error: String(error) };
  }
}

async function triggerActiveTradingViewCapture(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !isTradingViewUrl(tab.url)) return;

  await ensureTradingViewContentScript(tab.id);
  await chrome.tabs.sendMessage(tab.id, {
    type: 'TV_CAPTURE_SHORTCUT',
  } satisfies ExtensionMessage).catch((error) => {
    console.error('[bare meat🧸🥩] TradingView command capture failed:', error);
  });
}

async function ensureTradingViewContentScript(tabId: number): Promise<void> {
  const ready = await chrome.tabs.sendMessage(tabId, {
    type: 'TV_CONTENT_PING',
  } satisfies ExtensionMessage).then(() => true).catch(() => false);
  if (ready) return;

  await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    files: ['content-scripts/tradingview.js'],
  }).catch(() => {});
  await delay(300);
}

function isTradingViewUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    return new URL(url).hostname.endsWith('tradingview.com');
  } catch {
    return false;
  }
}

async function activeTradingViewTabId(): Promise<number> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.id && isTradingViewUrl(tab.url) ? tab.id : -1;
}

async function scrapeCoinglass(request: CoinglassScrapeRequest): Promise<void> {
  await clearStoredCoinglassSnapshot();

  const snapshot: CoinglassSnapshot = {
    id: generateId(),
    capturedAt: Date.now(),
    symbols: request.symbols,
    sections: request.sections,
    status: 'scraping',
    data: {},
    screenshots: [],
    warnings: [],
    errors: [],
  };

  try {
    const previousActiveTab = await getActiveTab();
    const jsonTab = await findOrOpenCoinglassTab('json');
    if (!jsonTab.id) throw new Error('Coinglass JSON tab has no id');

    for (const symbol of request.symbols) {
      snapshot.data[symbol] ??= {};
      for (const section of request.sections) {
        if (!isSectionAvailableForSymbol(section, symbol)) {
          snapshot.warnings.push(`${section} is not available for ${symbol}`);
          continue;
        }

        if (section === 'longShortRatio') {
          const ratios: Record<string, unknown> = {};
          for (const timeframe of ['1h', '4h', '12h', '24h'] as const) {
            try {
              ratios[timeframe] = await scrapeCoinglassPage(jsonTab.id, section, symbol, timeframe);
            } catch (error) {
              snapshot.errors.push(`${section} ${symbol} ${timeframe}: ${error instanceof Error ? error.message : String(error)}`);
            }
            await delay(COINGLASS_PAGE_DELAY_MS);
          }
          snapshot.data[symbol][section] = ratios;
        } else {
          try {
            snapshot.data[symbol][section] = await scrapeCoinglassPage(jsonTab.id, section, symbol);
          } catch (error) {
            snapshot.errors.push(`${section} ${symbol}: ${error instanceof Error ? error.message : String(error)}`);
          }
          await delay(COINGLASS_PAGE_DELAY_MS);
        }
      }
    }

    await queueScreenshotWork(() => scrapeCoinglassScreenshots(request, snapshot, previousActiveTab));

    snapshot.status = snapshotHasData(snapshot)
      ? snapshot.errors.length > 0 || snapshot.warnings.length > 0 ? 'partial' : 'success'
      : 'error';
    snapshot.capturedAt = Date.now();
    await saveCoinglassSnapshot(snapshot);
    await emitCoinglassComplete(snapshot);
  } catch (error) {
    snapshot.status = 'error';
    snapshot.capturedAt = Date.now();
    snapshot.errors.push(error instanceof Error ? error.message : String(error));
    await emitCoinglassFailed(snapshot);
  }
}

async function autoCaptureTradingView(request: TradingViewAutoCaptureRequest): Promise<TradingViewAutoCaptureResult> {
  const result: TradingViewAutoCaptureResult = { captured: 0, errors: [] };
  const presetGroups = request.presets
    .map((preset) => ({ preset, timeframes: enabledTradingViewTimeframes(preset) }))
    .filter((group) => group.timeframes.length > 0);
  if (presetGroups.length === 0) {
    result.errors.push('Select at least one TradingView chart and timeframe.');
    await emitTradingViewAutoFailed(result);
    return result;
  }

  const previousActiveTab = await getActiveTab();
  let tab: chrome.tabs.Tab | null = null;

  try {
    for (const { preset, timeframes } of presetGroups) {
      try {
        tab = await chrome.tabs.create({
          url: tradingViewUrlForTimeframe(preset.chartUrl, timeframes[0]!),
          active: true,
        });
        if (!tab.id) throw new Error('TradingView automation tab has no id.');
        await waitForTabComplete(tab.id);
        await delay(TRADINGVIEW_LOAD_DELAY_MS);
        await ensureTradingViewContentScript(tab.id);

        for (const timeframe of timeframes) {
          try {
            await emitTradingViewAutoProgress({
              symbol: preset.symbol,
              timeframe,
              message: `Preparing ${preset.symbol} ${timeframe}`,
            });

            const prepared = await sendTradingViewTabMessage(tab.id, {
              type: 'TV_PREPARE_AUTO_CAPTURE',
              symbol: preset.symbol,
              timeframe,
            }).catch((error) => ({ success: false, error: String(error) }));

            if (!prepared?.success) {
              throw new Error(prepared?.error ?? `TradingView did not prepare ${preset.symbol} ${timeframe}`);
            }
            if (!prepared.telemetry?.valid) {
              throw new Error(`TradingView CTX is not valid for ${preset.symbol} ${timeframe}`);
            }

            await emitTradingViewAutoProgress({
              symbol: prepared.symbol?.display ?? preset.symbol,
              timeframe,
              message: `Capturing ${preset.symbol} ${timeframe}`,
            });

            const screenshot = await captureCurrentTradingViewTab(
              tab.id,
              prepared.symbol ?? fallbackSymbol(preset.symbol),
              prepared.timeframe ?? fallbackInterval(timeframe),
              prepared.telemetry
            );
            await saveTradingViewScreenshot(screenshot);
            result.captured += 1;
          } catch (error) {
            result.errors.push(`${preset.symbol} ${timeframe}: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
      } catch (error) {
        result.errors.push(`${preset.symbol}: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        if (tab?.id) await chrome.tabs.remove(tab.id).catch(() => {});
        tab = null;
      }
    }
  } finally {
    await restoreActiveTab(previousActiveTab);
  }

  if (result.captured > 0) {
    await emitTradingViewAutoComplete(result);
  } else {
    await emitTradingViewAutoFailed(result);
  }
  return result;
}

async function captureCurrentTradingViewTab(
  tabId: number,
  symbol: DetectedSymbol,
  timeframe: DetectedInterval,
  telemetry?: TradingViewTelemetrySnapshot
): Promise<{ dataUrl: string; hash: string; mimeType: string; symbol: DetectedSymbol; timeframe: DetectedInterval; telemetry?: TradingViewTelemetrySnapshot }> {
  const tab = await chrome.tabs.get(tabId);
  if (!tab.windowId) throw new Error('TradingView tab window could not be identified');
  const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
  const blob = dataUrlToBlob(dataUrl, 'image/png');
  return {
    dataUrl,
    hash: await computeHash(await blob.arrayBuffer()),
    mimeType: blob.type || 'image/png',
    symbol,
    timeframe,
    telemetry,
  };
}

async function saveTradingViewScreenshot(result: {
  dataUrl: string;
  hash: string;
  mimeType: string;
  symbol: DetectedSymbol;
  timeframe: DetectedInterval;
  telemetry?: TradingViewTelemetrySnapshot;
}): Promise<void> {
  const imageBlob = dataUrlToBlob(result.dataUrl, result.mimeType);
  const screenshotMeta = buildTradingViewScreenshotMeta(result.symbol, result.timeframe, result.hash, result.mimeType, result.telemetry);
  await db.putScreenshotReplacingChart(screenshotMeta, imageBlob);
  void chrome.runtime.sendMessage({
    type: 'SCREENSHOT_UPDATE',
    screenshot: screenshotMeta,
  } satisfies ExtensionMessage).catch(() => {});
}

function buildTradingViewScreenshotMeta(
  symbol: DetectedSymbol,
  timeframe: DetectedInterval,
  hash: string,
  mimeType: string,
  telemetry?: TradingViewTelemetrySnapshot
): ScreenshotMeta {
  return {
    id: generateId(),
    key: buildScreenshotKey(symbol.normalized, timeframe.normalized),
    symbol: symbol.display,
    normalizedSymbol: symbol.normalized,
    timeframe: timeframe.normalized,
    blobId: generateId(),
    hash,
    mimeType,
    capturedAt: Date.now(),
    rawTradingView: {
      intervalValue: timeframe.dataValue,
      intervalTooltip: timeframe.tooltip,
    },
    tradingViewTelemetry: telemetry,
  };
}

function fallbackSymbol(symbol: string): DetectedSymbol {
  return {
    display: symbol,
    normalized: symbol.trim().replace(/\s+/g, '').toUpperCase(),
  };
}

function fallbackInterval(timeframe: string): DetectedInterval {
  return {
    normalized: timeframe,
    visibleText: timeframe,
  };
}

function snapshotHasData(snapshot: CoinglassSnapshot): boolean {
  if ((snapshot.screenshots?.length ?? 0) > 0) return true;
  return Object.values(snapshot.data).some((sections) => (
    sections && Object.values(sections).some((value) => value && (
      typeof value !== 'object' || Object.keys(value as Record<string, unknown>).length > 0
    ))
  ));
}

async function scrapeCoinglassScreenshots(
  request: CoinglassScrapeRequest,
  snapshot: CoinglassSnapshot,
  previousActiveTab: chrome.tabs.Tab | null
): Promise<void> {
  const settings = request.screenshots;
  if (!settings?.liquidationHeatmap && !settings?.liquidationMap) return;
  const tab = await findOrOpenCoinglassTab('screenshots');
  if (!tab.id) return;

  try {
    if (settings.liquidationHeatmap) {
      const timeframes = enabledHeatmapTimeframes(settings.heatmapTimeframes);
      for (const symbol of request.symbols) {
        for (const timeframe of timeframes) {
          try {
            snapshot.screenshots?.push(await captureCoinglassScreenshot(tab, {
              kind: 'liquidationHeatmap',
              symbol,
              timeframe,
            }));
          } catch (error) {
            snapshot.errors.push(`liquidationHeatmap ${symbol} ${timeframe}: ${error instanceof Error ? error.message : String(error)}`);
          }
          await delay(COINGLASS_PAGE_DELAY_MS);
        }
      }
    }

    if (settings.liquidationMap) {
      if (request.symbols.includes('BTC')) {
        try {
          snapshot.screenshots?.push(await captureCoinglassScreenshot(tab, {
            kind: 'liquidationMapChart1',
            symbol: 'BTC',
            timeframe: '7d',
          }));
        } catch (error) {
          snapshot.errors.push(`liquidationMap chart1 BTC 7d: ${error instanceof Error ? error.message : String(error)}`);
        }
        await delay(COINGLASS_PAGE_DELAY_MS);
      }

      for (const symbol of request.symbols) {
        try {
          snapshot.screenshots?.push(await captureCoinglassScreenshot(tab, {
            kind: 'liquidationMapChart2',
            symbol,
            timeframe: '7d',
          }));
        } catch (error) {
          snapshot.errors.push(`liquidationMap chart2 ${symbol} 7d: ${error instanceof Error ? error.message : String(error)}`);
        }
        await delay(COINGLASS_PAGE_DELAY_MS);
      }
    }
  } finally {
    await restoreActiveTab(previousActiveTab);
  }
}

async function captureCoinglassScreenshot(
  tab: chrome.tabs.Tab,
  target: Extract<ExtensionMessage, { type: 'CG_PREPARE_SCREENSHOT_TARGET' }>['target']
): Promise<CoinglassScreenshotImage> {
  if (!tab.id) throw new Error('Coinglass tab has no id');
  await emitCoinglassProgress({
    page: 'liquidationsTotals',
    symbol: target.symbol,
    message: `Capturing ${coinglassScreenshotLabel(target.kind)} ${target.symbol} ${target.timeframe}`,
  });

  const url = target.kind === 'liquidationHeatmap'
    ? coinglassLiquidationHeatmapUrl(target.symbol)
    : coinglassLiquidationMapUrl();
  await chrome.tabs.update(tab.id, { url: withCoinglassTabMarker(url, 'screenshots'), active: true });
  await waitForTabComplete(tab.id);
  await delay(COINGLASS_LOAD_DELAY_MS);
  await ensureCoinglassContentScript(tab.id);

  const prepared = await chrome.tabs.sendMessage(tab.id, {
    type: 'CG_PREPARE_SCREENSHOT_TARGET',
    target,
  } satisfies ExtensionMessage).catch((error) => ({ success: false, error: String(error) }));
  if (!prepared?.success || !prepared.rect || !prepared.viewport) {
    throw new Error(prepared?.error ?? `Could not prepare ${target.kind}`);
  }

  const fullDataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
  const dataUrl = await cropDataUrl(fullDataUrl, prepared.rect, prepared.viewport.devicePixelRatio);
  const id = generateId();
  return {
    id,
    filename: coinglassScreenshotFilename(target, id),
    mimeType: 'image/png',
    dataUrl,
    symbol: target.symbol,
    timeframe: target.timeframe,
    kind: target.kind,
    title: prepared.title ?? coinglassScreenshotLabel(target.kind),
  };
}

function enabledHeatmapTimeframes(
  timeframes: NonNullable<CoinglassScrapeRequest['screenshots']>['heatmapTimeframes']
): CoinglassHeatmapTimeframe[] {
  return (['24h', '7d', '12h'] as CoinglassHeatmapTimeframe[]).filter((timeframe) => timeframes[timeframe]);
}

function coinglassScreenshotLabel(kind: CoinglassScreenshotImage['kind']): string {
  if (kind === 'liquidationHeatmap') return 'liquidation heatmap';
  if (kind === 'liquidationMapChart1') return 'liquidation map chart 1';
  return 'liquidation map chart 2';
}

function coinglassScreenshotFilename(
  target: Extract<ExtensionMessage, { type: 'CG_PREPARE_SCREENSHOT_TARGET' }>['target'],
  id: string
): string {
  const kind = target.kind === 'liquidationHeatmap'
    ? 'liquidation-heatmap'
    : target.kind === 'liquidationMapChart1'
      ? 'liquidation-map_chart1'
      : 'liquidation-map_chart2';
  return `coinglass_${target.symbol}_${kind}_${target.timeframe}_${id}.png`;
}

async function scrapeCoinglassPage(
  tabId: number,
  section: CoinglassSection,
  symbol: CoinglassSymbol,
  timeframe?: '1h' | '4h' | '12h' | '24h'
): Promise<unknown> {
  await emitCoinglassProgress({
    page: section,
    symbol,
    message: `Scraping ${section} ${symbol}${timeframe ? ` ${timeframe}` : ''}`,
  });

  await chrome.tabs.update(tabId, { url: withCoinglassTabMarker(coinglassUrl(section, symbol), 'json'), active: false });
  await waitForTabComplete(tabId);
  await delay(COINGLASS_LOAD_DELAY_MS);
  await ensureCoinglassContentScript(tabId);

  const response = await sendCoinglassTabMessage(tabId, {
    type: 'CG_SCRAPE_PAGE',
    section,
    symbol,
    timeframe,
  }).catch((error) => ({ success: false, error: String(error) }));

  if (!response?.success) {
    throw new Error(response?.error ?? `Coinglass did not return ${section} ${symbol}`);
  }

  return response.data;
}

async function findOrOpenCoinglassTab(role: 'json' | 'screenshots'): Promise<chrome.tabs.Tab> {
  const marker = coinglassTabMarker(role);
  const tabs = await chrome.tabs.query({});
  const existing = tabs.find((tab) => isCoinglassUrl(tab.url) && tab.url?.includes(marker));
  if (existing) return existing;
  return chrome.tabs.create({ url: `https://www.coinglass.com/#bare-meat-${role}`, active: role === 'screenshots' });
}

function coinglassTabMarker(role: 'json' | 'screenshots'): string {
  return `bare-meat-${role}`;
}

function withCoinglassTabMarker(url: string, role: 'json' | 'screenshots'): string {
  const parsed = new URL(url);
  parsed.hash = coinglassTabMarker(role);
  return parsed.toString();
}

async function getActiveTab(): Promise<chrome.tabs.Tab | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab ?? null;
}

async function restoreActiveTab(tab: chrome.tabs.Tab | null): Promise<void> {
  if (!tab?.id) return;
  await chrome.tabs.update(tab.id, { active: true }).catch(() => {});
  if (tab.windowId !== undefined) {
    await chrome.windows.update(tab.windowId, { focused: true }).catch(() => {});
  }
}

function isCoinglassUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.hostname === 'coinglass.com' || parsed.hostname === 'www.coinglass.com';
  } catch {
    return false;
  }
}

async function waitForTabComplete(tabId: number, timeoutMs = 25000): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const tab = await chrome.tabs.get(tabId);
    if (tab.status === 'complete') return;
    await delay(300);
  }
}

async function ensureCoinglassContentScript(tabId: number): Promise<void> {
  const response = await sendCoinglassTabMessage(tabId, {
    type: 'CG_CONTENT_READY',
  }).catch(() => null);
  if (response) return;

  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['content-scripts/coinglass.js'],
  }).catch(() => {});
  await delay(300);
}

function sendCoinglassTabMessage(
  tabId: number,
  message: Extract<ExtensionMessage, { type: 'CG_CONTENT_READY' | 'CG_SCRAPE_PAGE' }>
): Promise<any> {
  return Promise.race([
    chrome.tabs.sendMessage(tabId, message),
    delay(COINGLASS_MESSAGE_TIMEOUT_MS).then(() => {
      throw new Error(`Coinglass content script did not respond within ${Math.round(COINGLASS_MESSAGE_TIMEOUT_MS / 1000)}s`);
    }),
  ]);
}

async function emitCoinglassProgress(progress: CoinglassScrapeProgress): Promise<void> {
  await chrome.runtime.sendMessage({
    type: 'CG_SCRAPE_PROGRESS',
    progress,
  } satisfies ExtensionMessage).catch(() => {});
}

async function emitCoinglassComplete(snapshot: CoinglassSnapshot): Promise<void> {
  await chrome.runtime.sendMessage({
    type: 'CG_SCRAPE_COMPLETE',
    snapshot,
  } satisfies ExtensionMessage).catch(() => {});
}

async function emitCoinglassFailed(snapshot: CoinglassSnapshot): Promise<void> {
  await chrome.runtime.sendMessage({
    type: 'CG_SCRAPE_FAILED',
    snapshot,
  } satisfies ExtensionMessage).catch(() => {});
}

function sendTradingViewTabMessage(
  tabId: number,
  message: Extract<ExtensionMessage, { type: 'TV_CONTENT_PING' | 'TV_PREPARE_AUTO_CAPTURE' }>
): Promise<any> {
  return Promise.race([
    chrome.tabs.sendMessage(tabId, message),
    delay(TRADINGVIEW_MESSAGE_TIMEOUT_MS).then(() => {
      throw new Error(`TradingView content script did not respond within ${Math.round(TRADINGVIEW_MESSAGE_TIMEOUT_MS / 1000)}s`);
    }),
  ]);
}

async function emitTradingViewAutoProgress(progress: TradingViewAutoCaptureProgress): Promise<void> {
  await chrome.runtime.sendMessage({
    type: 'TV_AUTO_CAPTURE_PROGRESS',
    progress,
  } satisfies ExtensionMessage).catch(() => {});
}

async function emitTradingViewAutoComplete(result: TradingViewAutoCaptureResult): Promise<void> {
  await chrome.runtime.sendMessage({
    type: 'TV_AUTO_CAPTURE_COMPLETE',
    result,
  } satisfies ExtensionMessage).catch(() => {});
}

async function emitTradingViewAutoFailed(result: TradingViewAutoCaptureResult): Promise<void> {
  await chrome.runtime.sendMessage({
    type: 'TV_AUTO_CAPTURE_FAILED',
    result,
  } satisfies ExtensionMessage).catch(() => {});
}

async function processCaptureQueue(): Promise<void> {
  if (captureProcessorRunning) return;
  captureProcessorRunning = true;

  try {
    while (captureQueue.peek()) {
      const pending = captureQueue.peek();
      if (!pending) return;

      try {
        await processCapture(pending);
      } finally {
        captureQueue.removeFromQueue(pending.id);
      }
    }
  } finally {
    captureProcessorRunning = false;
  }
}

async function processCapture(pending: PendingCapture): Promise<void> {
  console.log(`[bare meat🧸🥩] capturing ${pending.symbol.normalized} ${pending.timeframe.normalized}`);

  const result = await captureVisibleTradingViewTab(pending).catch((error) => {
    console.error('[bare meat🧸🥩] Direct tab capture failed:', error);
    return null;
  }) ?? await waitForClipboardImage(pending).catch((error) => {
    console.error('[bare meat🧸🥩] Clipboard reader failed:', error);
    return null;
  });

  if (!result?.dataUrl || !result.hash) {
    console.error(`[bare meat🧸🥩] Could not capture image for ${pending.symbol.normalized} ${pending.timeframe.normalized}`);
    return;
  }

  await saveTradingViewScreenshot({
    dataUrl: result.dataUrl,
    hash: result.hash,
    mimeType: result.mimeType ?? 'image/png',
    symbol: pending.symbol,
    timeframe: pending.timeframe,
    telemetry: pending.telemetry,
  });

  console.log(`[bare meat🧸🥩] saved ${buildScreenshotKey(pending.symbol.normalized, pending.timeframe.normalized)}`);
}

async function captureVisibleTradingViewTab(pending: PendingCapture): Promise<ClipboardReadResponse | null> {
  if (pending.sourceTabId < 0) return null;

  const tab = await chrome.tabs.get(pending.sourceTabId);
  if (!tab.windowId) return null;

  const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
  const blob = dataUrlToBlob(dataUrl, 'image/png');
  const hash = await computeHash(await blob.arrayBuffer());

  return {
    success: true,
    dataUrl,
    hash,
    mimeType: blob.type || 'image/png',
  };
}

async function waitForClipboardImage(pending: PendingCapture): Promise<ClipboardReadResponse | null> {
  const started = Date.now();
  let lastError = 'not attempted';

  await delay(400);

  while (Date.now() - started < CLIPBOARD_IMAGE_WAIT_MS) {
    const result = await readClipboardImage(pending);
    if (result?.dataUrl && result.hash) {
      return result;
    }

    lastError = result?.error ?? 'No clipboard image found';
    await delay(350);
  }

  console.warn(`[bare meat🧸🥩] Clipboard image wait timed out after ${CLIPBOARD_IMAGE_WAIT_MS}ms: ${lastError}`);
  return null;
}

async function ensureOffscreenDocument(): Promise<void> {
  if (chrome.offscreen?.hasDocument && await chrome.offscreen.hasDocument()) {
    offscreenDocumentCreated = true;
    return;
  }

  if (offscreenDocumentCreated) return;

  try {
    await chrome.offscreen.createDocument({
      url: '/offscreen.html',
      reasons: [chrome.offscreen.Reason.CLIPBOARD],
      justification: 'Reading clipboard for TradingView screenshots',
    });
  } catch (error) {
    const message = String(error);
    if (!message.includes('Only a single offscreen document')) {
      throw error;
    }
  }

  offscreenDocumentCreated = true;
}

async function readClipboardImage(pending: PendingCapture): Promise<ClipboardReadResponse | null> {
  await ensureOffscreenDocument();
  const offscreenResponse = await chrome.runtime.sendMessage({
    type: 'CLIPBOARD_READ_REQUEST',
    timeout: DEFAULT_CLIPBOARD_TIMEOUT_MS,
  });

  if (offscreenResponse?.success) {
    return offscreenResponse;
  }

  const offscreenError = offscreenResponse?.error ?? offscreenResponse ?? 'no response';

  if (pending.sourceTabId < 0) {
    return { success: false, error: `Offscreen: ${String(offscreenError)}; no TradingView tab id for fallback` };
  }

  const tabResponse: ClipboardReadResponse | undefined = await chrome.tabs.sendMessage(pending.sourceTabId, {
    type: 'TV_READ_CLIPBOARD_IMAGE',
  } satisfies ExtensionMessage).catch((error) => {
    return { success: false, error: `TradingView tab fallback failed: ${String(error)}` };
  });

  if (!tabResponse?.success) {
    return {
      success: false,
      error: `Offscreen: ${String(offscreenError)}; TradingView tab: ${String(tabResponse?.error ?? tabResponse ?? 'no response')}`,
    };
  }

  return tabResponse;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function cropDataUrl(
  dataUrl: string,
  rect: { x: number; y: number; width: number; height: number },
  devicePixelRatio: number
): Promise<string> {
  const sourceBlob = dataUrlToBlob(dataUrl, 'image/png');
  const image = await createImageBitmap(sourceBlob);
  const scale = devicePixelRatio || 1;
  const sx = Math.max(0, Math.round(rect.x * scale));
  const sy = Math.max(0, Math.round(rect.y * scale));
  const sw = Math.min(image.width - sx, Math.round(rect.width * scale));
  const sh = Math.min(image.height - sy, Math.round(rect.height * scale));
  if (sw <= 0 || sh <= 0) throw new Error('Coinglass chart crop was outside the viewport');

  const canvas = new OffscreenCanvas(sw, sh);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not create Coinglass screenshot crop context');
  context.drawImage(image, sx, sy, sw, sh, 0, 0, sw, sh);
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  return blobToDataUrl(blob);
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:${blob.type || 'image/png'};base64,${btoa(binary)}`;
}

function dataUrlToBlob(dataUrl: string, fallbackMimeType: string): Blob {
  const [header, base64 = ''] = dataUrl.split(',');
  const mimeType = header?.match(/^data:([^;]+);base64$/)?.[1] ?? fallbackMimeType;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mimeType });
}
