import type { DetectedSymbol, DetectedInterval } from '../types';
import { normalizeSymbol } from '../utils/symbols';
import { normalizeTradingViewInterval } from '../utils/timeframes';

export function detectTradingViewSymbol(): DetectedSymbol | null {
  const button = document.querySelector<HTMLButtonElement>(
    '#header-toolbar-symbol-search'
  );

  const value = button?.textContent?.trim().replace(/\s+/g, '') || symbolFromUrl(location.href) || symbolFromUrl(document.referrer);

  if (!value) {
    return null;
  }

  return {
    display: value,
    normalized: normalizeSymbol(value),
  };
}

export function detectTradingViewInterval(): DetectedInterval | null {
  const selectedButton = document.querySelector<HTMLButtonElement>(
    '#header-toolbar-intervals button[role="radio"][aria-checked="true"]'
  );

  if (!selectedButton) {
    return null;
  }

  const dataValue = selectedButton.dataset.value;
  const tooltip = selectedButton.dataset.tooltip;
  const ariaLabel = selectedButton.getAttribute('aria-label') ?? undefined;
  const visibleText = selectedButton.textContent?.trim() || undefined;

  const normalized = normalizeTradingViewInterval({
    dataValue,
    tooltip,
    ariaLabel,
    visibleText,
  });

  if (!normalized) {
    return null;
  }

  return {
    normalized,
    dataValue,
    tooltip,
    ariaLabel,
    visibleText,
  };
}

export function fallbackTradingViewInterval(): DetectedInterval {
  return {
    normalized: 'unknown',
    visibleText: 'unknown',
  };
}

function symbolFromUrl(value: string): string | null {
  if (!value) return null;

  try {
    const url = new URL(value);
    const symbol = url.searchParams.get('symbol');
    if (!symbol) return null;

    const withoutExchange = symbol.includes(':') ? symbol.split(':').pop() : symbol;
    return withoutExchange?.trim() || null;
  } catch {
    return null;
  }
}
