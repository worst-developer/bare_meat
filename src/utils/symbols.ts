export function normalizeSymbol(symbol: string): string {
  return symbol.trim().replace(/\s+/g, '').toUpperCase();
}

export function buildScreenshotKey(symbol: string, timeframe: string): string {
  return `${normalizeSymbol(symbol)}::${timeframe}`;
}

export function sanitizeFilename(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9._!-]/g, '_');
}

export async function computeHash(data: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}
