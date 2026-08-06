export const KIMI_COMPOSER_SELECTORS = [
  '.chat-input-editor[contenteditable="true"][role="textbox"]',
  '[data-lexical-editor="true"][contenteditable="true"]',
  'textarea',
  '[contenteditable="true"]',
];

export const KIMI_FILE_INPUT_SELECTORS = [
  'input[type="file"]',
];

export const KIMI_ATTACHMENT_SELECTORS = [
  '.toolkit-trigger-btn',
  '[name="Add"]',
];

export const KIMI_SEND_SELECTORS = [
  '.send-button-container:not(.disabled)',
  '[aria-label="Send"]',
  '[aria-label="Submit"]',
  'button[type="submit"]:not(:disabled)',
];
