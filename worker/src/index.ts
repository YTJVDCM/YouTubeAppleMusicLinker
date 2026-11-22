import type { MatchRequest } from '../../src/shared/contracts';
import { metadataValid } from '../../src/shared/validation';
import { parseTitle } from '../../src/matching/normalize';
import { rank } from '../../src/matching/score';
import { AppleMusic, CatalogError } from './appleMusic';
export interface Env {
  APPLE_MUSIC_TOKEN: string;
  RATE_LIMITER?: { limit(options: { key: string }): Promise<{ success: boolean }> };
}
export async function handle(request: Request, env: Env): Promise<Response> {
  const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
  const fail = (code: string, status: number) => json({ ok: false, error: { code, message: 'カタログ検索を完了できませんでした。' } }, status);
  if (request.method !== 'POST' || new URL(request.url).pathname !== '/match') return fail('invalid-request', 405);
  if (!env.APPLE_MUSIC_TOKEN || !env.RATE_LIMITER) return fail('not-configured', 503);
  // Fail closed without an edge rate limiter; no identifiers or IPs are logged.
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) return fail('invalid-request', 415);
  try {
    if (!(await env.RATE_LIMITER.limit({ key: request.headers.get('CF-Connecting-IP') ?? 'unknown' })).success) return fail('rate-limited', 429);
    const reader = request.body?.getReader();
    if (!reader) return fail('invalid-request', 400);
    let size = 0, text = ''; const decoder = new TextDecoder();
    while (true) {
      const part = await reader.read(); if (part.done) break;
      size += part.value.byteLength;
      if (size > 12000) { await reader.cancel(); return fail('invalid-request', 413); }
      text += decoder.decode(part.value, { stream: true });
    }
    text += decoder.decode();
    const input = JSON.parse(text) as MatchRequest;
    if (!input || typeof input !== 'object' || input.version !== 1 || typeof input.storefront !== 'string' ||
      !/^[a-z]{2}$/.test(input.storefront) || !metadataValid(input.metadata)) return fail('invalid-request', 400);
    const apple = new AppleMusic(env.APPLE_MUSIC_TOKEN, input.storefront);
    let candidates = [];
    for (const url of input.metadata.directAppleMusicUrls ?? []) {
      candidates.push(...await apple.direct(url));
    }
    if (!candidates.length && input.metadata.audioIsrc) candidates = await apple.isrc(input.metadata.audioIsrc);
    if (!candidates.length) {
      const parsed = parseTitle(input.metadata.title, input.metadata.channel);
      const credit = input.metadata.credits?.length === 1 ? input.metadata.credits[0] : undefined;
      candidates = await apple.search(`${credit?.artist ?? parsed.artist} ${credit?.title ?? parsed.title}`);
    }
    const result = rank(input.metadata, [...new Map(candidates.map(c => [`${c.kind}:${c.id}`, c])).values()]);
    // Bounded enrichment avoids a request fan-out across the full catalog.
    result.candidates = result.candidates.slice(0, 5);
    await Promise.all(result.candidates.map(async c => { c.album = await apple.album(c); }));
    return json({ ok: true, value: result });
  } catch (error) {
    if (error instanceof SyntaxError) return fail('invalid-request', 400);
    if (error instanceof CatalogError) return fail(error.code, error.status);
    return fail('upstream', 502);
  }
}
export default { fetch: handle };
