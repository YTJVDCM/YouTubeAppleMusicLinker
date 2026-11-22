// @vitest-environment happy-dom
import { it, expect, vi, afterEach } from 'vitest';
afterEach(() => { vi.unstubAllGlobals(); document.body.replaceChildren(); });
async function setup(permission: boolean, responds: boolean) {
  vi.resetModules();
  document.body.innerHTML = '<p id="status"></p><button id="check"></button><button id="grant" hidden></button><button id="reload" hidden></button><button id="options"></button>';
  const sendMessage = responds ? vi.fn().mockResolvedValue({ mounted: true, watchPage: true, buttonHidden: false }) : vi.fn().mockRejectedValue(new Error('no receiver'));
  const request = vi.fn().mockResolvedValue(true), reload = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal('browser', {
    tabs: { query: vi.fn().mockResolvedValue([{ id: 2, url: 'https://www.youtube.com/watch?v=abcdefghijk' }]), sendMessage, reload },
    permissions: { contains: vi.fn().mockResolvedValue(permission), request }, runtime: { openOptionsPage: vi.fn() },
  });
  await import('../src/entrypoints/popup');
  await vi.waitFor(() => expect(document.getElementById('status')!.textContent).not.toBe(''));
  return { sendMessage, request, reload };
}
it('explains missing site permission and requests only the current YouTube origin on click', async () => {
  const mock = await setup(false, false);
  expect(document.getElementById('status')!.textContent).toContain('アクセス権限がありません');
  expect(mock.request).not.toHaveBeenCalled(); expect(mock.sendMessage).not.toHaveBeenCalled();
  document.getElementById('grant')!.click();
  await vi.waitFor(() => expect(mock.request).toHaveBeenCalledWith({ origins: ['https://www.youtube.com/*'] }));
  expect(mock.reload).not.toHaveBeenCalled();
});
it('explains an absent content script without a page console error', async () => {
  await setup(true, false);
  await vi.waitFor(() => expect(document.getElementById('status')!.textContent).toContain('応答しません'));
  expect((document.getElementById('reload') as HTMLButtonElement).hidden).toBe(false);
});
it('reports the launcher position when the content script responds', async () => {
  await setup(true, true);
  await vi.waitFor(() => expect(document.getElementById('status')!.textContent).toContain('ページ右下'));
});
