import { describe, expect, it } from 'vitest';
import { confidenceFor, normalizeText, rankMatches, scoreMatch } from '../src/core/matching.js';
import type { Track } from '../src/core/types.js';

const track = (overrides: Partial<Track> = {}): Track => ({ id: 'a', service: 'spotify', title: 'Midnight City', artists: ['M83'], album: 'Hurry Up, We’re Dreaming', durationMs: 244_000, isrc: 'GB55H1100002', ...overrides });

describe('track matching', () => {
  it('normalizes accents, punctuation, feature credits, and edition noise', () => {
    expect(normalizeText('Beyoncé — Halo (Remastered) feat. Jay-Z')).toBe('beyonce halo');
  });
  it('always prioritizes an exact ISRC', () => {
    const result = scoreMatch(track(), track({ id: 'b', service: 'tidal', title: 'Completely different' }));
    expect(result.score).toBe(1);
    expect(result.reasons).toContain('Exact ISRC');
  });
  it('uses metadata and duration when ISRC is absent', () => {
    const good = track({ id: 'good', service: 'tidal', isrc: undefined, durationMs: 245_000 });
    const bad = track({ id: 'bad', service: 'tidal', isrc: undefined, title: 'Another Song', artists: ['Other'], durationMs: 180_000 });
    const ranked = rankMatches(track({ isrc: undefined }), [bad, good]);
    expect(ranked[0].track.id).toBe('good');
    expect(ranked[0].score).toBeGreaterThan(0.9);
  });
  it('requires review when the top candidates are ambiguous', () => {
    const candidates = rankMatches(track({ isrc: undefined }), [track({ id: 'one', service: 'tidal', isrc: undefined }), track({ id: 'two', service: 'tidal', isrc: undefined })]);
    expect(confidenceFor(candidates)).toBe('review');
  });
});
