import { describe, expect, it } from 'vitest';
import { buildAnalysisPrompt, buildCoinglassContext } from '../../src/prompts/prompt-builder';
import type { CoinglassSnapshot } from '../../src/types';

describe('Coinglass prompt context', () => {
  it('formats a Coinglass snapshot as prompt context', () => {
    const context = buildCoinglassContext(snapshot());
    expect(context).toContain('Coinglass market context');
    expect(context).toContain('"BTC"');
    expect(context).toContain('openInterest');
  });

  it('allows standalone Coinglass prompt without screenshots', () => {
    const prompt = buildAnalysisPrompt([], 'base', 'extra context', false, undefined, true, snapshot());
    expect(prompt).toContain('No TradingView screenshots are attached');
    expect(prompt).toContain('Coinglass market context');
    expect(prompt).toContain('extra context');
  });
});

function snapshot(): CoinglassSnapshot {
  return {
    id: 'cg',
    capturedAt: 1,
    symbols: ['BTC'],
    sections: ['openInterest'],
    status: 'success',
    warnings: [],
    errors: [],
    data: {
      BTC: {
        openInterest: {
          oiUsd: 1,
          exchanges: {},
        },
      },
    },
  };
}
