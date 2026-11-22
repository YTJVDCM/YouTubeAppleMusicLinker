export interface Settings {
  useMusicBrainz: boolean;
  musicBrainzContact: string;
  storefront: string;
  reuseTabs: boolean;
  protectAudible: boolean;
  reusePinned: boolean;
  reuseOtherWindows: boolean;
}
export const DEFAULT_SETTINGS: Settings = {
  useMusicBrainz: true, musicBrainzContact: '', storefront: 'jp', reuseTabs: true, protectAudible: true,
  reusePinned: false, reuseOtherWindows: true,
};
export function readSettings(value: unknown): Settings {
  const result = { ...DEFAULT_SETTINGS };
  if (!value || typeof value !== 'object') return result;
  const input = value as Record<string, unknown>;
  if (typeof input.storefront === 'string' && /^[a-z]{2}$/.test(input.storefront)) {
    result.storefront = input.storefront;
  }
  if (typeof input.musicBrainzContact === 'string' && validContact(input.musicBrainzContact.trim())) {
    result.musicBrainzContact = input.musicBrainzContact.trim();
  }
  for (const key of ['useMusicBrainz', 'reuseTabs', 'protectAudible', 'reusePinned', 'reuseOtherWindows'] as const) {
    if (typeof input[key] === 'boolean') result[key] = input[key];
  }
  return result;
}
export function validContact(value: string): boolean {
  if (value.length > 250 || /[\r\n()]/.test(value)) return false;
  if (/^[A-Za-z0-9.!#$%&'*+\-/=?^_`{|}~]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(value)) return true;
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password; } catch { return false; }
}
