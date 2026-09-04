import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { parseHTML } from 'linkedom';
import { GrokAdapter } from '../../src/providers/grok/adapter';
import { KimiAdapter } from '../../src/providers/kimi/adapter';
import { T3Adapter } from '../../src/providers/t3/adapter';
import type { IncomingScreenshot } from '../../src/types';

describe('provider adapters from real chat fixtures', () => {
  it('detects Grok composer, inserts prompt, and attaches files through the hidden file input', async () => {
    loadFixture('src/providers/grok/grok-example.html', 'https://grok.com/chat/abc');
    installDataTransferStub();

    const adapter = new GrokAdapter();
    const prompt = 'Analyze BTCUSD.P 4H with USDT.D context';
    const file = new File(['png'], 'BTCUSD.P_4H.png', { type: 'image/png' });

    await adapter.waitForComposer(1);
    await adapter.attachFiles([file]);
    await adapter.setPrompt(prompt);

    expect(await adapter.verifyAttachments(1)).toBe(true);
    expect(await adapter.verifyPrompt(prompt)).toBe(true);
  });

  it('detects Kimi composer, inserts prompt, and falls back to paste-style image attachment when no file input is present', async () => {
    loadFixture('src/providers/kimi/kimi-example.html', 'https://kimi.moonshot.cn/chat/abc');

    const adapter = new KimiAdapter();
    const prompt = 'Analyze BTCUSD.P 4H with USDT.D context';
    const composer = await adapter.waitForComposer(1);
    const pasteSpy = vi.fn();
    composer.addEventListener('paste', pasteSpy);

    const files = await adapter.prepareFiles([incomingScreenshot()]);
    await adapter.attachFiles(files);
    await adapter.setPrompt(prompt);

    expect(pasteSpy).toHaveBeenCalledTimes(1);
    expect(await adapter.verifyAttachments(1)).toBe(true);
    expect(await adapter.verifyPrompt(prompt)).toBe(true);
  });

  it('detects the T3 composer and inserts the prompt from the supplied DOM fixture', async () => {
    loadFixture('src/providers/t3/t3-example.html', 'https://t3.chat/chat/abc');

    const adapter = new T3Adapter();
    const prompt = 'Analyze BTCUSD.P 4H with USDT.D context';

    expect(adapter.detectPage()).toBe(true);
    await adapter.waitForComposer(1);
    await adapter.setPrompt(prompt);

    expect(await adapter.verifyPrompt(prompt)).toBe(true);

    const sendButton = document.querySelector<HTMLButtonElement>('form button[type="submit"]');
    expect(sendButton).not.toBeNull();
    sendButton!.disabled = false;
    const sendSpy = vi.fn();
    sendButton!.addEventListener('click', sendSpy);

    await adapter.submitPrompt();

    expect(sendSpy).toHaveBeenCalled();
  });

  it('reports T3 subscriber-only attachments and supports the paid file-input path', async () => {
    loadFixture('src/providers/t3/t3-example.html', 'https://t3.chat/chat/abc');
    installDataTransferStub();

    const freeAdapter = new T3Adapter();
    const file = new File(['png'], 'BTCUSD.P_4H.png', { type: 'image/png' });
    await expect(freeAdapter.attachFiles([file])).rejects.toThrow('T3 file attachments require a subscription');

    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    document.body.append(input);

    const paidAdapter = new T3Adapter();
    await paidAdapter.attachFiles([file]);

    expect(await paidAdapter.verifyAttachments(1)).toBe(true);
  });
});

function loadFixture(path: string, url: string): void {
  const html = readFileSync(path, 'utf8');
  const window = parseHTML(html);

  Object.defineProperty(globalThis, 'window', { value: window, configurable: true });
  Object.defineProperty(globalThis, 'document', { value: window.document, configurable: true });
  Object.defineProperty(globalThis, 'location', { value: new URL(url), configurable: true });
  Object.defineProperty(globalThis, 'MutationObserver', { value: window.MutationObserver, configurable: true });
  Object.defineProperty(globalThis, 'HTMLElement', { value: window.HTMLElement, configurable: true });
  Object.defineProperty(globalThis, 'HTMLInputElement', { value: window.HTMLInputElement, configurable: true });
  Object.defineProperty(globalThis, 'HTMLButtonElement', { value: window.HTMLButtonElement, configurable: true });
  Object.defineProperty(globalThis, 'HTMLTextAreaElement', { value: window.HTMLTextAreaElement, configurable: true });
  Object.defineProperty(globalThis, 'InputEvent', { value: window.InputEvent ?? window.Event, configurable: true });
  Object.defineProperty(globalThis, 'Event', { value: window.Event, configurable: true });
}

function installDataTransferStub(): void {
  class DataTransferStub {
    files: File[] = [];
    items = {
      add: (file: File) => {
        this.files.push(file);
      },
    };
  }

  Object.defineProperty(globalThis, 'DataTransfer', { value: DataTransferStub, configurable: true });
}

function incomingScreenshot(): IncomingScreenshot {
  return {
    meta: {
      id: 'shot',
      key: 'BTCUSD.P::4H',
      symbol: 'BTCUSD.P',
      normalizedSymbol: 'BTCUSD.P',
      timeframe: '4H',
      blobId: 'blob',
      hash: 'hash',
      mimeType: 'image/png',
      capturedAt: Date.now(),
      rawTradingView: {},
    },
    filename: 'BTCUSD.P_4H.png',
    mimeType: 'image/png',
    dataUrl: 'data:image/png;base64,cG5n',
  };
}
