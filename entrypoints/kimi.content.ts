import { defineContentScript } from 'wxt/utils/define-content-script';
import type { ExtensionMessage } from '../src/messaging/protocol';
import { kimiAdapter } from '../src/providers/kimi/adapter';

export default defineContentScript({
  matches: [
    'https://kimi.moonshot.cn/*',
    'https://www.kimi.moonshot.cn/*',
    'https://kimi.com/*',
    'https://www.kimi.com/*',
  ],
  async main() {
    console.log('[bare meat🧸🥩] Kimi content script loaded', location.href);

    chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
      if (message.type === 'PROVIDER_PING') {
        logKimi('ping received');
        sendResponse({ success: true, provider: kimiAdapter.provider });
        return false;
      }

      if (message.type === 'PROVIDER_PREPARE' && message.provider === kimiAdapter.provider) {
        logKimi('prepare received', {
          screenshotCount: message.screenshots.length,
          promptPreview: preview(message.prompt),
        });
        void prepareWithKimi(message)
          .then(() => {
            logKimi('prepare ok');
            sendResponse({ success: true });
          })
          .catch((error) => {
            logKimi('prepare failed', { error: String(error) }, 'error');
            sendResponse({ success: false, error: String(error) });
          });
        return true;
      }

      return false;
    });
  },
});

async function prepareWithKimi(
  message: Extract<ExtensionMessage, { type: 'PROVIDER_PREPARE' }>
): Promise<void> {
  logKimi('waiting for composer');
  await kimiAdapter.waitForComposer(15000);
  logKimi('composer ready');
  const files = await kimiAdapter.prepareFiles(message.screenshots);
  logKimi('files prepared', { files: files.map((file) => file.name) });
  await kimiAdapter.attachFiles(files);
  logKimi('files attached', { count: files.length });
  await kimiAdapter.setPrompt(message.prompt);
  logKimi('prompt written', { promptPreview: preview(message.prompt) });

  const attachmentsVerified = await kimiAdapter.verifyAttachments(files.length);
  logKimi('attachments verified', { expected: files.length, ok: attachmentsVerified });
  if (!attachmentsVerified) {
    throw new Error('Kimi attachment verification failed');
  }

  const promptVerified = await kimiAdapter.verifyPrompt(message.prompt);
  logKimi('prompt verified', { ok: promptVerified });
  if (!promptVerified) {
    throw new Error('Kimi prompt verification failed');
  }

  if (message.autosubmit) {
    await kimiAdapter.submitPrompt();
    logKimi('submitted');
  } else {
    logKimi('ready for manual submit');
  }
}

function logKimi(
  message: string,
  data?: unknown,
  level: 'log' | 'warn' | 'error' = 'log'
): void {
  const prefix = `[bare meat🧸🥩][provider:kimi] ${message}`;
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
