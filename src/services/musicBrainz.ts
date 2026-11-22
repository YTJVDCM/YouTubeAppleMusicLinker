import type { PublicMetadata } from '../shared/contracts';
import { validContact } from '../shared/settings';
import { normalize, parseTitle, versions } from '../matching/normalize';
import { similarity } from '../matching/score';
import { PublicApi, PublicApiError, record, type JsonClient } from './publicApi';
const api = new PublicApi('https://musicbrainz.org', 1100);
export interface RecordingHint { title: string; artist: string; artistNames: string[] }
const literal = (value: string) => `"${value.replace(/[+\-&|!(){}\[\]^"~*?:\\/]/g, '\\$&')}"`;
export class MusicBrainz {
  constructor(private contact: string, private get: JsonClient = api.get) {
    if (!validContact(contact)) throw new PublicApiError('invalid-request');
  }
  private async request(path: string, params: Record<string, string>) {
    const url = new URL(`/ws/2/${path}`, 'https://musicbrainz.org');
    url.search = new URLSearchParams({ ...params, fmt: 'json' }).toString();
    return record(await this.get(url, { 'User-Agent': `YouTubeAppleMusicLinker/0.2.1 (${this.contact})` }));
  }
  async resolve(metadata: PublicMetadata): Promise<RecordingHint | undefined> {
    if (metadata.credits && metadata.credits.length > 1) return;
    const parsed = parseTitle(metadata.title, metadata.channel);
    const source = metadata.credits?.[0] ?? { title: parsed.title, artist: parsed.artist };
    const query = metadata.audioIsrc ? `isrc:${metadata.audioIsrc}` :
      `recording:${literal(source.title)} AND artist:${literal(source.artist)}`;
    const data = await this.request('recording', { query, limit: '3' });
    if (!data || !Array.isArray(data.recordings)) throw new PublicApiError('invalid-response');
    const rows = data.recordings.map(record).filter((r): r is Record<string, unknown> => !!r)
      .filter(r => typeof r.title === 'string' && r.title.length <= 500 && (metadata.audioIsrc || Number(r.score) >= 95));
    const hints = rows.map(row => {
      const credits = Array.isArray(row['artist-credit']) ? row['artist-credit'].map(record) : [];
      const artists = credits.map(c => record(c?.artist));
      const artist = credits.map((c, i) => `${artists[i]?.name ?? c?.name ?? ''}${c?.joinphrase ?? ''}`).join('');
      return { title: row.title as string, artist, artistId: artists.length === 1 ? artists[0]?.id : undefined };
    }).filter(h => h.artist && h.artist.length <= 300);
    if (!hints.length || hints.some(h => normalize(h.title) !== normalize(hints[0].title) || normalize(h.artist) !== normalize(hints[0].artist))) return;
    const hint = hints[0];
    const originalVersions = versions(source.title), targetVersions = versions(hint.title);
    if (originalVersions.some(v => !targetVersions.includes(v)) || targetVersions.some(v => !originalVersions.includes(v))) return;
    if (!metadata.audioIsrc && similarity(source.title, hint.title) < .8) return;
    if (!metadata.audioIsrc && similarity(source.artist, hint.artist) < .9) {
      if (typeof hint.artistId !== 'string' || !/^[a-f\d-]{36}$/i.test(hint.artistId)) return;
      const artist = await this.request(`artist/${hint.artistId}`, { inc: 'aliases' });
      const aliases = Array.isArray(artist?.aliases) ? artist.aliases.map(record) : [];
      if (!aliases.some(alias => typeof alias?.name === 'string' && similarity(source.artist, alias.name) >= .9)) return;
    }
    return { title: hint.title, artist: hint.artist, artistNames: [source.artist, hint.artist] };
  }
}
