import type { MatchCandidate, Track } from './types.js';

const FEATURE_TOKENS = /\b(feat(?:uring)?|ft)\.?\s+[^([\]]+/gi;
const NOISE = /\b(remaster(?:ed)?|deluxe|expanded|anniversary|bonus track|radio edit|mono|stereo|explicit|clean)\b/gi;

export function normalizeText(value = ''): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(FEATURE_TOKENS, ' ')
    .replace(NOISE, ' ')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function tokens(value: string): Set<string> {
  return new Set(normalizeText(value).split(' ').filter(Boolean));
}

function similarity(a: string, b: string): number {
  const left = tokens(a);
  const right = tokens(b);
  if (!left.size && !right.size) return 1;
  const common = [...left].filter((value) => right.has(value)).length;
  return common / Math.max(left.size, right.size);
}

export function scoreMatch(source: Track, candidate: Track): MatchCandidate {
  const sourceIsrc = source.isrc?.replace(/[^a-z0-9]/gi, '').toUpperCase();
  const candidateIsrc = candidate.isrc?.replace(/[^a-z0-9]/gi, '').toUpperCase();
  if (sourceIsrc && candidateIsrc && sourceIsrc === candidateIsrc) {
    return { track: candidate, score: 1, reasons: ['Exact ISRC'] };
  }

  const title = similarity(source.title, candidate.title);
  const artist = similarity(source.artists.join(' '), candidate.artists.join(' '));
  const album = source.album && candidate.album ? similarity(source.album, candidate.album) : 0.5;
  const durationDelta = Math.abs(source.durationMs - candidate.durationMs);
  const duration = Math.max(0, 1 - durationDelta / 15_000);
  const score = title * 0.46 + artist * 0.34 + album * 0.1 + duration * 0.1;
  const reasons = [
    `Title ${Math.round(title * 100)}%`,
    `Artist ${Math.round(artist * 100)}%`,
    `Duration ${Math.round(durationDelta / 1000)}s apart`,
  ];
  return { track: candidate, score: Math.round(score * 1000) / 1000, reasons };
}

export function rankMatches(source: Track, candidates: Track[]): MatchCandidate[] {
  return candidates.map((candidate) => scoreMatch(source, candidate)).sort((a, b) => b.score - a.score);
}

export function confidenceFor(candidates: MatchCandidate[]): 'exact' | 'high' | 'review' | 'missing' {
  const best = candidates[0];
  if (!best || best.score < 0.58) return 'missing';
  if (best.score === 1 && best.reasons.includes('Exact ISRC')) return 'exact';
  const margin = best.score - (candidates[1]?.score ?? 0);
  return best.score >= 0.86 && margin >= 0.08 ? 'high' : 'review';
}
