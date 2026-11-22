import { it, expect, vi, afterEach } from 'vitest';
import { openAppleMusic } from '../src/services/tabNavigation';
import { DEFAULT_SETTINGS } from '../src/shared/settings';
afterEach(() => vi.unstubAllGlobals());
it('serializes rapid opens and preserves source window/container when creating', async () => {
  const source: browser.tabs.Tab = { id: 1, windowId: 4, cookieStoreId: 'firefox-container-2', incognito: false,
    index: 0, highlighted: false, active: true, pinned: false };
  const targets: unknown[] = [];
  const create = vi.fn(async (options: any) => { targets.push({ ...options, id: 2, incognito: false }); });
  const update = vi.fn();
  vi.stubGlobal('browser', { tabs: { get: vi.fn(async (id: number) => id === 1 ? source : targets[0]),
    query: vi.fn(async () => targets), create, update }, windows: { update: vi.fn() } });
  await Promise.all([openAppleMusic('https://music.apple.com/jp/song/1', source, DEFAULT_SETTINGS),
    openAppleMusic('https://music.apple.com/jp/song/2', source, DEFAULT_SETTINGS)]);
  expect(create).toHaveBeenCalledTimes(1);
  expect(create).toHaveBeenCalledWith(expect.objectContaining({ windowId: 4, cookieStoreId: 'firefox-container-2' }));
  expect(update).toHaveBeenCalledTimes(1);
});
it('rejects unsafe destinations before querying tabs', async () => {
  const query = vi.fn(); vi.stubGlobal('browser', { tabs: { query } });
  const source: browser.tabs.Tab = { id: 1, index: 0, highlighted: false, active: true, pinned: false, incognito: false };
  await expect(openAppleMusic('https://evil.test/', source, DEFAULT_SETTINGS)).rejects.toThrow();
  expect(query).not.toHaveBeenCalled();
});
