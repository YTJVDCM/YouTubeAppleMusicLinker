import { it, expect, vi, afterEach } from 'vitest';
import { catalogMatch } from '../src/services/catalogMatch';
import { ITunes } from '../src/services/itunes';
import { MusicBrainz } from '../src/services/musicBrainz';
import { DEFAULT_SETTINGS } from '../src/shared/settings';
import type { Candidate } from '../src/shared/contracts';
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const song: Candidate = { provider: 'itunes', id: '1', kind: 'song', title: 'Song', artist: 'Artist', url: 'https://music.apple.com/jp/song/1',
  durationSeconds: 200, score: 0, confidence: 'low', method: 'metadata', reasons: [], audioUnconfirmed: false };
const settings = { ...DEFAULT_SETTINGS, musicBrainzContact: 'https://project.example/' };
const metadata = { title: 'Artist - Song', channel: '', durationSeconds: 200 };
function permissions(granted = true) { vi.stubGlobal('browser', { permissions: { contains: vi.fn().mockResolvedValue(granted) } }); }
it('works without a server or account and never consults the supplement for a strong match', async () => {
  permissions(); const search = vi.spyOn(ITunes.prototype, 'search').mockResolvedValue([song]);
  const resolve = vi.spyOn(MusicBrainz.prototype, 'resolve');
  const result = await catalogMatch(metadata, settings);
  expect(result).toMatchObject({ ok: true, value: { candidates: [{ confidence: 'high', url: song.url }] } });
  expect(search).toHaveBeenCalledTimes(1); expect(resolve).not.toHaveBeenCalled();
});
it('prioritizes a direct link and preserves the MV/audio distinction', async () => {
  permissions(); vi.spyOn(ITunes.prototype, 'direct').mockResolvedValue([{ ...song, kind: 'music-video', audioUnconfirmed: true, method: 'direct-url' }]);
  const search = vi.spyOn(ITunes.prototype, 'search');
  expect(await catalogMatch({ ...metadata, directAppleMusicUrls: [song.url] }, settings)).toMatchObject({ ok: true,
    value: { candidates: [{ kind: 'music-video', audioUnconfirmed: true }] } });
  expect(search).not.toHaveBeenCalled();
});
it('requeries iTunes with a verified MusicBrainz artist alias while retaining version checks', async () => {
  permissions();
  const search = vi.spyOn(ITunes.prototype, 'search').mockResolvedValueOnce([]).mockResolvedValueOnce([song]);
  vi.spyOn(MusicBrainz.prototype, 'resolve').mockResolvedValue({ title: 'Song', artist: 'Artist', artistNames: ['アーティスト', 'Artist'] });
  const result = await catalogMatch({ ...metadata, title: 'アーティスト - Song' }, settings);
  expect(search).toHaveBeenLastCalledWith('Artist Song');
  expect(result).toMatchObject({ ok: true, value: { candidates: [{ method: 'musicbrainz-assisted', confidence: 'high' }] } });
});
it('preserves iTunes candidates when MusicBrainz is unavailable', async () => {
  permissions(); vi.spyOn(ITunes.prototype, 'search').mockResolvedValue([{ ...song, artist: 'Different Artist' }]);
  vi.spyOn(MusicBrainz.prototype, 'resolve').mockRejectedValue(new Error('503'));
  const result = await catalogMatch({ title: 'Unknown - Song Live', channel: '' }, settings);
  expect(result).toMatchObject({ ok: true, value: { candidates: [{ id: '1' }], notices: [expect.stringContaining('MusicBrainz補助を完了できません')] } });
});
it('does not call public APIs without permission or without a configured MusicBrainz identity', async () => {
  permissions(false); const search = vi.spyOn(ITunes.prototype, 'search').mockResolvedValue([]);
  const resolve = vi.spyOn(MusicBrainz.prototype, 'resolve');
  expect(await catalogMatch(metadata, settings)).toMatchObject({ ok: false, error: { code: 'permission-denied' } });
  expect(search).not.toHaveBeenCalled();
  permissions(); expect(await catalogMatch(metadata, DEFAULT_SETTINGS)).toMatchObject({ ok: true, value: { candidates: [] } });
  expect(resolve).not.toHaveBeenCalled();
});
