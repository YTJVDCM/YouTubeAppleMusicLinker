import { it, expect, vi } from 'vitest';
import { ITunes, appleIdentifiers } from '../src/services/itunes';
const song = { wrapperType: 'track', kind: 'song', trackId: 12, collectionId: 34, trackName: 'Song Live', artistName: 'Artist',
  collectionName: 'Album', trackTimeMillis: 201000, trackViewUrl: 'https://evil.example/redirect', releaseDate: '2020-02-03T00:00:00Z' };
it('searches the selected storefront without credentials and maps IDs to safe Apple Music URLs', async () => {
  const get = vi.fn().mockResolvedValue({ results: [song] });
  const result = await new ITunes('jp', get).search('Artist Song Live');
  const url = get.mock.calls[0][0] as URL;
  expect(url.origin).toBe('https://itunes.apple.com'); expect(url.searchParams.get('entity')).toBe('song');
  expect(url.searchParams.get('country')).toBe('jp'); expect(url.searchParams.get('term')).toBe('Artist Song Live');
  expect(result[0]).toMatchObject({ provider: 'itunes', id: '12', kind: 'song', durationSeconds: 201,
    url: 'https://music.apple.com/jp/album/34?i=12', album: { url: 'https://music.apple.com/jp/album/34', releaseDate: '2020-02-03', tracks: [] } });
  expect(result[0].artworkUrl).toBeUndefined();
});
it('keeps videos separate and does not infer their audio recording', async () => {
  const get = vi.fn().mockResolvedValue({ results: [song, { ...song, kind: 'music-video', trackId: 13 }] });
  const client = new ITunes('jp', get);
  expect((await client.search('Artist Song', true))[0]).toMatchObject({ id: '13', kind: 'music-video', audioUnconfirmed: true,
    url: 'https://music.apple.com/jp/music-video/13' });
  expect((await client.search('Artist Song'))).toHaveLength(1);
});
it('looks up direct links by song ID and filters unrelated or malformed records', async () => {
  const get = vi.fn().mockResolvedValue({ results: [song, { ...song, trackId: 99 }, { trackId: 12, kind: 'song' }, null] });
  const client = new ITunes('us', get);
  const result = await client.direct('https://music.apple.com/jp/album/name/34?i=12');
  expect(result).toHaveLength(1); expect(result[0].method).toBe('direct-url');
  expect(get.mock.calls[0][0].searchParams.get('id')).toBe('12');
  expect(appleIdentifiers('https://music.apple.com/jp/album/34')).toBeUndefined();
  expect(appleIdentifiers('https://music.apple.com/jp/music-video/name/13?i=12')).toEqual({ kind: 'music-video', id: '13' });
  expect(await client.direct('https://evil.test/album/34?i=12')).toEqual([]);
});
it('loads album tracks only when requested and rejects unrelated tracks', async () => {
  const get = vi.fn().mockResolvedValue({ results: [{ wrapperType: 'collection', collectionId: 34, collectionName: 'Album' },
    { ...song, trackNumber: 1 }, { ...song, collectionId: 99 }] });
  expect(get).not.toHaveBeenCalled();
  const album = await new ITunes('jp', get).album('34');
  expect(album?.tracks).toEqual([{ id: '12', title: 'Song Live', number: 1 }]);
  await expect(new ITunes('jp', get).album('../bad')).rejects.toMatchObject({ code: 'invalid-request' });
});
it('distinguishes empty catalogs from malformed responses', async () => {
  expect(await new ITunes('jp', vi.fn().mockResolvedValue({ results: [] })).search('x')).toEqual([]);
  await expect(new ITunes('jp', vi.fn().mockResolvedValue({ error: 'broken' })).search('x')).rejects.toMatchObject({ code: 'invalid-response' });
});
