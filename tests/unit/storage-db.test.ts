import { describe, expect, it } from 'vitest';

describe('storage db module', () => {
  it('can be imported without browser IndexedDB globals', async () => {
    await expect(import('../../src/storage/db')).resolves.toHaveProperty('getScreenshot');
  });
});
