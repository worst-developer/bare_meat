import { defineContentScript } from 'wxt/utils/define-content-script';
import type { ExtensionMessage } from '../src/messaging/protocol';
import { deepSeekAdapter } from '../src/providers/deepseek/adapter';

export default defineContentScript({
  matches: ['https://deepseek.com/*', 'https://chat.deepseek.com/*'],
  async main() {
    chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
      if (message.type === 'PROVIDER_PING') {
        sendResponse({ success: true, provider: deepSeekAdapter.provider });
        return false;
      }
      return false;
    });
  },
});
