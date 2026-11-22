// @vitest-environment happy-dom
import { it, expect, vi, afterEach } from 'vitest';
import { readSettings } from '../src/shared/settings';
import html from '../src/entrypoints/options.html?raw';
afterEach(() => { vi.unstubAllGlobals(); document.body.replaceChildren(); });
it('saves without a server URL and requests only the selected catalog hosts', async () => {
  vi.resetModules();
  // Load the real markup but execute its module through the test importer only.
  document.body.innerHTML = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  const set = vi.fn().mockResolvedValue(undefined), request = vi.fn().mockResolvedValue(true);
  vi.stubGlobal('browser', { storage: { local: { get: vi.fn().mockResolvedValue({ settings: { endpoint: 'https://old-worker.example/match' } }), set } },
    permissions: { request } });
  await import('../src/entrypoints/options');
  await vi.waitFor(() => expect((document.getElementById('storefront') as HTMLInputElement).value).toBe('jp'));
  expect(document.getElementById('endpoint')).toBeNull();
  document.getElementById('settings')!.dispatchEvent(new Event('submit', { cancelable: true }));
  await vi.waitFor(() => expect(set).toHaveBeenCalled());
  expect(request).toHaveBeenCalledWith({ origins: ['https://itunes.apple.com/*'] });
  expect(set.mock.calls[0][0].settings.endpoint).toBeUndefined();
  (document.getElementById('musicBrainzContact') as HTMLInputElement).value = 'https://project.example/';
  document.getElementById('settings')!.dispatchEvent(new Event('submit', { cancelable: true }));
  await vi.waitFor(() => expect(request).toHaveBeenLastCalledWith({ origins: ['https://itunes.apple.com/*', 'https://musicbrainz.org/*'] }));
});
it('rejects header injection and preserves existing tab preferences when reading old settings', () => {
  expect(readSettings({ endpoint: 'https://old.example/', reuseTabs: false, storefront: 'us', musicBrainzContact: 'bad\r\nUser-Agent: evil' }))
    .toMatchObject({ reuseTabs: false, storefront: 'us', musicBrainzContact: '' });
});
