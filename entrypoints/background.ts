import { defineBackground } from 'wxt/utils/define-background';
import { captureQueue } from '../src/capture/capture-queue';
import { dispatchRequest } from '../src/dispatch/dispatcher';
import type { ExtensionMessage } from '../src/messaging/protocol';
import { coinglassUrl, isSectionAvailableForSymbol } from '../src/providers/coinglass/config';
import { clearStoredCoinglassSnapshot, saveCoinglassSnapshot } from '../src/providers/coinglass/storage';
import * as db from '../src/storage/db';
import type {
  CoinglassScrapeProgress,
  CoinglassScrapeRequest,
  CoinglassSection,
  CoinglassSnapshot,
  CoinglassSymbol,
  PendingCapture,
  ScreenshotMeta,
} from '../src/types';
import { buildScreenshotKey, generateId } from '../src/utils/symbols';

const DEFAULT_CLIPBOARD_TIMEOUT_MS = 4000;
const CLIPBOARD_IMAGE_WAIT_MS = 6000;
const COINGLASS_PAGE_DELAY_MS = 1400;
const COINGLASS_LOAD_DELAY_MS = 2200;

let offscreenDocumentCreated = false;
let captureProcessorRunning = false;

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

  console.log('[bare meat🧸🥩] Background service worker initialized');
});

async function handleRuntimeMessage(
  message: ExtensionMessage,
  sender: chrome.runtime.MessageSender
): Promise<{ success: boolean; error?: string }> {
  try {
    if (message.type === 'TV_CAPTURE_TRIGGERED') {
      const capture = message.capture;
      const tabId = sender.tab?.id ?? capture.sourceTabId ?? -1;
      const pendingCapture = captureQueue.addToQueue(capture.symbol, capture.timeframe, tabId, capture.telemetry);

      console.log(`[bare meat🧸🥩] queued ${pendingCapture.symbol.normalized} ${pendingCapture.timeframe.normalized}`);
      void processCaptureQueue();
      return { success: true };
    }

    if (message.type === 'TV_CONTENT_READY') {
      console.log(`[bare meat🧸🥩] TradingView content ready (${message.frame}) ${message.href}`);
      return { success: true };
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

async function scrapeCoinglass(request: CoinglassScrapeRequest): Promise<void> {
  await clearStoredCoinglassSnapshot();

  const snapshot: CoinglassSnapshot = {
    id: generateId(),
    capturedAt: Date.now(),
    symbols: request.symbols,
    sections: request.sections,
    status: 'scraping',
    data: {},
    warnings: [],
    errors: [],
  };

  try {
    const tab = await findOrOpenCoinglassTab();
    if (!tab.id) throw new Error('Coinglass tab has no id');

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
              ratios[timeframe] = await scrapeCoinglassPage(tab.id, section, symbol, timeframe);
            } catch (error) {
              snapshot.errors.push(`${section} ${symbol} ${timeframe}: ${error instanceof Error ? error.message : String(error)}`);
            }
            await delay(COINGLASS_PAGE_DELAY_MS);
          }
          snapshot.data[symbol][section] = ratios;
        } else {
          try {
            snapshot.data[symbol][section] = await scrapeCoinglassPage(tab.id, section, symbol);
          } catch (error) {
            snapshot.errors.push(`${section} ${symbol}: ${error instanceof Error ? error.message : String(error)}`);
          }
          await delay(COINGLASS_PAGE_DELAY_MS);
        }
      }
    }

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

function snapshotHasData(snapshot: CoinglassSnapshot): boolean {
  return Object.values(snapshot.data).some((sections) => (
    sections && Object.values(sections).some((value) => value && (
      typeof value !== 'object' || Object.keys(value as Record<string, unknown>).length > 0
    ))
  ));
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

  await chrome.tabs.update(tabId, { url: coinglassUrl(section, symbol), active: true });
  await waitForTabComplete(tabId);
  await delay(COINGLASS_LOAD_DELAY_MS);
  await ensureCoinglassContentScript(tabId);

  const response = await chrome.tabs.sendMessage(tabId, {
    type: 'CG_SCRAPE_PAGE',
    section,
    symbol,
    timeframe,
  } satisfies ExtensionMessage).catch((error) => ({ success: false, error: String(error) }));

  if (!response?.success) {
    throw new Error(response?.error ?? `Coinglass did not return ${section} ${symbol}`);
  }

  return response.data;
}

async function findOrOpenCoinglassTab(): Promise<chrome.tabs.Tab> {
  const tabs = await chrome.tabs.query({});
  const existing = tabs.find((tab) => isCoinglassUrl(tab.url));
  if (existing) return existing;
  return chrome.tabs.create({ url: 'https://www.coinglass.com/', active: true });
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
  const response = await chrome.tabs.sendMessage(tabId, {
    type: 'CG_SCRAPE_PAGE',
    section: 'fundingRate',
    symbol: 'BTC',
  } satisfies ExtensionMessage).catch(() => null);
  if (response) return;

  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['content-scripts/coinglass.js'],
  }).catch(() => {});
  await delay(300);
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

  const result = await waitForClipboardImage(pending).catch((error) => {
    console.error('[bare meat🧸🥩] Clipboard reader failed:', error);
    return null;
  });

  if (!result?.dataUrl || !result.hash) {
    console.error(`[bare meat🧸🥩] Could not import clipboard image for ${pending.symbol.normalized} ${pending.timeframe.normalized}`);
    return;
  }

  const imageBlob = dataUrlToBlob(result.dataUrl, result.mimeType ?? 'image/png');

  const screenshotId = generateId();
  const key = buildScreenshotKey(pending.symbol.normalized, pending.timeframe.normalized);
  const screenshotMeta: ScreenshotMeta = {
    id: screenshotId,
    key,
    symbol: pending.symbol.display,
    normalizedSymbol: pending.symbol.normalized,
    timeframe: pending.timeframe.normalized,
    blobId: generateId(),
    hash: result.hash,
    mimeType: result.mimeType ?? 'image/png',
    capturedAt: Date.now(),
    rawTradingView: {
      intervalValue: pending.timeframe.dataValue,
      intervalTooltip: pending.timeframe.tooltip,
    },
    tradingViewTelemetry: pending.telemetry,
  };

  await db.putScreenshotReplacingChart(
    screenshotMeta,
    imageBlob
  );

  void chrome.runtime.sendMessage({
    type: 'SCREENSHOT_UPDATE',
    screenshot: screenshotMeta,
  } satisfies ExtensionMessage).catch(() => {
    // The side panel may be closed; persisted IndexedDB state is authoritative.
  });

  console.log(`[bare meat🧸🥩] saved ${screenshotMeta.key}`);
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
