import type { ApiResponse, Candidate, MatchResult, PublicMetadata } from '../shared/contracts';
import type { Settings } from '../shared/settings';
import { parseTitle } from '../matching/normalize';
import { rank, similarity } from '../matching/score';
import { ITunes } from './itunes';
import { MusicBrainz } from './musicBrainz';
import { PublicApiError } from './publicApi';

export async function catalogMatch(metadata: PublicMetadata, settings: Settings): Promise<ApiResponse<MatchResult>> {
  try {
    if (!await browser.permissions.contains({ origins: ['https://itunes.apple.com/*'] })) {
      return { ok: false, error: { code: 'permission-denied', message: '設定画面からiTunesへの接続を許可してください。' } };
    }
    const itunes = new ITunes(settings.storefront);
    const parsed = parseTitle(metadata.title, metadata.channel);
    const credit = metadata.credits?.length === 1 ? metadata.credits[0] : undefined;
    const term = `${credit?.artist ?? parsed.artist} ${credit?.title ?? parsed.title}`.trim();
    const album = credit?.album ?? metadata.album;
    let candidates: Candidate[] = [];
    const notices: string[] = [];
    for (const url of metadata.directAppleMusicUrls ?? []) {
      try {
        const direct = await itunes.direct(url); candidates.push(...direct);
        if (direct.length) break;
      } catch { notices.push('直接リンクの照合に失敗したため、曲名から検索します。'); }
    }
    const addSearch = async (query: string) => {
      candidates.push(...await itunes.search(query));
      if (parsed.isMv) {
        try { candidates.push(...await itunes.search(query, true)); }
        catch { notices.push('MV検索を完了できませんでした。取得済みの楽曲候補を表示します。'); }
      }
    };
    if (!candidates.length) await addSearch(term);
    let artistNames: string[] = [];
    let result = rank(metadata, unique(candidates));
    if (album && !result.candidates.some(c => similarity(album, c.album?.title ?? '') >= .8)) {
      try { candidates.push(...await itunes.search(`${term} ${album}`)); }
      catch { notices.push('アルバム名による補完検索を完了できませんでした。'); }
      result = rank(metadata, unique(candidates));
    }
    if (settings.useMusicBrainz && (!result.candidates.length || result.candidates[0].score < .7)) {
      if (!settings.musicBrainzContact) notices.push('MusicBrainz補助は、設定画面でアプリの公開URLまたは連絡先を登録すると利用できます。');
      else if (!await browser.permissions.contains({ origins: ['https://musicbrainz.org/*'] })) {
        notices.push('MusicBrainzへの接続権限がありません。設定画面で許可できます。');
      } else {
        try {
          const hint = await new MusicBrainz(settings.musicBrainzContact).resolve(metadata);
          if (hint) {
            const supplemental = await itunes.search(`${hint.artist} ${hint.title}`);
            candidates.push(...supplemental.map(c => ({ ...c, method: 'musicbrainz-assisted' as const,
              reasons: ['MusicBrainzの録音・アーティスト表記を補助照合に使用'] })));
            artistNames = hint.artistNames;
          }
        } catch { notices.push('MusicBrainz補助を完了できませんでした。iTunesの検索結果を表示します。'); }
      }
      result = rank(metadata, unique(candidates), artistNames);
    }
    return { ok: true, value: { ...result, candidates: result.candidates.slice(0, 5), notices } };
  } catch (error) {
    const code = error instanceof PublicApiError ? error.code : 'network';
    const httpStatus = error instanceof PublicApiError ? error.httpStatus : undefined;
    const messages = {
      'rate-limited': '検索回数の上限に達しました。時間をおいて再試行してください。',
      timeout: 'iTunes検索がタイムアウトしました。再試行できます。',
      network: 'iTunesとの通信に失敗しました。接続とアドオンの権限を確認してください。',
      'invalid-response': 'iTunesからの応答を読み取れませんでした。再試行できます。',
    };
    const message = code in messages ? messages[code as keyof typeof messages] : 'iTunes検索に失敗しました。再試行できます。';
    return { ok: false, error: { code, message: `${message}（${code}${httpStatus ? ` / HTTP ${httpStatus}` : ''}）`, httpStatus,
      retryAfterSeconds: error instanceof PublicApiError ? error.retryAfterSeconds : undefined } };
  }
}
function unique(candidates: Candidate[]): Candidate[] {
  return [...new Map(candidates.map(c => [`${c.provider}:${c.kind}:${c.id}`, c])).values()];
}
