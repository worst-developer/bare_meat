import { COINGLASS_STORAGE_KEYS } from './config';
import type { CoinglassScreenshotImage, CoinglassSnapshot } from './types';
import * as db from '../../storage/db';

type StoredCoinglassScreenshotImage = Omit<CoinglassScreenshotImage, 'dataUrl'>;
type StoredCoinglassSnapshot = Omit<CoinglassSnapshot, 'screenshots'> & {
  screenshots?: StoredCoinglassScreenshotImage[];
};

export async function clearStoredCoinglassSnapshot(): Promise<void> {
  const snapshot = await loadStoredCoinglassSnapshot();
  await deleteStoredScreenshotBlobs(snapshot?.screenshots);
  await chrome.storage.local.remove(COINGLASS_STORAGE_KEYS.snapshot);
}

export async function saveCoinglassSnapshot(snapshot: CoinglassSnapshot): Promise<void> {
  await deleteStoredScreenshotBlobs((await loadStoredCoinglassSnapshot())?.screenshots);
  for (const screenshot of snapshot.screenshots ?? []) {
    await db.saveBlob(coinglassScreenshotBlobId(screenshot.id), dataUrlToBlob(screenshot.dataUrl, screenshot.mimeType));
  }

  const storedSnapshot = {
    ...snapshot,
    screenshots: snapshot.screenshots?.map(({ dataUrl: _dataUrl, ...screenshot }) => screenshot),
  } satisfies StoredCoinglassSnapshot;
  await chrome.storage.local.set({ [COINGLASS_STORAGE_KEYS.snapshot]: storedSnapshot });
}

export async function loadCoinglassSnapshot(): Promise<CoinglassSnapshot | null> {
  const snapshot = await loadStoredCoinglassSnapshot();
  if (!snapshot) return null;

  const screenshots = await Promise.all(
    (snapshot.screenshots ?? []).map(async (screenshot) => {
      const blob = await db.getBlob(coinglassScreenshotBlobId(screenshot.id));
      if (!blob) return null;
      return {
        ...screenshot,
        dataUrl: await blobToDataUrl(blob),
      } satisfies CoinglassScreenshotImage;
    })
  );

  return {
    ...snapshot,
    screenshots: screenshots.filter((screenshot): screenshot is CoinglassScreenshotImage => Boolean(screenshot)),
  };
}

async function loadStoredCoinglassSnapshot(): Promise<StoredCoinglassSnapshot | null> {
  const result = await chrome.storage.local.get([COINGLASS_STORAGE_KEYS.snapshot]);
  const snapshot = result[COINGLASS_STORAGE_KEYS.snapshot];
  return isCoinglassSnapshot(snapshot) ? snapshot : null;
}

function isCoinglassSnapshot(value: unknown): value is StoredCoinglassSnapshot {
  return Boolean(value && typeof value === 'object' && 'capturedAt' in value && 'data' in value);
}

async function deleteStoredScreenshotBlobs(screenshots: StoredCoinglassScreenshotImage[] | undefined): Promise<void> {
  for (const screenshot of screenshots ?? []) {
    await db.deleteBlob(coinglassScreenshotBlobId(screenshot.id));
  }
}

function coinglassScreenshotBlobId(id: string): string {
  return `coinglass-screenshot-${id}`;
}

function dataUrlToBlob(dataUrl: string, fallbackMimeType: string): Blob {
  const [header = '', body = ''] = dataUrl.split(',');
  const mimeType = header.match(/^data:([^;,]+)/)?.[1] ?? fallbackMimeType;
  if (header.includes(';base64')) {
    const binary = atob(body);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return new Blob([bytes], { type: mimeType });
  }

  return new Blob([decodeURIComponent(body)], { type: mimeType });
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return `data:${blob.type || 'image/png'};base64,${btoa(binary)}`;
}
