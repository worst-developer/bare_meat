import { defineContentScript } from 'wxt/utils/define-content-script';
import { detectTradingViewSymbol, detectTradingViewInterval, fallbackTradingViewInterval } from '../src/tradingview/detectors';
import {
  closeTradingViewDataWindow,
  MANUAL_DATA_WINDOW_TIMEOUT_MS,
  scrapeTradingViewTelemetryWithDataWindow,
} from '../src/tradingview/telemetry';
import { tradingViewDateWindow } from '../src/tradingview/auto-capture';
import { normalizeTradingViewInterval } from '../src/utils/timeframes';
import type { ExtensionMessage } from '../src/messaging/protocol';
import type { DetectedInterval, DetectedSymbol, TradingViewAutoTimeframe, TradingViewTelemetrySnapshot } from '../src/types';

const SHORTCUT_DATA_WINDOW_TIMEOUT_MS = 5000;
const AUTO_CAPTURE_TELEMETRY_TIMEOUT_MS = 60000;

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
    const isTopFrame = window.top === window;
    const frame = isTopFrame ? 'top' : 'child';
    console.log(`[bare meat🧸🥩] TradingView content script loaded (${frame})`);
    void chrome.runtime.sendMessage({
      type: 'TV_CONTENT_READY',
      href: location.href,
      frame,
    } satisfies ExtensionMessage).catch(() => {});

    const listener = (event: KeyboardEvent) => {
      if (!isTopFrame) return;
      if (isScreenshotShortcut(event)) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        const now = Date.now();
        if (now - lastShortcutAt < 800) return;
        lastShortcutAt = now;
        void handleTradingViewScreenshotTrigger();
      }
    };

    window.addEventListener('keydown', listener, true);
    document.addEventListener('keydown', listener, true);

    chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
      if (message.type === 'TV_CONTENT_PING') {
        sendResponse({ success: true });
        return false;
      }

      if (message.type === 'TV_CAPTURE_SHORTCUT') {
        if (window.top !== window) return false;
        void handleTradingViewScreenshotTrigger().then(() => sendResponse({ success: true }));
        return true;
      }

      if (message.type === 'TV_SCRAPE_TELEMETRY') {
        if (window.top !== window) return false;
        void scrapeCurrentTelemetry().then(sendResponse);
        return true;
      }

      if (message.type === 'TV_PREPARE_AUTO_CAPTURE') {
        if (window.top !== window) return false;
        void prepareAutoCapture(message.symbol, message.timeframe).then(sendResponse);
        return true;
      }

      if (message.type !== 'TV_READ_CLIPBOARD_IMAGE') return false;

      void readClipboardImage().then(sendResponse);
      return true;
    });
  }
});

async function prepareAutoCapture(
  expectedSymbol: string,
  targetTimeframe: TradingViewAutoTimeframe
): Promise<{
  success: boolean;
  symbol?: DetectedSymbol;
  timeframe?: DetectedInterval;
  telemetry?: TradingViewTelemetrySnapshot;
  error?: string;
}> {
  try {
    await waitForTradingViewReady();
    let symbol = detectTradingViewSymbol();
    let timeframe: DetectedInterval;

    timeframe = detectTradingViewInterval() ?? fallbackTradingViewInterval();
    if (!timeframeMatches(timeframe, targetTimeframe)) {
      await changeInterval(targetTimeframe);
      timeframe = await waitForInterval(targetTimeframe) ?? timeframe;
    }
    if (!timeframeMatches(timeframe, targetTimeframe)) {
      throw new Error(`TradingView stayed on ${timeframe.visibleText ?? timeframe.normalized} instead of ${targetTimeframe}`);
    }

    await hideAllDrawings(true);
    await resetPriceScale();
    await applyCustomDateRange(targetTimeframe);
    await resetPriceScale();
    await delay(900);

    symbol = detectTradingViewSymbol() ?? symbol;
    timeframe = detectTradingViewInterval() ?? timeframe;
    if (!timeframeMatches(timeframe, targetTimeframe)) {
      throw new Error(`TradingView changed to ${timeframe.visibleText ?? timeframe.normalized} before capture; expected ${targetTimeframe}`);
    }
    if (!symbol) symbol = fallbackSymbol(expectedSymbol);

    const telemetry = await waitForValidAutoCaptureTelemetry(
      symbol.normalized,
      timeframe.normalized,
      AUTO_CAPTURE_TELEMETRY_TIMEOUT_MS
    );
    telemetry.quoteCurrency = detectQuoteCurrency(symbol.normalized);
    if (!await closeTradingViewDataWindow()) {
      throw new Error('TradingView Data Window could not be closed before capture');
    }
    await delay(800);
    await resetPriceScale();
    await delay(targetTimeframe === '1d' || targetTimeframe === '1w' ? 1500 : 500);

    await hideAllDrawings(true);
    if (!await waitForStableHiddenDrawings()) {
      throw new Error('TradingView drawings did not remain hidden before capture');
    }

    return {
      success: true,
      symbol,
      timeframe,
      telemetry,
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

async function waitForValidAutoCaptureTelemetry(
  symbol: string,
  timeframe: string,
  timeoutMs: number
): Promise<TradingViewTelemetrySnapshot> {
  const startedAt = Date.now();
  let latest: TradingViewTelemetrySnapshot | null = null;

  while (Date.now() - startedAt < timeoutMs) {
    latest = await scrapeTradingViewTelemetryWithDataWindow(symbol, timeframe, 2500).catch(() => null);
    if (latest?.valid) return latest;
    await delay(750);
  }

  const reason = latest?.errors.join('; ') || 'CTX rows did not load';
  throw new Error(`TradingView CTX did not become valid: ${reason}`);
}

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

async function handleTradingViewScreenshotTrigger(): Promise<void> {
  const frame = window.top === window ? 'top' : 'child';
  console.log(`[bare meat🧸🥩] shortcut detected (${frame})`);
  if (window.top !== window) return;

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

  await hideAllDrawings(false);
  await delay(500);
  const telemetry = await scrapeTradingViewTelemetryWithDataWindow(
    symbol.normalized,
    timeframe.normalized,
    SHORTCUT_DATA_WINDOW_TIMEOUT_MS
  ).catch((error) => {
    console.warn('[bare meat🧸🥩] CTX telemetry scrape failed before screenshot capture:', error);
    return null;
  });
  if (telemetry) {
    telemetry.quoteCurrency = detectQuoteCurrency(symbol.normalized);
    console.log(`[bare meat🧸🥩] CTX telemetry ${telemetry.valid ? 'valid' : 'invalid'} (${Object.keys(telemetry.metrics).length} metrics)`);
    if (!telemetry.valid) {
      console.warn(`[bare meat🧸🥩] CTX validation: ${telemetry.errors.join('; ')}`);
    }
  } else {
    console.log('[bare meat🧸🥩] CTX telemetry not found');
  }

  await closeTradingViewDataWindow();
  await delay(800);

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

async function waitForTradingViewReady(): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 12000) {
    if (detectTradingViewSymbol() && (detectTradingViewInterval() || document.querySelector('#header-toolbar-intervals'))) {
      return;
    }
    await delay(200);
  }
}

async function waitForInterval(targetTimeframe: TradingViewAutoTimeframe): Promise<DetectedInterval | null> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 5000) {
    const timeframe = detectTradingViewInterval();
    if (timeframeMatches(timeframe, targetTimeframe)) return timeframe;
    await delay(200);
  }
  return null;
}

async function changeInterval(timeframe: TradingViewAutoTimeframe): Promise<void> {
  const toolbarButton = Array.from(document.querySelectorAll<HTMLElement>(
    '#header-toolbar-intervals button, #header-toolbar-intervals [role="radio"]'
  )).find((button) => {
    const normalized = normalizeTradingViewInterval({
      dataValue: button.dataset.value,
      tooltip: button.dataset.tooltip,
      ariaLabel: button.getAttribute('aria-label') ?? undefined,
      visibleText: button.textContent?.trim(),
    });
    return normalized?.toLowerCase() === timeframe.toLowerCase();
  });

  if (!toolbarButton) throw new Error(`TradingView ${timeframe} toolbar button was not found`);
  clickElement(toolbarButton);
  if (!await waitForInterval(timeframe)) {
    throw new Error(`TradingView did not switch to ${timeframe}`);
  }
}

function timeframeMatches(timeframe: DetectedInterval | null, target: TradingViewAutoTimeframe): boolean {
  return timeframe?.normalized.toLowerCase() === target.toLowerCase();
}

async function applyCustomDateRange(timeframe: TradingViewAutoTimeframe): Promise<void> {
  let dialog = findVisibleElement(['[role="dialog"][data-name="go-to-date-dialog"]']);
  if (!dialog) {
    const goToButton = await waitForGoToDateButton(5000);
    if (goToButton) {
      clickElement(goToButton);
      dialog = await waitForVisibleElement('[role="dialog"][data-name="go-to-date-dialog"]', 3500);
    }
  }
  if (!dialog) throw new Error('TradingView Go to dialog did not open');

  const customRange = findVisibleElementIn(dialog, [
    '[data-id="tab-item-customrange"]',
    '[data-name="tab-item-customrange"]',
    '[id="tab-item-customrange"]',
  ]) ?? findVisibleText(dialog, 'Custom range');
  if (!customRange) throw new Error('TradingView Custom range tab was not found');
  clickElement(customRange);
  await delay(250);

  const fromInput = dialog.querySelector<HTMLInputElement>('input[name="start-date-range"]');
  const toInput = dialog.querySelector<HTMLInputElement>('input[name="end-date-range"]');
  if (!fromInput || !toInput || !isVisible(fromInput) || !isVisible(toInput)) {
    throw new Error('TradingView custom date inputs were not found');
  }

  const now = new Date();
  const from = subtractDateWindow(now, timeframe);
  const to = addRightDatePadding(now, timeframe);
  setInputValue(fromInput, formatDate(from));
  setInputValue(toInput, formatDate(to));

  const submit = Array.from(dialog.querySelectorAll<HTMLElement>('button, [role="button"]'))
    .filter(isVisible)
    .find((element) => element.textContent?.trim() === 'Go to');
  if (!submit) throw new Error('TradingView custom range submit button was not found');
  clickElement(submit);

  const closed = await waitUntil(() => !isVisible(dialog), 5000);
  if (!closed) throw new Error('TradingView custom date range was not applied');
  await delay(chartSettleDelay(timeframe));

  const selected = detectTradingViewInterval();
  if (!timeframeMatches(selected, timeframe)) {
    throw new Error(`TradingView custom range changed interval to ${selected?.visibleText ?? selected?.normalized ?? 'unknown'}; expected ${timeframe}`);
  }
}

async function resetPriceScale(): Promise<void> {
  const priceScale = findPriceScale();
  if (!priceScale) throw new Error('TradingView price scale was not found');

  const rect = priceScale.getBoundingClientRect();
  const clientX = rect.left + rect.width / 2;
  const clientY = rect.top + rect.height / 2;
  const target = document.elementFromPoint(clientX, clientY) as HTMLElement | null ?? priceScale;
  const eventInit: MouseEventInit = {
    bubbles: true,
    cancelable: true,
    composed: true,
    clientX,
    clientY,
    button: 2,
    buttons: 2,
  };

  target.dispatchEvent(new PointerEvent('pointerdown', eventInit));
  target.dispatchEvent(new MouseEvent('mousedown', eventInit));
  target.dispatchEvent(new PointerEvent('pointerup', { ...eventInit, buttons: 0 }));
  target.dispatchEvent(new MouseEvent('mouseup', { ...eventInit, buttons: 0 }));
  target.dispatchEvent(new MouseEvent('contextmenu', { ...eventInit, buttons: 0 }));

  const reset = await waitForVisibleText('Reset price scale', 1500);
  if (reset) {
    clickElement(reset);
    await delay(1200);
    return;
  }

  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
  target.dispatchEvent(new MouseEvent('dblclick', {
    bubbles: true,
    cancelable: true,
    composed: true,
    clientX,
    clientY,
    detail: 2,
  }));
  await delay(1200);
}

function findPriceScale(): HTMLElement | null {
  const candidates = Array.from(document.querySelectorAll<HTMLElement>([
    '[data-name="price-axis"]',
    '[class*="price-axis"]',
    '[class*="priceAxis"]',
  ].join(','))).filter((element) => {
    if (!isVisible(element)) return false;
    const rect = element.getBoundingClientRect();
    return rect.width >= 30
      && rect.width <= 220
      && rect.height >= 250
      && rect.left >= window.innerWidth * 0.45;
  });

  return candidates.sort((left, right) => {
    const leftRect = left.getBoundingClientRect();
    const rightRect = right.getBoundingClientRect();
    return rightRect.height - leftRect.height || leftRect.width - rightRect.width;
  })[0] ?? null;
}

function subtractDateWindow(to: Date, timeframe: TradingViewAutoTimeframe): Date {
  const from = new Date(to);
  const window = tradingViewDateWindow(timeframe);
  if (window.days) from.setDate(from.getDate() - window.days);
  if (window.months) from.setMonth(from.getMonth() - window.months);
  return from;
}

function addRightDatePadding(now: Date, timeframe: TradingViewAutoTimeframe): Date {
  const to = new Date(now);
  to.setDate(to.getDate() + tradingViewDateWindow(timeframe).rightPaddingDays);
  return to;
}

function chartSettleDelay(timeframe: TradingViewAutoTimeframe): number {
  if (timeframe === '1w') return 6000;
  if (timeframe === '1d') return 4500;
  return 1400;
}

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function setInputValue(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, data: value, inputType: 'insertText' }));
  input.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
  input.dispatchEvent(new Event('blur', { bubbles: true, composed: true }));
}

async function hideAllDrawings(strict: boolean): Promise<void> {
  const button = drawingVisibilityButton();

  if (!button) {
    if (strict) throw new Error('TradingView Hide all drawings control was not found');
    return;
  }
  if (drawingsAreHidden()) return;

  clickElement(button);
  if (await waitForStableHiddenDrawings()) return;

  const container = document.querySelector<HTMLElement>('[data-name="hide-all"][data-type="hide-drawing-tools"]');
  const arrow = container?.querySelector<HTMLElement>('button[aria-label="Hide options"]');
  if (arrow) {
    clickElement(arrow);
    const menuItem = await waitForVisibleText('Hide drawings', 1200);
    if (menuItem) {
      clickElement(menuItem);
      if (await waitForStableHiddenDrawings()) return;
    }
  }

  if (strict) throw new Error('TradingView drawings could not be hidden');
}

function drawingVisibilityButton(): HTMLButtonElement | null {
  const container = document.querySelector<HTMLElement>('[data-name="hide-all"][data-type="hide-drawing-tools"]');
  const selector = 'button[aria-label="Hide all drawings"], button[aria-label="Show all drawings"]';
  return Array.from((container ?? document).querySelectorAll<HTMLButtonElement>(selector)).find(isVisible)
    ?? Array.from(document.querySelectorAll<HTMLButtonElement>(selector)).find(isVisible)
    ?? null;
}

function drawingsAreHidden(): boolean {
  const button = drawingVisibilityButton();
  return button?.getAttribute('aria-pressed') === 'true'
    && button.getAttribute('aria-label') === 'Show all drawings';
}

async function waitForStableHiddenDrawings(timeoutMs = 2600): Promise<boolean> {
  const startedAt = Date.now();
  let hiddenSince = 0;

  while (Date.now() - startedAt < timeoutMs) {
    if (drawingsAreHidden()) {
      if (!hiddenSince) hiddenSince = Date.now();
      if (Date.now() - hiddenSince >= 500) return true;
    } else {
      hiddenSince = 0;
    }
    await delay(100);
  }

  return false;
}

async function waitForGoToDateButton(timeoutMs: number): Promise<HTMLElement | null> {
  let button: HTMLElement | null = null;
  await waitUntil(() => Boolean(button = findGoToDateButton()), timeoutMs);
  return button;
}

function findGoToDateButton(): HTMLElement | null {
  const exact = findVisibleElement([
    '[data-name="go-to-date"]',
    'button[aria-label="Go to"]',
    'button[aria-label*="Go to date" i]',
    'button[data-tooltip*="Go to date" i]',
  ]);
  if (exact) return exact;

  return Array.from(document.querySelectorAll<HTMLElement>('button, [role="button"]'))
    .filter(isVisible)
    .find((element) => {
      const description = [
        element.getAttribute('aria-label'),
        element.getAttribute('data-tooltip'),
        element.getAttribute('title'),
        element.getAttribute('data-name'),
        element.textContent,
      ].filter(Boolean).join(' ');
      return /\bgo to(?: date)?\b/i.test(description);
    }) ?? null;
}

function findVisibleElement(selectors: string[]): HTMLElement | null {
  return findVisibleElementIn(document, selectors);
}

function findVisibleElementIn(root: ParentNode, selectors: string[]): HTMLElement | null {
  for (const selector of selectors) {
    const match = Array.from(root.querySelectorAll<HTMLElement>(selector)).find(isVisible);
    if (match) return match;
  }
  return null;
}

function findVisibleText(root: ParentNode, text: string): HTMLElement | null {
  return Array.from(root.querySelectorAll<HTMLElement>('button, [role="button"], [role="tab"], span, div'))
    .filter(isVisible)
    .find((element) => element.textContent?.trim() === text) ?? null;
}

async function waitForVisibleText(text: string, timeoutMs: number): Promise<HTMLElement | null> {
  let match: HTMLElement | null = null;
  await waitUntil(() => Boolean(match = findVisibleText(document, text)), timeoutMs);
  return match;
}

async function waitForVisibleElement(selector: string, timeoutMs: number): Promise<HTMLElement | null> {
  let match: HTMLElement | null = null;
  await waitUntil(() => Boolean(match = Array.from(document.querySelectorAll<HTMLElement>(selector)).find(isVisible) ?? null), timeoutMs);
  return match;
}

async function waitUntil(predicate: () => boolean, timeoutMs: number): Promise<boolean> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (predicate()) return true;
    await delay(100);
  }
  return false;
}

function isVisible(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect();
  const style = getComputedStyle(element);
  return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
}

function clickElement(element: HTMLElement): void {
  const rect = element.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const hit = document.elementFromPoint(centerX, centerY);
  const resolved = hit?.closest<HTMLElement>('[role="menuitem"], [data-role="menuitem"], button, [class*="item"]') ?? element;
  const eventInit: MouseEventInit = {
    bubbles: true,
    cancelable: true,
    composed: true,
    clientX: centerX,
    clientY: centerY,
  };

  resolved.dispatchEvent(new PointerEvent('pointerdown', eventInit));
  resolved.dispatchEvent(new MouseEvent('mousedown', eventInit));
  resolved.dispatchEvent(new PointerEvent('pointerup', eventInit));
  resolved.dispatchEvent(new MouseEvent('mouseup', eventInit));
  resolved.click();
}

function fallbackSymbol(symbol: string): DetectedSymbol {
  const normalized = symbol.trim().replace(/\s+/g, '').toUpperCase();
  return {
    display: normalized || 'UNKNOWN',
    normalized: normalized || 'UNKNOWN',
  };
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
