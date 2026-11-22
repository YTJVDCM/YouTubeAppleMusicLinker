import type { ApiResponse, MatchReply, Candidate, ContentMessage, Album } from '../shared/contracts';
import { youtubeVideoId } from '../shared/urls';
import { extractMetadata } from '../youtube/metadata';

const HOST = 'yt-apple-music-linker';
if (!document.getElementById(HOST)) mount();
function mount() {
  const host = document.createElement('div'); host.id = HOST;
  const shadow = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = `:host{all:initial;font:14px system-ui;color:#202124}button{font:inherit;cursor:pointer;padding:8px 12px;border:1px solid #aaa;border-radius:8px;background:#fff;color:#222}button:focus-visible{outline:3px solid #2459cf}button:disabled{opacity:.6;cursor:wait}.launcher{position:fixed;right:16px;bottom:24px;z-index:2147483646;background:#c71940;color:white}.panel{position:fixed;right:16px;bottom:76px;z-index:2147483647;width:min(420px,calc(100vw - 32px));max-height:70vh;overflow:auto;background:white;border:1px solid #aaa;border-radius:12px;padding:16px;box-sizing:border-box;box-shadow:0 8px 32px #0005}h2{font-size:18px}article{border-top:1px solid #ddd;padding:12px 0}p{line-height:1.5;overflow-wrap:anywhere}img{width:80px;height:80px;object-fit:cover}button{margin:3px}ol{padding-left:24px}`;
  shadow.append(style);
  const button = document.createElement('button'); button.className = 'launcher'; button.textContent = 'Apple Music';
  const panel = document.createElement('section'); panel.className = 'panel'; panel.hidden = true;
  panel.id = 'apple-music-panel';
  button.setAttribute('aria-controls', panel.id); button.setAttribute('aria-haspopup', 'dialog');
  button.setAttribute('aria-expanded', 'false');
  panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'Apple Musicの候補');
  shadow.append(button, panel); document.documentElement.append(host);
  let videoId: string | undefined, generation = 0, loading = false;
  const text = (tag: string, value: string, parent = panel) => { const el = document.createElement(tag); el.textContent = value; parent.append(el); return el; };
  const action = (label: string, callback: () => void, parent = panel) => {
    const el = document.createElement('button'); el.textContent = label; el.addEventListener('click', e => { if (e.isTrusted) callback(); }); parent.append(el); return el;
  };
  const setOpen = (open: boolean) => { panel.hidden = !open; button.setAttribute('aria-expanded', String(open)); };
  const close = (restoreFocus = true) => { setOpen(false); if (restoreFocus) button.focus(); };
  const header = () => { panel.replaceChildren(); action('閉じる', close); text('h2', 'Apple Music'); };
  const sync = () => {
    // YouTube or a page extension may replace/remove the host after injection.
    if (!host.isConnected) document.documentElement.append(host);
    const current = youtubeVideoId(location.href);
    if (current !== videoId) { videoId = current; generation++; loading = false; setOpen(false); panel.replaceChildren(); }
    button.hidden = !current;
  };
  const send = async (message: ContentMessage) => {
    const ticket = generation;
    try {
      const response = await browser.runtime.sendMessage(message) as ApiResponse<unknown>;
      if (ticket !== generation || youtubeVideoId(location.href) !== message.videoId) return;
      if (!response?.ok) text('p', response?.error?.message ?? '操作に失敗しました。');
      else if (message.type === 'select') text('p', 'この候補を記憶しました。');
    } catch { if (ticket === generation && youtubeVideoId(location.href) === message.videoId) text('p', '操作に失敗しました。再試行してください。'); }
  };
  const renderCandidate = (candidate: Candidate, id: string, selected?: { id: string; kind: string }) => {
    const article = document.createElement('article'); panel.append(article);
    text('h3', `${candidate.title} — ${candidate.artist}`, article);
    text('p', candidate.provider === 'itunes' ? 'iTunesカタログで照合' : 'Apple Musicカタログで照合', article);
    if (selected?.id === candidate.id && selected.kind === candidate.kind) text('p', '記憶した選択', article);
    text('p', `${candidate.kind === 'song' ? '楽曲' : 'ミュージックビデオ'} / ${candidate.confidence === 'high' ? '高信頼候補' : '要確認'} / 一致スコア ${candidate.score.toFixed(2)}（正答確率ではありません）`, article);
    if (candidate.audioUnconfirmed) text('p', '対応音源は未確定です。', article);
    const imageUrl = candidate.artworkUrl ?? candidate.album?.artworkUrl;
    if (imageUrl) {
      try { const url = new URL(imageUrl); if (url.protocol === 'https:' && url.hostname.endsWith('.mzstatic.com')) {
        const img = document.createElement('img'); img.src = url.href; img.alt = 'ジャケット'; img.referrerPolicy = 'no-referrer';
        img.addEventListener('error', () => { img.replaceWith(document.createTextNode('ジャケットなし')); }); article.append(img);
      } } catch {}
    } else text('p', 'ジャケットなし', article);
    for (const reason of candidate.reasons) text('p', reason, article);
    action('この候補を記憶', () => void send({ type: 'select', videoId: id, candidateId: candidate.id, kind: candidate.kind }), article);
    action('Apple Musicで開く', () => void send({ type: 'open', videoId: id, candidateId: candidate.id, kind: candidate.kind, target: 'song' }), article);
    if (candidate.album) {
      text('h4', candidate.album.title, article); text('p', candidate.album.releaseDate ?? '発売日不明', article);
      const list = document.createElement('ol'); article.append(list);
      for (const track of candidate.album.tracks) text('li', track.title, list);
      if (!candidate.album.tracks.length && candidate.provider === 'itunes') {
        const load = action('収録曲を表示', () => {
          const ticket = generation; load.disabled = true; load.textContent = '収録曲を取得しています…';
          void browser.runtime.sendMessage({ type: 'album', videoId: id, candidateId: candidate.id, kind: candidate.kind }).then((response: ApiResponse<Album>) => {
            if (ticket !== generation || youtubeVideoId(location.href) !== id || !article.isConnected) return;
            if (!response.ok) throw new Error(response.error.message);
            list.replaceChildren();
            for (const track of response.value.tracks) text('li', track.title, list);
            text('p', '収録曲一覧はAPIが返す範囲で表示します。', article);
            load.textContent = '収録曲を取得しました';
          }).catch(() => {
            if (ticket !== generation || youtubeVideoId(location.href) !== id || !article.isConnected) return;
            load.disabled = false; load.textContent = '収録曲を再取得'; text('p', '収録曲の取得に失敗しました。再試行できます。', article);
          });
        }, article);
      }
      action('アルバムを開く', () => void send({ type: 'open', videoId: id, candidateId: candidate.id, kind: candidate.kind, target: 'album' }), article);
    }
  };
  async function search(refresh = false) {
    sync(); if (!videoId || loading) return;
    const id = videoId, ticket = ++generation; loading = true; setOpen(true);
    header(); text('p', 'iTunesで検索しています…'); panel.querySelector('button')?.focus();
    const metadata = extractMetadata(document, id);
    if (!metadata) {
      loading = false; header(); text('p', '動画情報を更新しています。少し待って再検索してください。');
      action('再検索', () => void search(refresh)); return;
    }
    try {
      const requestId = crypto.randomUUID();
      const response = await browser.runtime.sendMessage({ type: 'match', videoId: id, requestId, metadata, refresh }) as ApiResponse<MatchReply>;
      if (ticket !== generation || youtubeVideoId(location.href) !== id) return;
      header();
      if (!response?.ok) text('p', response?.error?.message ?? '検索に失敗しました。');
      else if (response.value.videoId === id && response.value.requestId === requestId) {
        text('p', 'Apple Musicで再生できない楽曲も含まれます。再生可否は移動先で確認してください。');
        for (const notice of response.value.result.notices ?? []) text('p', notice);
        if (!response.value.result.candidates.length) text('p', '候補が見つかりませんでした。');
        if (response.value.result.ambiguous) text('p', '複数の近い候補があります。曲・版・収録盤を確認して選択してください。');
        const candidates = [...response.value.result.candidates].sort((a, b) =>
          Number(b.id === response.value.selected?.id && b.kind === response.value.selected?.kind) -
          Number(a.id === response.value.selected?.id && a.kind === response.value.selected?.kind));
        for (const candidate of candidates) renderCandidate(candidate, id, response.value.selected);
      }
    } catch { if (ticket === generation) { header(); text('p', '通信に失敗しました。'); } }
    finally {
      if (ticket === generation) {
        loading = false;
        action('再検索（記憶した選択も解除）', () => void search(true));
        action('Apple Musicで手動検索', () => void send({ type: 'search', videoId: id, term: metadata.title }));
      }
    }
  }
  button.addEventListener('click', e => {
    if (!e.isTrusted) return;
    sync(); if (!videoId) return;
    if (!panel.hidden) { close(); return; }
    if (panel.childNodes.length) { setOpen(true); panel.querySelector('button')?.focus(); }
    else void search();
  });
  // Closed Shadow DOM retargets internal clicks to the host at document level.
  // Capture avoids depending on YouTube's bubbling handlers; never cancel its click.
  document.addEventListener('click', e => {
    if (e.isTrusted && !panel.hidden && !e.composedPath().includes(host)) close(false);
  }, true);
  shadow.addEventListener('keydown', e => { if ((e as KeyboardEvent).key === 'Escape') close(); });
  document.addEventListener('yt-navigate-finish', sync); window.addEventListener('popstate', sync);
  browser.runtime.onMessage.addListener((message: unknown, sender) => {
    if (sender.id !== browser.runtime.id || !message || typeof message !== 'object' ||
      (message as { type?: string }).type !== 'ui-status') return;
    sync();
    return Promise.resolve({ mounted: host.isConnected, watchPage: !!videoId, buttonHidden: button.hidden });
  });
  setInterval(sync, 1000); sync();
}
