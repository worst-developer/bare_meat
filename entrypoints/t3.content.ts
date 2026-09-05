import { defineContentScript } from 'wxt/utils/define-content-script';
import type { ExtensionMessage } from '../src/messaging/protocol';
import { t3Adapter } from '../src/providers/t3/adapter';

export default defineContentScript({
  matches: ['https://t3.chat/*', 'https://www.t3.chat/*'],
  async main() {
    if (window.__BARE_MEAT_T3_CONTENT_LOADED__) return;
    window.__BARE_MEAT_T3_CONTENT_LOADED__ = true;

    chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
      if (message.type === 'PROVIDER_PING') {
        sendResponse({ success: true, provider: t3Adapter.provider });
        return false;
      }

      if (message.type === 'PROVIDER_PREPARE' && message.provider === t3Adapter.provider) {
        const signature = prepareSignature(message);
        if (window.__BARE_MEAT_T3_PREPARE_IN_FLIGHT__ === signature) {
          sendResponse({ success: true });
          return false;
        }
        window.__BARE_MEAT_T3_PREPARE_IN_FLIGHT__ = signature;
        void prepareWithT3(message)
          .then(() => sendResponse({ success: true }))
          .catch((error) => sendResponse({ success: false, error: String(error) }))
          .finally(() => {
            if (window.__BARE_MEAT_T3_PREPARE_IN_FLIGHT__ === signature) {
              window.__BARE_MEAT_T3_PREPARE_IN_FLIGHT__ = undefined;
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
    __BARE_MEAT_T3_CONTENT_LOADED__?: boolean;
    __BARE_MEAT_T3_PREPARE_IN_FLIGHT__?: string;
  }
}

async function prepareWithT3(
  message: Extract<ExtensionMessage, { type: 'PROVIDER_PREPARE' }>
): Promise<void> {
  await t3Adapter.waitForComposer(15000);
  const files = await t3Adapter.prepareFiles(message.screenshots);
  await t3Adapter.attachFiles(files);
  await t3Adapter.setPrompt(message.prompt);

  if (!await t3Adapter.verifyAttachments(files.length)) {
    throw new Error('T3 attachment verification failed');
  }
  if (!await t3Adapter.verifyPrompt(message.prompt)) {
    throw new Error('T3 prompt verification failed');
  }
  if (message.autosubmit) await t3Adapter.submitPrompt();
}

function prepareSignature(message: Extract<ExtensionMessage, { type: 'PROVIDER_PREPARE' }>): string {
  return JSON.stringify({
    autosubmit: message.autosubmit,
    prompt: message.prompt,
    screenshots: message.screenshots.map((screenshot) => screenshot.filename),
  });
}
