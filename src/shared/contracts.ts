/** Versioned boundary shared by content, background, and catalog worker. */
export const CONTRACT_VERSION = 2 as const;
export type ResourceKind = 'song' | 'music-video';
export type Confidence = 'high' | 'review' | 'low';
export type MatchMethod = 'direct-url' | 'audio-isrc' | 'metadata' | 'musicbrainz-assisted';
export type ErrorCode = 'invalid-request' | 'not-configured' | 'unauthorized' |
  'rate-limited' | 'timeout' | 'upstream' | 'network' | 'invalid-response' | 'permission-denied';

export interface PublicMetadata {
  title: string;
  channel: string;
  durationSeconds?: number;
  credits?: { title: string; artist: string }[];
  directAppleMusicUrls?: string[];
  /** Only verified audio-recording identifiers; never infer these from an MV. */
  audioIsrc?: string;
}
export interface Album {
  id: string;
  title: string;
  url: string;
  releaseDate?: string;
  artworkUrl?: string;
  tracks: { id: string; title: string; number?: number }[];
}
export interface Candidate {
  provider: 'itunes' | 'apple-music';
  id: string;
  kind: ResourceKind;
  title: string;
  artist: string;
  url: string;
  durationSeconds?: number;
  artworkUrl?: string;
  album?: Album;
  score: number;
  confidence: Confidence;
  reasons: string[];
  method: MatchMethod;
  /** A music-video alone never establishes the corresponding audio recording. */
  audioUnconfirmed: boolean;
}
/** No video URL/ID is needed by the catalog service. */
export interface MatchRequest {
  version: typeof CONTRACT_VERSION;
  storefront: string;
  metadata: PublicMetadata;
}
export interface MatchResult {
  candidates: Candidate[];
  ambiguous: boolean;
  notices?: string[];
}
export type ApiResponse<T> = { ok: true; value: T } |
  { ok: false; error: { code: ErrorCode; message: string; retryAfterSeconds?: number } };
export type ContentMessage =
  | { type: 'match'; videoId: string; requestId: string; metadata: PublicMetadata; refresh?: boolean }
  | { type: 'select'; videoId: string; candidateId: string; kind: ResourceKind }
  | { type: 'open'; videoId: string; candidateId: string; kind: ResourceKind; target: 'song' | 'album' }
  | { type: 'search'; videoId: string; term: string }
  | AlbumMessage;
export type AlbumMessage = { type: 'album'; videoId: string; candidateId: string; kind: ResourceKind };
export interface MatchReply {
  videoId: string;
  requestId: string;
  result: MatchResult;
  selected?: { id: string; kind: ResourceKind };
}
export interface CacheEntry {
  version: typeof CONTRACT_VERSION;
  storefront: string;
  videoId: string;
  result: MatchResult;
  createdAt: number;
  expiresAt: number;
  manual: boolean;
  selected?: { id: string; kind: ResourceKind };
}
