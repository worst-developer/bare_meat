import { defineContentScript } from 'wxt/utils/define-content-script';
import type { ExtensionMessage } from '../src/messaging/protocol';
import { grokAdapter } from '../src/providers/grok/adapter';

export default defineContentScript({
  matches: ['https://x.com/*', 'https://grok.com/*'],
  async main() {
    if (window.__BARE_MEAT_GROK_CONTENT_LOADED__) return;
    window.__BARE_MEAT_GROK_CONTENT_LOADED__ = true;
    console.log('[bare meat🧸🥩] Grok content script loaded');

    chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
      if (message.type === 'PROVIDER_PING') {
        logGrok('ping received');
        sendResponse({ success: true, provider: grokAdapter.provider });
        return false;
      }

      if (message.type === 'PROVIDER_PREPARE' && message.provider === grokAdapter.provider) {
        const signature = prepareSignature(message);
        if (window.__BARE_MEAT_GROK_PREPARE_IN_FLIGHT__ === signature) {
          logGrok('duplicate prepare ignored', { signature });
          sendResponse({ success: true });
          return false;
        }
        window.__BARE_MEAT_GROK_PREPARE_IN_FLIGHT__ = signature;
        logGrok('prepare received', {
          screenshotCount: message.screenshots.length,
          promptPreview: preview(message.prompt),
        });
        void prepareWithGrok(message)
          .then(() => {
            logGrok('prepare ok');
            sendResponse({ success: true });
          })
          .catch((error) => {
            logGrok('prepare failed', { error: String(error) }, 'error');
            sendResponse({ success: false, error: String(error) });
          })
          .finally(() => {
            if (window.__BARE_MEAT_GROK_PREPARE_IN_FLIGHT__ === signature) {
              window.__BARE_MEAT_GROK_PREPARE_IN_FLIGHT__ = undefined;
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
    __BARE_MEAT_GROK_CONTENT_LOADED__?: boolean;
    __BARE_MEAT_GROK_PREPARE_IN_FLIGHT__?: string;
  }
}

async function prepareWithGrok(
  message: Extract<ExtensionMessage, { type: 'PROVIDER_PREPARE' }>
): Promise<void> {
  logGrok('waiting for composer');
  await grokAdapter.waitForComposer(15000);
  logGrok('composer ready');
  const files = await grokAdapter.prepareFiles(message.screenshots);
  logGrok('files prepared', { files: files.map((file) => file.name) });
  await grokAdapter.attachFiles(files);
  logGrok('files attached', { count: files.length });
  await grokAdapter.setPrompt(message.prompt);
  logGrok('prompt written', { promptPreview: preview(message.prompt) });

  const attachmentsVerified = await grokAdapter.verifyAttachments(files.length);
  logGrok('attachments verified', { expected: files.length, ok: attachmentsVerified });
  if (!attachmentsVerified) {
    throw new Error('Grok attachment verification failed');
  }

  const promptVerified = await grokAdapter.verifyPrompt(message.prompt);
  logGrok('prompt verified', { ok: promptVerified });
  if (!promptVerified) {
    throw new Error('Grok prompt verification failed');
  }

  if (message.autosubmit) {
    await grokAdapter.submitPrompt();
    logGrok('submitted');
  } else {
    logGrok('ready for manual submit');
  }
}

function logGrok(
  message: string,
  data?: unknown,
  level: 'log' | 'warn' | 'error' = 'log'
): void {
  const prefix = `[bare meat🧸🥩][provider:grok] ${message}`;
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
