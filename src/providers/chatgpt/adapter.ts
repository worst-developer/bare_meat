import type { IncomingScreenshot } from '../../types';
import {
  attachFilesToInput,
  clickElement,
  delay,
  dropFilesOnElement,
  elementText,
  incomingScreenshotToFile,
  incomingScreenshotToFileViaFetch,
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
const CHATGPT_UPLOAD_BATCH_DELAY_MS = 1000;
const CHATGPT_BATCH_UPLOAD_TIMEOUT_MS = 45000;
const CHATGPT_UPLOAD_FALLBACK_SETTLE_MS = 1600;

export class ChatGptAdapter implements ProviderAdapter {
  readonly provider = 'chatgpt' as const;
  private composer: HTMLElement | null = null;
  private attachmentUiBaseline = 0;
  private expectedAttachmentCount = 0;
  private attachedCount = 0;

  beginTransfer(): void {
    this.composer = null;
    this.attachmentUiBaseline = this.countAttachmentUi();
    this.expectedAttachmentCount = 0;
    this.attachedCount = 0;
  }

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
    const files: File[] = [];
    for (const screenshot of screenshots) {
      files.push(await incomingScreenshotToFileForChatGpt(screenshot));
      await delay(0);
    }
    return files;
  }

  async attachFiles(files: File[]): Promise<void> {
    if (files.length === 0) {
      return;
    }

    const composer = this.composer ?? await this.waitForComposer(15000);
    this.attachmentUiBaseline = this.countAttachmentUi();
    this.expectedAttachmentCount = files.length;
    this.attachedCount = 0;

    const batches = chatGptUploadBatches(files);
    for (const [index, batch] of batches.entries()) {
      await this.attachFileBatch(composer, batch);
      const nextAttachedCount = this.attachedCount + batch.length;
      const uploaded = await this.waitForUploadedAttachments(nextAttachedCount, CHATGPT_BATCH_UPLOAD_TIMEOUT_MS);
      if (!uploaded) {
        throw new Error(`ChatGPT attached only ${this.countNewAttachmentUi()} of ${nextAttachedCount} expected files`);
      }
      this.attachedCount = nextAttachedCount;
      if (index < batches.length - 1) {
        await delay(CHATGPT_UPLOAD_BATCH_DELAY_MS);
      }
    }

    this.composer = null;
  }

  async setPrompt(prompt: string): Promise<void> {
    const composer = this.composer ?? await this.waitForComposer(15000);
    setChatGptPromptText(composer, prompt);
    await delay(0);
    if (normalizeText(elementText(composer)).length === 0) {
      setElementText(composer, prompt);
    }
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
      resetFileInput(input);
      attachFilesToInput(input, files);
      return;
    }

    this.findAttachmentButton()?.click();
    await delay(500);
    const menuInput = this.findCompatibleFileInput(files) ?? this.findFileInput();
    if (menuInput) {
      resetFileInput(menuInput);
      attachFilesToInput(menuInput, files);
      return;
    }

    dropFilesOnElement(this.findDropTarget() ?? composer, files);
    await delay(CHATGPT_UPLOAD_FALLBACK_SETTLE_MS);
    if (this.countNewAttachmentUi() >= this.attachedCount + files.length) return;

    pasteFilesIntoElement(composer, files);
    await delay(CHATGPT_UPLOAD_FALLBACK_SETTLE_MS);
    if (this.countNewAttachmentUi() < this.attachedCount + files.length) {
      throw new Error(`ChatGPT file input not found for ${files.map((file) => file.name).join(', ')}`);
    }
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
    let attempts = 0;
    while (Date.now() - started < timeoutMs) {
      attempts += 1;
      const uploadedCount = this.countNewAttachmentUi();
      if (attempts === 1 || attempts % 5 === 0 || uploadedCount >= expectedCount) {
        logChatGptAdapter('waiting attachments', { expectedCount, uploadedCount, attempts });
      }
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
    return Math.max(
      0,
      ...CHATGPT_ATTACHMENT_UI_SELECTORS.map((selector) => document.querySelectorAll(selector).length)
    );
  }
}

export const chatGptAdapter = new ChatGptAdapter();

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

async function incomingScreenshotToFileForChatGpt(screenshot: IncomingScreenshot): Promise<File> {
  try {
    return await incomingScreenshotToFileViaFetch(screenshot);
  } catch (error) {
    logChatGptAdapter('async file decode failed, using fallback', {
      filename: screenshot.filename,
      error: String(error),
    });
    return incomingScreenshotToFile(screenshot);
  }
}

function chatGptUploadBatches(files: File[]): File[][] {
  const documents = files.filter((file) => !file.type.startsWith('image/'));
  const images = files.filter((file) => file.type.startsWith('image/'));
  return [
    ...documents.map((file) => [file]),
    ...chunkFiles(images, CHATGPT_UPLOAD_BATCH_SIZE),
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

function resetFileInput(input: HTMLInputElement): void {
  try {
    input.value = '';
  } catch {
    // Some framework-owned inputs reject direct value writes.
  }
}

function setChatGptPromptText(element: HTMLElement, text: string): void {
  if (element instanceof HTMLTextAreaElement) {
    setElementText(element, text);
    return;
  }

  element.focus();
  const selection = window.getSelection?.();
  selection?.removeAllRanges();
  element.textContent = text;
  element.dispatchEvent(new InputEvent('input', {
    bubbles: true,
    cancelable: true,
    inputType: 'insertText',
  }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

function logChatGptAdapter(message: string, data?: unknown): void {
  const prefix = `[bare meat🧸🥩][provider:chatgpt:adapter] ${message}`;
  if (data === undefined) {
    console.log(prefix);
    return;
  }
  console.log(prefix, data);
}
