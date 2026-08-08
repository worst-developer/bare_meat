import { defineConfig } from 'wxt';

export default defineConfig({
  browser: 'chrome',
  manifestVersion: 3,
  manifest: {
    name: '__MSG_extName__',
    short_name: '__MSG_extShortName__',
    description: '__MSG_extDescription__',
    version: '0.5.0',
    default_locale: 'en',
    action: {
      default_title: '__MSG_extName__',
    },
    permissions: ['sidePanel', 'storage', 'offscreen', 'clipboardRead', 'tabs', 'scripting'],
    host_permissions: [
      'https://www.tradingview.com/*',
      'https://tradingview.com/*',
      'https://*.tradingview.com/*',
      'https://chatgpt.com/*',
      'https://x.com/*',
      'https://grok.com/*',
      'https://deepseek.com/*',
      'https://chat.deepseek.com/*',
      'https://kimi.moonshot.cn/*',
      'https://www.kimi.moonshot.cn/*',
      'https://kimi.com/*',
      'https://www.kimi.com/*',
    ],
  },
  outDir: 'dist',
  publicDir: 'public',
});
