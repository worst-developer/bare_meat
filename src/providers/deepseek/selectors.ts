export const DEEPSEEK_COMPOSER_SELECTORS = [
  'textarea[placeholder="Message DeepSeek"]',
  'textarea[name="search"]',
  'textarea',
  '[contenteditable="true"]',
];

export const DEEPSEEK_FILE_INPUT_SELECTORS = [
  'input[type="file"][multiple]',
  'input[type="file"]',
];

export const DEEPSEEK_ATTACHMENT_SELECTORS = [
  '.f02f0e25',
  'input[type="file"]',
];

export const DEEPSEEK_SEND_SELECTORS = [
  '.bd74640a:not(.ds-button--disabled)',
  '.ds-button--primary.ds-button--circle:not(.ds-button--disabled)',
  'button[aria-label="Send"]',
  '[aria-label="Send"]',
  'button[type="submit"]:not(:disabled)',
];

export const DEEPSEEK_ATTACHMENT_UI_SELECTORS = [
  '[class*="file" i]',
  '[class*="attach" i]',
  '[class*="image" i]',
  'img[src^="blob:"]',
  'img[src^="data:"]',
];
