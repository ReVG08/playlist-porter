export type Service = 'spotify' | 'tidal';

export interface Track {
  id: string;
  service: Service;
  title: string;
  artists: string[];
  album?: string;
  durationMs: number;
  isrc?: string;
  url?: string;
}

export interface PlaylistSummary {
  id: string;
  service: Service;
  name: string;
  description?: string;
  trackCount: number;
  imageUrl?: string;
  url?: string;
}

export interface Playlist extends PlaylistSummary {
  tracks: Track[];
}

export interface MatchCandidate {
  track: Track;
  score: number;
  reasons: string[];
}

export interface TrackMatch {
  source: Track;
  candidates: MatchCandidate[];
  selectedId?: string;
  confidence: 'exact' | 'high' | 'review' | 'missing';
}

export interface TransferPlan {
  id: string;
  sourceService: Service;
  targetService: Service;
  sourcePlaylist: PlaylistSummary;
  matches: TrackMatch[];
}

export interface MusicService {
  readonly service: Service;
  listPlaylists(): Promise<PlaylistSummary[]>;
  getPlaylist(id: string): Promise<Playlist>;
  searchTracks(track: Track): Promise<Track[]>;
  createPlaylist(name: string, description?: string): Promise<PlaylistSummary>;
  addTracks(playlistId: string, trackIds: string[]): Promise<void>;
}
