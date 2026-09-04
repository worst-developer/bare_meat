export const CHATGPT_COMPOSER_SELECTORS = [
  '#prompt-textarea',
  '[data-testid="composer"] [contenteditable="true"]',
  'form textarea',
  'textarea',
  '[contenteditable="true"]',
];

export const CHATGPT_FILE_INPUT_SELECTORS = [
  'input[type="file"][accept*="image"]',
  'input[type="file"][accept*="json"]',
  'input[type="file"]',
];

export const CHATGPT_ATTACHMENT_BUTTON_SELECTORS = [
  'button[aria-label*="Attach" i]',
  'button[aria-label*="Upload" i]',
  'button[data-testid*="attach" i]',
  'button[data-testid*="upload" i]',
  '[role="button"][aria-label*="Attach" i]',
  '[role="button"][aria-label*="Upload" i]',
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
];
