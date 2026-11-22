import { it, expect, vi, afterEach } from 'vitest';
import type { Candidate } from '../src/shared/contracts';
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const candidate: Candidate = { provider: 'itunes', id: '1', kind: 'song', title: 'Song', artist: 'Artist', url: 'https://music.apple.com/jp/album/2?i=1',
  score: .95, confidence: 'high', reasons: [], method: 'metadata', audioUnconfirmed: false };
async function setup(incognito = false) {
  vi.resetModules();
  let listener!: (message: unknown, sender: unknown) => Promise<any>;
  const source = { id: 1, windowId: 1, url: 'https://www.youtube.com/watch?v=abcdefghijk', cookieStoreId: 'firefox-default', incognito };
  const sender = { tab: { ...source }, frameId: 0, id: 'addon', url: source.url };
  const store: Record<string, unknown> = { settings: { endpoint: 'https://match.example/match' } };
  const set = vi.fn(async (value: object) => Object.assign(store, value));
  const create = vi.fn();
  vi.stubGlobal('browser', { runtime: { id: 'addon', onMessage: { addListener: (fn: typeof listener) => { listener = fn; } } },
    permissions: { contains: vi.fn().mockResolvedValue(true) },
    storage: { local: { get: async (key: string) => ({ [key]: store[key] }), set, remove: async (key: string) => { delete store[key]; } } },
    tabs: { onRemoved: { addListener: vi.fn() }, get: async () => source, query: async () => [], create } });
  const fetcher = vi.fn(async (_url: string, _init?: RequestInit) => Response.json({ resultCount: 1, results: [{ wrapperType: 'track', kind: 'song', trackId: 1,
    trackName: 'Song', artistName: 'Artist', collectionId: 2, collectionName: 'Album', trackTimeMillis: 200000 }] }));
  vi.stubGlobal('fetch', fetcher);
  await import('../src/entrypoints/background');
  return { listener, sender, source, store, set, create, fetcher };
}
it('matches, caches, remembers explicit selections, then opens only a cached destination', async () => {
  const s = await setup();
  const message = { type: 'match', videoId: 'abcdefghijk', requestId: 'request', metadata: { title: 'Artist - Song', channel: '' } };
  expect((await s.listener(message, s.sender)).ok).toBe(true);
  expect(s.create).not.toHaveBeenCalled();
  await s.listener(message, s.sender); expect(s.fetcher).toHaveBeenCalledTimes(1);
  expect(s.fetcher.mock.calls[0][0]).toContain('https://itunes.apple.com/search?');
  await s.listener({ type: 'select', videoId: message.videoId, candidateId: '1', kind: 'song' }, s.sender);
  expect((await s.listener(message, s.sender)).value.selected).toEqual({ id: '1', kind: 'song' });
  expect((await s.listener({ type: 'open', videoId: message.videoId, candidateId: 'unknown', kind: 'song', target: 'song' }, s.sender)).ok).toBe(false);
  expect(s.create).not.toHaveBeenCalled();
  await s.listener({ type: 'open', videoId: message.videoId, candidateId: '1', kind: 'song', target: 'song' }, s.sender);
  expect(s.create).toHaveBeenCalledWith(expect.objectContaining({ url: candidate.url }));
});
it('rejects foreign frames/senders and stale video messages', async () => {
  const s = await setup(); const message = { type: 'search', videoId: 'abcdefghijk', term: 'Song' };
  for (const change of [{ id: 'other' }, { frameId: 2 }, { url: 'https://evil.example/watch?v=abcdefghijk' }]) {
    expect((await s.listener(message, { ...s.sender, ...change })).ok).toBe(false);
  }
  expect(s.create).not.toHaveBeenCalled(); expect(s.fetcher).not.toHaveBeenCalled();
});
it('retries after a failed search and SPA navigation with stale sender snapshots, but rejects the old video', async () => {
  vi.useFakeTimers();
  const s = await setup();
  s.fetcher.mockResolvedValueOnce(new Response('', { status: 403 }));
  expect((await s.listener({ type: 'match', videoId: 'abcdefghijk', requestId: 'old', metadata: { title: 'Artist - Song', channel: '' } }, s.sender)).ok).toBe(false);
  s.source.url = 'https://www.youtube.com/watch?v=lmnopqrstuv';
  expect(s.sender.tab.url).toContain('abcdefghijk');
  const message = { type: 'match', videoId: 'lmnopqrstuv', requestId: 'new', refresh: true, metadata: { title: 'Artist - Song', channel: '' } };
  const retried = s.listener(message, s.sender);
  await vi.advanceTimersByTimeAsync(3500);
  expect((await retried).ok).toBe(true);
  expect(s.fetcher).toHaveBeenCalledTimes(2);
  expect((await s.listener({ ...message, videoId: 'abcdefghijk' }, s.sender)).ok).toBe(false);
  await s.listener({ type: 'open', videoId: message.videoId, candidateId: '1', kind: 'song', target: 'song' }, s.sender);
  expect(s.create).toHaveBeenCalledTimes(1);
});
it('never persists private matches or manual selections', async () => {
  const s = await setup(true);
  await s.listener({ type: 'match', videoId: 'abcdefghijk', requestId: 'request', metadata: { title: 'Song', channel: '' } }, s.sender);
  await s.listener({ type: 'select', videoId: 'abcdefghijk', candidateId: '1', kind: 'song' }, s.sender);
  expect(s.set).not.toHaveBeenCalled();
  await s.listener({ type: 'open', videoId: 'abcdefghijk', candidateId: '1', kind: 'song', target: 'song' }, s.sender);
  expect(s.create).toHaveBeenCalledTimes(1);
});
it('loads album tracks on explicit request without navigating', async () => {
  const s = await setup();
  await s.listener({ type: 'match', videoId: 'abcdefghijk', requestId: 'request', metadata: { title: 'Artist - Song', channel: '', durationSeconds: 200 } }, s.sender);
  expect(s.fetcher).toHaveBeenCalledTimes(1);
  // ResetModules gives the background its own constructor; inspect that same module.
  const { ITunes: Client } = await import('../src/services/itunes');
  const album = vi.spyOn(Client.prototype, 'album').mockResolvedValue({ id: '2', title: 'Album', url: 'https://music.apple.com/jp/album/2', tracks: [{ id: '1', title: 'Song' }] });
  const response = await s.listener({ type: 'album', videoId: 'abcdefghijk', candidateId: '1', kind: 'song' }, s.sender);
  expect(album).toHaveBeenCalledWith('2');
  expect(response).toMatchObject({ ok: true, value: { tracks: [{ title: 'Song' }] } });
  expect(s.create).not.toHaveBeenCalled();
});
