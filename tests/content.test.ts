// @vitest-environment happy-dom
import { it, expect, vi, afterEach } from 'vitest';
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); document.documentElement.innerHTML = '<head></head><body></body>'; });
it('mounts once, waits for interaction, discards stale results, and closes with Escape', async () => {
  vi.useFakeTimers();
  const realAttach = Element.prototype.attachShadow;
  let shadow: ShadowRoot;
  const attach = vi.spyOn(Element.prototype, 'attachShadow').mockImplementation(function (this: Element, init) {
    shadow = realAttach.call(this, init); return shadow;
  });
  window.history.replaceState({}, '', 'https://www.youtube.com/watch?v=abcdefghijk');
  document.body.innerHTML = '<h1 class="ytd-watch-metadata">Artist - Song</h1>';
  let resolve!: (value: unknown) => void;
  const sendMessage = vi.fn(() => new Promise(r => { resolve = r; }));
  vi.stubGlobal('browser', { runtime: { sendMessage, onMessage: { addListener: vi.fn() } } });
  await import('../src/entrypoints/youtube.content');
  expect(document.querySelectorAll('#yt-apple-music-linker')).toHaveLength(1);
  expect(sendMessage).not.toHaveBeenCalled();
  document.getElementById('yt-apple-music-linker')!.remove();
  await vi.advanceTimersByTimeAsync(1000);
  expect(document.querySelectorAll('#yt-apple-music-linker')).toHaveLength(1);
  expect(sendMessage).not.toHaveBeenCalled();
  const launcher = shadow!.querySelector('.launcher') as HTMLButtonElement;
  const click = new MouseEvent('click', { bubbles: true }); Object.defineProperty(click, 'isTrusted', { value: true });
  launcher.dispatchEvent(click);
  expect(sendMessage).toHaveBeenCalledTimes(1);
  const request = sendMessage.mock.calls[0] as unknown as [{ requestId: string }];
  const panel = shadow!.querySelector('.panel') as HTMLElement;
  expect(panel.hidden).toBe(false);
  // A same-document navigation invalidates the outstanding request immediately.
  window.history.replaceState({}, '', 'https://www.youtube.com/watch?v=lmnopqrstuv');
  document.dispatchEvent(new Event('yt-navigate-finish'));
  resolve({ ok: true, value: { videoId: 'abcdefghijk', requestId: request[0].requestId,
    result: { candidates: [], ambiguous: false } } });
  await Promise.resolve(); await Promise.resolve();
  expect(panel.hidden).toBe(true);
  expect(panel.textContent).not.toContain('候補が見つかりません');
  const secondClick = new MouseEvent('click'); Object.defineProperty(secondClick, 'isTrusted', { value: true });
  launcher.dispatchEvent(secondClick);
  expect(panel.hidden).toBe(false);
  panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  expect(panel.hidden).toBe(true);
  attach.mockRestore();
});
