import type { MusicService, Playlist, PlaylistSummary, Track } from '../../core/types.js';
import { allPages, requestJson } from '../http.js';
import { accessToken } from '../oauth.js';

const API = 'https://api.spotify.com/v1';
type STrack = { id: string; name: string; artists: Array<{ name: string }>; album?: { name: string }; duration_ms: number; external_ids?: { isrc?: string }; external_urls?: { spotify?: string }; uri: string };

export class SpotifyService implements MusicService {
  readonly service = 'spotify' as const;
  private async headers(): Promise<Record<string, string>> { return { authorization: `Bearer ${await accessToken('spotify')}`, 'content-type': 'application/json' }; }
  private track(value: STrack): Track { return { id: value.id, service: 'spotify', title: value.name, artists: value.artists.map((a) => a.name), album: value.album?.name, durationMs: value.duration_ms, isrc: value.external_ids?.isrc, url: value.external_urls?.spotify }; }

  async listPlaylists(): Promise<PlaylistSummary[]> {
    const headers = await this.headers();
    const items = await allPages<any>(`${API}/me/playlists?limit=50`, { headers }, (data) => ({ items: data.items, next: data.next }));
    return items.map((p) => ({ id: p.id, service: 'spotify', name: p.name, description: p.description || undefined, trackCount: p.items?.total ?? p.tracks?.total ?? 0, imageUrl: p.images?.[0]?.url, url: p.external_urls?.spotify }));
  }

  async getPlaylist(id: string): Promise<Playlist> {
    const headers = await this.headers();
    const meta = await requestJson<any>(`${API}/playlists/${encodeURIComponent(id)}`, { headers });
    const items = await allPages<any>(`${API}/playlists/${encodeURIComponent(id)}/items?limit=50&additional_types=track`, { headers }, (data) => ({ items: data.items, next: data.next }));
    return { id, service: 'spotify', name: meta.name, description: meta.description || undefined, trackCount: items.length, imageUrl: meta.images?.[0]?.url, url: meta.external_urls?.spotify, tracks: items.map((item) => item.item ?? item.track).filter((track): track is STrack => Boolean(track?.id && track.type === 'track')).map((track) => this.track(track)) };
  }

  async searchTracks(track: Track): Promise<Track[]> {
    const headers = await this.headers();
    const search = async (query: string) => {
      const data = await requestJson<any>(`${API}/search?type=track&limit=10&q=${encodeURIComponent(query)}`, { headers });
      return (data.tracks?.items ?? []).map((item: STrack) => this.track(item));
    };
    if (track.isrc) {
      const exact = await search(`isrc:${track.isrc}`);
      if (exact.length) return exact;
    }
    return search(`track:${track.title} artist:${track.artists[0] ?? ''}`);
  }

  async createPlaylist(name: string, description?: string): Promise<PlaylistSummary> {
    const data = await requestJson<any>(`${API}/me/playlists`, { method: 'POST', headers: await this.headers(), body: JSON.stringify({ name, description, public: false }) });
    return { id: data.id, service: 'spotify', name: data.name, description: data.description, trackCount: 0, url: data.external_urls?.spotify };
  }

  async addTracks(playlistId: string, trackIds: string[]): Promise<void> {
    const headers = await this.headers();
    for (let index = 0; index < trackIds.length; index += 100) {
      await requestJson(`${API}/playlists/${encodeURIComponent(playlistId)}/items`, { method: 'POST', headers, body: JSON.stringify({ uris: trackIds.slice(index, index + 100).map((id) => `spotify:track:${id}`) }) });
    }
  }
}
