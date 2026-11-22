import { it, expect, vi } from 'vitest';
import { MusicBrainz } from '../src/services/musicBrainz';
const recording = { id: 'recording', score: 100, title: 'Song', 'artist-credit': [{ name: 'Artist', artist: { id: '12345678-1234-1234-1234-123456789abc', name: 'Artist' } }] };
it('uses a contact-bearing application identity and escaped structured queries', async () => {
  const get = vi.fn().mockResolvedValue({ recordings: [recording] });
  const hint = await new MusicBrainz('https://project.example/', get).resolve({ title: 'Artist - Song', channel: '' });
  expect(hint).toMatchObject({ title: 'Song', artist: 'Artist' });
  expect(get.mock.calls[0][1]['User-Agent']).toContain('https://project.example/');
  expect(get.mock.calls[0][0].searchParams.get('query')).toBe('recording:"song" AND artist:"artist"');
});
it('accepts an artist alias only after verifying it on the artist entity', async () => {
  const get = vi.fn().mockResolvedValueOnce({ recordings: [recording] }).mockResolvedValueOnce({ aliases: [{ name: 'アーティスト' }] });
  const hint = await new MusicBrainz('project@example.com', get).resolve({ title: 'アーティスト - Song', channel: '' });
  expect(hint?.artistNames).toContain('Artist'); expect(get).toHaveBeenCalledTimes(2);
});
it('rejects ambiguous recordings and version conflicts instead of forcing a match', async () => {
  const get = vi.fn().mockResolvedValue({ recordings: [recording, { ...recording, title: 'Other' }] });
  expect(await new MusicBrainz('project@example.com', get).resolve({ title: 'Artist - Song', channel: '' })).toBeUndefined();
  get.mockResolvedValue({ recordings: [recording] });
  expect(await new MusicBrainz('project@example.com', get).resolve({ title: 'Artist - Song Live', channel: '' })).toBeUndefined();
});
it('uses only an explicitly provided audio ISRC and never interprets MV identifiers as audio', async () => {
  const get = vi.fn().mockResolvedValue({ recordings: [recording] });
  await new MusicBrainz('project@example.com', get).resolve({ title: 'Artist - Song', channel: '', audioIsrc: 'JPABC1200001' });
  expect(get.mock.calls[0][0].searchParams.get('query')).toBe('isrc:JPABC1200001');
});
