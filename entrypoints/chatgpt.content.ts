import { defineContentScript } from 'wxt/utils/define-content-script';
import type { ExtensionMessage } from '../src/messaging/protocol';
import { chatGptAdapter } from '../src/providers/chatgpt/adapter';

export default defineContentScript({
  matches: ['https://chatgpt.com/*'],
  async main() {
    chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
      if (message.type === 'PROVIDER_PING') {
        sendResponse({ success: true, provider: chatGptAdapter.provider });
        return false;
      }

      if (message.type === 'PROVIDER_PREPARE' && message.provider === chatGptAdapter.provider) {
        void prepareWithChatGpt(message)
          .then(() => sendResponse({ success: true }))
          .catch((error) => sendResponse({ success: false, error: String(error) }));
        return true;
      }

      return false;
    });
  },
});

async function prepareWithChatGpt(
  message: Extract<ExtensionMessage, { type: 'PROVIDER_PREPARE' }>
): Promise<void> {
  await chatGptAdapter.waitForComposer(15000);
  const files = await chatGptAdapter.prepareFiles(message.screenshots);
  await chatGptAdapter.attachFiles(files);
  await chatGptAdapter.setPrompt(message.prompt);

  const attachmentsOk = await chatGptAdapter.verifyAttachments(files.length);
  if (!attachmentsOk) {
    throw new Error('ChatGPT attachment verification failed');
  }

  const promptOk = await chatGptAdapter.verifyPrompt(message.prompt);
  if (!promptOk) {
    throw new Error('ChatGPT prompt verification failed');
  }

  if (message.autosubmit) {
    await chatGptAdapter.submitPrompt();
  }
}
