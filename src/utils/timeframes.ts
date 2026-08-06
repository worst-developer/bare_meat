export interface IntervalInput {
  dataValue?: string;
  tooltip?: string;
  ariaLabel?: string;
  visibleText?: string;
}

export function normalizeTradingViewInterval(input: IntervalInput): string | null {
  const { dataValue, tooltip, ariaLabel, visibleText } = input;

  if (dataValue) {
    const normalized = tryNormalizeFromDataValue(dataValue);
    if (normalized) return normalized;
  }

  if (tooltip) {
    const normalized = extractTimeframeFromText(tooltip);
    if (normalized) return normalized;
  }

  if (ariaLabel) {
    const normalized = extractTimeframeFromText(ariaLabel);
    if (normalized) return normalized;
  }

  if (visibleText) {
    const normalized = normalizeVisibleText(visibleText);
    if (normalized) return normalized;
  }

  return null;
}

function tryNormalizeFromDataValue(value: string): string | null {
  const minutes = Number.parseInt(value, 10);
  if (!Number.isNaN(minutes) && String(minutes) === value) {
    if (minutes < 60) return `${minutes}m`;
    if (minutes % 60 === 0) return `${minutes / 60}H`;
    return value;
  }

  if (/^\d+[DWMS]$/i.test(value)) {
    return value.toUpperCase();
  }

  return null;
}

function extractTimeframeFromText(text: string): string | null {
  const match = text.match(/(\d+)\s*(minutes?|hours?|days?|weeks?|months?)\b/i);
  if (!match) return null;

  const amount = Number.parseInt(match[1] ?? '', 10);
  const unit = (match[2] ?? '').toLowerCase();

  if (unit.startsWith('minute')) return `${amount}m`;
  if (unit.startsWith('hour')) return `${amount}H`;
  if (unit.startsWith('day')) return `${amount}D`;
  if (unit.startsWith('week')) return `${amount}W`;
  if (unit.startsWith('month')) return `${amount}M`;

  return null;
}

function normalizeVisibleText(text: string): string | null {
  const trimmed = text.trim();

  if (/^\d+m$/i.test(trimmed)) return trimmed.toLowerCase();
  if (/^\d+h$/i.test(trimmed)) return trimmed.toUpperCase();
  if (/^\d+[DWM]$/i.test(trimmed)) return trimmed.toUpperCase();

  return null;
}
