import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseHTML } from 'linkedom';
import {
  parseFundingRateSymbol,
  parseGenericPage,
  parseLiquidationsTotals,
  parseLongShortRatio,
  parseOpenInterest,
  parseFundingRateOverview,
  parseBasis,
  parseEtf,
  parseNumber,
} from '../../src/providers/coinglass/parser';
import { coinglassUrl } from '../../src/providers/coinglass/config';
import type { CoinglassLiquidationsTotals, CoinglassOpenInterest } from '../../src/types';

describe('Coinglass parser', () => {
  it('builds symbol-specific ETF URLs', () => {
    expect(coinglassUrl('etf', 'BTC')).toBe('https://www.coinglass.com/etf/bitcoin');
    expect(coinglassUrl('etf', 'ETH')).toBe('https://www.coinglass.com/etf/ethereum');
    expect(coinglassUrl('etf', 'SOL')).toBe('https://www.coinglass.com/etf/solana');
  });

  it('builds the fixture-backed spot inflow outflow URL', () => {
    expect(coinglassUrl('spotInflowOutflow', 'BTC')).toBe('https://www.coinglass.com/spot-inflow-outflow');
  });

  it('parses compact money and percent values', () => {
    expect(parseNumber('$2.77B')).toBe(2_770_000_000);
    expect(parseNumber('+0.45%')).toBe(0.45);
    expect(parseNumber('63300.55')).toBe(63300.55);
  });

  it('parses open interest rows from the fixture', () => {
    const result = parseOpenInterest(loadFixture('open-interest.html'), 'BTC') as CoinglassOpenInterest;
    expect(Array.isArray(result.rawRow)).toBe(true);
    expect(result.oiUsd === null || typeof result.oiUsd === 'number').toBe(true);
    expect(result.exchanges).toHaveProperty('binance');
    expect(result.exchanges.binance).toHaveProperty('oiUsd');
    expect(result.exchanges.binance).not.toHaveProperty('col0');
  });

  it('parses funding rate symbol cards from the fixture', () => {
    const result = parseFundingRateSymbol(loadFixture('funding-rate-symbol.html'), 'BTC');
    expect(Object.keys(result.rawCards).join(' ')).toContain('BTC AVG Funding');
    expect(result.average).toBeTypeOf('number');
    expect(result.spread).toBeTypeOf('number');
  });

  it('parses liquidation totals for tracked symbols from the fixture', () => {
    const result = parseLiquidationsTotals(loadFixture('liquidations-totals.html'), 'BTC') as CoinglassLiquidationsTotals;
    expect(result.rawRow?.join(' ')).toContain('BTC');
    expect(result['1h']).toHaveProperty('long');
    expect(result['24h']).toHaveProperty('short');
  });

  it('parses long short ratio cards and exchange tables from the fixture', () => {
    const result = parseLongShortRatio(loadFixture('long-short-ratio.html'));
    expect(result.timeframe).toBe('4h');
    expect(result.longVolume === null || typeof result.longVolume === 'number').toBe(true);
    expect(result.shortVolume === null || typeof result.shortVolume === 'number').toBe(true);
    expect(result.exchanges).toHaveProperty('binance');
    expect(result.exchanges.binance).toHaveProperty('retailRatio');
    expect(result.exchanges.binance).not.toHaveProperty('col0');
  });

  it('parses funding overview into selected-symbol rates', () => {
    const result = parseFundingRateOverview(loadFixture('funding-rate.html'), 'BTC') as any;
    expect(result.symbol).toBe('BTC');
    expect(result.exchanges.binance).toHaveProperty('rate');
    expect(result).not.toHaveProperty('tables');
  });

  it('parses basis exchange rows into named fields', () => {
    const result = parseBasis(loadFixture('basis.html'), 'BTC') as any;
    expect(result.exchanges.binance).toHaveProperty('quarterlyPremiumPct');
    expect(result.exchanges.binance).not.toHaveProperty('col0');
  });

  it('parses ETF cards into named totals', () => {
    const result = parseEtf(loadFixture('etf.html'), 'BTC') as any;
    expect(result.symbol).toBe('BTC');
    expect(result.totalNetInflow).toBeTypeOf('number');
    expect(result.dailyTradingVolume).toBeTypeOf('number');
  });

  it.each([
    ['spot-inflow-outflow.html', 'BTC'],
  ] as const)('parses generic Coinglass page %s', (filename, symbol) => {
    const result = parseGenericPage(loadFixture(filename), symbol);
    expect(result.title.length).toBeGreaterThan(0);
    expect(Object.keys(result.cards).length + result.tables.length).toBeGreaterThan(0);
  });
});

function loadFixture(filename: string): Document {
  const html = readFileSync(`src/providers/coinglass/${filename}`, 'utf8');
  return parseHTML(html).document;
}
