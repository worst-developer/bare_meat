import { defineContentScript } from 'wxt/utils/define-content-script';
import type { ExtensionMessage } from '../src/messaging/protocol';
import { parseCoinglassPage } from '../src/providers/coinglass/parser';

export default defineContentScript({
  matches: ['https://www.coinglass.com/*', 'https://coinglass.com/*'],
  runAt: 'document_idle',

  main() {
    chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
      if (message.type !== 'CG_SCRAPE_PAGE') return false;

      void scrapePage(message).then(sendResponse);
      return true;
    });
  },
});

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

    if ((message.section === 'basis' || message.section === 'spotInflowOutflow') && message.symbol) {
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

async function clickByText(label: string): Promise<void> {
  const target = Array.from(document.querySelectorAll<HTMLElement>('button, [role="tab"], a'))
    .find((element) => element.innerText.trim().toLowerCase() === label.toLowerCase());
  if (!target) return;
  target.click();
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
