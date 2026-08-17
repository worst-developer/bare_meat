import { defineContentScript } from 'wxt/utils/define-content-script';
import { detectTradingViewSymbol, detectTradingViewInterval, fallbackTradingViewInterval } from '../src/tradingview/detectors';
import { MANUAL_DATA_WINDOW_TIMEOUT_MS, scrapeTradingViewTelemetryWithDataWindow } from '../src/tradingview/telemetry';
import type { ExtensionMessage } from '../src/messaging/protocol';
import type { TradingViewTelemetrySnapshot } from '../src/types';

// @ts-check
/** @type {import('wxt').ContentScript} */
export default defineContentScript({
  matches: ['https://www.tradingview.com/*', 'https://tradingview.com/*', 'https://*.tradingview.com/*'],
  allFrames: true,
  matchAboutBlank: true,
  matchOriginAsFallback: true,
  runAt: 'document_start',
  
  async main() {
    let lastShortcutAt = 0;
    const frame = window.top === window ? 'top' : 'child';
    console.log(`[bare meat🧸🥩] TradingView content script loaded (${frame})`);
    void chrome.runtime.sendMessage({
      type: 'TV_CONTENT_READY',
      href: location.href,
      frame,
    } satisfies ExtensionMessage).catch(() => {});

    const listener = (event: KeyboardEvent) => {
      if (isScreenshotShortcut(event)) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        const now = Date.now();
        if (now - lastShortcutAt < 800) return;
        lastShortcutAt = now;
        void handleTradingViewScreenshotTrigger(event);
      }
    };

    window.addEventListener('keydown', listener, true);
    document.addEventListener('keydown', listener, true);

    chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
      if (message.type === 'TV_SCRAPE_TELEMETRY') {
        if (window.top !== window) return false;
        void scrapeCurrentTelemetry().then(sendResponse);
        return true;
      }

      if (message.type !== 'TV_READ_CLIPBOARD_IMAGE') return false;

      void readClipboardImage().then(sendResponse);
      return true;
    });
  }
});

async function scrapeCurrentTelemetry(): Promise<{
  success: boolean;
  telemetry?: TradingViewTelemetrySnapshot;
  error?: string;
}> {
  const symbol = detectTradingViewSymbol();
  const timeframe = detectTradingViewInterval() ?? fallbackTradingViewInterval();
  if (!symbol) return { success: false, error: 'TradingView symbol could not be identified' };

  const telemetry = await scrapeTradingViewTelemetryWithDataWindow(
    symbol.normalized,
    timeframe.normalized,
    MANUAL_DATA_WINDOW_TIMEOUT_MS
  );
  if (!telemetry) {
    return { success: false, error: 'No CTX rows found. Open Data Window and confirm the telemetry indicators have loaded.' };
  }
  telemetry.quoteCurrency = detectQuoteCurrency(symbol.normalized);

  return { success: true, telemetry };
}

async function handleTradingViewScreenshotTrigger(event: KeyboardEvent): Promise<void> {
  const frame = window.top === window ? 'top' : 'child';
  console.log(`[bare meat🧸🥩] shortcut detected (${frame})`);

  const symbol = detectTradingViewSymbol();
  const timeframe = detectTradingViewInterval() ?? fallbackTradingViewInterval();

  if (!symbol) {
    console.error('[bare meat🧸🥩] TradingView symbol could not be identified');
    console.log('#header-toolbar-symbol-search found:', !!document.querySelector('#header-toolbar-symbol-search'));
    return;
  }

  if (timeframe.normalized === 'unknown') {
    console.warn('[bare meat🧸🥩] TradingView timeframe could not be identified; saving screenshot with unknown timeframe');
  }

  console.log(`[bare meat🧸🥩] symbol ${symbol.normalized}`);
  console.log(`[bare meat🧸🥩] interval ${timeframe.normalized} / ${timeframe.dataValue || 'N/A'}`);

  await delay(500);
  const telemetry = await scrapeTradingViewTelemetryWithDataWindow(
    symbol.normalized,
    timeframe.normalized,
    MANUAL_DATA_WINDOW_TIMEOUT_MS
  );
  if (telemetry) {
    telemetry.quoteCurrency = detectQuoteCurrency(symbol.normalized);
    console.log(`[bare meat🧸🥩] CTX telemetry ${telemetry.valid ? 'valid' : 'invalid'} (${Object.keys(telemetry.metrics).length} metrics)`);
    if (!telemetry.valid) {
      console.warn(`[bare meat🧸🥩] CTX validation: ${telemetry.errors.join('; ')}`);
    }
  } else {
    console.log('[bare meat🧸🥩] CTX telemetry not found');
  }

  const message = {
    type: 'TV_CAPTURE_TRIGGERED',
    capture: {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 9)}`,
      symbol,
      timeframe,
      sourceTabId: -1,
      triggeredAt: Date.now(),
      telemetry,
    } as any,
  };

  // Use chrome.runtime.sendMessage instead of port for simple messages
  try {
    await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(response);
        }
      });
    });
  } catch (error) {
    console.error('[bare meat🧸🥩] Failed to send message to background:', error);
  }
}

function isScreenshotShortcut(event: KeyboardEvent): boolean {
  return (
    (event.ctrlKey || event.metaKey) &&
    event.shiftKey &&
    (event.code === 'KeyS' || event.key.toLowerCase() === 's') &&
    !event.repeat
  );
}

function detectQuoteCurrency(symbol: string): string {
  const controls = document.querySelectorAll<HTMLElement>('button, [role="button"], [aria-label], [title], [data-tooltip], [data-name]');
  for (const control of controls) {
    const text = [
      control.innerText,
      control.textContent,
      control.getAttribute('aria-label'),
      control.getAttribute('title'),
      control.getAttribute('data-tooltip'),
    ].filter(Boolean).join(' ').trim();

    const match = text.match(/\b(USD|USDT|USDC|BTC|ETH|EUR|GBP)\b/i);
    if (match?.[1]) return match[1].toUpperCase();
  }

  if (/USDT/i.test(symbol)) return 'USDT';
  if (/USD/i.test(symbol)) return 'USD';
  return 'unknown';
}

async function readClipboardImage(): Promise<{ success: boolean; dataUrl?: string; hash?: string; mimeType?: string; error?: string }> {
  try {
    const clipboardItems = await navigator.clipboard.read();

    for (const item of clipboardItems) {
      const mimeType = item.types.includes('image/png')
        ? 'image/png'
        : item.types.includes('image/jpeg')
        ? 'image/jpeg'
        : item.types.includes('image/webp')
        ? 'image/webp'
        : null;

      if (!mimeType) continue;

      const blob = await item.getType(mimeType);
      const data = await blob.arrayBuffer();
      return {
        success: true,
        dataUrl: arrayBufferToDataUrl(data, mimeType),
        hash: await computeHash(data),
        mimeType,
      };
    }

    return { success: false, error: 'No clipboard image found in TradingView tab' };
  } catch (error) {
    return { success: false, error: `TradingView tab clipboard read failed: ${String(error)}` };
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function arrayBufferToDataUrl(arrayBuffer: ArrayBuffer, mimeType: string): string {
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return `data:${mimeType};base64,${btoa(binary)}`;
}

async function computeHash(arrayBuffer: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}
