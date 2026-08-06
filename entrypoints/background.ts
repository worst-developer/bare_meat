import { defineBackground } from 'wxt/utils/define-background';
import { captureQueue } from '../src/capture/capture-queue';
import { dispatchRequest } from '../src/dispatch/dispatcher';
import type { ExtensionMessage } from '../src/messaging/protocol';
import * as db from '../src/storage/db';
import type {
  PendingCapture,
  ScreenshotMeta,
} from '../src/types';
import { buildScreenshotKey, generateId } from '../src/utils/symbols';

const DEFAULT_CLIPBOARD_TIMEOUT_MS = 4000;
const CLIPBOARD_IMAGE_WAIT_MS = 6000;

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

    return { success: false, error: `Unsupported message type: ${message.type}` };
  } catch (error) {
    console.error('[bare meat🧸🥩] Message handler error:', error);
    return { success: false, error: String(error) };
  }
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
