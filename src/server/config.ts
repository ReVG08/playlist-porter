import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

function loadDotEnv(): void {
  if (process.env.PLAYLIST_PORTER_DESKTOP === '1') return;
  const path = resolve('.env');
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
}

loadDotEnv();
const desktop = process.env.PLAYLIST_PORTER_DESKTOP === '1';
export const port = desktop ? 8787 : Number(process.env.APP_PORT ?? 8787);
export const appUrl = desktop ? 'http://127.0.0.1:8787' : process.env.APP_URL ?? `http://127.0.0.1:${port}`;
if (!Number.isInteger(port) || port < 1 || port > 65535 || appUrl !== `http://127.0.0.1:${port}`) {
  throw new Error('APP_URL must be http://127.0.0.1:APP_PORT, with a valid local port. Register that exact callback URL in both developer dashboards.');
}
export const dataDirectory = process.env.PLAYLIST_PORTER_DATA_DIR ?? join(homedir(), '.playlist-porter');
const settingsPath = join(dataDirectory, 'settings.json');
function storedSettings(): Partial<Record<'spotify' | 'tidal', string>> {
  try {
    const parsed: unknown = JSON.parse(readFileSync(settingsPath, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const values = parsed as Record<string, unknown>;
    return {
      spotify: typeof values.spotify === 'string' ? values.spotify : undefined,
      tidal: typeof values.tidal === 'string' ? values.tidal : undefined,
    };
  } catch { return {}; }
}
const stored = storedSettings();
export const clientIds: Record<'spotify' | 'tidal', string> = {
  spotify: (desktop ? stored.spotify : process.env.SPOTIFY_CLIENT_ID ?? stored.spotify)?.trim() ?? '',
  tidal: (desktop ? stored.tidal : process.env.TIDAL_CLIENT_ID ?? stored.tidal)?.trim() ?? '',
};

export function saveClientIds(next: Partial<typeof clientIds>): void {
  const values = { ...clientIds };
  if (next.spotify !== undefined) values.spotify = next.spotify.trim();
  if (next.tidal !== undefined) values.tidal = next.tidal.trim();
  for (const value of Object.values(values)) {
    if (value && !/^[a-zA-Z0-9_-]{1,200}$/.test(value)) throw new Error('Paste only the public Client ID, not a URL, client secret, or JSON.');
  }
  mkdirSync(dataDirectory, { recursive: true, mode: 0o700 });
  writeFileSync(settingsPath, JSON.stringify(values, null, 2), { mode: 0o600 });
  Object.assign(clientIds, values);
}
