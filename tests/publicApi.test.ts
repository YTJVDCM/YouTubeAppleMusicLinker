import { it, expect, vi, afterEach } from 'vitest';
import { PublicApi } from '../src/services/publicApi';
afterEach(() => vi.useRealTimers());
it('calls browser fetch with the global receiver rather than the PublicApi instance', async () => {
  const fetcher = vi.fn(async function (this: typeof globalThis, _url: string | URL | Request, _init?: RequestInit) {
    if (this !== globalThis) throw new TypeError('Illegal invocation');
    return Response.json({ results: [] });
  });
  expect(await new PublicApi('https://itunes.apple.com', 0, fetcher).get(new URL('https://itunes.apple.com/search'))).toEqual({ results: [] });
});
it('preserves HTTP failure status without logging a query or response body', async () => {
  const fetcher = vi.fn(async () => new Response('blocked', { status: 403 }));
  await expect(new PublicApi('https://itunes.apple.com', 0, fetcher).get(new URL('https://itunes.apple.com/search')))
    .rejects.toMatchObject({ code: 'upstream', httpStatus: 403 });
});
it('serializes all calls and spaces requests including album lookups', async () => {
  vi.useFakeTimers();
  const fetcher = vi.fn(async () => Response.json({ results: [] }));
  const client = new PublicApi('https://itunes.apple.com', 3500, fetcher);
  const a = client.get(new URL('https://itunes.apple.com/search?term=x'));
  const b = client.get(new URL('https://itunes.apple.com/lookup?id=1'));
  await vi.advanceTimersByTimeAsync(0); expect(fetcher).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(3499); expect(fetcher).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1); await Promise.all([a, b]); expect(fetcher).toHaveBeenCalledTimes(2);
});
it('classifies timeouts and never includes cookies or follows redirects', async () => {
  vi.useFakeTimers();
  const fetcher = vi.fn((_url: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
  }));
  const task = new PublicApi('https://itunes.apple.com', 3500, fetcher).get(new URL('https://itunes.apple.com/search'));
  const assertion = expect(task).rejects.toMatchObject({ code: 'timeout' });
  await vi.advanceTimersByTimeAsync(8000); await assertion;
  expect(fetcher.mock.calls[0][1]).toMatchObject({ credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer' });
});
it('honors rate limits without an unbounded retry loop', async () => {
  const fetcher = vi.fn(async () => new Response('', { status: 429, headers: { 'Retry-After': '60' } }));
  const api = new PublicApi('https://itunes.apple.com', 3500, fetcher);
  await expect(api.get(new URL('https://itunes.apple.com/search')))
    .rejects.toMatchObject({ code: 'rate-limited', retryAfterSeconds: 60 });
  await expect(api.get(new URL('https://itunes.apple.com/search'))).rejects.toMatchObject({ code: 'rate-limited' });
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it('rejects unexpected origins and malformed JSON', async () => {
  const fetcher = vi.fn(async () => new Response('bad json'));
  const api = new PublicApi('https://itunes.apple.com', 0, fetcher);
  await expect(api.get(new URL('https://evil.test/search'))).rejects.toMatchObject({ code: 'invalid-request' });
  expect(fetcher).not.toHaveBeenCalled();
  await expect(api.get(new URL('https://itunes.apple.com/search'))).rejects.toMatchObject({ code: 'invalid-response' });
});
it('retries a transient 5xx only after the provider spacing and then returns JSON', async () => {
  vi.useFakeTimers();
  const fetcher = vi.fn().mockResolvedValueOnce(new Response('', { status: 502 })).mockResolvedValueOnce(Response.json({ results: [] }));
  const task = new PublicApi('https://itunes.apple.com', 3500, fetcher).get(new URL('https://itunes.apple.com/search'));
  await vi.advanceTimersByTimeAsync(0); expect(fetcher).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(3500); expect(await task).toEqual({ results: [] });
  expect(fetcher).toHaveBeenCalledTimes(2);
});
