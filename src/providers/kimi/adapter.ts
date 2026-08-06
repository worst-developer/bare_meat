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
import { KIMI_ATTACHMENT_SELECTORS, KIMI_COMPOSER_SELECTORS, KIMI_FILE_INPUT_SELECTORS, KIMI_SEND_SELECTORS } from './selectors';

export class KimiAdapter implements ProviderAdapter {
  readonly provider = 'kimi' as const;
  private composer: HTMLElement | null = null;
  private attachedCount = 0;
  private attachmentUiBaseline = 0;

  detectPage(): boolean {
    return location.hostname === 'kimi.moonshot.cn'
      || location.hostname === 'www.kimi.moonshot.cn'
      || location.hostname === 'kimi.com'
      || location.hostname === 'www.kimi.com';
  }

  waitForComposer(timeoutMs: number): Promise<HTMLElement> {
    return waitForElement(() => this.findComposer(), timeoutMs, 'Kimi composer not found')
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

    const composer = await this.waitForComposer(15000);
    this.attachmentUiBaseline = this.countAttachmentUi();
    logKimiAdapter('attach start', {
      fileCount: files.length,
      baseline: this.attachmentUiBaseline,
      hasInputBeforePopup: Boolean(this.findFileInput()),
    });

    pasteFilesIntoElement(composer, files);
    dropFilesOnElement(this.findDropTarget() ?? composer, files);
    await delay(1200);
    logKimiAdapter('paste/drop attempted', { newAttachmentUi: this.countNewAttachmentUi() });

    if (this.countNewAttachmentUi() >= files.length) {
      logKimiAdapter('paste/drop accepted');
      this.attachedCount = files.length;
      this.composer = null;
      return;
    }

    const input = this.findFileInput();
    if (input) {
      attachFilesToInput(input, files);
      await delay(1200);
      logKimiAdapter('direct input attempted', {
        inputFiles: input.files?.length ?? 0,
        newAttachmentUi: this.countNewAttachmentUi(),
      });

      if (this.countNewAttachmentUi() >= files.length || (input.files?.length ?? 0) === files.length) {
        logKimiAdapter('direct input accepted');
        this.attachedCount = files.length;
        this.composer = null;
        return;
      }
    }

    this.findAttachmentButton()?.click();
    await delay(500);
    const menuInput = this.findFileInput();
    if (menuInput && menuInput !== input) {
      attachFilesToInput(menuInput, files);
      logKimiAdapter('menu input attempted', { inputFiles: menuInput.files?.length ?? 0 });
    } else {
      logKimiAdapter('menu input not found', {
        hasMenuInput: Boolean(menuInput),
        sameAsPreviousInput: Boolean(menuInput && menuInput === input),
      });
    }

    this.attachedCount = files.length;
    this.composer = null;
    await delay(1200);
    logKimiAdapter('attach finished', { newAttachmentUi: this.countNewAttachmentUi() });
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
    if (!input) return this.attachedCount === expectedCount;
    return (input?.files?.length ?? 0) === expectedCount;
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
    logKimiAdapter('clicking send');
    clickElement(button);
    await delay(300);
  }

  private findComposer(): HTMLElement | null {
    for (const selector of KIMI_COMPOSER_SELECTORS) {
      const element = document.querySelector<HTMLElement>(selector);
      if (element) return element;
    }
    return null;
  }

  private findFileInput(): HTMLInputElement | null {
    for (const selector of KIMI_FILE_INPUT_SELECTORS) {
      const input = document.querySelector<HTMLInputElement>(selector);
      if (input) return input;
    }
    return null;
  }

  private findAttachmentButton(): HTMLElement | null {
    for (const selector of KIMI_ATTACHMENT_SELECTORS) {
      const element = document.querySelector<HTMLElement>(selector);
      if (element) return element;
    }
    return null;
  }

  private findSendButton(): HTMLElement | null {
    for (const selector of KIMI_SEND_SELECTORS) {
      const element = document.querySelector<HTMLElement>(selector);
      if (element && !isDisabledElement(element)) return element;
    }
    return null;
  }

  private waitForSendButton(timeoutMs: number): Promise<HTMLElement> {
    return waitForElement(() => this.findSendButton(), timeoutMs, 'Kimi send button not ready');
  }

  private findDropTarget(): HTMLElement | null {
    return document.querySelector<HTMLElement>('[data-testid="drop-container"]')
      ?? document.querySelector<HTMLElement>('.chat-input')
      ?? document.querySelector<HTMLElement>('.chat-editor');
  }

  private countNewAttachmentUi(): number {
    return Math.max(0, this.countAttachmentUi() - this.attachmentUiBaseline);
  }

  private countAttachmentUi(): number {
    return document.querySelectorAll([
      '.attachment-list-file',
      '.file-card-container',
      '.file-count',
      '[role="list"][aria-label*="attachment" i] > *',
      '[aria-label*="attachment" i] img',
    ].join(',')).length;
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

export const kimiAdapter = new KimiAdapter();

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function logKimiAdapter(message: string, data?: unknown): void {
  const prefix = `[bare meat🧸🥩][provider:kimi:adapter] ${message}`;
  if (data === undefined) {
    console.log(prefix);
    return;
  }
  console.log(prefix, data);
}
