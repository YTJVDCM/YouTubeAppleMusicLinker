import type { ErrorCode } from '../shared/contracts';
export class PublicApiError extends Error {
  constructor(public code: ErrorCode, public retryAfterSeconds?: number, public httpStatus?: number) { super(code); }
}
export type JsonClient = (url: URL, headers?: Record<string, string>) => Promise<unknown>;
/** One queue per provider, including retries and album lookups. No network before get(). */
export class PublicApi {
  private queue: Promise<unknown> = Promise.resolve();
  private nextAt = 0;
  private blockedUntil = 0;
  constructor(private origin: string, private spacingMs: number, private fetcher: typeof fetch = fetch) {}
  get: JsonClient = (url, headers = {}) => {
    if (url.origin !== this.origin || url.username || url.password) return Promise.reject(new PublicApiError('invalid-request'));
    const task = this.queue.catch(() => {}).then(async () => {
      if (Date.now() < this.blockedUntil) throw new PublicApiError('rate-limited', Math.ceil((this.blockedUntil - Date.now()) / 1000));
      for (let attempt = 0; attempt < 2; attempt++) {
        const delay = this.nextAt - Date.now();
        if (delay > 0) await new Promise(resolve => setTimeout(resolve, delay));
        this.nextAt = Date.now() + this.spacingMs;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8000);
        try {
          const response = await this.fetcher.call(globalThis, url.href, { signal: controller.signal, credentials: 'omit',
            redirect: 'error', referrerPolicy: 'no-referrer', headers: { Accept: 'application/json', ...headers } });
          if (response.status === 429 || response.status === 503 || response.status >= 500) {
            const retryValue = response.headers.get('Retry-After');
            const seconds = retryValue && /^\d+$/.test(retryValue) ? Number(retryValue) :
              retryValue ? Math.ceil((Date.parse(retryValue) - Date.now()) / 1000) : undefined;
            await response.body?.cancel();
            if (seconds && Number.isFinite(seconds) && seconds > 4) this.blockedUntil = Date.now() + Math.min(seconds, 3600) * 1000;
            if (attempt === 0 && (!seconds || seconds <= 4)) {
              this.nextAt = Math.max(this.nextAt, Date.now() + Math.max(this.spacingMs, (seconds ?? 0) * 1000));
              continue;
            }
            throw new PublicApiError(response.status === 429 ? 'rate-limited' : 'upstream', Number.isFinite(seconds) ? seconds : undefined, response.status);
          }
          if (!response.ok) { await response.body?.cancel(); throw new PublicApiError('upstream', undefined, response.status); }
          // Bound untrusted public responses as well as the request count.
          const reader = response.body?.getReader();
          if (!reader) throw new PublicApiError('invalid-response');
          let bytes = 0, text = ''; const decoder = new TextDecoder();
          while (true) {
            const part = await reader.read(); if (part.done) break;
            bytes += part.value.byteLength;
            if (bytes > 1000000) { await reader.cancel(); throw new PublicApiError('invalid-response'); }
            text += decoder.decode(part.value, { stream: true });
          }
          try { return JSON.parse(text + decoder.decode()); } catch { throw new PublicApiError('invalid-response'); }
        } catch (error) {
          if (error instanceof PublicApiError) throw error;
          throw new PublicApiError(controller.signal.aborted ? 'timeout' : 'network');
        } finally { clearTimeout(timer); }
      }
      throw new PublicApiError('upstream');
    });
    this.queue = task;
    return task;
  };
}
export function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
