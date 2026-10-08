import type { PlaylistSummary, Service, TransferPlan } from '../core/types';

export interface Status { spotify: { configured: boolean; connected: boolean }; tidal: { configured: boolean; connected: boolean } }

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { 'content-type': 'application/json', ...init?.headers } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? `Request failed (${response.status})`);
  return data as T;
}

export const api = {
  status: () => json<Status>('/api/status'),
  getSettings: () => json<{ spotifyClientId: string; tidalClientId: string }>('/api/settings'),
  playlists: (service: Service) => json<PlaylistSummary[]>(`/api/${service}/playlists`),
  plan: (sourceService: Service, targetService: Service, playlistId: string) => json<TransferPlan>('/api/transfers/plan', { method: 'POST', body: JSON.stringify({ sourceService, targetService, playlistId }) }),
  execute: (id: string, selections: Record<number, string | null>) => json<{ playlist: PlaylistSummary; added: number; skipped: number }>(`/api/transfers/${id}/execute`, { method: 'POST', body: JSON.stringify({ selections }) }),
  disconnect: (service: Service) => fetch(`/api/auth/${service}/disconnect`, { method: 'POST' }),
  settings: (spotifyClientId: string, tidalClientId: string) => json<{ ok: true }>('/api/settings', { method: 'PUT', body: JSON.stringify({ spotifyClientId, tidalClientId }) }),
};
