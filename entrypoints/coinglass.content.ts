import { defineContentScript } from 'wxt/utils/define-content-script';
import type { ExtensionMessage } from '../src/messaging/protocol';
import { parseCoinglassPage } from '../src/providers/coinglass/parser';
import { COINGLASS_SYMBOLS } from '../src/providers/coinglass/types';

export default defineContentScript({
  matches: ['https://www.coinglass.com/*', 'https://coinglass.com/*'],
  runAt: 'document_idle',

  main() {
    chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
      if (message.type === 'CG_CONTENT_READY') {
        sendResponse({ success: true });
        return false;
      }

      if (message.type !== 'CG_SCRAPE_PAGE' && message.type !== 'CG_PREPARE_SCREENSHOT_TARGET') return false;

      if (message.type === 'CG_PREPARE_SCREENSHOT_TARGET') {
        void prepareScreenshotTarget(message.target).then(sendResponse);
      } else {
        void scrapePage(message).then(sendResponse);
      }
      return true;
    });
  },
});

interface ScreenshotRectResponse {
  success: boolean;
  rect?: { x: number; y: number; width: number; height: number };
  viewport?: { width: number; height: number; devicePixelRatio: number };
  title?: string;
  error?: string;
}

async function scrapePage(message: Extract<ExtensionMessage, { type: 'CG_SCRAPE_PAGE' }>): Promise<{
  success: boolean;
  data?: unknown;
  error?: string;
}> {
  try {
    if (message.section === 'longShortRatio' && message.timeframe) {
      await clickByText(periodLabel(message.timeframe));
      await delay(900);
    }

    if (message.section === 'basis' && message.symbol) {
      await clickByText(message.symbol);
      await delay(900);
    }

    await waitForStableDom();
    return {
      success: true,
      data: parseCoinglassPage(document, message.section, message.symbol),
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

async function prepareScreenshotTarget(
  target: Extract<ExtensionMessage, { type: 'CG_PREPARE_SCREENSHOT_TARGET' }>['target']
): Promise<ScreenshotRectResponse> {
  try {
    if (target.kind === 'liquidationHeatmap') {
      await selectNearestControl(findHeading(`${target.symbol} Liquidation Heatmap`), timeframeLabels(target.timeframe));
    }

    if (target.kind === 'liquidationMapChart1') {
      await selectNearestControl(findHeading('Binance BTC/USDT Liquidation Map'), mapTimeframeLabels(target.timeframe));
    }

    if (target.kind === 'liquidationMapChart2') {
      const heading = findHeading('Exchange Liquidation Map') ?? findHeading('Bitcoin Exchange Liquidation Map');
      await setNearestInputValue(heading, target.symbol);
      await selectNearestControl(heading, mapTimeframeLabels(target.timeframe));
    }

    await waitForStableDom();
    const targetElement = findChartElement(target.kind);
    if (!targetElement) throw new Error(`Could not find ${target.kind} chart element`);

    targetElement.scrollIntoView({ block: 'center', inline: 'center' });
    await delay(700);
    await closeAnyOpenMenus();

    const rect = paddedRect(targetElement.getBoundingClientRect(), 8);
    return {
      success: true,
      rect,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio || 1,
      },
      title: chartTitle(target.kind),
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

async function clickByText(label: string): Promise<void> {
  const target = Array.from(document.querySelectorAll<HTMLElement>('button, [role="tab"], a'))
    .find((element) => element.innerText.trim().toLowerCase() === label.toLowerCase());
  if (!target) return;
  target.click();
}

async function selectNearestControl(anchor: HTMLElement | null, labels: string[]): Promise<void> {
  const scope = closestChartCard(anchor) ?? document.body;
  const current = Array.from(scope.querySelectorAll<HTMLElement>('button, [role="combobox"]'))
    .find((element) => labels.some((label) => element.innerText.trim().toLowerCase() === label.toLowerCase()));
  if (current) return;

  const trigger = Array.from(scope.querySelectorAll<HTMLElement>('[role="combobox"], .MuiSelect-button, button'))
    .find((element) => /hour|day|week/i.test(element.innerText));
  if (!trigger) return;

  trigger.click();
  await delay(300);
  const option = Array.from(document.querySelectorAll<HTMLElement>('[role="option"], li, button, div'))
    .find((element) => labels.some((label) => element.innerText.trim().toLowerCase() === label.toLowerCase()));
  option?.click();
  if (option) await delay(900);
}

async function setNearestInputValue(anchor: HTMLElement | null, value: string): Promise<void> {
  const scope = closestChartCard(anchor) ?? document.body;
  const input = Array.from(scope.querySelectorAll<HTMLInputElement>('input')).find((candidate) => (
    COINGLASS_SYMBOLS.some((symbol) => candidate.value.toUpperCase().includes(symbol))
    || candidate.placeholder.toLowerCase().includes('search')
  ));
  if (!input) return;
  if (input.value.toUpperCase() === value) {
    await closeOpenMenus(input);
    return;
  }

  input.focus();
  input.select();
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }));
  await delay(700);

  const option = findAutocompleteOption(value);
  if (option) {
    option.click();
  } else {
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }));
  }

  await waitForInputValue(input, value, 2500);
  await closeOpenMenus(input);
  await delay(1800);
}

function findAutocompleteOption(value: string): HTMLElement | null {
  const needle = value.toUpperCase();
  const options = Array.from(document.querySelectorAll<HTMLElement>('[role="option"], li, [class*="option"], [class*="Option"]'));
  return options.find((option) => option.innerText.trim().toUpperCase() === needle)
    ?? options.find((option) => option.innerText.trim().toUpperCase().startsWith(needle))
    ?? null;
}

async function waitForInputValue(input: HTMLInputElement, value: string, timeoutMs: number): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (input.value.toUpperCase().includes(value)) return;
    await delay(150);
  }
}

async function closeOpenMenus(input: HTMLInputElement): Promise<void> {
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', bubbles: true }));
  input.blur();
  await closeAnyOpenMenus();
}

async function closeAnyOpenMenus(): Promise<void> {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', bubbles: true }));
  document.body.click();
  await delay(350);
}

function findHeading(text: string): HTMLElement | null {
  const needle = text.toLowerCase();
  return Array.from(document.querySelectorAll<HTMLElement>('h1, h2, h3, [class*="Typography"]'))
    .find((element) => element.innerText.toLowerCase().includes(needle)) ?? null;
}

function findChartElement(kind: 'liquidationHeatmap' | 'liquidationMapChart1' | 'liquidationMapChart2'): HTMLElement | null {
  const heading = kind === 'liquidationHeatmap'
    ? Array.from(document.querySelectorAll<HTMLElement>('h1, h2, h3')).find((element) => /liquidation heatmap/i.test(element.innerText))
    : kind === 'liquidationMapChart1'
      ? findHeading('Binance BTC/USDT Liquidation Map')
      : findHeading('Exchange Liquidation Map') ?? findHeading('Bitcoin Exchange Liquidation Map');
  const card = closestChartCard(heading ?? null);
  const scopedChart = card?.querySelector<HTMLElement>('.echarts-for-react') ?? card?.querySelector<HTMLElement>('canvas')?.parentElement ?? null;
  if (scopedChart) return scopedChart;

  const charts = visibleChartElements();
  if (kind === 'liquidationHeatmap') return charts[0] ?? null;
  if (kind === 'liquidationMapChart1') return charts[0] ?? null;
  return charts[1] ?? charts[0] ?? null;
}

function closestChartCard(anchor: HTMLElement | null): HTMLElement | null {
  return anchor?.closest<HTMLElement>('.MuiCard-root, .MuiBox-root') ?? null;
}

function visibleChartElements(): HTMLElement[] {
  const elements = Array.from(document.querySelectorAll<HTMLElement>('.echarts-for-react, canvas'));
  const chartRoots = elements.map((element) => (
    element.matches('.echarts-for-react') ? element : element.closest<HTMLElement>('.echarts-for-react') ?? element.parentElement
  ));
  return Array.from(new Set(chartRoots.filter((element): element is HTMLElement => {
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 200 && rect.height > 200;
  }))).sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
}

function chartTitle(kind: 'liquidationHeatmap' | 'liquidationMapChart1' | 'liquidationMapChart2'): string {
  if (kind === 'liquidationHeatmap') return findChartElement(kind)?.closest('.MuiBox-root')?.querySelector('h1, h2, h3')?.textContent?.trim() || 'Liquidation heatmap';
  if (kind === 'liquidationMapChart1') return 'Binance BTC/USDT Liquidation Map';
  return 'Exchange Liquidation Map';
}

function paddedRect(rect: DOMRect, padding: number): { x: number; y: number; width: number; height: number } {
  const x = Math.max(0, rect.x - padding);
  const y = Math.max(0, rect.y - padding);
  const right = Math.min(window.innerWidth, rect.right + padding);
  const bottom = Math.min(window.innerHeight, rect.bottom + padding);
  return {
    x,
    y,
    width: Math.max(1, right - x),
    height: Math.max(1, bottom - y),
  };
}

function timeframeLabels(value: '12h' | '24h' | '7d'): string[] {
  if (value === '12h') return ['12 hour'];
  if (value === '24h') return ['24 hour', '1 day'];
  return ['7 day', '7d', '1 week'];
}

function mapTimeframeLabels(value: '12h' | '24h' | '7d'): string[] {
  if (value === '7d') return ['7 day', '7d', '1 week', '1 day'];
  return timeframeLabels(value);
}

async function waitForStableDom(): Promise<void> {
  const first = document.body?.innerText.length ?? 0;
  await delay(700);
  const second = document.body?.innerText.length ?? 0;
  if (first !== second) await delay(700);
}

function periodLabel(value: '1h' | '4h' | '12h' | '24h'): string {
  if (value === '1h') return '1 hour';
  if (value === '4h') return '4 hour';
  if (value === '12h') return '12 hour';
  return '24 hour';
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
