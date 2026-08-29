import type { IncomingScreenshot, Provider } from '../types';

export interface ProviderAdapter {
  readonly provider: Provider;
  detectPage(): boolean;
  waitForComposer(timeoutMs: number): Promise<HTMLElement>;
  prepareFiles(screenshots: IncomingScreenshot[]): Promise<File[]>;
  attachFiles(files: File[]): Promise<void>;
  setPrompt(prompt: string): Promise<void>;
  verifyAttachments(expectedCount: number): Promise<boolean>;
  verifyPrompt(expectedPrompt: string): Promise<boolean>;
  submitPrompt(): Promise<void>;
}

export function waitForElement(
  findElement: () => HTMLElement | null,
  timeoutMs: number,
  missingMessage: string
): Promise<HTMLElement> {
  const existing = findElement();
  if (existing) return Promise.resolve(existing);

  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      observer.disconnect();
      reject(new Error(missingMessage));
    }, timeoutMs);

    const observer = new MutationObserver(() => {
      const element = findElement();
      if (element) {
        window.clearTimeout(timeout);
        observer.disconnect();
        resolve(element);
      }
    });

    observer.observe(document.documentElement, { childList: true, subtree: true });
  });
}

export async function incomingScreenshotToFile(screenshot: IncomingScreenshot): Promise<File> {
  const blob = dataUrlToBlob(screenshot.dataUrl, screenshot.mimeType);
  return new File([blob], screenshot.filename, { type: screenshot.mimeType });
}

export async function incomingScreenshotToFileViaFetch(screenshot: IncomingScreenshot): Promise<File> {
  const response = await fetch(screenshot.dataUrl);
  const blob = await response.blob();
  return new File([blob], screenshot.filename, {
    type: screenshot.mimeType || blob.type || 'application/octet-stream',
  });
}

function dataUrlToBlob(dataUrl: string, fallbackMimeType: string): Blob {
  const [header = '', body = ''] = dataUrl.split(',');
  const mimeType = header.match(/^data:([^;,]+)/)?.[1] ?? fallbackMimeType;
  if (header.includes(';base64')) {
    const binary = atob(body);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
    return new Blob([bytes], { type: mimeType });
  }

  return new Blob([decodeURIComponent(body)], { type: mimeType });
}

export function setElementText(element: HTMLElement, text: string): void {
  if (element instanceof HTMLTextAreaElement) {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
    setter?.call(element, text);
    element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    return;
  }

  element.focus();
  const selection = window.getSelection?.();
  const range = document.createRange?.();
  if (selection && range) {
    range.selectNodeContents(element);
    range.deleteContents();
    selection.removeAllRanges();
    selection.addRange(range);
  }

  element.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: text }));

  if (!document.execCommand?.('insertText', false, text)) {
    element.textContent = text;
  }

  element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

export function elementText(element: HTMLElement): string {
  if (element instanceof HTMLTextAreaElement) return element.value;
  return element.textContent ?? '';
}

export function attachFilesToInput(input: HTMLInputElement, files: File[]): void {
  const transfer = new DataTransfer();
  for (const file of files) {
    transfer.items.add(file);
  }

  try {
    input.files = transfer.files;
  } catch {
    Object.defineProperty(input, 'files', {
      value: transfer.files,
      configurable: true,
    });
  }

  if (typeof PointerEvent !== 'undefined') {
    input.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  }
  input.dispatchEvent(createMouseLikeEvent('mousedown'));
  input.dispatchEvent(createMouseLikeEvent('click'));
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

export function pasteFilesIntoElement(element: HTMLElement, files: File[]): void {
  element.focus();
  const transfer = createFileTransfer(files);
  const event = typeof ClipboardEvent !== 'undefined'
    ? new ClipboardEvent('paste', {
      bubbles: true,
      cancelable: true,
      clipboardData: transfer,
    })
    : new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', {
    value: transfer,
    configurable: true,
  });
  element.dispatchEvent(event);
}

export function dropFilesOnElement(element: HTMLElement, files: File[]): void {
  element.focus();
  const transfer = createFileTransfer(files);
  for (const type of ['dragenter', 'dragover', 'drop'] as const) {
    const event = typeof DragEvent !== 'undefined'
      ? new DragEvent(type, {
        bubbles: true,
        cancelable: true,
        dataTransfer: transfer,
      })
      : new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'dataTransfer', {
      value: transfer,
      configurable: true,
    });
    element.dispatchEvent(event);
  }
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function clickElement(element: HTMLElement): void {
  element.focus();
  if (typeof PointerEvent !== 'undefined') {
    element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
    element.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true }));
  }
  element.dispatchEvent(createMouseLikeEvent('mousedown'));
  element.dispatchEvent(createMouseLikeEvent('mouseup'));
  element.dispatchEvent(createMouseLikeEvent('click'));
  element.click();
}

export function isDisabledElement(element: HTMLElement): boolean {
  if (element instanceof HTMLButtonElement || element instanceof HTMLInputElement) {
    return element.disabled;
  }
  return element.getAttribute('aria-disabled') === 'true'
    || element.classList.contains('disabled')
    || Boolean(element.closest('[aria-disabled="true"], .disabled'));
}

function createFileTransfer(files: File[]): DataTransfer {
  const transfer = new DataTransfer();
  for (const file of files) {
    transfer.items.add(file);
  }
  return transfer;
}

function createMouseLikeEvent(type: string): Event {
  if (typeof MouseEvent !== 'undefined') {
    return new MouseEvent(type, { bubbles: true });
  }
  return new Event(type, { bubbles: true });
}
