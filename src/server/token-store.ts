import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Service } from '../core/types.js';
import { dataDirectory } from './config.js';

export interface OAuthToken {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  scope?: string;
}

const directory = dataDirectory;
const keyPath = join(directory, 'local.key');
const tokenPath = (service: Service) => join(directory, `${service}.token`);

async function key(): Promise<Buffer> {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  try { return await readFile(keyPath); } catch {
    const value = randomBytes(32);
    await writeFile(keyPath, value, { mode: 0o600 });
    await chmod(keyPath, 0o600);
    return value;
  }
}

export async function saveToken(service: Service, token: OAuthToken): Promise<void> {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', await key(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(token)), cipher.final()]);
  const payload = Buffer.concat([iv, cipher.getAuthTag(), encrypted]);
  await writeFile(tokenPath(service), payload, { mode: 0o600 });
  await chmod(tokenPath(service), 0o600);
}

export async function loadToken(service: Service): Promise<OAuthToken | undefined> {
  try {
    const payload = await readFile(tokenPath(service));
    const decipher = createDecipheriv('aes-256-gcm', await key(), payload.subarray(0, 12));
    decipher.setAuthTag(payload.subarray(12, 28));
    return JSON.parse(Buffer.concat([decipher.update(payload.subarray(28)), decipher.final()]).toString()) as OAuthToken;
  } catch { return undefined; }
}

export async function deleteToken(service: Service): Promise<void> {
  const { unlink } = await import('node:fs/promises');
  try { await unlink(tokenPath(service)); } catch { /* already disconnected */ }
}
