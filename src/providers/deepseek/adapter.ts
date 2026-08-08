import type { IncomingScreenshot } from '../../types';
import {
  attachFilesToInput,
  clickElement,
  delay,
  dropFilesOnElement,
  elementText,
  incomingScreenshotToFile,
  isDisabledElement,
  pasteFilesIntoElement,
  setElementText,
  waitForElement,
  type ProviderAdapter,
} from '../provider';
import {
  DEEPSEEK_ATTACHMENT_SELECTORS,
  DEEPSEEK_ATTACHMENT_UI_SELECTORS,
  DEEPSEEK_COMPOSER_SELECTORS,
  DEEPSEEK_FILE_INPUT_SELECTORS,
  DEEPSEEK_SEND_SELECTORS,
} from './selectors';

export class DeepSeekAdapter implements ProviderAdapter {
  readonly provider = 'deepseek' as const;
  private composer: HTMLElement | null = null;
  private attachedCount = 0;
  private attachmentUiBaseline = 0;

  detectPage(): boolean {
    return location.hostname === 'deepseek.com' || location.hostname === 'chat.deepseek.com';
  }

  waitForComposer(timeoutMs: number): Promise<HTMLElement> {
    return waitForElement(() => this.findComposer(), timeoutMs, 'DeepSeek composer not found')
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

    const composer = this.composer ?? await this.waitForComposer(15000);
    this.attachmentUiBaseline = this.countAttachmentUi();

    const input = this.findFileInput();
    if (input) {
      attachFilesToInput(input, files);
      this.attachedCount = files.length;
      this.composer = null;
      await delay(1200);
      return;
    }

    pasteFilesIntoElement(composer, files);
    dropFilesOnElement(this.findDropTarget() ?? composer, files);
    await delay(1000);
    if (this.countNewAttachmentUi() >= files.length) {
      this.attachedCount = files.length;
      this.composer = null;
      return;
    }

    this.findAttachmentButton()?.click();
    await delay(500);
    const menuInput = this.findFileInput();
    if (!menuInput) throw new Error('DeepSeek file input not found');

    attachFilesToInput(menuInput, files);
    this.attachedCount = files.length;
    this.composer = null;
    await delay(1200);
  }

  async setPrompt(prompt: string): Promise<void> {
    const composer = await this.waitForComposer(15000);
    setElementText(composer, prompt);
    await this.waitForPromptText(prompt, 3000);
  }

  async verifyAttachments(expectedCount: number): Promise<boolean> {
    if (expectedCount === 0) return true;
    if (this.countNewAttachmentUi() >= expectedCount) return true;

    const input = this.findFileInput();
    if ((input?.files?.length ?? 0) === expectedCount) return true;

    return this.attachedCount === expectedCount;
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
    for (const selector of DEEPSEEK_COMPOSER_SELECTORS) {
      const element = document.querySelector<HTMLElement>(selector);
      if (element) return element;
    }
    return null;
  }

  private findFileInput(): HTMLInputElement | null {
    for (const selector of DEEPSEEK_FILE_INPUT_SELECTORS) {
      const input = document.querySelector<HTMLInputElement>(selector);
      if (input) return input;
    }
    return null;
  }

  private findAttachmentButton(): HTMLElement | null {
    for (const selector of DEEPSEEK_ATTACHMENT_SELECTORS) {
      const element = document.querySelector<HTMLElement>(selector);
      if (element) return element;
    }
    return null;
  }

  private findSendButton(): HTMLElement | null {
    for (const selector of DEEPSEEK_SEND_SELECTORS) {
      const element = document.querySelector<HTMLElement>(selector);
      if (element && !this.isDeepSeekDisabled(element)) return element;
    }
    return null;
  }

  private waitForSendButton(timeoutMs: number): Promise<HTMLElement> {
    return waitForElement(() => this.findSendButton(), timeoutMs, 'DeepSeek send button not ready');
  }

  private findDropTarget(): HTMLElement | null {
    return document.querySelector<HTMLElement>('._871cbca')
      ?? document.querySelector<HTMLElement>('.aaff8b8f')
      ?? document.querySelector<HTMLElement>('textarea')?.closest<HTMLElement>('form, [class]')
      ?? null;
  }

  private countNewAttachmentUi(): number {
    return Math.max(0, this.countAttachmentUi() - this.attachmentUiBaseline);
  }

  private countAttachmentUi(): number {
    return document.querySelectorAll(DEEPSEEK_ATTACHMENT_UI_SELECTORS.join(',')).length;
  }

  private isDeepSeekDisabled(element: HTMLElement): boolean {
    return isDisabledElement(element)
      || element.classList.contains('ds-button--disabled')
      || Boolean(element.closest('.ds-button--disabled'));
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

export const deepSeekAdapter = new DeepSeekAdapter();

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}
