export const CHATGPT_COMPOSER_SELECTORS = [
  '#prompt-textarea',
  '[data-testid="composer"] [contenteditable="true"]',
  'form textarea',
  'textarea',
  '[contenteditable="true"]',
];

export const CHATGPT_FILE_INPUT_SELECTORS = [
  'input[type="file"]',
];

export const CHATGPT_SEND_SELECTORS = [
  'button[data-testid="send-button"]',
  'button[aria-label="Send prompt"]',
  'button[aria-label="Send message"]',
  'button[aria-label="Send"]',
];

export const CHATGPT_ATTACHMENT_UI_SELECTORS = [
  '[data-testid="composer-attachment-file"]',
  '[data-testid^="file-thumbnail"]',
  '[data-testid*="attachment" i]',
  '[aria-label*="attachment" i]',
  '[aria-label*="Attached" i]',
  '.composer-parent img',
  'form img',
];
