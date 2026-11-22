import { youtubeVideoId } from '../shared/urls';
const status = document.getElementById('status')!;
const grant = document.getElementById('grant') as HTMLButtonElement;
const reload = document.getElementById('reload') as HTMLButtonElement;
let tabId: number | undefined, origin: string | undefined;
async function check() {
  grant.hidden = true; reload.hidden = true; tabId = undefined; origin = undefined;
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab?.id === undefined || !youtubeVideoId(tab.url ?? '')) {
      status.textContent = 'YouTubeの動画視聴ページ（watch?v=…）を開いてください。'; return;
    }
    tabId = tab.id; origin = `${new URL(tab.url!).origin}/*`;
    if (!await browser.permissions.contains({ origins: [origin] })) {
      status.textContent = 'YouTubeへのアクセス権限がありません。許可後に動画ページを再読み込みしてください。';
      grant.hidden = false; return;
    }
    try {
      const response = await browser.tabs.sendMessage(tab.id, { type: 'ui-status' }, { frameId: 0 });
      status.textContent = response?.mounted && response.watchPage && !response.buttonHidden ?
        'ボタンはページ右下に配置されています。見えない場合はページの再読み込みや、他の拡張機能の表示制御を確認してください。' :
        'ページの表示準備ができていません。動画ページを再読み込みしてください。';
    } catch {
      status.textContent = 'ページ内のアドオンが応答しません。アドオンの読み込み・更新後は、動画ページを再読み込みしてください。';
    }
    reload.hidden = false;
  } catch { status.textContent = '状態を確認できません。about:debuggingのアドオン用「調査」画面を確認してください。'; }
}
document.getElementById('check')!.addEventListener('click', () => void check());
grant.addEventListener('click', () => {
  if (!origin) return;
  void browser.permissions.request({ origins: [origin] }).then(granted => {
    if (granted) { status.textContent = '許可しました。動画ページを再読み込みしてください。'; reload.hidden = false; grant.hidden = true; }
    else status.textContent = 'アクセス権限が許可されませんでした。';
  }).catch(() => { status.textContent = 'アクセス権限を変更できませんでした。'; });
});
reload.addEventListener('click', () => {
  if (tabId === undefined) return;
  void browser.tabs.reload(tabId).then(() => window.close()).catch(() => { status.textContent = 'ページを再読み込みできませんでした。'; });
});
document.getElementById('options')!.addEventListener('click', () => void browser.runtime.openOptionsPage());
void check();
