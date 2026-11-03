import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const environmentKeys = [
  'PLAYLIST_PORTER_DESKTOP', 'PLAYLIST_PORTER_DATA_DIR',
  'SPOTIFY_CLIENT_ID', 'TIDAL_CLIENT_ID', 'APP_PORT', 'APP_URL',
] as const;

let directory: string;
const loadConfig = () => import('../src/server/config.js');

beforeEach(() => {
  vi.resetModules();
  for (const key of environmentKeys) vi.stubEnv(key, undefined);
  directory = mkdtempSync(join(tmpdir(), 'playlist-porter-config-test-'));
  vi.stubEnv('PLAYLIST_PORTER_DATA_DIR', directory);
  // Resolve development .env files in this isolated test directory, not the user's checkout.
  vi.spyOn(process, 'cwd').mockReturnValue(directory);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  rmSync(directory, { recursive: true, force: true });
});

describe('local developer app settings', () => {
  it.each(['not-json', 'null', '42', 'true', '"client-id"', '[]'])('ignores malformed settings document %s without blocking startup', async (document) => {
    writeFileSync(join(directory, 'settings.json'), document);
    expect((await loadConfig()).clientIds).toEqual({ spotify: '', tidal: '' });
  });

  it.each([null, 123, true, ['client-id'], { clientId: 'client-id' }])('ignores a non-string saved Client ID while keeping the other provider (%j)', async (value) => {
    writeFileSync(join(directory, 'settings.json'), JSON.stringify({ spotify: value, tidal: 'saved-tidal' }));
    expect((await loadConfig()).clientIds).toEqual({ spotify: '', tidal: 'saved-tidal' });

    writeFileSync(join(directory, 'settings.json'), JSON.stringify({ spotify: 'saved-spotify', tidal: value }));
    vi.resetModules();
    expect((await loadConfig()).clientIds).toEqual({ spotify: 'saved-spotify', tidal: '' });
  });

  it('trims and persists both public Client IDs across a restart', async () => {
    const config = await loadConfig();
    config.saveClientIds({ spotify: '  spotify_id-123  ', tidal: '\ttidal_id-456\n' });
    expect(config.clientIds).toEqual({ spotify: 'spotify_id-123', tidal: 'tidal_id-456' });
    expect(JSON.parse(readFileSync(join(directory, 'settings.json'), 'utf8'))).toEqual(config.clientIds);

    vi.resetModules();
    expect((await loadConfig()).clientIds).toEqual({ spotify: 'spotify_id-123', tidal: 'tidal_id-456' });
  });

  it('preserves the other provider when updating one Client ID and supports clearing it', async () => {
    const config = await loadConfig();
    config.saveClientIds({ spotify: 'spotify-1', tidal: 'tidal-1' });
    config.saveClientIds({ tidal: 'tidal-2' });
    expect(config.clientIds).toEqual({ spotify: 'spotify-1', tidal: 'tidal-2' });
    config.saveClientIds({ spotify: '  ' });
    expect(config.clientIds).toEqual({ spotify: '', tidal: 'tidal-2' });
  });

  it.each(['https://developer.example/app', '{"client_id":"id"}', 'two ids', 'a'.repeat(201)])(
    'does not mutate live or persisted settings after rejecting invalid input %s', async (value) => {
      const config = await loadConfig();
      config.saveClientIds({ spotify: 'spotify-1', tidal: 'tidal-1' });
      const saved = readFileSync(join(directory, 'settings.json'), 'utf8');
      expect(() => config.saveClientIds({ spotify: 'spotify-2', tidal: value })).toThrow('Paste only the public Client ID');
      expect(config.clientIds).toEqual({ spotify: 'spotify-1', tidal: 'tidal-1' });
      expect(readFileSync(join(directory, 'settings.json'), 'utf8')).toBe(saved);
    },
  );
});

describe('OAuth loopback configuration', () => {
  it('uses desktop settings and its registered callback origin despite launch-directory env values', async () => {
    writeFileSync(join(directory, 'settings.json'), JSON.stringify({ spotify: 'saved-spotify', tidal: 'saved-tidal' }));
    writeFileSync(join(directory, '.env'), 'APP_PORT=9999\nAPP_URL=http://localhost:9999\nSPOTIFY_CLIENT_ID=dotenv-id\nTIDAL_CLIENT_ID=dotenv-id\n');
    vi.stubEnv('PLAYLIST_PORTER_DESKTOP', '1');
    vi.stubEnv('APP_PORT', '7777');
    vi.stubEnv('APP_URL', 'https://unrelated.example');
    vi.stubEnv('SPOTIFY_CLIENT_ID', 'environment-spotify');
    vi.stubEnv('TIDAL_CLIENT_ID', 'environment-tidal');

    const config = await loadConfig();
    expect(config.port).toBe(8787);
    expect(config.appUrl).toBe('http://127.0.0.1:8787');
    expect(config.clientIds).toEqual({ spotify: 'saved-spotify', tidal: 'saved-tidal' });
  });

  it('honors an explicitly configured matching development loopback port', async () => {
    vi.stubEnv('APP_PORT', '9876');
    vi.stubEnv('APP_URL', 'http://127.0.0.1:9876');
    vi.stubEnv('SPOTIFY_CLIENT_ID', 'development-spotify');
    const config = await loadConfig();
    expect(config.port).toBe(9876);
    expect(config.appUrl).toBe('http://127.0.0.1:9876');
    expect(config.clientIds.spotify).toBe('development-spotify');
  });

  it('loads development .env configuration when no environment overrides are set', async () => {
    writeFileSync(join(directory, '.env'), 'APP_PORT=9876\nAPP_URL=http://127.0.0.1:9876\nSPOTIFY_CLIENT_ID=dotenv-spotify\n');
    const config = await loadConfig();
    expect(config.port).toBe(9876);
    expect(config.appUrl).toBe('http://127.0.0.1:9876');
    expect(config.clientIds.spotify).toBe('dotenv-spotify');
  });

  it.each([
    ['8787', 'http://localhost:8787'],
    ['8787', 'https://example.com'],
    ['8787', 'http://127.0.0.1:9999'],
    ['0', 'http://127.0.0.1:0'],
    ['65536', 'http://127.0.0.1:65536'],
    ['not-a-port', 'http://127.0.0.1:8787'],
  ])('rejects mismatched or invalid development callback settings (%s, %s)', async (port, url) => {
    vi.stubEnv('APP_PORT', port);
    vi.stubEnv('APP_URL', url);
    await expect(loadConfig()).rejects.toThrow('APP_URL must be http://127.0.0.1:APP_PORT');
  });
});
