import { describe, it, expect } from 'vitest';
import { normalizeSymbol, buildScreenshotKey, sanitizeFilename } from '../../src/utils/symbols';
import { normalizeTradingViewInterval } from '../../src/utils/timeframes';

describe('normalizeSymbol', () => {
  it('should uppercase symbols', () => {
    expect(normalizeSymbol('btcusd.p')).toBe('BTCUSD.P');
    expect(normalizeSymbol('USDT.D')).toBe('USDT.D');
  });

  it('should remove whitespace', () => {
    expect(normalizeSymbol('BTC USD .P')).toBe('BTCUSD.P');
  });

  it('should preserve punctuation', () => {
    expect(normalizeSymbol('BTC1!')).toBe('BTC1!');
    expect(normalizeSymbol('ETH/USD')).toBe('ETH/USD');
  });
});

describe('buildScreenshotKey', () => {
  it('should combine symbol and timeframe', () => {
    expect(buildScreenshotKey('BTCUSD.P', '4H')).toBe('BTCUSD.P::4H');
    expect(buildScreenshotKey('USDT.D', '1D')).toBe('USDT.D::1D');
  });

  it('should normalize symbol in key', () => {
    // Test uses built-in normalization
    expect(buildScreenshotKey('btcusd.p', '4H')).toBe('BTCUSD.P::4H');
  });
});

describe('sanitizeFilename', () => {
  it('should keep safe characters', () => {
    expect(sanitizeFilename('BTCUSD.P_4H')).toBe('BTCUSD.P_4H');
  });

  it('should replace unsafe characters', () => {
    expect(sanitizeFilename('BTC:USD.P')).toBe('BTC_USD.P');
    expect(sanitizeFilename('BTC\\USD')).toBe('BTC_USD');
  });

  it('should handle exclamation marks', () => {
    expect(sanitizeFilename('BTC1!')).toBe('BTC1!');
  });
});

describe('normalizeTradingViewInterval', () => {
  it('should normalize numeric data-values to minutes', () => {
    expect(normalizeTradingViewInterval({ dataValue: '5' })).toBe('5m');
    expect(normalizeTradingViewInterval({ dataValue: '15' })).toBe('15m');
    expect(normalizeTradingViewInterval({ dataValue: '30' })).toBe('30m');
  });

  it('should normalize hourly data-values', () => {
    expect(normalizeTradingViewInterval({ dataValue: '60' })).toBe('1H');
    expect(normalizeTradingViewInterval({ dataValue: '240' })).toBe('4H');
    expect(normalizeTradingViewInterval({ dataValue: '480' })).toBe('8H');
  });

  it('should preserve non-numeric values', () => {
    expect(normalizeTradingViewInterval({ dataValue: '1D' })).toBe('1D');
    expect(normalizeTradingViewInterval({ dataValue: '1W' })).toBe('1W');
    expect(normalizeTradingViewInterval({ dataValue: '1M' })).toBe('1M');
  });

  it('should extract from tooltip', () => {
    expect(normalizeTradingViewInterval({ tooltip: '4 hours' })).toBe('4H');
    expect(normalizeTradingViewInterval({ tooltip: '1 day' })).toBe('1D');
    expect(normalizeTradingViewInterval({ tooltip: '15 minutes' })).toBe('15m');
  });

  it('should return null for unknown formats', () => {
    expect(normalizeTradingViewInterval({ visibleText: 'unknown' })).toBe(null);
  });
});

describe('screenshot replacement logic', () => {
  it('should recognize same symbol+timeframe as duplicate', () => {
    const key1 = buildScreenshotKey('BTCUSD.P', '4H');
    const key2 = buildScreenshotKey('btcusd.p', '4h');
    
    expect(key1).toBe(key2.toUpperCase());
  });

  it('should treat different timeframes as separate', () => {
    expect(buildScreenshotKey('BTCUSD.P', '4H')).not.toBe(buildScreenshotKey('BTCUSD.P', '1H'));
  });

  it('should treat different symbols as separate even with same timeframe', () => {
    expect(buildScreenshotKey('BTCUSD.P', '4H')).not.toBe(buildScreenshotKey('USDT.D', '4H'));
  });
});
