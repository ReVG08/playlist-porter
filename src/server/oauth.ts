import { createHash, randomBytes } from 'node:crypto';
import type { Request, Response } from 'express';
import type { Service } from '../core/types.js';
import { appUrl, clientIds } from './config.js';
import { requestJson } from './http.js';
import { loadToken, saveToken, type OAuthToken } from './token-store.js';

interface PendingAuth { verifier: string; service: Service; createdAt: number }
const pending = new Map<string, PendingAuth>();
const settings = {
  spotify: {
    authorize: 'https://accounts.spotify.com/authorize', token: 'https://accounts.spotify.com/api/token',
    scopes: ['playlist-read-private', 'playlist-read-collaborative', 'playlist-modify-private', 'playlist-modify-public'],
  },
  tidal: {
    authorize: 'https://login.tidal.com/authorize', token: 'https://auth.tidal.com/v1/oauth2/token',
    scopes: ['playlists.read', 'playlists.write', 'search.read', 'user.read'],
  },
} as const;

const base64url = (value: Buffer) => value.toString('base64url');
const redirectUri = (service: Service) => `${appUrl}/auth/${service}/callback`;

export function beginAuth(service: Service, response: Response): void {
  const clientId = clientIds[service];
  if (!clientId) throw new Error(`${service === 'spotify' ? 'SPOTIFY' : 'TIDAL'}_CLIENT_ID is not configured.`);
  const state = base64url(randomBytes(24));
  const verifier = base64url(randomBytes(64));
  const challenge = base64url(createHash('sha256').update(verifier).digest());
  pending.set(state, { verifier, service, createdAt: Date.now() });
  const query = new URLSearchParams({
    response_type: 'code', client_id: clientId, redirect_uri: redirectUri(service),
    scope: settings[service].scopes.join(' '), state, code_challenge_method: 'S256', code_challenge: challenge,
  });
  response.redirect(`${settings[service].authorize}?${query}`);
}

export async function finishAuth(service: Service, request: Request, response: Response): Promise<void> {
  const code = String(request.query.code ?? '');
  const state = String(request.query.state ?? '');
  const item = pending.get(state);
  pending.delete(state);
  if (request.query.error) throw new Error(`Authorization declined: ${String(request.query.error_description ?? request.query.error)}`);
  if (!code || !item || item.service !== service || Date.now() - item.createdAt > 10 * 60_000) throw new Error('Invalid or expired OAuth callback. Please connect again.');
  const body = new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri(service), client_id: clientIds[service], code_verifier: item.verifier });
  const token = await requestJson<{ access_token: string; refresh_token?: string; expires_in: number; scope?: string }>(settings[service].token, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body,
  });
  await saveToken(service, { accessToken: token.access_token, refreshToken: token.refresh_token, expiresAt: Date.now() + token.expires_in * 1000, scope: token.scope });
  if (process.env.PLAYLIST_PORTER_DESKTOP === '1') {
    response.type('html').send(`<!doctype html><meta charset="utf-8"><title>Connected</title><style>body{font:16px system-ui;background:#111;color:#f4f1e9;display:grid;place-items:center;height:100vh;margin:0}div{text-align:center}b{color:#d8ff62}</style><div><h1><b>Connected.</b></h1><p>You can close this window and return to Playlist Porter.</p></div>`);
  } else response.redirect('/?connected=' + service);
}

export async function accessToken(service: Service): Promise<string> {
  const token = await loadToken(service);
  if (!token) throw new Error(`${service} is not connected.`);
  if (token.expiresAt > Date.now() + 60_000) return token.accessToken;
  if (!token.refreshToken) throw new Error(`${service} session expired. Please reconnect.`);
  const body = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: token.refreshToken, client_id: clientIds[service] });
  const refreshed = await requestJson<{ access_token: string; refresh_token?: string; expires_in: number; scope?: string }>(settings[service].token, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body,
  });
  const next: OAuthToken = { accessToken: refreshed.access_token, refreshToken: refreshed.refresh_token ?? token.refreshToken, expiresAt: Date.now() + refreshed.expires_in * 1000, scope: refreshed.scope ?? token.scope };
  await saveToken(service, next);
  return next.accessToken;
}

export async function connectionStatus(service: Service): Promise<boolean> {
  return Boolean(clientIds[service] && await loadToken(service));
}
