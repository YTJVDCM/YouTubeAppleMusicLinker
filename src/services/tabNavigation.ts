import { appleMusicUrl, youtubeVideoId } from '../shared/urls';
import type { Settings } from '../shared/settings';

export function chooseTab(tabs: browser.tabs.Tab[], source: browser.tabs.Tab, settings: Settings) {
  return tabs.filter(tab => tab.id !== undefined && appleMusicUrl(tab.url) &&
    tab.incognito === source.incognito && tab.cookieStoreId === source.cookieStoreId &&
    (!tab.pinned || settings.reusePinned) && (!tab.audible || !settings.protectAudible) &&
    (settings.reuseOtherWindows || tab.windowId === source.windowId))
    .sort((a, b) => Number(b.windowId === source.windowId) - Number(a.windowId === source.windowId) ||
      (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0))[0];
}
let navigation = Promise.resolve();
export function openAppleMusic(value: string, source: browser.tabs.Tab, settings: Settings): Promise<void> {
  const url = appleMusicUrl(value);
  if (!url || source.id === undefined) return Promise.reject(new Error('Invalid destination'));
  const task = navigation.catch(() => {}).then(async () => {
    // Refresh source context rather than trusting an obsolete sender snapshot.
    const current = await browser.tabs.get(source.id!);
    if (source.url && youtubeVideoId(source.url) !== youtubeVideoId(current.url ?? '')) throw new Error('Source changed');
    const tabs = settings.reuseTabs ? await browser.tabs.query({ url: ['https://music.apple.com/*'] }) : [];
    const target = chooseTab(tabs, current, settings);
    if (target?.id !== undefined) {
      const fresh = await browser.tabs.get(target.id);
      if (chooseTab([fresh], current, settings)) {
        await browser.tabs.update(target.id, { url: url.href, active: true });
        if (target.windowId !== undefined && target.windowId !== current.windowId) await browser.windows.update(target.windowId, { focused: true });
        return;
      }
    }
    await browser.tabs.create({ url: url.href, active: true, windowId: current.windowId,
      cookieStoreId: current.cookieStoreId });
  });
  navigation = task;
  return task;
}
