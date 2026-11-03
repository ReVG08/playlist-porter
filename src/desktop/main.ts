import { app, BrowserWindow, dialog, nativeTheme, session, shell } from 'electron';
import { join } from 'node:path';
import { canOpenExternal, LOCAL_ORIGIN, navigationAction } from './navigation.js';

let mainWindow: BrowserWindow | undefined;

function openInBrowser(url: string): void {
  void shell.openExternal(url).catch(() => {
    dialog.showErrorBox('Could not open your browser', 'Playlist Porter could not open your default browser. Set a default browser in your operating-system settings, then select Connect again.');
  });
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
    if (canOpenExternal(url)) openInBrowser(url);
    return { action: 'deny' };
  });
  const handleNavigation = (event: Electron.Event, url: string) => {
    const action = navigationAction(url);
    if (action === 'allow') return;
    event.preventDefault();
    if (action === 'external') openInBrowser(url);
  };
  mainWindow.webContents.on('will-navigate', handleNavigation);
  mainWindow.webContents.on('will-redirect', handleNavigation);
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
  }).catch((error: unknown) => {
    const addressInUse = error instanceof Error && 'code' in error && error.code === 'EADDRINUSE';
    dialog.showErrorBox('Playlist Porter could not start', addressInUse
      ? 'Local port 8787 is already in use. Close other Playlist Porter instances or the app using that port, then reopen Playlist Porter.'
      : 'The local application could not start. Check that Playlist Porter has permission to use its application data folder, then reopen it.');
    app.quit();
  });
}

app.on('window-all-closed', () => app.quit());
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) void createWindow(); });
