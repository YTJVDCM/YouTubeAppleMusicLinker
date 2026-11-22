import { it, expect, vi, afterEach } from 'vitest';
import { AppleMusic } from '../worker/src/appleMusic';
import { handle } from '../worker/src/index';
afterEach(() => vi.unstubAllGlobals());
it('classifies invalid authorization without retrying', async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response('', { status: 401 }));
  await expect(new AppleMusic('dummy', 'jp', fetcher).get('search')).rejects.toMatchObject({ code: 'unauthorized' });
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it('retries upstream errors and distinguishes rate limits', async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response('', { status: 429 }));
  await expect(new AppleMusic('dummy', 'jp', fetcher).get('search')).rejects.toMatchObject({ code: 'rate-limited' });
  expect(fetcher).toHaveBeenCalledTimes(3);
});
it('handles missing fields and storefront-specific empty catalogs', async () => {
  const fetcher = vi.fn().mockResolvedValue(Response.json({ results: { songs: { data: [{ id: '1', type: 'songs' }] } } }));
  expect(await new AppleMusic('dummy', 'jp', fetcher).search('Song')).toEqual([]);
  expect(fetcher.mock.calls[0][0]).toContain('/catalog/jp/');
});
it('fails closed without authentication configuration or limiter', async () => {
  const req = new Request('https://worker.example/match', { method: 'POST' });
  expect((await handle(req, { APPLE_MUSIC_TOKEN: '' })).status).toBe(503);
});
it('rejects malformed input before catalog access', async () => {
  for (const body of ['{}', 'null', '"invalid"']) {
    const request = new Request('https://worker.example/match', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    expect((await handle(request, { APPLE_MUSIC_TOKEN: 'dummy', RATE_LIMITER: { limit: async () => ({ success: true }) } })).status).toBe(400);
  }
});
it('runs the catalog contract through matching and album enrichment without a video identifier', async () => {
  const fetcher = vi.fn(async (url: string) => {
    if (url.includes('/search?')) return Response.json({ results: { songs: { data: [{ id: '1', type: 'songs', attributes: {
      name: 'Song', artistName: 'Artist', url: 'https://music.apple.com/jp/song/1', durationInMillis: 200000 } }] } } });
    if (url.includes('/songs/1')) return Response.json({ data: [{ relationships: { albums: { data: [{ id: '2' }] } } }] });
    return Response.json({ data: [{ attributes: { name: 'Album', url: 'https://music.apple.com/jp/album/2', releaseDate: '2026-01-01' },
      relationships: { tracks: { data: [{ id: '1', attributes: { name: 'Song', trackNumber: 1 } }] } } }] });
  });
  vi.stubGlobal('fetch', fetcher);
  const request = new Request('https://worker.example/match', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ version: 1, storefront: 'jp', metadata: { title: 'Artist - Song', channel: 'Artist', durationSeconds: 200 } }) });
  const response = await handle(request, { APPLE_MUSIC_TOKEN: 'dummy', RATE_LIMITER: { limit: async () => ({ success: true }) } });
  expect(response.status).toBe(200);
  const data = await response.json() as any;
  expect(data.value.candidates[0]).toMatchObject({ kind: 'song', confidence: 'high', album: { title: 'Album', tracks: [{ title: 'Song' }] } });
  expect(fetcher).toHaveBeenCalledTimes(3);
});
it('rejects oversized input and handles edge limiter failures', async () => {
  const make = () => new Request('https://worker.example/match', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: 'x'.repeat(12001) });
  expect((await handle(make(), { APPLE_MUSIC_TOKEN: 'dummy', RATE_LIMITER: { limit: async () => ({ success: true }) } })).status).toBe(413);
  expect((await handle(make(), { APPLE_MUSIC_TOKEN: 'dummy', RATE_LIMITER: { limit: async () => { throw new Error(); } } })).status).toBe(502);
});
