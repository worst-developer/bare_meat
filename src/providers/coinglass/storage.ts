import { COINGLASS_STORAGE_KEYS } from './config';
import type { CoinglassSnapshot } from './types';

export async function clearStoredCoinglassSnapshot(): Promise<void> {
  await chrome.storage.local.remove(COINGLASS_STORAGE_KEYS.snapshot);
}

export async function saveCoinglassSnapshot(snapshot: CoinglassSnapshot): Promise<void> {
  const { screenshots: _screenshots, ...storedSnapshot } = snapshot;
  await chrome.storage.local.set({ [COINGLASS_STORAGE_KEYS.snapshot]: storedSnapshot });
}

export async function loadCoinglassSnapshot(): Promise<CoinglassSnapshot | null> {
  const result = await chrome.storage.local.get([COINGLASS_STORAGE_KEYS.snapshot]);
  const snapshot = result[COINGLASS_STORAGE_KEYS.snapshot];
  return isCoinglassSnapshot(snapshot) ? snapshot : null;
}

function isCoinglassSnapshot(value: unknown): value is CoinglassSnapshot {
  return Boolean(value && typeof value === 'object' && 'capturedAt' in value && 'data' in value);
}
