import type { Album, Candidate, ResourceKind } from '../shared/contracts';
import { appleMusicUrl } from '../shared/urls';
import { PublicApi, PublicApiError, record, type JsonClient } from './publicApi';
const api = new PublicApi('https://itunes.apple.com', 3500);
const numericId = (value: unknown) => (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) ||
  (typeof value === 'string' && /^[1-9]\d{0,18}$/.test(value));
const string = (value: unknown, limit = 500) => typeof value === 'string' && value.length > 0 && value.length <= limit ? value : undefined;

export function appleIdentifiers(value: string): { kind: ResourceKind; id: string } | undefined {
  const url = appleMusicUrl(value); if (!url) return;
  const match = url.pathname.match(/\/(album|song|music-video)\/(?:[^/]+\/)?(\d+)\/?$/);
  if (!match || !numericId(match[2])) return;
  const songId = url.searchParams.get('i');
  if (match[1] === 'album' && !numericId(songId)) return;
  return { kind: match[1] === 'music-video' ? 'music-video' : 'song', id: match[1] === 'album' ? songId! : match[2] };
}
export class ITunes {
  constructor(private storefront: string, private get: JsonClient = api.get) {
    if (!/^[a-z]{2}$/.test(storefront)) throw new PublicApiError('invalid-request');
  }
  private async request(path: string, params: Record<string, string>) {
    const url = new URL(path, 'https://itunes.apple.com');
    url.search = new URLSearchParams({ ...params, country: this.storefront, lang: this.storefront === 'jp' ? 'ja_jp' : 'en_us' }).toString();
    const data = record(await this.get(url));
    if (!data || !Array.isArray(data.results)) throw new PublicApiError('invalid-response');
    return data.results.slice(0, 201).map(record).filter((item): item is Record<string, unknown> => !!item);
  }
  candidate(item: Record<string, unknown>): Candidate | undefined {
    if (item.wrapperType !== 'track' || !['song', 'music-video'].includes(String(item.kind)) || !numericId(item.trackId)) return;
    const title = string(item.trackName), artist = string(item.artistName);
    if (!title || !artist) return;
    const id = String(item.trackId), kind = item.kind as ResourceKind;
    const albumId = numericId(item.collectionId) ? String(item.collectionId) : undefined;
    const albumTitle = string(item.collectionName);
    const album: Album | undefined = albumId && albumTitle ? { id: albumId, title: albumTitle,
      url: `https://music.apple.com/${this.storefront}/album/${albumId}`,
      releaseDate: typeof item.releaseDate === 'string' ? item.releaseDate.slice(0, 10) : undefined, tracks: [] } : undefined;
    // Catalog IDs are mapped to Apple Music per the product decision; availability is not a matching criterion.
    const url = kind === 'music-video' ? `https://music.apple.com/${this.storefront}/music-video/${id}` :
      albumId ? `https://music.apple.com/${this.storefront}/album/${albumId}?i=${id}` : `https://music.apple.com/${this.storefront}/song/${id}`;
    return { provider: 'itunes', id, kind, title, artist, url, album,
      durationSeconds: typeof item.trackTimeMillis === 'number' && Number.isFinite(item.trackTimeMillis) && item.trackTimeMillis > 0 ? item.trackTimeMillis / 1000 : undefined,
      score: 0, confidence: 'low', reasons: [], method: 'metadata', audioUnconfirmed: kind === 'music-video' };
  }
  async search(term: string, musicVideo = false): Promise<Candidate[]> {
    const rows = await this.request('/search', { term: term.slice(0, 500), media: musicVideo ? 'musicVideo' : 'music', entity: musicVideo ? 'musicVideo' : 'song', limit: '10' });
    return rows.map(row => this.candidate(row)).filter((c): c is Candidate => !!c && c.kind === (musicVideo ? 'music-video' : 'song'));
  }
  async direct(value: string): Promise<Candidate[]> {
    const ids = appleIdentifiers(value); if (!ids) return [];
    const rows = await this.request('/lookup', { id: ids.id });
    return rows.map(row => this.candidate(row)).filter((c): c is Candidate => !!c && c.id === ids.id && c.kind === ids.kind)
      .map(c => ({ ...c, method: 'direct-url' }));
  }
  async album(id: string): Promise<Album | undefined> {
    if (!numericId(id)) throw new PublicApiError('invalid-request');
    const rows = await this.request('/lookup', { id, entity: 'song', limit: '200' });
    const collection = rows.find(row => row.wrapperType === 'collection' && String(row.collectionId) === id);
    const title = string(collection?.collectionName); if (!title) return;
    return { id, title, url: `https://music.apple.com/${this.storefront}/album/${id}`,
      releaseDate: typeof collection?.releaseDate === 'string' ? collection.releaseDate.slice(0, 10) : undefined,
      tracks: rows.filter(row => row.kind === 'song' && String(row.collectionId) === id && numericId(row.trackId) && string(row.trackName))
        .map(row => ({ id: String(row.trackId), title: row.trackName as string,
          number: typeof row.trackNumber === 'number' ? row.trackNumber : undefined })) };
  }
}
