export function appleMusicUrl(value: unknown): URL | undefined {
  if (typeof value !== 'string' || value.length > 2048) return;
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' && url.hostname === 'music.apple.com' &&
        !url.username && !url.password && !url.port) return url;
  } catch { /* Untrusted input is not a URL. */ }
}

export function youtubeVideoId(value: string): string | undefined {
  try {
    const url = new URL(value);
    const id = url.searchParams.get('v');
    if (url.protocol === 'https:' && ['www.youtube.com', 'youtube.com'].includes(url.hostname) &&
        url.pathname === '/watch' && id && /^[A-Za-z0-9_-]{11}$/.test(id)) return id;
  } catch { /* Ignore non-watch pages. */ }
}
