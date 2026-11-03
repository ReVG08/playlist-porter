import { createHash } from 'node:crypto';
import type { Request, Response } from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Service } from '../src/core/types.js';
import { accessToken, beginAuth, finishAuth } from '../src/server/oauth.js';
import { requestJson } from '../src/server/http.js';
import { loadToken, saveToken } from '../src/server/token-store.js';

vi.mock('../src/server/config.js', () => ({
  appUrl: 'http://127.0.0.1:8787',
  clientIds: { spotify: 'spotify-client-id', tidal: 'tidal-client-id' },
}));
vi.mock('../src/server/http.js', () => ({ requestJson: vi.fn() }));
vi.mock('../src/server/token-store.js', () => ({ loadToken: vi.fn(), saveToken: vi.fn() }));

const providers = [
  { service: 'spotify' as const, authorize: 'https://accounts.spotify.com/authorize', token: 'https://accounts.spotify.com/api/token', scopes: ['playlist-read-private', 'playlist-read-collaborative', 'playlist-modify-private', 'playlist-modify-public'] },
  { service: 'tidal' as const, authorize: 'https://login.tidal.com/authorize', token: 'https://auth.tidal.com/v1/oauth2/token', scopes: ['playlists.read', 'playlists.write', 'search.read', 'user.read'] },
];
const now = 1_800_000_000_000;
const callback = (query: Record<string, string>) => ({ query }) as unknown as Request;
function response() {
  const redirect = vi.fn();
  const type = vi.fn().mockReturnThis();
  const send = vi.fn();
  return { redirect, type, send } as unknown as Response;
}
function start(service: Service): URL {
  const res = response();
  beginAuth(service, res);
  return new URL(String(vi.mocked(res.redirect).mock.calls[0][0]));
}

describe('official OAuth Authorization Code + PKCE flows', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(Date, 'now').mockReturnValue(now);
    vi.stubEnv('PLAYLIST_PORTER_DESKTOP', '1');
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it.each(providers)('uses $service authorize parameters and exchanges the matching PKCE verifier without a secret', async ({ service, authorize, token, scopes }) => {
    const url = start(service);
    expect(`${url.origin}${url.pathname}`).toBe(authorize);
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('client_id')).toBe(`${service}-client-id`);
    expect(url.searchParams.get('redirect_uri')).toBe(`http://127.0.0.1:8787/auth/${service}/callback`);
    expect(url.searchParams.get('scope')?.split(' ')).toEqual(scopes);
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('state')).toMatch(/^[A-Za-z0-9_-]{32,}$/);
    expect(url.searchParams.has('client_secret')).toBe(false);
    vi.mocked(requestJson).mockResolvedValueOnce({ access_token: 'access', refresh_token: 'refresh', expires_in: 3600, scope: scopes.join(' ') });

    const res = response();
    await finishAuth(service, callback({ code: 'provider-code', state: url.searchParams.get('state')! }), res);
    const [tokenUrl, init] = vi.mocked(requestJson).mock.calls[0];
    expect(tokenUrl).toBe(token);
    expect(init?.method).toBe('POST');
    expect(init?.headers).toEqual({ 'content-type': 'application/x-www-form-urlencoded' });
    const body = init?.body as URLSearchParams;
    expect(body.get('grant_type')).toBe('authorization_code');
    expect(body.get('code')).toBe('provider-code');
    expect(body.get('client_id')).toBe(`${service}-client-id`);
    expect(body.get('redirect_uri')).toBe(url.searchParams.get('redirect_uri'));
    expect(body.has('client_secret')).toBe(false);
    const verifier = body.get('code_verifier')!;
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{43,128}$/);
    expect(createHash('sha256').update(verifier).digest('base64url')).toBe(url.searchParams.get('code_challenge'));
    expect(saveToken).toHaveBeenCalledWith(service, { accessToken: 'access', refreshToken: 'refresh', expiresAt: now + 3_600_000, scope: scopes.join(' ') });
    expect(res.send).toHaveBeenCalledWith(expect.stringContaining('return to Playlist Porter'));
  });

  it.each(providers)('rejects reused $service callback state', async ({ service }) => {
    const url = start(service);
    const req = callback({ code: 'code', state: url.searchParams.get('state')! });
    vi.mocked(requestJson).mockResolvedValueOnce({ access_token: 'access', expires_in: 3600 });
    await finishAuth(service, req, response());
    await expect(finishAuth(service, req, response())).rejects.toThrow(/Invalid or expired/);
    expect(requestJson).toHaveBeenCalledTimes(1);
    expect(saveToken).toHaveBeenCalledTimes(1);
  });

  it('rejects a callback on the wrong provider without exchanging a code', async () => {
    const url = start('spotify');
    await expect(finishAuth('tidal', callback({ code: 'code', state: url.searchParams.get('state')! }), response())).rejects.toThrow(/Invalid or expired/);
    expect(requestJson).not.toHaveBeenCalled();
    expect(saveToken).not.toHaveBeenCalled();
  });

  it('rejects expired callback state before exchanging a code', async () => {
    const url = start('tidal');
    vi.mocked(Date.now).mockReturnValue(now + 10 * 60_000 + 1);
    await expect(finishAuth('tidal', callback({ code: 'code', state: url.searchParams.get('state')! }), response())).rejects.toThrow(/Invalid or expired/);
    expect(requestJson).not.toHaveBeenCalled();
  });

  it('rejects unknown callback state', async () => {
    await expect(finishAuth('spotify', callback({ code: 'code', state: 'unknown' }), response())).rejects.toThrow(/Invalid or expired/);
    expect(requestJson).not.toHaveBeenCalled();
  });

  it.each(providers)('refreshes $service tokens with form data and no client secret', async ({ service, token }) => {
    vi.mocked(loadToken).mockResolvedValueOnce({ accessToken: 'expired', refreshToken: 'existing-refresh', expiresAt: now - 1, scope: 'scope' });
    vi.mocked(requestJson).mockResolvedValueOnce({ access_token: 'new-access', expires_in: 3600 });
    await expect(accessToken(service)).resolves.toBe('new-access');
    const [tokenUrl, init] = vi.mocked(requestJson).mock.calls[0];
    expect(tokenUrl).toBe(token);
    expect(init?.method).toBe('POST');
    expect(init?.headers).toEqual({ 'content-type': 'application/x-www-form-urlencoded' });
    expect(Object.fromEntries(init?.body as URLSearchParams)).toEqual({ grant_type: 'refresh_token', refresh_token: 'existing-refresh', client_id: `${service}-client-id` });
    expect(saveToken).toHaveBeenCalledWith(service, { accessToken: 'new-access', refreshToken: 'existing-refresh', expiresAt: now + 3_600_000, scope: 'scope' });
  });

  it('retains a rotated refresh token', async () => {
    vi.mocked(loadToken).mockResolvedValueOnce({ accessToken: 'expired', refreshToken: 'old-refresh', expiresAt: now - 1 });
    vi.mocked(requestJson).mockResolvedValueOnce({ access_token: 'new-access', refresh_token: 'new-refresh', expires_in: 3600 });
    await accessToken('spotify');
    expect(saveToken).toHaveBeenCalledWith('spotify', expect.objectContaining({ refreshToken: 'new-refresh' }));
  });

  it('returns unexpired access tokens without contacting the provider', async () => {
    vi.mocked(loadToken).mockResolvedValueOnce({ accessToken: 'valid-access', expiresAt: now + 3_600_000 });
    await expect(accessToken('tidal')).resolves.toBe('valid-access');
    expect(requestJson).not.toHaveBeenCalled();
  });
});
