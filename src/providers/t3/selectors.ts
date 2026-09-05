export const T3_COMPOSER_SELECTORS = [
  'textarea[aria-label="Message input"]',
  'textarea[placeholder="Type your message here..."]',
  'form textarea',
];

export const T3_FILE_INPUT_SELECTORS = [
  'input[type="file"]',
];

export const T3_ATTACHMENT_SELECTORS = [
  'button[aria-label="Attach"]',
  'button[aria-label*="Attaching files"]',
  'button[aria-label*="Attach" i]',
];

export const T3_SEND_SELECTORS = [
  'form button[type="submit"]',
  'button[aria-label="Send message"]',
  'button[aria-label="Send"]',
];

export const T3_ATTACHMENT_UI_SELECTORS = [
  '[aria-label*="attachment" i] img',
  '[data-testid*="attachment" i]',
  '[data-testid*="file-preview" i]',
];
