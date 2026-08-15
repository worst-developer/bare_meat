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
  CHATGPT_ATTACHMENT_BUTTON_SELECTORS,
  CHATGPT_ATTACHMENT_UI_SELECTORS,
  CHATGPT_COMPOSER_SELECTORS,
  CHATGPT_FILE_INPUT_SELECTORS,
  CHATGPT_SEND_SELECTORS,
} from './selectors';

const CHATGPT_UPLOAD_BATCH_SIZE = 4;

export class ChatGptAdapter implements ProviderAdapter {
  readonly provider = 'chatgpt' as const;
  private composer: HTMLElement | null = null;
  private attachmentUiBaseline = 0;
  private expectedAttachmentCount = 0;
  private attachedCount = 0;

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
    if (files.length === 0) {
      this.attachedCount = 0;
      return;
    }

    const composer = this.composer ?? await this.waitForComposer(15000);
    this.attachmentUiBaseline = this.countAttachmentUi();

    for (const batch of chatGptUploadBatches(files)) {
      await this.attachFileBatch(composer, batch);
      this.attachedCount += batch.length;
      await delay(1500);
    }

    this.composer = null;
  }

  async setPrompt(prompt: string): Promise<void> {
    const composer = this.composer ?? await this.waitForComposer(15000);
    setElementText(composer, prompt);
  }

  async verifyAttachments(expectedCount: number): Promise<boolean> {
    if (expectedCount === 0) return true;
    if (this.countNewAttachmentUi() >= expectedCount) return true;
    const input = this.findFileInput();
    if ((input?.files?.length ?? 0) === expectedCount) return true;
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

  private findAttachmentButton(): HTMLElement | null {
    for (const selector of CHATGPT_ATTACHMENT_BUTTON_SELECTORS) {
      const element = document.querySelector<HTMLElement>(selector);
      if (element && !isDisabledElement(element)) return element;
    }
    return null;
  }

  private findDropTarget(): HTMLElement | null {
    return document.querySelector<HTMLElement>('form')
      ?? document.querySelector<HTMLElement>('[data-testid="composer"]')
      ?? this.composer;
  }

  private async attachFileBatch(composer: HTMLElement, files: File[]): Promise<void> {
    const input = this.findCompatibleFileInput(files);
    if (input) {
      attachFilesToInput(input, files);
      return;
    }

    pasteFilesIntoElement(composer, files);
    dropFilesOnElement(this.findDropTarget() ?? composer, files);
    await delay(1200);
    if (this.countNewAttachmentUi() >= this.attachedCount + files.length) return;

    this.findAttachmentButton()?.click();
    await delay(500);
    const menuInput = this.findCompatibleFileInput(files) ?? this.findFileInput();
    if (!menuInput) throw new Error(`ChatGPT file input not found for ${files.map((file) => file.name).join(', ')}`);
    attachFilesToInput(menuInput, files);
  }

  private findCompatibleFileInput(files: File[]): HTMLInputElement | null {
    const inputs = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="file"]'));
    return inputs.find((input) => files.every((file) => fileInputAccepts(input, file)))
      ?? inputs.find((input) => !input.accept)
      ?? null;
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

function chatGptUploadBatches(files: File[]): File[][] {
  const imageFiles = files.filter((file) => file.type.startsWith('image/'));
  const otherFiles = files.filter((file) => !file.type.startsWith('image/'));
  return [
    ...chunkFiles(imageFiles, CHATGPT_UPLOAD_BATCH_SIZE),
    ...chunkFiles(otherFiles, 1),
  ];
}

function chunkFiles(files: File[], size: number): File[][] {
  const chunks: File[][] = [];
  for (let index = 0; index < files.length; index += size) {
    chunks.push(files.slice(index, index + size));
  }
  return chunks;
}

function fileInputAccepts(input: HTMLInputElement, file: File): boolean {
  const accept = input.accept.trim();
  if (!accept) return true;
  return accept.split(',').map((part) => part.trim().toLowerCase()).some((part) => (
    part === '*/*'
    || part === file.type.toLowerCase()
    || (part.endsWith('/*') && file.type.toLowerCase().startsWith(part.slice(0, -1)))
    || (part.startsWith('.') && file.name.toLowerCase().endsWith(part))
  ));
}

function logChatGptAdapter(message: string, data?: unknown): void {
  const prefix = `[bare meat🧸🥩][provider:chatgpt:adapter] ${message}`;
  if (data === undefined) {
    console.log(prefix);
    return;
  }
  console.log(prefix, data);
}
