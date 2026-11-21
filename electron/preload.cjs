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
  onCloseRequested: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('window:close-requested', listener);
    return () => ipcRenderer.removeListener('window:close-requested', listener);
  },
  onFocusQuickAdd: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('app:focus-quick-add', listener);
    return () => ipcRenderer.removeListener('app:focus-quick-add', listener);
  },
  setCloseBehavior: (behavior) => ipcRenderer.invoke('window:set-close-behavior', behavior),
  performCloseAction: (action) => ipcRenderer.invoke('window:perform-close-action', action),
  updateTrayLabels: (labels) => ipcRenderer.invoke('tray:update-labels', labels),
  applyAppIcon: (payload) => ipcRenderer.invoke('icon:apply', payload),
  setZoomFactor: (factor) => ipcRenderer.invoke('window:set-zoom', factor),
  getInitialLocale: () => ipcRenderer.invoke('app:get-initial-locale'),
  checkForUpdates: () => ipcRenderer.invoke('updater:check'),
  downloadAndInstallUpdate: (url) => ipcRenderer.invoke('updater:download-and-install', url),
  openOneDriveFolder: (folderPath) => ipcRenderer.invoke('onedrive:open-folder', folderPath),
  onUpdateProgress: (callback) => {
    const listener = (_event, percent) => callback(Number(percent) || 0);
    ipcRenderer.on('updater:progress', listener);
    return () => ipcRenderer.removeListener('updater:progress', listener);
  },
});
