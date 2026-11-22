import type { ApiResponse, MatchReply, PublicMetadata, Candidate, ContentMessage } from '../shared/contracts';
import { youtubeVideoId, appleMusicUrl } from '../shared/urls';

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
  panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'Apple Musicの候補');
  shadow.append(button, panel); document.documentElement.append(host);
  let videoId: string | undefined, generation = 0, loading = false;
  const text = (tag: string, value: string, parent = panel) => { const el = document.createElement(tag); el.textContent = value; parent.append(el); return el; };
  const action = (label: string, callback: () => void, parent = panel) => {
    const el = document.createElement('button'); el.textContent = label; el.addEventListener('click', e => { if (e.isTrusted) callback(); }); parent.append(el); return el;
  };
  const close = () => { panel.hidden = true; button.focus(); };
  const header = () => { panel.replaceChildren(); action('閉じる', close); text('h2', 'Apple Music'); };
  const sync = () => {
    // YouTube or a page extension may replace/remove the host after injection.
    if (!host.isConnected) document.documentElement.append(host);
    const current = youtubeVideoId(location.href);
    if (current !== videoId) { videoId = current; generation++; loading = false; panel.hidden = true; panel.replaceChildren(); }
    button.hidden = !current;
  };
  const send = async (message: ContentMessage) => {
    try {
      const response = await browser.runtime.sendMessage(message) as ApiResponse<unknown>;
      if (!response?.ok) text('p', response?.error?.message ?? '操作に失敗しました。');
    } catch { text('p', '操作に失敗しました。再試行してください。'); }
  };
  const renderCandidate = (candidate: Candidate, id: string, selected?: { id: string; kind: string }) => {
    const article = document.createElement('article'); panel.append(article);
    text('h3', `${candidate.title} — ${candidate.artist}`, article);
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
      action('アルバムを開く', () => void send({ type: 'open', videoId: id, candidateId: candidate.id, kind: candidate.kind, target: 'album' }), article);
    }
  };
  async function search(refresh = false) {
    sync(); if (!videoId || loading) return;
    const id = videoId, ticket = ++generation; loading = true; panel.hidden = false;
    header(); text('p', '検索しています…'); panel.querySelector('button')?.focus();
    const metadata = extract();
    try {
      const requestId = crypto.randomUUID();
      const response = await browser.runtime.sendMessage({ type: 'match', videoId: id, requestId, metadata, refresh }) as ApiResponse<MatchReply>;
      if (ticket !== generation || youtubeVideoId(location.href) !== id) return;
      header();
      if (!response?.ok) text('p', response?.error?.message ?? '検索に失敗しました。');
      else if (response.value.videoId === id && response.value.requestId === requestId) {
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
  button.addEventListener('click', e => { if (e.isTrusted) void search(); });
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
function extract(): PublicMetadata {
  const title = document.querySelector('h1.ytd-watch-metadata')?.textContent?.trim() || document.title.replace(/ - YouTube$/, '');
  const channel = document.querySelector('#owner #channel-name a')?.textContent?.trim() ?? '';
  const duration = document.querySelector('video')?.duration;
  const links = [...document.querySelectorAll<HTMLAnchorElement>('#description a[href]')]
    .map(a => a.href).filter(u => !!appleMusicUrl(u)).slice(0, 5);
  return { title: title.slice(0, 500), channel: channel.slice(0, 300),
    durationSeconds: duration && Number.isFinite(duration) ? duration : undefined, directAppleMusicUrls: links };
}
