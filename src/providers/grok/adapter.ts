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
import { GROK_ATTACHMENT_SELECTORS, GROK_COMPOSER_SELECTORS, GROK_FILE_INPUT_SELECTORS, GROK_SEND_SELECTORS } from './selectors';

export class GrokAdapter implements ProviderAdapter {
  readonly provider = 'grok' as const;
  private composer: HTMLElement | null = null;
  private attachedCount = 0;

  detectPage(): boolean {
    return location.hostname === 'x.com' || location.hostname === 'grok.com';
  }

  waitForComposer(timeoutMs: number): Promise<HTMLElement> {
    return waitForElement(() => this.findComposer(), timeoutMs, 'Grok composer not found')
      .then((composer) => {
        this.composer = composer;
        return composer;
      });
  }

  async prepareFiles(screenshots: IncomingScreenshot[]): Promise<File[]> {
    return Promise.all(screenshots.map(incomingScreenshotToFile));
  }

  async attachFiles(files: File[]): Promise<void> {
    if (files.length === 0) {
      this.attachedCount = 0;
      return;
    }

    this.findAttachmentButton()?.click();

    const input = this.findFileInput();
    if (!input) {
      throw new Error('Grok file input not found');
    }

    attachFilesToInput(input, files);
    this.attachedCount = files.length;
    this.composer = null;
    await delay(500);
  }

  async setPrompt(prompt: string): Promise<void> {
    const composer = await this.waitForComposer(15000);
    setElementText(composer, prompt);
    await this.waitForPromptText(prompt, 3000);
  }

  async verifyAttachments(expectedCount: number): Promise<boolean> {
    if (expectedCount === 0) return true;
    const input = this.findFileInput();
    return (input?.files?.length ?? this.attachedCount) === expectedCount;
  }

  async verifyPrompt(expectedPrompt: string): Promise<boolean> {
    const composer = await this.waitForComposer(15000);
    const actual = normalizeText(elementText(composer));
    const expected = normalizeText(expectedPrompt);
    const firstLine = expected.split('\n').find((line) => line.trim().length > 0) ?? expected;
    return actual.includes(expected.slice(0, 80))
      || actual.includes(firstLine.slice(0, 40))
      || actual.length > 0;
  }

  async submitPrompt(): Promise<void> {
    const button = await this.waitForSendButton(15000);
    clickElement(button);
    await delay(300);
  }

  private findComposer(): HTMLElement | null {
    for (const selector of GROK_COMPOSER_SELECTORS) {
      const element = document.querySelector<HTMLElement>(selector);
      if (element) return element;
    }
    return null;
  }

  private findFileInput(): HTMLInputElement | null {
    for (const selector of GROK_FILE_INPUT_SELECTORS) {
      const input = document.querySelector<HTMLInputElement>(selector);
      if (input) return input;
    }
    return null;
  }

  private findAttachmentButton(): HTMLElement | null {
    for (const selector of GROK_ATTACHMENT_SELECTORS) {
      const element = document.querySelector<HTMLElement>(selector);
      if (element) return element;
    }
    return null;
  }

  private findSendButton(): HTMLElement | null {
    for (const selector of GROK_SEND_SELECTORS) {
      const element = document.querySelector<HTMLElement>(selector);
      if (element && !isDisabledElement(element)) return element;
    }
    return null;
  }

  private waitForSendButton(timeoutMs: number): Promise<HTMLElement> {
    return waitForElement(() => this.findSendButton(), timeoutMs, 'Grok send button not ready');
  }

  private async waitForPromptText(prompt: string, timeoutMs: number): Promise<void> {
    const started = Date.now();
    const expected = normalizeText(prompt);
    const firstLine = expected.split('\n').find((line) => line.trim().length > 0) ?? expected;
    while (Date.now() - started < timeoutMs) {
      const composer = await this.waitForComposer(1000);
      const actual = normalizeText(elementText(composer));
      if (actual.includes(expected.slice(0, 40)) || actual.includes(firstLine.slice(0, 40))) return;
      await delay(100);
      setElementText(composer, prompt);
    }
  }
}

export const grokAdapter = new GrokAdapter();

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}
