export const GROK_COMPOSER_SELECTORS = [
  '[data-testid="chat-input"] [contenteditable="true"][role="textbox"]',
  '[aria-label="Ask Grok anything"][contenteditable="true"]',
  'textarea',
  '[contenteditable="true"]',
];

export const GROK_FILE_INPUT_SELECTORS = [
  'input[type="file"][name="files"]',
  'input[type="file"]',
];

export const GROK_ATTACHMENT_SELECTORS = [
  '[data-testid="attach-button"]',
  '[aria-label="Attach"]',
];

export const GROK_SEND_SELECTORS = [
  'button[aria-label="Send"]',
  'button[aria-label="Submit"]',
  'button[data-testid="send-button"]',
  'form button[type="submit"]',
];
