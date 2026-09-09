import { contextBridge, ipcRenderer } from 'electron';

export interface ElectronAPI {
  minimizeWindow: () => void;
  maximizeWindow: () => void;
  closeWindow: () => void;
  getAppVersion: () => Promise<string>;
  saveDatabaseBinary: (buffer: Uint8Array) => Promise<boolean>;
  loadDatabaseBinary: () => Promise<Uint8Array | null>;
  loginYouTubeMusic: () => Promise<{ success: boolean; cookieString?: string; error?: string }>;
}

const electronAPI: ElectronAPI = {
  minimizeWindow: () => ipcRenderer.send('window-minimize'),
  maximizeWindow: () => ipcRenderer.send('window-maximize'),
  closeWindow: () => ipcRenderer.send('window-close'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  saveDatabaseBinary: (buffer: Uint8Array) => ipcRenderer.invoke('db-save', buffer),
  loadDatabaseBinary: () => ipcRenderer.invoke('db-load'),
  loginYouTubeMusic: () => ipcRenderer.invoke('yt-music-login'),
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
