import { app, BrowserWindow, nativeTheme, session, shell } from 'electron';
import { join } from 'node:path';

const LOCAL_ORIGIN = 'http://127.0.0.1:8787';
const externalHosts = new Set(['accounts.spotify.com', 'login.tidal.com', 'open.spotify.com', 'tidal.com', 'listen.tidal.com']);
let mainWindow: BrowserWindow | undefined;

function safeExternal(url: string): boolean {
  try { return new URL(url).protocol === 'https:' && externalHosts.has(new URL(url).hostname); }
  catch { return false; }
}

async function createWindow(): Promise<void> {
  nativeTheme.themeSource = 'dark';
  mainWindow = new BrowserWindow({
    title: 'Playlist Porter', width: 1220, height: 840, minWidth: 760, minHeight: 620,
    backgroundColor: '#0d0e0e', show: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true },
  });
  mainWindow.removeMenu();
  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (safeExternal(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith(LOCAL_ORIGIN)) return;
    event.preventDefault();
    if (safeExternal(url)) void shell.openExternal(url);
  });
  await mainWindow.loadURL(LOCAL_ORIGIN);
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus(); } });
  app.whenReady().then(async () => {
    process.env.PLAYLIST_PORTER_DESKTOP = '1';
    process.env.PLAYLIST_PORTER_DATA_DIR = app.getPath('userData');
    process.env.PLAYLIST_PORTER_CLIENT_DIR = join(app.getAppPath(), 'dist', 'client');
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    const { startServer } = await import('../server/index.js');
    await startServer();
    await createWindow();
  }).catch((error) => { console.error(error); app.quit(); });
}

app.on('window-all-closed', () => app.quit());
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) void createWindow(); });
