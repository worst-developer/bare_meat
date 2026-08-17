import type { Provider } from '../../src/types';
import coinglassLogo from './assets/coinglass.svg?url';
import deepseekLogo from './assets/deepseek.svg?url';
import grokLogo from './assets/grok.svg?url';
import kimiLogo from './assets/kimi-color.svg?url';
import openaiLogo from './assets/openai.svg?url';
import tradingViewLogo from './assets/trading-view-dark.svg?url';

export const SOURCE_LOGOS = {
  coinglass: coinglassLogo,
  tradingView: tradingViewLogo,
};

const PROVIDER_LOGOS: Record<Provider, string> = {
  chatgpt: openaiLogo,
  deepseek: deepseekLogo,
  grok: grokLogo,
  kimi: kimiLogo,
};

export function logoForProvider(provider: Provider): string {
  return PROVIDER_LOGOS[provider];
}

export function providerLogoNeedsBackplate(provider: Provider): boolean {
  return provider === 'kimi';
}
