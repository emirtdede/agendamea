const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('agendameaWindow', {
  isWindowsStore: Boolean(process.windowsStore),
  minimize: () => ipcRenderer.invoke('window:minimize'),
  toggleMaximize: () => ipcRenderer.invoke('window:toggle-maximize'),
  isMaximized: () => ipcRenderer.invoke('window:is-maximized'),
  close: () => ipcRenderer.invoke('window:close'),
  onMaximizedChange: (callback) => {
    const listener = (_event, state) => callback(Boolean(state));
    ipcRenderer.on('window:maximized-changed', listener);
    return () => ipcRenderer.removeListener('window:maximized-changed', listener);
  },
  checkForUpdates: () => ipcRenderer.invoke('updater:check'),
  downloadAndInstallUpdate: (url) => ipcRenderer.invoke('updater:download-and-install', url),
  openOneDriveFolder: (folderPath) => ipcRenderer.invoke('onedrive:open-folder', folderPath),
  onUpdateProgress: (callback) => {
    const listener = (_event, percent) => callback(Number(percent) || 0);
    ipcRenderer.on('updater:progress', listener);
    return () => ipcRenderer.removeListener('updater:progress', listener);
  },
});
