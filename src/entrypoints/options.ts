import { readSettings, type Settings } from '../shared/settings';
const status = document.getElementById('status')!;
const fields = ['endpoint', 'storefront', 'reuseTabs', 'protectAudible', 'reusePinned', 'reuseOtherWindows'] as const;
void browser.storage.local.get('settings').then(data => {
  const settings = readSettings(data.settings);
  for (const key of fields) {
    const field = document.getElementById(key) as HTMLInputElement;
    if (typeof settings[key] === 'boolean') field.checked = settings[key] as boolean;
    else field.value = settings[key] as string;
  }
});
document.getElementById('settings')!.addEventListener('submit', e => {
  e.preventDefault();
  const input: Record<string, unknown> = {};
  for (const key of fields) { const el = document.getElementById(key) as HTMLInputElement; input[key] = el.type === 'checkbox' ? el.checked : el.value.trim(); }
  const settings: Settings = readSettings(input);
  if (!settings.endpoint) { status.textContent = '資格情報を含まないHTTPS URLを入力してください。'; return; }
  // request() runs directly within the user's submit gesture.
  void browser.permissions.request({ origins: [`${new URL(settings.endpoint).origin}/*`] }).then(async granted => {
    if (!granted) { status.textContent = '接続権限が許可されませんでした。'; return; }
    await browser.storage.local.set({ settings }); status.textContent = '保存しました。';
  }).catch(() => { status.textContent = '設定を保存できませんでした。'; });
});
document.getElementById('clear')!.addEventListener('click', () => {
  void browser.storage.local.get(null).then(async data => {
    await browser.storage.local.remove(Object.keys(data).filter(k => k.startsWith('match:')));
    status.textContent = '照合キャッシュを削除しました。';
  });
});
