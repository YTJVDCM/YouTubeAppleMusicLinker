import type { Candidate, PublicMetadata } from '../shared/contracts';
import { normalize, parseTitle, versions } from './normalize';

export function similarity(a: string, b: string): number {
  a = normalize(a); b = normalize(b);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const grams = (s: string) => new Set(Array.from(s).slice(1).map((_, i) => s.slice(i, i + 2)));
  const x = grams(a), y = grams(b);
  return x.size + y.size ? 2 * [...x].filter(v => y.has(v)).length / (x.size + y.size) : 0;
}
export function rank(metadata: PublicMetadata, candidates: Candidate[]) {
  const parsed = parseTitle(metadata.title, metadata.channel);
  const credit = metadata.credits?.length === 1 ? metadata.credits[0] : undefined;
  const title = credit?.title ?? parsed.title;
  const artist = credit?.artist ?? parsed.artist;
  const ranked = candidates.map(candidate => {
    const sourceVersions = versions(title), targetVersions = versions(candidate.title);
    const conflict = sourceVersions.some(v => !targetVersions.includes(v)) ||
      targetVersions.some(v => !sourceVersions.includes(v));
    const delta = metadata.durationSeconds && candidate.durationSeconds ?
      Math.abs(metadata.durationSeconds - candidate.durationSeconds) : undefined;
    const duration = delta === undefined ? 0 : Math.max(0, 1 - delta / (parsed.isMv ? 60 : 15));
    let score = .35 * similarity(artist, candidate.artist) + .35 * similarity(title, candidate.title) +
      .15 * duration + .15 * (conflict ? 0 : 1);
    if (conflict) score = Math.min(score, .49);
    if (metadata.credits && metadata.credits.length > 1) score = Math.min(score, .69);
    return { ...candidate, score, confidence: (score >= .9 ? 'high' : score >= .7 ? 'review' : 'low') as Candidate['confidence'],
      reasons: [conflict ? 'バージョンに相違があります' : '曲名・アーティスト・版情報を比較',
        ...(delta === undefined ? ['再生時間は照合できません'] : [])] };
  }).sort((a, b) => b.score - a.score);
  const ambiguous = ranked.length > 1 && ranked[0].score - ranked[1].score < .05;
  if (ambiguous) for (const c of ranked) if (c.confidence === 'high') c.confidence = 'review';
  return { candidates: ranked, ambiguous };
}
