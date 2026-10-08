import { randomUUID } from 'node:crypto';
import type { MusicService, Playlist, PlaylistSummary, Track } from '../../core/types.js';
import { requestJson } from '../http.js';
import { accessToken } from '../oauth.js';

const API = 'https://openapi.tidal.com/v2';
type Resource = { id: string; type: string; attributes?: Record<string, any>; relationships?: Record<string, { data?: Array<{ id: string; type: string }> }> };
type Document = { data: Resource | Resource[]; included?: Resource[]; links?: { next?: string }; meta?: Record<string, unknown> };

const durationMs = (value?: string): number => {
  const match = value?.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:([\d.]+)S)?$/);
  return match ? Math.round(((Number(match[1] ?? 0) * 3600) + (Number(match[2] ?? 0) * 60) + Number(match[3] ?? 0)) * 1000) : 0;
};

export class TidalService implements MusicService {
  readonly service = 'tidal' as const;
  private countryCode?: string;
  private async headers(jsonApi = false): Promise<Record<string, string>> { return { authorization: `Bearer ${await accessToken('tidal')}`, accept: 'application/vnd.tidal.v1+json', 'content-type': jsonApi ? 'application/vnd.api+json' : 'application/vnd.tidal.v1+json' }; }
  private relationships(resource: Resource, included: Resource[] = []): { artists: string[]; album?: string } {
    const ids = (name: string) => resource.relationships?.[name]?.data?.map((item) => `${item.type}:${item.id}`) ?? [];
    const byKey = new Map(included.map((item) => [`${item.type}:${item.id}`, item]));
    return { artists: ids('artists').map((key) => byKey.get(key)?.attributes?.name).filter(Boolean), album: ids('albums').map((key) => byKey.get(key)?.attributes?.title).find(Boolean) };
  }
  private track(resource: Resource, included: Resource[]): Track {
    const related = this.relationships(resource, included);
    const attrs = resource.attributes ?? {};
    return { id: resource.id, service: 'tidal', title: String(attrs.title ?? ''), artists: related.artists, album: related.album, durationMs: durationMs(attrs.duration), isrc: attrs.isrc ?? undefined, url: attrs.externalLinks?.find((link: any) => link.href)?.href };
  }
  private next(link: string | undefined): string | undefined { return link ? new URL(link, API).toString() : undefined; }
  private async country(): Promise<string> {
    if (this.countryCode) return this.countryCode;
    const page = await requestJson<Document>(`${API}/users/me`, { headers: await this.headers() });
    const user = Array.isArray(page.data) ? page.data[0] : page.data;
    this.countryCode = String(user.attributes?.country ?? 'US');
    return this.countryCode;
  }

  async listPlaylists(): Promise<PlaylistSummary[]> {
    const output: PlaylistSummary[] = [];
    let url: string | undefined = `${API}/playlists?filter%5Bowners.id%5D=me&sort=-lastModifiedAt&countryCode=${await this.country()}`;
    const headers = await this.headers();
    while (url) {
      const page = await requestJson<Document>(url, { headers });
      const data = Array.isArray(page.data) ? page.data : [page.data];
      output.push(...data.map((p) => ({ id: p.id, service: 'tidal' as const, name: String(p.attributes?.name ?? 'Untitled playlist'), description: p.attributes?.description || undefined, trackCount: Number(p.attributes?.numberOfTrackItems ?? p.attributes?.numberOfItems ?? 0), url: p.attributes?.externalLinks?.find((link: any) => link.href)?.href })));
      url = this.next(page.links?.next);
    }
    return output;
  }

  async getPlaylist(id: string): Promise<Playlist> {
    const headers = await this.headers();
    const country = await this.country();
    const meta = await requestJson<Document>(`${API}/playlists/${encodeURIComponent(id)}?countryCode=${country}`, { headers });
    const p = Array.isArray(meta.data) ? meta.data[0] : meta.data;
    const tracks: Track[] = [];
    let url: string | undefined = `${API}/playlists/${encodeURIComponent(id)}/relationships/items?sort=itemIndex&include=items.tracks%3Aartists%2Citems.tracks%3Aalbums&countryCode=${country}`;
    while (url) {
      const page = await requestJson<Document>(url, { headers });
      const included = page.included ?? [];
      const trackMap = new Map(included.filter((item) => item.type === 'tracks').map((item) => [item.id, item]));
      const identifiers = (Array.isArray(page.data) ? page.data : [page.data]).filter((item) => item.type === 'tracks');
      const resources = identifiers.map((item) => trackMap.get(item.id) ?? item).filter((item) => item.attributes);
      tracks.push(...resources.map((item) => this.track(item, page.included ?? [])));
      url = this.next(page.links?.next);
    }
    return { id, service: 'tidal', name: String(p.attributes?.name ?? 'Untitled playlist'), description: p.attributes?.description || undefined, trackCount: tracks.length, url: p.attributes?.externalLinks?.find((link: any) => link.href)?.href, tracks };
  }

  async searchTracks(track: Track): Promise<Track[]> {
    const headers = await this.headers();
    const search = async (query: string) => {
      const url = `${API}/searchResults?filter%5Bquery%5D=${encodeURIComponent(query)}&include=tracks%2Ctracks.artists%2Ctracks.albums&countryCode=${await this.country()}&deviceType=DESKTOP&systemType=DESKTOP`;
      const page = await requestJson<Document>(url, { headers });
      return (page.included ?? []).filter((item) => item.type === 'tracks').map((item) => this.track(item, page.included ?? [])).slice(0, 10);
    };
    if (track.isrc) {
      const exact = await search(track.isrc);
      if (exact.some((item) => item.isrc?.toUpperCase() === track.isrc?.toUpperCase())) return exact;
    }
    return search(`${track.title} ${track.artists[0] ?? ''}`);
  }

  async createPlaylist(name: string, description?: string): Promise<PlaylistSummary> {
    const page = await requestJson<Document>(`${API}/playlists`, { method: 'POST', headers: { ...await this.headers(true), 'idempotency-key': randomUUID() }, body: JSON.stringify({ data: { type: 'playlists', attributes: { name, description, accessType: 'UNLISTED' } } }) });
    const p = Array.isArray(page.data) ? page.data[0] : page.data;
    return { id: p.id, service: 'tidal', name: String(p.attributes?.name ?? name), description: p.attributes?.description || undefined, trackCount: 0, url: p.attributes?.externalLinks?.find((link: any) => link.href)?.href };
  }

  async addTracks(playlistId: string, trackIds: string[]): Promise<void> {
    for (let index = 0; index < trackIds.length; index += 50) {
      await requestJson(`${API}/playlists/${encodeURIComponent(playlistId)}/relationships/items`, { method: 'POST', headers: { ...await this.headers(true), 'idempotency-key': randomUUID() }, body: JSON.stringify({ data: trackIds.slice(index, index + 50).map((id) => ({ type: 'tracks', id })) }) });
    }
  }
}
