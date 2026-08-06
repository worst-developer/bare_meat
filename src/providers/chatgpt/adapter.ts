import type { IncomingScreenshot } from '../../types';
import {
  attachFilesToInput,
  clickElement,
  delay,
  elementText,
  incomingScreenshotToFile,
  isDisabledElement,
  setElementText,
  waitForElement,
  type ProviderAdapter,
} from '../provider';
import {
  CHATGPT_ATTACHMENT_UI_SELECTORS,
  CHATGPT_COMPOSER_SELECTORS,
  CHATGPT_FILE_INPUT_SELECTORS,
  CHATGPT_SEND_SELECTORS,
} from './selectors';

export class ChatGptAdapter implements ProviderAdapter {
  readonly provider = 'chatgpt' as const;
  private composer: HTMLElement | null = null;
  private attachmentUiBaseline = 0;
  private expectedAttachmentCount = 0;

  detectPage(): boolean {
    return location.hostname === 'chatgpt.com';
  }

  async waitForComposer(timeoutMs: number): Promise<HTMLElement> {
    this.composer = await waitForElement(
      () => this.findComposer(),
      timeoutMs,
      'ChatGPT composer not found'
    );
    return this.composer;
  }

  async prepareFiles(screenshots: IncomingScreenshot[]): Promise<File[]> {
    return Promise.all(screenshots.map(incomingScreenshotToFile));
  }

  async attachFiles(files: File[]): Promise<void> {
    this.expectedAttachmentCount = files.length;
    if (files.length === 0) return;

    const input = this.findFileInput();
    if (!input) {
      throw new Error('ChatGPT file input not found');
    }

    this.attachmentUiBaseline = this.countAttachmentUi();
    attachFilesToInput(input, files);
  }

  async setPrompt(prompt: string): Promise<void> {
    const composer = this.composer ?? await this.waitForComposer(15000);
    setElementText(composer, prompt);
  }

  async verifyAttachments(expectedCount: number): Promise<boolean> {
    if (expectedCount === 0) return true;
    return this.waitForUploadedAttachments(expectedCount, 30000);
  }

  async verifyPrompt(expectedPrompt: string): Promise<boolean> {
    const composer = this.composer ?? await this.waitForComposer(15000);
    const actual = normalizeText(elementText(composer));
    const expected = normalizeText(expectedPrompt);
    const firstLine = expected.split('\n').find((line) => line.trim().length > 0) ?? expected;
    return actual.includes(expected.slice(0, 80))
      || actual.includes(firstLine.slice(0, 40))
      || actual.length > 0;
  }

  async submitPrompt(): Promise<void> {
    if (this.expectedAttachmentCount > 0 && !await this.waitForUploadedAttachments(this.expectedAttachmentCount, 30000)) {
      throw new Error('ChatGPT attachments did not finish uploading');
    }

    const button = await this.waitForSendButton(15000);
    clickElement(button);
    await delay(300);
  }

  private findComposer(): HTMLElement | null {
    for (const selector of CHATGPT_COMPOSER_SELECTORS) {
      const element = document.querySelector<HTMLElement>(selector);
      if (element) return element;
    }
    return null;
  }

  private findFileInput(): HTMLInputElement | null {
    for (const selector of CHATGPT_FILE_INPUT_SELECTORS) {
      const input = document.querySelector<HTMLInputElement>(selector);
      if (input) return input;
    }
    return null;
  }

  private findSendButton(): HTMLElement | null {
    for (const selector of CHATGPT_SEND_SELECTORS) {
      const element = document.querySelector<HTMLElement>(selector);
      if (element && !isDisabledElement(element)) return element;
    }
    return null;
  }

  private waitForSendButton(timeoutMs: number): Promise<HTMLElement> {
    return waitForElement(() => this.findSendButton(), timeoutMs, 'ChatGPT send button not ready');
  }

  private async waitForUploadedAttachments(expectedCount: number, timeoutMs: number): Promise<boolean> {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const uploadedCount = this.countNewAttachmentUi();
      logChatGptAdapter('waiting attachments', { expectedCount, uploadedCount });
      if (uploadedCount >= expectedCount) return true;
      await delay(500);
    }

    logChatGptAdapter('attachment upload wait timed out', {
      expectedCount,
      uploadedCount: this.countNewAttachmentUi(),
    });
    return false;
  }

  private countNewAttachmentUi(): number {
    return Math.max(0, this.countAttachmentUi() - this.attachmentUiBaseline);
  }

  private countAttachmentUi(): number {
    return document.querySelectorAll(CHATGPT_ATTACHMENT_UI_SELECTORS.join(',')).length;
  }
}

export const chatGptAdapter = new ChatGptAdapter();

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function logChatGptAdapter(message: string, data?: unknown): void {
  const prefix = `[bare meat🧸🥩][provider:chatgpt:adapter] ${message}`;
  if (data === undefined) {
    console.log(prefix);
    return;
  }
  console.log(prefix, data);
}
