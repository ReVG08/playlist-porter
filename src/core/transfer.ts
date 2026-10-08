import { randomUUID } from 'node:crypto';
import { confidenceFor, rankMatches } from './matching.js';
import type { MusicService, TransferPlan } from './types.js';

export async function buildTransferPlan(source: MusicService, target: MusicService, playlistId: string): Promise<TransferPlan> {
  if (source.service === target.service) throw new Error('Source and target services must differ.');
  const playlist = await source.getPlaylist(playlistId);
  const matches = [];
  for (const track of playlist.tracks) {
    const candidates = rankMatches(track, await target.searchTracks(track)).slice(0, 5);
    const confidence = confidenceFor(candidates);
    matches.push({
      source: track,
      candidates,
      confidence,
      selectedId: confidence === 'exact' || confidence === 'high' ? candidates[0]?.track.id : undefined,
    });
  }
  const sourcePlaylist = {
    id: playlist.id, service: playlist.service, name: playlist.name,
    description: playlist.description, trackCount: playlist.trackCount,
    imageUrl: playlist.imageUrl, url: playlist.url,
  };
  return { id: randomUUID(), sourceService: source.service, targetService: target.service, sourcePlaylist, matches };
}

export async function executeTransfer(
  plan: TransferPlan,
  target: MusicService,
  selections: Record<number, string | null>,
): Promise<{ playlist: Awaited<ReturnType<MusicService['createPlaylist']>>; added: number; skipped: number }> {
  if (plan.targetService !== target.service) throw new Error('Transfer target does not match the plan.');
  const playlist = await target.createPlaylist(plan.sourcePlaylist.name, `Transferred from ${plan.sourceService} with Playlist Porter. ${plan.sourcePlaylist.description ?? ''}`.trim());
  const trackIds = plan.matches.flatMap((match, index) => {
    const chosen = selections[index] === undefined ? match.selectedId : selections[index];
    if (!chosen) return [];
    if (!match.candidates.some((candidate) => candidate.track.id === chosen)) throw new Error(`Invalid selection for track ${index + 1}.`);
    return [chosen];
  });
  await target.addTracks(playlist.id, trackIds);
  return { playlist, added: trackIds.length, skipped: plan.matches.length - trackIds.length };
}
