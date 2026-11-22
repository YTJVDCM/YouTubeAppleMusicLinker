import { it, expect, vi, afterEach } from 'vitest';
import { cacheKey, getCached, putCached } from '../src/services/cache';
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
it('separates regions, gives negative results a short TTL, and preserves manual mappings', async () => {
  vi.useFakeTimers(); vi.setSystemTime(1000);
  const store: Record<string, unknown> = {};
  vi.stubGlobal('browser', { storage: { local: { get: async (key: string) => ({ [key]: store[key] }),
    set: async (value: object) => Object.assign(store, value) } } });
  const result = { candidates: [], ambiguous: false };
  const entry = await putCached('jp', 'abcdefghijk', result);
  expect(entry.expiresAt - entry.createdAt).toBe(86400000);
  expect(await getCached('us', 'abcdefghijk')).toBeUndefined();
  expect(cacheKey('jp', 'abcdefghijk')).not.toBe(cacheKey('us', 'abcdefghijk'));
  expect(cacheKey('jp', 'abcdefghijk')).toContain('v3:itunes:');
  store['match:jp:abcdefghijk'] = { ...entry, version: 1, manual: true };
  delete store[cacheKey('jp', 'abcdefghijk')];
  expect(await getCached('jp', 'abcdefghijk')).toBeUndefined();
  await putCached('jp', 'abcdefghijk', result);
  const manual = await putCached('jp', 'abcdefghijk', result, { id: '1', kind: 'song' });
  expect((await putCached('jp', 'abcdefghijk', result)).selected).toEqual(manual.selected);
  vi.advanceTimersByTime(86400001);
  expect(await getCached('jp', 'abcdefghijk')).toMatchObject({ manual: true });
});
