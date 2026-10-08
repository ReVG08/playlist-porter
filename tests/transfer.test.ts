import { describe, expect, it, vi } from 'vitest';
import { buildTransferPlan, executeTransfer } from '../src/core/transfer.js';
import type { MusicService, Playlist, Track } from '../src/core/types.js';

const tracks: Track[] = [
  { id: 's1', service: 'spotify', title: 'One', artists: ['Artist'], album: 'A', durationMs: 100_000, isrc: 'ISRC1' },
  { id: 's2', service: 'spotify', title: 'Two', artists: ['Artist'], album: 'A', durationMs: 120_000, isrc: 'ISRC2' },
];
const sourcePlaylist: Playlist = { id: 'p1', service: 'spotify', name: 'Road trip', trackCount: 2, tracks };
const adapter = (service: 'spotify' | 'tidal'): MusicService => ({
  service,
  listPlaylists: vi.fn(),
  getPlaylist: vi.fn().mockResolvedValue(sourcePlaylist),
  searchTracks: vi.fn(async (source: Track): Promise<Track[]> => [{ ...source, id: `t-${source.id}`, service: 'tidal' }]),
  createPlaylist: vi.fn().mockResolvedValue({ id: 'new', service, name: 'Road trip', trackCount: 0 }),
  addTracks: vi.fn(),
});

describe('transfer orchestration', () => {
  it('builds exact matches in source order', async () => {
    const plan = await buildTransferPlan(adapter('spotify'), adapter('tidal'), 'p1');
    expect(plan.matches.map((match) => match.selectedId)).toEqual(['t-s1', 't-s2']);
  });
  it('creates once, keeps order, and skips manual omissions', async () => {
    const target = adapter('tidal');
    const plan = await buildTransferPlan(adapter('spotify'), target, 'p1');
    const result = await executeTransfer(plan, target, { 0: 't-s1', 1: null });
    expect(target.addTracks).toHaveBeenCalledWith('new', ['t-s1']);
    expect(result).toMatchObject({ added: 1, skipped: 1 });
  });
  it('rejects a selection that was not in the reviewed candidates', async () => {
    const target = adapter('tidal');
    const plan = await buildTransferPlan(adapter('spotify'), target, 'p1');
    await expect(executeTransfer(plan, target, { 0: 'tampered' })).rejects.toThrow('Invalid selection');
  });
});
