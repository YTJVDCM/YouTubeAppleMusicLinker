import { readSettings, validContact, type Settings } from '../shared/settings';
const status = document.getElementById('status')!;
const fields = ['storefront', 'useMusicBrainz', 'musicBrainzContact', 'reuseTabs', 'protectAudible', 'reusePinned', 'reuseOtherWindows'] as const;
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
  if (input.musicBrainzContact && !validContact(input.musicBrainzContact as string)) {
    status.textContent = '連絡先には公開HTTPS URLまたはメールアドレスを入力してください。'; return;
  }
  const origins = ['https://itunes.apple.com/*'];
  if (settings.useMusicBrainz && settings.musicBrainzContact) origins.push('https://musicbrainz.org/*');
  // request() runs directly within the user's submit gesture.
  void browser.permissions.request({ origins }).then(async granted => {
    if (!granted) { status.textContent = '接続権限が許可されませんでした。'; return; }
    await browser.storage.local.set({ settings }); status.textContent = settings.useMusicBrainz && !settings.musicBrainzContact ?
      '保存しました。iTunes検索を利用できます。MusicBrainz補助にはアプリの連絡先を登録してください。' : '保存しました。';
  }).catch(() => { status.textContent = '設定を保存できませんでした。'; });
});
document.getElementById('clear')!.addEventListener('click', () => {
  void browser.storage.local.get(null).then(async data => {
    await browser.storage.local.remove(Object.keys(data).filter(k => k.startsWith('match:')));
    status.textContent = '照合キャッシュを削除しました。';
  });
});
