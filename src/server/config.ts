import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

function loadDotEnv(): void {
  const path = resolve('.env');
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
}

loadDotEnv();
export const port = Number(process.env.APP_PORT ?? 8787);
export const appUrl = process.env.APP_URL ?? `http://127.0.0.1:${port}`;
export const dataDirectory = process.env.PLAYLIST_PORTER_DATA_DIR ?? join(homedir(), '.playlist-porter');
const settingsPath = join(dataDirectory, 'settings.json');
function storedSettings(): Partial<Record<'spotify' | 'tidal', string>> {
  try { return JSON.parse(readFileSync(settingsPath, 'utf8')); } catch { return {}; }
}
const stored = storedSettings();
export const clientIds: Record<'spotify' | 'tidal', string> = {
  spotify: process.env.SPOTIFY_CLIENT_ID ?? stored.spotify ?? '',
  tidal: process.env.TIDAL_CLIENT_ID ?? stored.tidal ?? '',
};

export function saveClientIds(next: Partial<typeof clientIds>): void {
  if (next.spotify !== undefined) clientIds.spotify = next.spotify.trim();
  if (next.tidal !== undefined) clientIds.tidal = next.tidal.trim();
  mkdirSync(dataDirectory, { recursive: true, mode: 0o700 });
  writeFileSync(settingsPath, JSON.stringify(clientIds, null, 2), { mode: 0o600 });
}
