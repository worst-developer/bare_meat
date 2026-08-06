export function normalizeChatUrl(url: string): string {
  const parsed = new URL(url);
  parsed.hash = '';

  for (const key of [...parsed.searchParams.keys()]) {
    if (key.startsWith('utm_') || key === 'ref' || key === 'source') {
      parsed.searchParams.delete(key);
    }
  }

  const normalized = parsed.toString();
  return normalized.endsWith('/') ? normalized.slice(0, -1) : normalized;
}
