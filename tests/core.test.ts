import { describe, it, expect } from 'vitest';
import { normalize, versions, parseTitle } from '../src/matching/normalize';
import { rank } from '../src/matching/score';
import { appleMusicUrl, youtubeVideoId } from '../src/shared/urls';
import { chooseTab } from '../src/services/tabNavigation';
import { DEFAULT_SETTINGS } from '../src/shared/settings';
import { usable } from '../src/services/cache';
import { metadataValid } from '../src/shared/validation';
import type { Candidate, CacheEntry } from '../src/shared/contracts';
const song: Candidate = { provider: 'itunes', id: '1', kind: 'song', title: 'Song', artist: 'Artist', url: 'https://music.apple.com/jp/song/1',
  durationSeconds: 200, score: 0, confidence: 'low', reasons: [], method: 'metadata', audioUnconfirmed: false };
describe('matching safety', () => {
  it('removes decoration but preserves meaningful versions', () => {
    expect(normalize('Ａｒｔｉｓｔ — Song (Official Music Video)')).toBe('artist song');
    expect(versions('Song (Live Remix Acoustic Cover Remastered Instrumental)')).toHaveLength(6);
    expect(parseTitle('Artist - Song (Official MV)', 'Uploader').title).toBe('song');
  });
  it('ranks exact audio high but demotes version conflicts and close releases', () => {
    const metadata = { title: 'Artist - Song', channel: 'Uploader', durationSeconds: 200 };
    expect(rank(metadata, [song]).candidates[0].confidence).toBe('high');
    expect(rank({ ...metadata, title: 'Artist - Song Live' }, [song]).candidates[0].score).toBeLessThan(.7);
    const tied = rank(metadata, [song, { ...song, id: '2' }]);
    expect(tied.ambiguous).toBe(true); expect(tied.candidates[0].confidence).toBe('review');
  });
  it('does not establish audio from an MV or a multi-track credit', () => {
    const mv = { ...song, kind: 'music-video' as const, audioUnconfirmed: true };
    expect(rank({ title: 'Artist - Song Official Music Video', channel: '', durationSeconds: 220 }, [mv]).candidates[0].audioUnconfirmed).toBe(true);
    expect(rank({ title: 'Artist - Song', channel: '', credits: [{ title: 'Song', artist: 'Artist' }, { title: 'Other', artist: 'Artist' }] }, [song]).candidates[0].score).toBeLessThan(.7);
  });
});
describe('untrusted inputs', () => {
  it.each(['http://music.apple.com/a', 'https://music.apple.com.evil/a', 'https://evil.music.apple.com/a',
    'javascript:alert(1)', 'https://user@music.apple.com/a', 'https://music.apple.com:444/a'])('rejects %s', url => expect(appleMusicUrl(url)).toBeUndefined());
  it('recognizes only watch pages and validates bounded metadata', () => {
    expect(youtubeVideoId('https://www.youtube.com/watch?v=abcdefghijk')).toBe('abcdefghijk');
    expect(youtubeVideoId('https://www.youtube.com/shorts/abcdefghijk')).toBeUndefined();
    expect(metadataValid({ title: 'Song', channel: '', durationSeconds: Infinity })).toBe(false);
  });
});
describe('tab isolation and cache expiry', () => {
  const source = { id: 1, windowId: 1, incognito: false, cookieStoreId: 'firefox-container-1' } as browser.tabs.Tab;
  const base = { id: 2, windowId: 1, incognito: false, cookieStoreId: source.cookieStoreId, url: song.url, lastAccessed: 1 } as browser.tabs.Tab;
  it('excludes private, other-container, pinned and audible tabs', () => {
    for (const change of [{ incognito: true }, { cookieStoreId: 'firefox-default' }, { pinned: true }, { audible: true }]) {
      expect(chooseTab([{ ...base, ...change }], source, DEFAULT_SETTINGS)).toBeUndefined();
    }
  });
  it('prefers current window then recent use and honors settings', () => {
    expect(chooseTab([{ ...base, id: 3, windowId: 2, lastAccessed: 500 }, base], source, DEFAULT_SETTINGS)?.id).toBe(2);
    expect(chooseTab([base, { ...base, id: 4, lastAccessed: 10 }], source, DEFAULT_SETTINGS)?.id).toBe(4);
    expect(chooseTab([{ ...base, pinned: true }], source, { ...DEFAULT_SETTINGS, reusePinned: true })?.id).toBe(2);
  });
  it('expires automated results and retains manual choices', () => {
    const entry = { version: 2, expiresAt: 100, manual: false } as CacheEntry;
    expect(usable(entry, 99)).toBe(true); expect(usable(entry, 100)).toBe(false);
    expect(usable({ ...entry, manual: true }, 1000)).toBe(true);
  });
});
