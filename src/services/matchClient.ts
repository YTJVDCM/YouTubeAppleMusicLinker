import type { ApiResponse, MatchRequest, MatchResult } from '../shared/contracts';
import { appleMusicUrl } from '../shared/urls';

export function validResult(value: unknown): value is MatchResult {
  if (!value || typeof value !== 'object') return false;
  const result = value as MatchResult;
  return typeof result.ambiguous === 'boolean' && Array.isArray(result.candidates) && result.candidates.length <= 25 &&
    (result.notices === undefined || (Array.isArray(result.notices) && result.notices.every(n => typeof n === 'string'))) &&
    result.candidates.every(c => c && ['itunes', 'apple-music'].includes(c.provider) && typeof c.id === 'string' && /^(song|music-video)$/.test(c.kind) &&
      typeof c.title === 'string' && typeof c.artist === 'string' && !!appleMusicUrl(c.url) &&
      Number.isFinite(c.score) && c.score >= 0 && c.score <= 1 &&
      ['high', 'review', 'low'].includes(c.confidence) && Array.isArray(c.reasons) &&
      c.reasons.every(r => typeof r === 'string') && typeof c.audioUnconfirmed === 'boolean' &&
      (!c.album || (typeof c.album.title === 'string' && !!appleMusicUrl(c.album.url) &&
        Array.isArray(c.album.tracks) && c.album.tracks.every(t => typeof t.title === 'string'))));
}
export async function matchClient(endpoint: string, request: MatchRequest): Promise<ApiResponse<MatchResult>> {
  if (!endpoint) return { ok: false, error: { code: 'not-configured', message: '設定画面で照合サーバーを設定してください。' } };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(endpoint, { method: 'POST', credentials: 'omit', redirect: 'error',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request), signal: controller.signal });
    if (!response.ok) return { ok: false, error: { code: response.status === 429 ? 'rate-limited' : 'upstream',
      message: '照合サーバーを利用できません。時間をおいて再試行してください。' } };
    const data: unknown = await response.json();
    if (data && typeof data === 'object' && (data as ApiResponse<MatchResult>).ok === true &&
      validResult((data as { value: unknown }).value)) return data as ApiResponse<MatchResult>;
    return { ok: false, error: { code: 'invalid-response', message: '検索結果を確認できませんでした。' } };
  } catch {
    return { ok: false, error: { code: controller.signal.aborted ? 'timeout' : 'network', message: '通信に失敗しました。再試行できます。' } };
  } finally { clearTimeout(timeout); }
}
