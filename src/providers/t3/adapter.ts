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
  T3_ATTACHMENT_SELECTORS,
  T3_ATTACHMENT_UI_SELECTORS,
  T3_COMPOSER_SELECTORS,
  T3_FILE_INPUT_SELECTORS,
  T3_SEND_SELECTORS,
} from './selectors';

export class T3Adapter implements ProviderAdapter {
  readonly provider = 't3' as const;
  private attachedCount = 0;
  private attachmentUiBaseline = 0;

  detectPage(): boolean {
    return location.hostname === 't3.chat' || location.hostname === 'www.t3.chat';
  }

  waitForComposer(timeoutMs: number): Promise<HTMLElement> {
    return waitForElement(() => this.findComposer(), timeoutMs, 'T3 composer not found');
  }

  async prepareFiles(screenshots: IncomingScreenshot[]): Promise<File[]> {
    return Promise.all(screenshots.map(incomingScreenshotToFile));
  }

  async attachFiles(files: File[]): Promise<void> {
    if (files.length === 0) {
      this.attachedCount = 0;
      return;
    }

    this.attachmentUiBaseline = this.countAttachmentUi();
    let input = this.findFileInput();
    if (!input) {
      const button = this.findAttachmentButton();
      const label = button?.getAttribute('aria-label') ?? '';
      if (label.toLowerCase().includes('subscriber-only')) {
        throw new Error('T3 file attachments require a subscription');
      }
      if (!button) throw new Error('T3 attachment control not found');

      clickElement(button);
      await delay(300);
      input = this.findFileInput();
    }

    if (!input) throw new Error('T3 file input not found');
    attachFilesToInput(input, files);
    this.attachedCount = files.length;
    await delay(500);
  }

  async setPrompt(prompt: string): Promise<void> {
    const composer = await this.waitForComposer(15000);
    setElementText(composer, prompt);
  }

  async verifyAttachments(expectedCount: number): Promise<boolean> {
    if (expectedCount === 0) return true;
    if (this.countAttachmentUi() - this.attachmentUiBaseline >= expectedCount) return true;
    return (this.findFileInput()?.files?.length ?? this.attachedCount) === expectedCount;
  }

  async verifyPrompt(expectedPrompt: string): Promise<boolean> {
    const composer = await this.waitForComposer(15000);
    return normalizeText(elementText(composer)) === normalizeText(expectedPrompt);
  }

  async submitPrompt(): Promise<void> {
    const button = await waitForElement(
      () => this.findSendButton(),
      15000,
      'T3 send button not ready'
    );
    clickElement(button);
    await delay(300);
  }

  private findComposer(): HTMLElement | null {
    return findFirst<HTMLElement>(T3_COMPOSER_SELECTORS);
  }

  private findFileInput(): HTMLInputElement | null {
    return findFirst<HTMLInputElement>(T3_FILE_INPUT_SELECTORS);
  }

  private findAttachmentButton(): HTMLElement | null {
    return findFirst<HTMLElement>(T3_ATTACHMENT_SELECTORS);
  }

  private findSendButton(): HTMLElement | null {
    for (const selector of T3_SEND_SELECTORS) {
      const button = document.querySelector<HTMLElement>(selector);
      if (button && !isDisabledElement(button)) return button;
    }
    return null;
  }

  private countAttachmentUi(): number {
    return document.querySelectorAll(T3_ATTACHMENT_UI_SELECTORS.join(',')).length;
  }
}

export const t3Adapter = new T3Adapter();

function findFirst<T extends Element>(selectors: string[]): T | null {
  for (const selector of selectors) {
    const element = document.querySelector<T>(selector);
    if (element) return element;
  }
  return null;
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}
