import { CONTRACT_VERSION, type CacheEntry, type MatchResult, type ResourceKind } from '../shared/contracts';
import { validResult } from './matchClient';
export const cacheKey = (storefront: string, videoId: string) => `match:v${CONTRACT_VERSION}:itunes:${storefront}:${videoId}`;
export function usable(entry: CacheEntry | undefined, now = Date.now()): boolean {
  return !!entry && entry.version === CONTRACT_VERSION && (entry.manual || entry.expiresAt > now);
}
export async function getCached(storefront: string, videoId: string): Promise<CacheEntry | undefined> {
  const key = cacheKey(storefront, videoId);
  const entry = (await browser.storage.local.get(key))[key] as CacheEntry | undefined;
  return usable(entry) && entry?.storefront === storefront && entry.videoId === videoId && validResult(entry.result) &&
    entry.result.candidates.every(c => c.provider === 'itunes') ? entry : undefined;
}
export async function putCached(storefront: string, videoId: string, result: MatchResult,
  selected?: { id: string; kind: ResourceKind }): Promise<CacheEntry> {
  const existing = await getCached(storefront, videoId);
  if (existing?.manual && !selected) return existing;
  const now = Date.now();
  const entry: CacheEntry = { version: CONTRACT_VERSION, storefront, videoId, result, createdAt: now,
    expiresAt: now + (result.candidates.length ? 7 : 1) * 86400000, manual: !!selected, selected };
  await browser.storage.local.set({ [cacheKey(storefront, videoId)]: entry });
  return entry;
}
