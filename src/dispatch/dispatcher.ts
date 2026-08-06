import * as db from '../storage/db';
import type {
  ChatTarget,
  IncomingScreenshot,
  Provider,
  ScreenshotMeta,
  TargetDispatchState,
} from '../types';
import type { ExtensionMessage } from '../messaging/protocol';
import { buildAnalysisPrompt } from '../prompts/prompt-builder';
import { resolveMatchingTargets } from '../routing/target-resolver';
import { normalizeChatUrl } from '../routing/url-normalizer';
import { sanitizeFilename } from '../utils/symbols';

export async function dispatchRequest(
  message: Extract<ExtensionMessage, { type: 'DISPATCH_REQUEST' }>
): Promise<void> {
  const allScreenshots = await db.listScreenshots();
  const screenshots = allScreenshots.filter((screenshot) => message.screenshotKeys.includes(screenshot.key));
  const targets = await getChatTargets();
  const requestedTargetIds = new Set(message.targetIds);
  const matchingTargets = resolveMatchingTargets(screenshots, targets)
    .filter((target) => requestedTargetIds.has(target.id));

  if (screenshots.length === 0) return;

  const prompt = buildAnalysisPrompt(
    screenshots,
    message.basePrompt,
    message.additionalPrompt,
    message.includeScrapedData,
    message.telemetry
  );
  const incomingScreenshots = await Promise.all(screenshots.map(toIncomingScreenshot));
  console.log('[bare meat🧸🥩][dispatch] request', {
    screenshotKeys: screenshots.map((screenshot) => screenshot.key),
    targetIds: matchingTargets.map((target) => target.id),
    autosubmit: message.autosubmit,
    promptPreview: preview(prompt),
  });

  await Promise.allSettled(
    matchingTargets.map((target) => dispatchTarget(target, prompt, incomingScreenshots, message.autosubmit))
  );
}

async function dispatchTarget(
  target: ChatTarget,
  prompt: string,
  screenshots: IncomingScreenshot[],
  autosubmit: boolean
): Promise<void> {
  try {
    logAgentFlow(target, 'start', {
      screenshotCount: screenshots.length,
      screenshots: screenshots.map((screenshot) => screenshot.filename),
      promptPreview: preview(prompt),
      autosubmit,
      chatUrl: target.chatUrl,
      normalizedChatUrl: safeNormalizeChatUrl(target.chatUrl),
    });
    await emitTargetStatus(target.id, 'finding_tab', 'Finding configured conversation');

    if (target.provider === 'deepseek') {
      logAgentFlow(target, 'skipped: adapter not implemented');
      await emitTargetStatus(target.id, 'error', `${target.provider} adapter not implemented yet`);
      return;
    }

    const tab = await findOrOpenChatTab(target);
    if (!tab.id) throw new Error('Tab has no id');
    logAgentFlow(target, 'tab selected', tabInfo(tab));
    await chrome.tabs.update(tab.id, { active: true });
    logAgentFlow(target, 'tab activated', { tabId: tab.id });
    await ensureProviderContentScript(tab.id, target);

    await emitTargetStatus(target.id, 'waiting_for_provider', `Waiting for ${target.provider} composer`);
    const ready = await pingProvider(tab.id, target.provider, target);
    if (!ready.success) {
      const freshTab = await chrome.tabs.get(tab.id).catch(() => tab);
      throw new Error(
        `${target.provider} content script not reachable in tab ${tab.id} (${freshTab.url ?? tab.url ?? 'unknown url'}): ${
          ready.error ?? `${target.provider} composer not found or page is not ready`
        }`
      );
    }
    logAgentFlow(target, 'provider ready', { tabId: tab.id });

    await emitTargetStatus(target.id, 'transferring_images', `Sending ${screenshots.length} image(s)`);
    await emitTargetStatus(target.id, 'attaching_images', `Attaching ${screenshots.length} image(s)`);
    await emitTargetStatus(target.id, 'writing_prompt', 'Writing prompt');
    if (autosubmit) {
      await emitTargetStatus(target.id, 'working', 'Working…');
    }
    logAgentFlow(target, 'sending prepare', {
      tabId: tab.id,
      screenshotCount: screenshots.length,
      screenshots: screenshots.map((screenshot) => screenshot.filename),
      autosubmit,
    });
    const response = await chrome.tabs.sendMessage(tab.id, {
      type: 'PROVIDER_PREPARE',
      provider: target.provider,
      prompt,
      screenshots,
      autosubmit,
    } satisfies ExtensionMessage);
    logAgentFlow(target, 'prepare response', response);

    if (!response?.success) {
      throw new Error(response?.error ?? 'Provider preparation failed');
    }

    if (autosubmit) {
      await emitTargetStatus(target.id, 'finished', 'Finished');
      logAgentFlow(target, 'finished');
    } else {
      await emitTargetStatus(target.id, 'verifying', 'Verifying prompt and attachments');
      await emitTargetStatus(target.id, 'ready', 'Ready — send manually');
      logAgentFlow(target, 'ready');
    }
  } catch (error) {
    logAgentFlow(target, 'error', { error: String(error) }, 'error');
    await emitTargetStatus(target.id, 'error', String(error));
  }
}

async function findOrOpenChatTab(target: ChatTarget): Promise<chrome.tabs.Tab> {
  const normalizedTargetUrl = normalizeChatUrl(target.chatUrl);
  logAgentFlow(target, 'looking for tab', { normalizedTargetUrl });
  const tabs = await chrome.tabs.query({});
  const existing = tabs.find((tab) => tab.url && chatTabMatches(tab.url, target.chatUrl));

  if (existing) {
    logAgentFlow(target, 'found existing tab', tabInfo(existing));
    return existing;
  }

  await emitTargetStatus(target.id, 'opening_tab', 'Opening configured conversation');
  logAgentFlow(target, 'opening tab', { url: target.chatUrl });
  const created = await chrome.tabs.create({ url: target.chatUrl, active: true });
  logAgentFlow(target, 'opened tab', tabInfo(created));
  return created;
}

async function pingProvider(
  tabId: number,
  provider: Provider,
  target: ChatTarget,
  timeoutMs = 15000
): Promise<{ success: boolean; error?: string }> {
  const started = Date.now();
  let lastError = `${provider} composer not found or page is not ready`;
  let attempts = 0;
  while (Date.now() - started < timeoutMs) {
    attempts += 1;
    try {
      const response = await chrome.tabs.sendMessage(tabId, {
        type: 'PROVIDER_PING',
      } satisfies ExtensionMessage);

      if (response?.success && response.provider === provider) {
        logAgentFlow(target, 'ping ok', { tabId, attempts });
        return { success: true };
      }
      if (response?.error) lastError = response.error;
      if (attempts === 1 || attempts % 5 === 0) {
        logAgentFlow(target, 'ping waiting', { tabId, attempts, response });
      }
    } catch (error) {
      lastError = String(error);
      if (attempts === 1 || attempts % 5 === 0) {
        logAgentFlow(target, 'ping failed', { tabId, attempts, error: lastError }, 'warn');
      }
    }

    await delay(500);
  }

  logAgentFlow(target, 'ping timeout', { tabId, attempts, lastError }, 'warn');
  return { success: false, error: lastError };
}

async function getChatTargets(): Promise<ChatTarget[]> {
  const result = await chrome.storage.local.get(['chat_targets']);
  return Array.isArray(result.chat_targets) ? result.chat_targets : [];
}

async function toIncomingScreenshot(meta: ScreenshotMeta): Promise<IncomingScreenshot> {
  const blob = await db.getBlob(meta.blobId);
  if (!blob) throw new Error(`Missing blob for ${meta.key}`);

  return {
    meta,
    filename: sanitizeFilename(`${meta.symbol}_${meta.timeframe}_${meta.id}.png`),
    mimeType: meta.mimeType,
    dataUrl: await blobToDataUrl(blob),
  };
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return `data:${blob.type || 'image/png'};base64,${btoa(binary)}`;
}

async function emitTargetStatus(
  targetId: string,
  state: TargetDispatchState,
  message?: string,
  progress?: number
): Promise<void> {
  await chrome.runtime.sendMessage({
    type: 'DISPATCH_STATUS_UPDATE',
    targetId,
    state,
    message,
    progress,
  } satisfies ExtensionMessage).catch(() => {
    // Status is best-effort when the side panel is closed.
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeNormalizeChatUrl(url: string): string | null {
  try {
    return normalizeChatUrl(url);
  } catch {
    return null;
  }
}

function chatTabMatches(tabUrl: string, targetUrl: string): boolean {
  const normalizedTabUrl = safeNormalizeChatUrl(tabUrl);
  const normalizedTargetUrl = safeNormalizeChatUrl(targetUrl);
  return Boolean(normalizedTabUrl && normalizedTargetUrl && normalizedTabUrl === normalizedTargetUrl);
}

async function ensureProviderContentScript(tabId: number, target: ChatTarget): Promise<void> {
  const ping = await pingProvider(tabId, target.provider, target, 1200);
  if (ping.success) return;

  const file = providerContentScriptFile(target.provider);
  if (!file) return;
  logAgentFlow(target, 'injecting provider content script', { tabId, file });
  await chrome.scripting.executeScript({
    target: { tabId },
    files: [file],
  });
  await delay(300);
}

function providerContentScriptFile(provider: Provider): string | null {
  if (provider === 'chatgpt') return 'content-scripts/chatgpt.js';
  if (provider === 'grok') return 'content-scripts/grok.js';
  if (provider === 'kimi') return 'content-scripts/kimi.js';
  if (provider === 'deepseek') return 'content-scripts/deepseek.js';
  return null;
}

function logAgentFlow(
  target: ChatTarget,
  message: string,
  data?: unknown,
  level: 'log' | 'warn' | 'error' = 'log'
): void {
  const prefix = `[bare meat🧸🥩][agent:${target.name}/${target.provider}] ${message}`;
  if (data === undefined) {
    console[level](prefix);
    return;
  }
  console[level](prefix, data);
}

function tabInfo(tab: chrome.tabs.Tab): Record<string, unknown> {
  return {
    id: tab.id,
    url: tab.url,
    pendingUrl: tab.pendingUrl,
    status: tab.status,
    title: tab.title,
  };
}

function preview(value: string, maxLength = 180): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength)}…`;
}
