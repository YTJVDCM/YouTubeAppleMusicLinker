export interface Settings {
  endpoint: string;
  storefront: string;
  reuseTabs: boolean;
  protectAudible: boolean;
  reusePinned: boolean;
  reuseOtherWindows: boolean;
}
export const DEFAULT_SETTINGS: Settings = {
  endpoint: '', storefront: 'jp', reuseTabs: true, protectAudible: true,
  reusePinned: false, reuseOtherWindows: true,
};
export function readSettings(value: unknown): Settings {
  const result = { ...DEFAULT_SETTINGS };
  if (!value || typeof value !== 'object') return result;
  const input = value as Record<string, unknown>;
  if (typeof input.storefront === 'string' && /^[a-z]{2}$/.test(input.storefront)) {
    result.storefront = input.storefront;
  }
  if (typeof input.endpoint === 'string') {
    try {
      const url = new URL(input.endpoint);
      if (url.protocol === 'https:' && !url.username && !url.password && !url.hash && !url.search) {
        result.endpoint = url.href;
      }
    } catch { /* Unconfigured endpoint is a normal initial state. */ }
  }
  for (const key of ['reuseTabs', 'protectAudible', 'reusePinned', 'reuseOtherWindows'] as const) {
    if (typeof input[key] === 'boolean') result[key] = input[key];
  }
  return result;
}
