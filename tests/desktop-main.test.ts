import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const electron = vi.hoisted(() => {
  const handlers = new Map<string, (event: { preventDefault(): void }, url: string) => void>();
  const state = {
    popup: undefined as undefined | ((details: { url: string }) => { action: string }),
    options: undefined as unknown,
    handlers,
    startServer: vi.fn(),
    openExternal: vi.fn(),
    showErrorBox: vi.fn(),
    whenReady: vi.fn(),
    quit: vi.fn(),
    permissionHandler: vi.fn(),
    window: {
      removeMenu: vi.fn(), once: vi.fn(), show: vi.fn(), loadURL: vi.fn(),
      isMinimized: vi.fn(), restore: vi.fn(), focus: vi.fn(),
      webContents: {
        setWindowOpenHandler: vi.fn((callback) => { state.popup = callback; }),
        on: vi.fn((event, callback) => { handlers.set(event, callback); }),
      },
    },
  };
  return state;
});

vi.mock('electron', () => ({
  app: {
    requestSingleInstanceLock: () => true,
    on: vi.fn(),
    whenReady: electron.whenReady,
    getPath: () => '/test/local-data',
    getAppPath: () => '/test/app',
    quit: electron.quit,
  },
  BrowserWindow: class {
    constructor(options: unknown) { electron.options = options; return electron.window; }
    static getAllWindows() { return [electron.window]; }
  },
  dialog: { showErrorBox: electron.showErrorBox },
  nativeTheme: {},
  session: { defaultSession: { setPermissionRequestHandler: electron.permissionHandler } },
  shell: { openExternal: electron.openExternal },
}));

vi.mock('../src/server/index.js', () => ({ startServer: electron.startServer }));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  electron.popup = undefined;
  electron.options = undefined;
  electron.handlers.clear();
  electron.whenReady.mockResolvedValue(undefined);
  electron.startServer.mockResolvedValue({});
  electron.openExternal.mockResolvedValue(undefined);
  electron.window.loadURL.mockResolvedValue(undefined);
  for (const name of ['PLAYLIST_PORTER_DESKTOP', 'PLAYLIST_PORTER_DATA_DIR', 'PLAYLIST_PORTER_CLIENT_DIR']) {
    vi.stubEnv(name, process.env[name]);
  }
});

afterEach(() => { vi.unstubAllEnvs(); });

async function launch(): Promise<void> {
  await import('../src/desktop/main.js');
  await vi.waitFor(() => { expect(electron.window.loadURL).toHaveBeenCalledWith('http://127.0.0.1:8787'); });
}

describe('Electron connection flow', () => {
  it('starts the loopback server and keeps the sandboxed UI on its local origin', async () => {
    await launch();
    expect(electron.startServer).toHaveBeenCalledOnce();
    expect(electron.options).toMatchObject({
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true },
    });
    expect(electron.handlers.has('will-navigate')).toBe(true);
    expect(electron.handlers.has('will-redirect')).toBe(true);
    const permissionDecision = vi.fn();
    electron.permissionHandler.mock.calls[0][0]({}, 'camera', permissionDecision);
    expect(permissionDecision).toHaveBeenCalledWith(false);
  });

  it.each(['spotify', 'tidal'])('hands the %s Connect popup to the system browser without creating an Electron popup', async (service) => {
    await launch();
    const url = `http://127.0.0.1:8787/auth/${service}/start`;
    expect(electron.popup!({ url })).toEqual({ action: 'deny' });
    expect(electron.openExternal).toHaveBeenCalledExactlyOnceWith(url);
    expect(electron.window.loadURL).toHaveBeenCalledExactlyOnceWith('http://127.0.0.1:8787');
  });

  it.each(['spotify', 'tidal'])('also intercepts accidental same-window %s sign-in', async (service) => {
    await launch();
    const event = { preventDefault: vi.fn() };
    const url = `http://127.0.0.1:8787/auth/${service}/start`;
    electron.handlers.get('will-navigate')!(event, url);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(electron.openExternal).toHaveBeenCalledExactlyOnceWith(url);
  });

  it.each(['https://accounts.spotify.com/authorize?state=test', 'https://login.tidal.com/authorize?state=test'])('cancels embedded provider redirects and opens %s externally', async (url) => {
    await launch();
    const event = { preventDefault: vi.fn() };
    electron.handlers.get('will-redirect')!(event, url);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(electron.openExternal).toHaveBeenCalledExactlyOnceWith(url);
  });

  it('allows local UI navigation without opening a browser', async () => {
    await launch();
    const event = { preventDefault: vi.fn() };
    electron.handlers.get('will-navigate')!(event, 'http://127.0.0.1:8787/?connected=spotify');
    electron.handlers.get('will-redirect')!(event, 'http://127.0.0.1:8787/');
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(electron.openExternal).not.toHaveBeenCalled();
  });

  it('blocks untrusted popups and redirects without launching them externally', async () => {
    await launch();
    const url = 'https://accounts.spotify.com.evil.example/authorize';
    expect(electron.popup!({ url })).toEqual({ action: 'deny' });
    const event = { preventDefault: vi.fn() };
    electron.handlers.get('will-redirect')!(event, url);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(electron.openExternal).not.toHaveBeenCalled();
  });

  it('explains browser-launch failures without leaving an unhandled rejection', async () => {
    await launch();
    electron.openExternal.mockRejectedValueOnce(new Error('browser unavailable'));
    electron.popup!({ url: 'http://127.0.0.1:8787/auth/tidal/start' });
    await vi.waitFor(() => { expect(electron.showErrorBox).toHaveBeenCalledWith('Could not open your browser', expect.stringContaining('default browser')); });
  });

  it('explains local port conflicts instead of silently quitting', async () => {
    electron.startServer.mockRejectedValueOnce(Object.assign(new Error('listen failed'), { code: 'EADDRINUSE' }));
    await import('../src/desktop/main.js');
    await vi.waitFor(() => { expect(electron.showErrorBox).toHaveBeenCalledWith('Playlist Porter could not start', expect.stringContaining('Local port 8787 is already in use')); });
    expect(electron.quit).toHaveBeenCalledOnce();
    expect(electron.window.loadURL).not.toHaveBeenCalled();
  });

  it('reports other startup failures without exposing private diagnostic details', async () => {
    electron.startServer.mockRejectedValueOnce(new Error('private file or credential detail'));
    await import('../src/desktop/main.js');
    await vi.waitFor(() => { expect(electron.showErrorBox).toHaveBeenCalledWith('Playlist Porter could not start', expect.stringContaining('application data folder')); });
    expect(electron.showErrorBox.mock.calls[0].join(' ')).not.toContain('private file or credential detail');
    expect(electron.quit).toHaveBeenCalledOnce();
  });
});
