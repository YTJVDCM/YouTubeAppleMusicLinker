import type { Candidate, Album, ErrorCode } from '../../src/shared/contracts';
import { appleMusicUrl } from '../../src/shared/urls';
export class CatalogError extends Error {
  constructor(public code: ErrorCode, public status = 502) { super(code); }
}
type Resource = { id: string; type: string; attributes?: Record<string, any>; relationships?: Record<string, { data?: Resource[] }> };
export class AppleMusic {
  constructor(private token: string, private storefront: string, private fetcher: typeof fetch = fetch) {}
  async get(path: string): Promise<any> {
    for (let attempt = 0; attempt < 3; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      try {
        const response = await this.fetcher(`https://api.music.apple.com/v1/catalog/${this.storefront}/${path}`, {
          headers: { Authorization: `Bearer ${this.token}` }, signal: controller.signal, redirect: 'error' });
        if (response.status === 401 || response.status === 403) throw new CatalogError('unauthorized', 503);
        if (response.status === 404) return { data: [] };
        if (response.status === 429 || response.status >= 500) {
          if (attempt < 2) { await new Promise(r => setTimeout(r, 200 * 2 ** attempt)); continue; }
          throw new CatalogError(response.status === 429 ? 'rate-limited' : 'upstream', response.status === 429 ? 429 : 502);
        }
        if (!response.ok) throw new CatalogError('upstream');
        return await response.json();
      } catch (e) {
        if (e instanceof CatalogError) throw e;
        throw new CatalogError(controller.signal.aborted ? 'timeout' : 'network');
      } finally { clearTimeout(timer); }
    }
    throw new CatalogError('upstream');
  }
  candidate(resource: Resource): Candidate | undefined {
    const a = resource.attributes;
    if (!a || typeof resource.id !== 'string' || !['songs', 'music-videos'].includes(resource.type) ||
      typeof a.name !== 'string' || typeof a.artistName !== 'string' || !appleMusicUrl(a.url)) return;
    return { provider: 'apple-music', id: resource.id, kind: resource.type === 'songs' ? 'song' : 'music-video', title: a.name,
      artist: a.artistName, url: a.url, durationSeconds: typeof a.durationInMillis === 'number' ? a.durationInMillis / 1000 : undefined,
      artworkUrl: artwork(a.artwork?.url), score: 0, confidence: 'low', reasons: [], method: 'metadata',
      audioUnconfirmed: resource.type === 'music-videos' };
  }
  async search(term: string): Promise<Candidate[]> {
    const data = await this.get(`search?types=songs,music-videos&limit=10&term=${encodeURIComponent(term)}`);
    const resources = [...(data.results?.songs?.data ?? []), ...(data.results?.['music-videos']?.data ?? [])];
    return resources.map(r => this.candidate(r)).filter((c): c is Candidate => !!c);
  }
  async direct(value: string): Promise<Candidate[]> {
    const url = appleMusicUrl(value);
    if (!url) return [];
    const song = url.searchParams.get('i');
    const match = url.pathname.match(/\/(album|song|music-video)\/(?:[^/]+\/)?(\d+)\/?$/);
    const id = song && /^\d+$/.test(song) ? song : match?.[2];
    if (!id || (!song && match?.[1] === 'album')) return [];
    const type = !song && match?.[1] === 'music-video' ? 'music-videos' : 'songs';
    const data = await this.get(`${type}/${id}?include=albums`);
    return (data.data ?? []).map((r: Resource) => this.candidate(r)).filter(Boolean).map((c: Candidate) => ({ ...c, method: 'direct-url' }));
  }
  async isrc(isrc: string): Promise<Candidate[]> {
    const data = await this.get(`songs?filter[isrc]=${encodeURIComponent(isrc)}&include=albums`);
    return (data.data ?? []).map((r: Resource) => this.candidate(r)).filter(Boolean).map((c: Candidate) => ({ ...c, method: 'audio-isrc' }));
  }
  async album(candidate: Candidate): Promise<Album | undefined> {
    const type = candidate.kind === 'song' ? 'songs' : 'music-videos';
    const resource = await this.get(`${type}/${encodeURIComponent(candidate.id)}?include=albums`);
    const albumId = resource.data?.[0]?.relationships?.albums?.data?.[0]?.id;
    if (typeof albumId !== 'string' || !/^\d+$/.test(albumId)) return;
    const data = await this.get(`albums/${albumId}?include=tracks`);
    const album = data.data?.[0], a = album?.attributes;
    if (!a || typeof a.name !== 'string' || !appleMusicUrl(a.url)) return;
    return { id: albumId, title: a.name, url: a.url, releaseDate: a.releaseDate,
      artworkUrl: artwork(a.artwork?.url), tracks: (album.relationships?.tracks?.data ?? [])
        .filter((t: Resource) => typeof t.attributes?.name === 'string')
        .map((t: Resource) => ({ id: t.id, title: t.attributes!.name, number: t.attributes!.trackNumber })) };
  }
}
function artwork(value: unknown): string | undefined {
  if (typeof value !== 'string') return;
  const url = value.replace('{w}', '300').replace('{h}', '300');
  try { const parsed = new URL(url); if (parsed.protocol === 'https:' && parsed.hostname.endsWith('.mzstatic.com')) return parsed.href; } catch {}
}
