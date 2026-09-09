import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { spawn, ChildProcess } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindow | null = null;
let backendProcess: ChildProcess | null = null;

const dbFilePath = path.join(app.getPath('userData'), 'aura_music.sqlite');

function startBackend() {
  const backendScript = path.join(__dirname, '../backend/server.py');
  try {
    backendProcess = spawn('python', [backendScript, '47823'], {
      stdio: 'ignore',
      detached: false,
      windowsHide: true
    });
    backendProcess.on('error', (err) => {
      console.warn('Failed to start python backend service:', err);
    });
  } catch (err) {
    console.warn('Failed to spawn python process:', err);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 1024,
    minHeight: 700,
    frame: false, // Sleek frameless desktop experience
    backgroundColor: '#07080c',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false // allow streaming audio from varied YouTube/CDN endpoints
    },
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';
  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

  if (isDev) {
    mainWindow.loadURL(devServerUrl);
    // mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Window Management IPC
ipcMain.on('window-minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on('window-maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.on('window-close', () => {
  if (mainWindow) mainWindow.close();
});

ipcMain.handle('get-app-version', () => app.getVersion());

// SQLite Persistence IPC
ipcMain.handle('db-save', async (_event, data: Uint8Array) => {
  try {
    await fs.promises.writeFile(dbFilePath, Buffer.from(data));
    return true;
  } catch (err) {
    console.error('Failed to save SQLite DB to disk:', err);
    return false;
  }
});

ipcMain.handle('db-load', async () => {
  try {
    if (fs.existsSync(dbFilePath)) {
      const buffer = await fs.promises.readFile(dbFilePath);
      return new Uint8Array(buffer);
    }
    return null;
  } catch (err) {
    console.error('Failed to load SQLite DB from disk:', err);
    return null;
  }
});

// YouTube Music In-App Login Handler
ipcMain.handle('yt-music-login', async () => {
  return new Promise<{ success: boolean; cookieString?: string; accountName?: string; error?: string }>((resolve) => {
    let isResolved = false;
    let loginWin: BrowserWindow | null = new BrowserWindow({
      width: 560,
      height: 740,
      parent: mainWindow || undefined,
      modal: true,
      title: 'Đăng nhập YouTube Music - Aura Music',
      autoHideMenuBar: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      }
    });

    loginWin.loadURL('https://music.youtube.com');

    const checkCookies = async () => {
      try {
        if (!loginWin || isResolved) return;
        const currentUrl = loginWin.webContents.getURL();
        if (currentUrl.includes('music.youtube.com')) {
          const cookies = await loginWin.webContents.session.cookies.get({ url: 'https://music.youtube.com' });
          const ytCookies = await loginWin.webContents.session.cookies.get({ domain: '.youtube.com' });
          
          const cookieMap = new Map<string, string>();
          for (const c of [...cookies, ...ytCookies]) {
            cookieMap.set(c.name, c.value);
          }

          const hasAuth = 
            cookieMap.has('SAPISID') || 
            cookieMap.has('__Secure-3PAPISID') || 
            cookieMap.has('__Secure-1PAPISID') ||
            cookieMap.has('SSID') ||
            cookieMap.has('SID');

          if (hasAuth) {
            const cookieStr = Array.from(cookieMap.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
            let accountName = 'YouTube Music User';
            try {
              const jsName = await loginWin.webContents.executeJavaScript(`
                (function() {
                  try {
                    var avatar = document.querySelector('ytmusic-app-header #avatar-btn img, button#avatar-btn img');
                    if (avatar && avatar.getAttribute('alt')) return avatar.getAttribute('alt');
                    var btn = document.querySelector('ytmusic-settings-button button');
                    if (btn && btn.getAttribute('aria-label')) {
                      var l = btn.getAttribute('aria-label');
                      if (!l.includes('Cài đặt') && !l.includes('Settings')) return l;
                    }
                  } catch (e) {}
                  return '';
                })()
              `);
              if (jsName && jsName.trim()) {
                accountName = jsName.trim();
              }
            } catch {}

            isResolved = true;
            const winToClose = loginWin;
            loginWin = null;
            try { winToClose.close(); } catch {}
            resolve({ success: true, cookieString: cookieStr, accountName });
            return;
          }
        }
      } catch (err: any) {
        console.warn('Cookie inspection warning:', err);
      }
    };

    loginWin.webContents.on('did-finish-load', checkCookies);
    loginWin.webContents.on('did-navigate', checkCookies);
    loginWin.webContents.on('did-navigate-in-page', checkCookies);

    // Periodic check every 1.5s while window is open
    const interval = setInterval(async () => {
      if (isResolved || !loginWin) {
        clearInterval(interval);
        return;
      }
      await checkCookies();
    }, 1500);

    loginWin.on('closed', () => {
      clearInterval(interval);
      if (!isResolved) {
        isResolved = true;
        loginWin = null;
        resolve({ success: false, error: 'Cửa sổ đăng nhập đã được đóng.' });
      }
    });
  });
});

app.whenReady().then(() => {
  startBackend();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('will-quit', () => {
  if (backendProcess) {
    try {
      backendProcess.kill();
    } catch {
      // ignore
    }
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
