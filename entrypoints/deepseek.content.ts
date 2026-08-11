import { defineContentScript } from 'wxt/utils/define-content-script';
import type { ExtensionMessage } from '../src/messaging/protocol';
import { deepSeekAdapter } from '../src/providers/deepseek/adapter';

export default defineContentScript({
  matches: ['https://deepseek.com/*', 'https://chat.deepseek.com/*'],
  async main() {
    if (window.__BARE_MEAT_DEEPSEEK_CONTENT_LOADED__) return;
    window.__BARE_MEAT_DEEPSEEK_CONTENT_LOADED__ = true;
    console.log('[bare meat🧸🥩] DeepSeek content script loaded', location.href);

    chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
      if (message.type === 'PROVIDER_PING') {
        logDeepSeek('ping received');
        sendResponse({ success: true, provider: deepSeekAdapter.provider });
        return false;
      }

      if (message.type === 'PROVIDER_PREPARE' && message.provider === deepSeekAdapter.provider) {
        const signature = prepareSignature(message);
        if (window.__BARE_MEAT_DEEPSEEK_PREPARE_IN_FLIGHT__ === signature) {
          logDeepSeek('duplicate prepare ignored', { signature });
          sendResponse({ success: true });
          return false;
        }
        window.__BARE_MEAT_DEEPSEEK_PREPARE_IN_FLIGHT__ = signature;
        logDeepSeek('prepare received', {
          screenshotCount: message.screenshots.length,
          promptPreview: preview(message.prompt),
        });
        void prepareWithDeepSeek(message)
          .then(() => {
            logDeepSeek('prepare ok');
            sendResponse({ success: true });
          })
          .catch((error) => {
            logDeepSeek('prepare failed', { error: String(error) }, 'error');
            sendResponse({ success: false, error: String(error) });
          })
          .finally(() => {
            if (window.__BARE_MEAT_DEEPSEEK_PREPARE_IN_FLIGHT__ === signature) {
              window.__BARE_MEAT_DEEPSEEK_PREPARE_IN_FLIGHT__ = undefined;
            }
          });
        return true;
      }

      return false;
    });
  },
});

declare global {
  interface Window {
    __BARE_MEAT_DEEPSEEK_CONTENT_LOADED__?: boolean;
    __BARE_MEAT_DEEPSEEK_PREPARE_IN_FLIGHT__?: string;
  }
}

async function prepareWithDeepSeek(
  message: Extract<ExtensionMessage, { type: 'PROVIDER_PREPARE' }>
): Promise<void> {
  logDeepSeek('waiting for composer');
  await deepSeekAdapter.waitForComposer(15000);
  logDeepSeek('composer ready');
  const files = await deepSeekAdapter.prepareFiles(message.screenshots);
  logDeepSeek('files prepared', { files: files.map((file) => file.name) });
  await deepSeekAdapter.attachFiles(files);
  logDeepSeek('files attached', { count: files.length });
  await deepSeekAdapter.setPrompt(message.prompt);
  logDeepSeek('prompt written', { promptPreview: preview(message.prompt) });

  const attachmentsVerified = await deepSeekAdapter.verifyAttachments(files.length);
  logDeepSeek('attachments verified', { expected: files.length, ok: attachmentsVerified });
  if (!attachmentsVerified) {
    throw new Error('DeepSeek attachment verification failed');
  }

  const promptVerified = await deepSeekAdapter.verifyPrompt(message.prompt);
  logDeepSeek('prompt verified', { ok: promptVerified });
  if (!promptVerified) {
    throw new Error('DeepSeek prompt verification failed');
  }

  if (message.autosubmit) {
    await deepSeekAdapter.submitPrompt();
    logDeepSeek('submitted');
  } else {
    logDeepSeek('ready for manual submit');
  }
}

function logDeepSeek(
  message: string,
  data?: unknown,
  level: 'log' | 'warn' | 'error' = 'log'
): void {
  const prefix = `[bare meat🧸🥩][provider:deepseek] ${message}`;
  if (data === undefined) {
    console[level](prefix);
    return;
  }
  console[level](prefix, data);
}

function preview(value: string, maxLength = 180): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength)}…`;
}

function prepareSignature(message: Extract<ExtensionMessage, { type: 'PROVIDER_PREPARE' }>): string {
  return JSON.stringify({
    autosubmit: message.autosubmit,
    prompt: message.prompt,
    screenshots: message.screenshots.map((screenshot) => screenshot.filename),
  });
}
