import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  browser: 'chrome',
  manifestVersion: 3,
  manifest: {
    name: '__MSG_extName__',
    short_name: '__MSG_extShortName__',
    description: '__MSG_extDescription__',
    version: '0.7.6',
    default_locale: 'en',
	    action: {
	      default_title: '__MSG_extName__',
	    },
	    commands: {
	      capture_tradingview: {
	        suggested_key: {
	          default: 'Ctrl+Shift+S',
	          mac: 'Command+Shift+S',
	        },
	        description: 'Capture TradingView chart',
	      },
	    },
	    permissions: ['sidePanel', 'storage', 'offscreen', 'clipboardRead', 'tabs', 'scripting', 'activeTab'],
    host_permissions: [
      '<all_urls>',
      'https://www.tradingview.com/*',
      'https://tradingview.com/*',
      'https://*.tradingview.com/*',
      'https://www.coinglass.com/*',
      'https://coinglass.com/*',
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
  vite: () => ({
    build: {
      assetsInlineLimit: 0,
    },
    plugins: [tailwindcss()],
  }),
});
