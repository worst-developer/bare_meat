import { openDB } from 'idb';
import type { DBSchema } from 'idb';
import type { ScreenshotMeta } from '../types';
import { normalizeSymbol } from '../utils/symbols';

interface BareMeatDB extends DBSchema {
  screenshots: {
    key: string;
    value: ScreenshotMeta;
    indexes: {
      'by-captured-at': number;
    };
  };
  blobs: {
    key: string;
    value: Blob;
  };
}

let dbPromise: ReturnType<typeof openDB<BareMeatDB>> | undefined;

function getDb() {
  dbPromise ??= openDB<BareMeatDB>('bare-meat', 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('screenshots')) {
        const screenshots = db.createObjectStore('screenshots', { keyPath: 'key' });
        screenshots.createIndex('by-captured-at', 'capturedAt');
      }

      if (!db.objectStoreNames.contains('blobs')) {
        db.createObjectStore('blobs');
      }
    },
  });

  return dbPromise;
}

export async function getScreenshot(key: string): Promise<ScreenshotMeta | undefined> {
  const screenshot = await (await getDb()).get('screenshots', key);
  return screenshot ? normalizeScreenshotMeta(screenshot) : undefined;
}

export async function listScreenshots(): Promise<ScreenshotMeta[]> {
  const screenshots = await (await getDb()).getAll('screenshots');
  return screenshots.map(normalizeScreenshotMeta);
}

export async function putScreenshot(screenshot: ScreenshotMeta, blob: Blob): Promise<void> {
  const database = await getDb();
  const existing = await database.get('screenshots', screenshot.key);

  await database.put('blobs', blob, screenshot.blobId);
  await database.put('screenshots', screenshot);

  if (existing && existing.blobId !== screenshot.blobId) {
    await database.delete('blobs', existing.blobId);
  }
}

export async function putScreenshotReplacingChart(screenshot: ScreenshotMeta, blob: Blob): Promise<void> {
  const database = await getDb();
  const existingScreenshots = await database.getAll('screenshots');
  const staleScreenshots = existingScreenshots.filter((existing) => (
    existing.key !== screenshot.key &&
    sameChart(existing, screenshot)
  ));

  for (const existing of staleScreenshots) {
    await database.delete('screenshots', existing.key);
    await database.delete('blobs', existing.blobId);
  }

  await putScreenshot(screenshot, blob);
}

export async function updateScreenshotTelemetry(
  key: string,
  telemetry: ScreenshotMeta['tradingViewTelemetry']
): Promise<void> {
  const database = await getDb();
  const screenshot = await database.get('screenshots', key);
  if (!screenshot) throw new Error('Matching screenshot no longer exists');
  await database.put('screenshots', { ...screenshot, tradingViewTelemetry: telemetry });
}

export async function saveBlob(blobId: string, blob: Blob): Promise<void> {
  await (await getDb()).put('blobs', blob, blobId);
}

export async function getBlob(blobId: string): Promise<Blob | undefined> {
  return (await getDb()).get('blobs', blobId);
}

export async function deleteBlob(blobId: string): Promise<void> {
  await (await getDb()).delete('blobs', blobId);
}

export async function deleteScreenshot(key: string): Promise<void> {
  const database = await getDb();
  const existing = await database.get('screenshots', key);
  await database.delete('screenshots', key);
  if (existing) {
    await database.delete('blobs', existing.blobId);
  }
}

export async function clearScreenshots(): Promise<void> {
  const database = await getDb();
  await database.clear('screenshots');
  await database.clear('blobs');
}

function normalizeScreenshotMeta(screenshot: ScreenshotMeta): ScreenshotMeta {
  return {
    ...screenshot,
    timeframe: screenshot.timeframe ?? screenshot.key.split('::')[1] ?? 'unknown',
  };
}

function sameChart(a: ScreenshotMeta, b: ScreenshotMeta): boolean {
  return chartSymbol(a) === chartSymbol(b) && a.timeframe === b.timeframe;
}

function chartSymbol(screenshot: ScreenshotMeta): string {
  return normalizeSymbol(screenshot.normalizedSymbol || screenshot.symbol);
}
