export const VERSION_TERMS = ['live', 'remix', 'acoustic', 'instrumental', 'cover', 'remastered'] as const;
export function normalize(value: string): string {
  return value.normalize('NFKC').toLowerCase()
    .replace(/official\s*(music\s*)?(video|audio)|official\s*mv|\bhd\b|\b4k\b/gi, ' ')
    .replace(/[\p{P}\p{S}]/gu, ' ').replace(/\s+/g, ' ').trim();
}
export function versions(value: string): string[] {
  const text = normalize(value);
  return VERSION_TERMS.filter(term => new RegExp(`\\b${term}\\b`, 'i').test(text));
}
export function parseTitle(title: string, channel: string): { title: string; artist: string; isMv: boolean } {
  const pieces = title.normalize('NFKC').split(/\s+[-–—]\s+/);
  return {
    artist: normalize(pieces.length > 1 ? pieces.shift()! : channel.replace(/\s*-\s*Topic$/i, '')),
    title: normalize(pieces.join(' - ')),
    isMv: /\b(mv|music\s*video)\b/i.test(title),
  };
}
