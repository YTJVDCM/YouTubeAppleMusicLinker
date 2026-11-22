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
  const secondRequest = sendMessage.mock.calls[1] as unknown as [{ requestId: string }];
  resolve({ ok: true, value: { videoId: 'lmnopqrstuv', requestId: secondRequest[0].requestId,
    result: { candidates: [{ provider: 'itunes', id: '1', kind: 'song', title: 'Song <img src=x>', artist: 'Artist',
      url: 'https://music.apple.com/jp/album/2?i=1', score: .95, confidence: 'high', reasons: [], audioUnconfirmed: false,
      album: { id: '2', title: 'Album', url: 'https://music.apple.com/jp/album/2', tracks: [] } }], ambiguous: false } } });
  await vi.waitFor(() => expect(panel.textContent).toContain('iTunesカタログで照合'));
  expect(panel.textContent).toContain('Song <img src=x>'); expect(panel.querySelector('img')).toBeNull();
  const trustedClick = (button: Element) => {
    const event = new MouseEvent('click'); Object.defineProperty(event, 'isTrusted', { value: true }); button.dispatchEvent(event);
  };
  trustedClick([...panel.querySelectorAll('button')].find(b => b.textContent === 'この候補を記憶')!);
  expect(sendMessage).toHaveBeenLastCalledWith({ type: 'select', videoId: 'lmnopqrstuv', candidateId: '1', kind: 'song' });
  resolve({ ok: true, value: null });
  await vi.waitFor(() => expect(panel.textContent).toContain('この候補を記憶しました'));
  trustedClick([...panel.querySelectorAll('button')].find(b => b.textContent === '収録曲を表示')!);
  expect(sendMessage).toHaveBeenLastCalledWith({ type: 'album', videoId: 'lmnopqrstuv', candidateId: '1', kind: 'song' });
  resolve({ ok: true, value: { id: '2', title: 'Album', url: 'https://music.apple.com/jp/album/2', tracks: [{ id: '1', title: 'Track 1' }] } });
  await vi.waitFor(() => expect(panel.querySelector('li')?.textContent).toBe('Track 1'));
  attach.mockRestore();
});
