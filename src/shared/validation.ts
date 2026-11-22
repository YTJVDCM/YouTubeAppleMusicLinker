import type { PublicMetadata } from './contracts';
import { appleMusicUrl } from './urls';
export function metadataValid(value: unknown): value is PublicMetadata {
  if (!value || typeof value !== 'object') return false;
  const m = value as PublicMetadata;
  return typeof m.title === 'string' && m.title.length > 0 && m.title.length <= 500 &&
    typeof m.channel === 'string' && m.channel.length <= 300 &&
    (m.durationSeconds === undefined || (Number.isFinite(m.durationSeconds) && m.durationSeconds > 0 && m.durationSeconds < 86400)) &&
    (m.directAppleMusicUrls === undefined || (Array.isArray(m.directAppleMusicUrls) && m.directAppleMusicUrls.length <= 5 && m.directAppleMusicUrls.every(u => !!appleMusicUrl(u)))) &&
    (m.audioIsrc === undefined || /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/.test(m.audioIsrc)) &&
    (m.credits === undefined || (Array.isArray(m.credits) && m.credits.length <= 10 && m.credits.every(c => c &&
      typeof c.title === 'string' && c.title.length <= 500 && typeof c.artist === 'string' && c.artist.length <= 300)));
}
