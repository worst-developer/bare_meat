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
  const phase = message.phase ?? 'all';

  if (phase === 'prompt') {
    chatGptAdapter.beginTransfer();
    await writeAndVerifyPrompt(message.prompt);
    return;
  }

  if (phase === 'attachments') {
    const files = await chatGptAdapter.prepareFiles(message.screenshots);
    await chatGptAdapter.attachFiles(files);
    if (!await chatGptAdapter.verifyAttachments(files.length)) {
      throw new Error('ChatGPT attachment verification failed');
    }
    return;
  }

  if (phase === 'finish') {
    if (!await chatGptAdapter.verifyPrompt(message.prompt)) {
      throw new Error('ChatGPT prompt verification failed after attaching files');
    }
    if (message.autosubmit) {
      await chatGptAdapter.submitPrompt();
    }
    return;
  }

  chatGptAdapter.beginTransfer();
  await writeAndVerifyPrompt(message.prompt);
  const files = await chatGptAdapter.prepareFiles(message.screenshots);
  await chatGptAdapter.attachFiles(files);
  if (!await chatGptAdapter.verifyAttachments(files.length)) {
    throw new Error('ChatGPT attachment verification failed');
  }
  if (message.autosubmit) {
    await chatGptAdapter.submitPrompt();
  }
}

async function writeAndVerifyPrompt(prompt: string): Promise<void> {
  await chatGptAdapter.setPrompt(prompt);
  if (!await chatGptAdapter.verifyPrompt(prompt)) {
    throw new Error('ChatGPT prompt verification failed');
  }
}
