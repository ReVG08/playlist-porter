export const LOCAL_ORIGIN = 'http://127.0.0.1:8787';

const externalHosts = new Set(['accounts.spotify.com', 'login.tidal.com', 'open.spotify.com', 'tidal.com', 'listen.tidal.com']);

function parseUrl(value: string): URL | undefined {
  try {
    const url = new URL(value);
    return url.username || url.password ? undefined : url;
  } catch { return undefined; }
}

export function isAuthStartUrl(value: string): boolean {
  const url = parseUrl(value);
  return Boolean(url && url.origin === LOCAL_ORIGIN && /^\/auth\/(spotify|tidal)\/start$/.test(url.pathname) && !url.search && !url.hash);
}

export function isLocalAppUrl(value: string): boolean {
  return parseUrl(value)?.origin === LOCAL_ORIGIN;
}

export function canOpenExternal(value: string): boolean {
  if (isAuthStartUrl(value)) return true;
  const url = parseUrl(value);
  return Boolean(url && url.protocol === 'https:' && !url.port && externalHosts.has(url.hostname));
}

export function navigationAction(value: string): 'allow' | 'external' | 'deny' {
  if (isAuthStartUrl(value)) return 'external';
  if (isLocalAppUrl(value)) return 'allow';
  return canOpenExternal(value) ? 'external' : 'deny';
}
