import type { IncomingScreenshot } from '../../types';
import { waitForElement, type ProviderAdapter } from '../provider';
import { DEEPSEEK_COMPOSER_SELECTORS } from './selectors';

export class DeepSeekAdapter implements ProviderAdapter {
  readonly provider = 'deepseek' as const;

  detectPage(): boolean {
    return location.hostname === 'deepseek.com' || location.hostname === 'chat.deepseek.com';
  }

  waitForComposer(timeoutMs: number): Promise<HTMLElement> {
    return waitForElement(() => this.findComposer(), timeoutMs, 'DeepSeek composer not found');
  }

  async prepareFiles(_screenshots: IncomingScreenshot[]): Promise<File[]> {
    throw new Error('DeepSeek adapter not implemented yet');
  }

  async attachFiles(_files: File[]): Promise<void> {
    throw new Error('DeepSeek adapter not implemented yet');
  }

  async setPrompt(_prompt: string): Promise<void> {
    throw new Error('DeepSeek adapter not implemented yet');
  }

  async verifyAttachments(_expectedCount: number): Promise<boolean> {
    return false;
  }

  async verifyPrompt(_expectedPrompt: string): Promise<boolean> {
    return false;
  }

  async submitPrompt(): Promise<void> {
    throw new Error('DeepSeek adapter not implemented yet');
  }

  private findComposer(): HTMLElement | null {
    for (const selector of DEEPSEEK_COMPOSER_SELECTORS) {
      const element = document.querySelector<HTMLElement>(selector);
      if (element) return element;
    }
    return null;
  }
}

export const deepSeekAdapter = new DeepSeekAdapter();
