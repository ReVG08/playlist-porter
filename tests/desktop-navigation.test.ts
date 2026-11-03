import { describe, expect, it } from 'vitest';
import { canOpenExternal, isAuthStartUrl, isLocalAppUrl, navigationAction } from '../src/desktop/navigation.js';

describe('desktop browser handoff', () => {
  it.each(['spotify', 'tidal'])('opens %s sign-in in the system browser, not Electron', (service) => {
    const url = `http://127.0.0.1:8787/auth/${service}/start`;
    expect(isAuthStartUrl(url)).toBe(true);
    expect(canOpenExternal(url)).toBe(true);
    expect(navigationAction(url)).toBe('external');
  });

  it('keeps the local UI inside Electron and denies arbitrary local popups', () => {
    expect(navigationAction('http://127.0.0.1:8787/')).toBe('allow');
    expect(navigationAction('http://127.0.0.1:8787/?connected=spotify')).toBe('allow');
    expect(canOpenExternal('http://127.0.0.1:8787/api/settings')).toBe(false);
    expect(canOpenExternal('http://127.0.0.1:8787/auth/spotify/callback?code=secret')).toBe(false);
  });

  it.each([
    'http://127.0.0.1:8787.evil.example/',
    'http://127.0.0.1:87870/auth/spotify/start',
    'http://127.0.0.1:9999/auth/spotify/start',
    'http://localhost:8787/auth/spotify/start',
    'http://user:password@127.0.0.1:8787/auth/spotify/start',
    'javascript:alert(1)',
    'file:///etc/passwd',
    'https://accounts.spotify.com.evil.example/authorize',
    'https://accounts.spotify.com:8443/authorize',
    'https://user:password@accounts.spotify.com/authorize',
  ])('blocks untrusted navigation and popup URL %s', (url) => {
    expect(canOpenExternal(url)).toBe(false);
    expect(isLocalAppUrl(url)).toBe(false);
    expect(navigationAction(url)).toBe('deny');
  });

  it.each([
    'http://127.0.0.1:8787/auth/spotify/start?redirect=https://evil.example',
    'http://127.0.0.1:8787/auth/tidal/start#unexpected',
    'http://127.0.0.1:8787/auth/unknown/start',
    'http://127.0.0.1:8787/auth/tidal/start/extra',
  ])('does not hand off unexpected local route %s', (url) => {
    expect(isAuthStartUrl(url)).toBe(false);
    expect(canOpenExternal(url)).toBe(false);
  });

  it('hands known provider redirects and playlist links to the browser', () => {
    expect(navigationAction('https://accounts.spotify.com/authorize?state=test')).toBe('external');
    expect(navigationAction('https://login.tidal.com/authorize?state=test')).toBe('external');
    expect(canOpenExternal('https://open.spotify.com/playlist/example')).toBe(true);
  });
});
