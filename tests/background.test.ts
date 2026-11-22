import { it, expect, vi, afterEach } from 'vitest';
import type { Candidate } from '../src/shared/contracts';
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const candidate: Candidate = { id: '1', kind: 'song', title: 'Song', artist: 'Artist', url: 'https://music.apple.com/jp/song/1',
  score: .95, confidence: 'high', reasons: [], method: 'metadata', audioUnconfirmed: false };
async function setup(incognito = false) {
  vi.resetModules();
  let listener!: (message: unknown, sender: unknown) => Promise<any>;
  const source = { id: 1, windowId: 1, url: 'https://www.youtube.com/watch?v=abcdefghijk', cookieStoreId: 'firefox-default', incognito };
  const sender = { tab: source, frameId: 0, id: 'addon', url: source.url };
  const store: Record<string, unknown> = { settings: { endpoint: 'https://match.example/match' } };
  const set = vi.fn(async (value: object) => Object.assign(store, value));
  const create = vi.fn();
  vi.stubGlobal('browser', { runtime: { id: 'addon', onMessage: { addListener: (fn: typeof listener) => { listener = fn; } } },
    storage: { local: { get: async (key: string) => ({ [key]: store[key] }), set, remove: async (key: string) => { delete store[key]; } } },
    tabs: { onRemoved: { addListener: vi.fn() }, get: async () => source, query: async () => [], create } });
  const fetcher = vi.fn(async () => Response.json({ ok: true, value: { candidates: [candidate], ambiguous: false } }));
  vi.stubGlobal('fetch', fetcher);
  await import('../src/entrypoints/background');
  return { listener, sender, store, set, create, fetcher };
}
it('matches, caches, remembers explicit selections, then opens only a cached destination', async () => {
  const s = await setup();
  const message = { type: 'match', videoId: 'abcdefghijk', requestId: 'request', metadata: { title: 'Artist - Song', channel: '' } };
  expect((await s.listener(message, s.sender)).ok).toBe(true);
  expect(s.create).not.toHaveBeenCalled();
  await s.listener(message, s.sender); expect(s.fetcher).toHaveBeenCalledTimes(1);
  await s.listener({ type: 'select', videoId: message.videoId, candidateId: '1', kind: 'song' }, s.sender);
  expect((await s.listener(message, s.sender)).value.selected).toEqual({ id: '1', kind: 'song' });
  expect((await s.listener({ type: 'open', videoId: message.videoId, candidateId: 'unknown', kind: 'song', target: 'song' }, s.sender)).ok).toBe(false);
  expect(s.create).not.toHaveBeenCalled();
  await s.listener({ type: 'open', videoId: message.videoId, candidateId: '1', kind: 'song', target: 'song' }, s.sender);
  expect(s.create).toHaveBeenCalledWith(expect.objectContaining({ url: candidate.url }));
});
it('rejects foreign frames/senders and stale video messages', async () => {
  const s = await setup(); const message = { type: 'search', videoId: 'abcdefghijk', term: 'Song' };
  for (const change of [{ id: 'other' }, { frameId: 2 }, { url: 'https://www.youtube.com/watch?v=lmnopqrstuv' }]) {
    expect((await s.listener(message, { ...s.sender, ...change })).ok).toBe(false);
  }
  expect(s.create).not.toHaveBeenCalled(); expect(s.fetcher).not.toHaveBeenCalled();
});
it('never persists private matches or manual selections', async () => {
  const s = await setup(true);
  await s.listener({ type: 'match', videoId: 'abcdefghijk', requestId: 'request', metadata: { title: 'Song', channel: '' } }, s.sender);
  await s.listener({ type: 'select', videoId: 'abcdefghijk', candidateId: '1', kind: 'song' }, s.sender);
  expect(s.set).not.toHaveBeenCalled();
  await s.listener({ type: 'open', videoId: 'abcdefghijk', candidateId: '1', kind: 'song', target: 'song' }, s.sender);
  expect(s.create).toHaveBeenCalledTimes(1);
});
