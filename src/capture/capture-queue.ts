import type { DetectedInterval, DetectedSymbol, PendingCapture, TradingViewTelemetrySnapshot } from '../types';
import { generateId } from '../utils/symbols';

export interface CaptureQueue {
  addToQueue(
    symbol: DetectedSymbol,
    timeframe: DetectedInterval,
    sourceTabId: number,
    telemetry?: TradingViewTelemetrySnapshot
  ): PendingCapture;
  peek(): PendingCapture | undefined;
  removeFromQueue(id: string): boolean;
  getAll(): PendingCapture[];
}

export function createCaptureQueue(): CaptureQueue {
  const pendingCaptures = new Map<string, PendingCapture>();

  return {
    addToQueue(symbol, timeframe, sourceTabId, telemetry) {
      const pending: PendingCapture = {
        id: generateId(),
        symbol,
        timeframe,
        sourceTabId,
        triggeredAt: Date.now(),
        status: 'pending',
        telemetry,
      };

      pendingCaptures.set(pending.id, pending);
      return pending;
    },

    removeFromQueue(id) {
      return pendingCaptures.delete(id);
    },

    peek() {
      return pendingCaptures.values().next().value;
    },

    getAll() {
      return [...pendingCaptures.values()];
    },
  };
}

export const captureQueue = createCaptureQueue();
