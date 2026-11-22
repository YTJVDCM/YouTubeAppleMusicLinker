import type { ApiResponse, ContentMessage, MatchReply, MatchResult } from '../shared/contracts';
import { readSettings } from '../shared/settings';
import { youtubeVideoId } from '../shared/urls';
import { metadataValid } from '../shared/validation';
import { cacheKey, getCached, putCached } from '../services/cache';
import { catalogMatch } from '../services/catalogMatch';
import { ITunes } from '../services/itunes';
import { openAppleMusic } from '../services/tabNavigation';

const pending = new Map<string, Promise<ApiResponse<MatchResult>>>();
const privateResults = new Map<string, MatchResult>();
browser.tabs.onRemoved.addListener(tabId => {
  for (const key of privateResults.keys()) if (key.startsWith(`${tabId}:`)) privateResults.delete(key);
});
browser.runtime.onMessage.addListener((raw: unknown, sender) => handle(raw, sender));
async function handle(raw: unknown, sender: browser.runtime.MessageSender): Promise<unknown> {
  const fail = (message: string) => ({ ok: false, error: { code: 'invalid-request', message } });
  if (!raw || typeof raw !== 'object' || !sender.tab || sender.frameId !== 0 ||
    sender.id !== browser.runtime.id) return fail('無効な操作です。');
  const message = raw as ContentMessage;
  if (!message.videoId || youtubeVideoId(sender.url ?? '') !== message.videoId ||
    youtubeVideoId(sender.tab.url ?? '') !== message.videoId) return fail('動画が切り替わりました。');
  try {
    const settings = readSettings((await browser.storage.local.get('settings')).settings);
    if (message.type === 'match') {
      if (!metadataValid(message.metadata) || typeof message.requestId !== 'string' || message.requestId.length > 100) return fail('動画情報が不足しています。');
      const cached = sender.tab.incognito ? undefined : await getCached(settings.storefront, message.videoId);
      if (cached && !message.refresh) return { ok: true, value: { videoId: message.videoId, requestId: message.requestId,
        result: cached.result, selected: cached.selected } satisfies MatchReply };
      // A refresh explicitly discards a previous manual mapping.
      if (message.refresh && !sender.tab.incognito) await browser.storage.local.remove(cacheKey(settings.storefront, message.videoId));
      const key = `${sender.tab.incognito}:${sender.tab.cookieStoreId}:${settings.storefront}:${message.videoId}`;
      let task = pending.get(key);
      if (!task) {
        task = catalogMatch(message.metadata, settings);
        pending.set(key, task);
        void task.finally(() => pending.delete(key));
      }
      const response = await task;
      if (!response.ok) return response;
      // Private sessions do not write watch mappings into persistent storage.
      if (!sender.tab.incognito) await putCached(settings.storefront, message.videoId, response.value);
      else {
        for (const key of privateResults.keys()) if (key.startsWith(`${sender.tab.id}:`)) privateResults.delete(key);
        privateResults.set(`${sender.tab.id}:${settings.storefront}:${message.videoId}`, response.value);
      }
      return { ok: true, value: { videoId: message.videoId, requestId: message.requestId, result: response.value } satisfies MatchReply };
    }
    if (message.type === 'search') {
      if (typeof message.term !== 'string' || message.term.length > 500) return fail('検索語が無効です。');
      await openAppleMusic(`https://music.apple.com/${settings.storefront}/search?term=${encodeURIComponent(message.term)}`, sender.tab, settings);
      return { ok: true, value: null };
    }
    if (message.type === 'select' || message.type === 'open' || message.type === 'album') {
      const cached = sender.tab.incognito ? undefined : await getCached(settings.storefront, message.videoId);
      const result = sender.tab.incognito ? privateResults.get(`${sender.tab.id}:${settings.storefront}:${message.videoId}`) : cached?.result;
      const candidate = result?.candidates.find(c => c.id === message.candidateId && c.kind === message.kind);
      if (!candidate) return fail('候補を再検索してください。');
      if (message.type === 'album') {
        if (!candidate.album) return fail('アルバムは取得できません。');
        const album = await new ITunes(settings.storefront).album(candidate.album.id);
        return album ? { ok: true, value: album } : fail('収録曲が見つかりませんでした。');
      }
      if (message.type === 'select') {
        if (!sender.tab.incognito) await putCached(settings.storefront, message.videoId, cached!.result,
          { id: candidate.id, kind: candidate.kind });
      } else {
        const destination = message.target === 'album' ? candidate.album?.url : candidate.url;
        if (!destination) return fail('アルバムは取得できません。');
        await openAppleMusic(destination, sender.tab, settings);
      }
      return { ok: true, value: null };
    }
    return fail('無効な操作です。');
  } catch { return { ok: false, error: { code: 'network', message: '操作に失敗しました。再試行してください。' } }; }
}
