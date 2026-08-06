import type { ChatTarget, ScreenshotMeta } from '../types';

export function resolveMatchingTargets(
  screenshots: ScreenshotMeta[],
  targets: ChatTarget[]
): ChatTarget[] {
  if (screenshots.length === 0) return [];

  return targets.filter((target) => target.enabled);
}

export function chatAcceptsBatch(target: ChatTarget): boolean {
  return target.enabled;
}
