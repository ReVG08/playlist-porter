import express, { type NextFunction, type Request, type Response } from 'express';
import { existsSync } from 'node:fs';
import type { Server } from 'node:http';
import { resolve } from 'node:path';
import { buildTransferPlan, executeTransfer } from '../core/transfer.js';
import type { Service, TransferPlan } from '../core/types.js';
import { SpotifyService } from './adapters/spotify.js';
import { TidalService } from './adapters/tidal.js';
import { appUrl, clientIds, port, saveClientIds } from './config.js';
import { ApiError } from './http.js';
import { beginAuth, connectionStatus, finishAuth } from './oauth.js';
import { deleteToken } from './token-store.js';

const app = express();
app.use(express.json({ limit: '1mb' }));
const services = { spotify: new SpotifyService(), tidal: new TidalService() };
const plans = new Map<string, { plan: TransferPlan; createdAt: number }>();
const validService = (value: string): value is Service => value === 'spotify' || value === 'tidal';

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.get('/api/status', async (_req, res) => res.json({
  spotify: { configured: Boolean(clientIds.spotify), connected: await connectionStatus('spotify') },
  tidal: { configured: Boolean(clientIds.tidal), connected: await connectionStatus('tidal') },
}));
app.get('/api/settings', (_req, res) => res.json({ spotifyClientId: clientIds.spotify, tidalClientId: clientIds.tidal }));
app.put('/api/settings', (req, res) => {
  const body = req.body as { spotifyClientId?: unknown; tidalClientId?: unknown };
  const spotify = typeof body.spotifyClientId === 'string' ? body.spotifyClientId : undefined;
  const tidal = typeof body.tidalClientId === 'string' ? body.tidalClientId : undefined;
  if ((spotify !== undefined && spotify.length > 200) || (tidal !== undefined && tidal.length > 200)) return res.status(400).json({ error: 'A client ID is too long.' });
  saveClientIds({ spotify, tidal });
  res.json({ ok: true });
});

app.get('/auth/:service/start', (req, res) => {
  if (!validService(req.params.service)) return res.status(404).end();
  beginAuth(req.params.service, res);
});
app.get('/auth/:service/callback', async (req, res) => {
  if (!validService(req.params.service)) return res.status(404).end();
  await finishAuth(req.params.service, req, res);
});
app.post('/api/auth/:service/disconnect', async (req, res) => {
  if (!validService(req.params.service)) return res.status(404).end();
  await deleteToken(req.params.service);
  res.status(204).end();
});

app.get('/api/:service/playlists', async (req, res) => {
  if (!validService(req.params.service)) return res.status(404).end();
  res.json(await services[req.params.service].listPlaylists());
});

app.post('/api/transfers/plan', async (req, res) => {
  const { sourceService, targetService, playlistId } = req.body as { sourceService?: string; targetService?: string; playlistId?: string };
  if (!sourceService || !targetService || !playlistId || !validService(sourceService) || !validService(targetService)) return res.status(400).json({ error: 'Choose a source, target, and playlist.' });
  const plan = await buildTransferPlan(services[sourceService], services[targetService], playlistId);
  plans.set(plan.id, { plan, createdAt: Date.now() });
  for (const [id, item] of plans) if (Date.now() - item.createdAt > 60 * 60_000) plans.delete(id);
  res.json(plan);
});

app.post('/api/transfers/:id/execute', async (req, res) => {
  const stored = plans.get(req.params.id);
  if (!stored) return res.status(404).json({ error: 'This transfer plan expired. Please scan the playlist again.' });
  const selections = (req.body as { selections?: Record<number, string | null> }).selections ?? {};
  const result = await executeTransfer(stored.plan, services[stored.plan.targetService], selections);
  plans.delete(req.params.id);
  res.json(result);
});

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(error);
  const status = error instanceof ApiError ? Math.min(error.status, 599) : 500;
  res.status(status).json({ error: error instanceof Error ? error.message : 'Unexpected error.', details: error instanceof ApiError ? error.details : undefined });
});

const clientPath = process.env.PLAYLIST_PORTER_CLIENT_DIR ?? resolve('dist/client');
if (existsSync(clientPath)) {
  app.use(express.static(clientPath));
  app.get('*splat', (_req, res) => res.sendFile(resolve(clientPath, 'index.html')));
}

let server: Server | undefined;
export async function startServer(): Promise<Server> {
  if (server) return server;
  return await new Promise((resolveServer, reject) => {
    server = app.listen(port, '127.0.0.1', () => { console.log(`Playlist Porter is ready at ${appUrl}`); resolveServer(server!); });
    server.once('error', reject);
  });
}

const isDirect = !process.env.PLAYLIST_PORTER_DESKTOP && /src[\\/]server[\\/]index\.ts$/.test(process.argv[1] ?? '');
if (isDirect) void startServer();
