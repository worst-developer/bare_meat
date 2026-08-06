import { describe, expect, it } from 'vitest';
import { createCaptureQueue } from '../../src/capture/capture-queue';

describe('capture queue', () => {
  it('creates pending captures with stable input fields and removes them by id', () => {
    const queue = createCaptureQueue();

    const pending = queue.addToQueue(
      { display: 'BTCUSD.P', normalized: 'BTCUSD.P' },
      { normalized: '4H', dataValue: '240', tooltip: '4 hours' },
      123
    );

    expect(pending.id).toMatch(/^[a-z0-9]+-[a-z0-9]+$/);
    expect(pending.symbol.normalized).toBe('BTCUSD.P');
    expect(pending.timeframe.normalized).toBe('4H');
    expect(pending.sourceTabId).toBe(123);
    expect(pending.status).toBe('pending');
    expect(queue.getAll()).toEqual([pending]);

    expect(queue.removeFromQueue(pending.id)).toBe(true);
    expect(queue.getAll()).toEqual([]);
  });
});
