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
  onNavigateSmartView: (callback) => {
    const listener = (_event, viewId) => callback(String(viewId));
    ipcRenderer.on('app:navigate-smart-view', listener);
    return () => ipcRenderer.removeListener('app:navigate-smart-view', listener);
  },
  setCloseBehavior: (behavior) => ipcRenderer.invoke('window:set-close-behavior', behavior),
  performCloseAction: (action) => ipcRenderer.invoke('window:perform-close-action', action),
  setLaunchAtStartup: (enabled, minimizedToTray) =>
    ipcRenderer.invoke('startup:set-login-item', Boolean(enabled), minimizedToTray),
  setGlobalQuickAddShortcut: (enabled) =>
    ipcRenderer.invoke('shortcut:set-global-quick-add', Boolean(enabled)),
  setGlobalQuickAddShortcutKey: (shortcut) =>
    ipcRenderer.invoke('shortcut:set-global-quick-add-key', String(shortcut || '')),
  getShortcutStatus: () => ipcRenderer.invoke('shortcut:get-status'),
  showDesktopNotification: (payload) => ipcRenderer.invoke('notification:show', payload || {}),
  onFocusTodo: (callback) => {
    const listener = (_event, todoId) => callback(String(todoId || ''));
    ipcRenderer.on('app:focus-todo', listener);
    return () => ipcRenderer.removeListener('app:focus-todo', listener);
  },
  getDiagnostics: () => ipcRenderer.invoke('app:get-diagnostics'),
  openDataFolder: () => ipcRenderer.invoke('app:open-data-folder'),
  openLogsFolder: () => ipcRenderer.invoke('app:open-logs-folder'),
  openModelsFolder: () => ipcRenderer.invoke('app:open-models-folder'),
  openFileLocation: (targetPath) =>
    ipcRenderer.invoke('app:open-file-location', String(targetPath || '')),
  openWindowsNotificationSettings: () => ipcRenderer.invoke('app:open-windows-notifications'),
  openMicrosoftStorePage: () => ipcRenderer.invoke('app:open-microsoft-store'),
  runCliDry: (commandName) => ipcRenderer.invoke('app:run-cli-dry', String(commandName || '')),
  installCliShims: () => ipcRenderer.invoke('cli:install-shims'),
  openCliTerminal: () => ipcRenderer.invoke('cli:open-terminal'),
  listMcpClients: () => ipcRenderer.invoke('mcp:list-clients'),
  installMcpClient: (clientId) => ipcRenderer.invoke('mcp:install-client', String(clientId || '')),
  uninstallMcpClient: (clientId) =>
    ipcRenderer.invoke('mcp:uninstall-client', String(clientId || '')),
  testMcpServer: () => ipcRenderer.invoke('mcp:test-server'),
  updateTrayLabels: (labels) => ipcRenderer.invoke('tray:update-labels', labels),
  applyAppIcon: (payload) => ipcRenderer.invoke('icon:apply', payload),
  setZoomFactor: (factor) => ipcRenderer.invoke('window:set-zoom', factor),
  getInitialLocale: () => ipcRenderer.invoke('app:get-initial-locale'),
  checkForUpdates: () => ipcRenderer.invoke('updater:check'),
  downloadAndInstallUpdate: (url) => ipcRenderer.invoke('updater:download-and-install', url),
  cancelUpdateDownload: () => ipcRenderer.invoke('updater:cancel-download'),
  quitAndInstallUpdate: () => ipcRenderer.invoke('updater:quit-and-install'),
  pickCloudSyncFolder: () => ipcRenderer.invoke('onedrive:pick-folder'),
  openOneDriveFolder: (folderPath) => ipcRenderer.invoke('onedrive:open-folder', folderPath),
  onUpdateProgress: (callback) => {
    const listener = (_event, percent) => callback(Number(percent) || 0);
    ipcRenderer.on('updater:progress', listener);
    return () => ipcRenderer.removeListener('updater:progress', listener);
  },
  onUpdateDownloaded: (callback) => {
    const listener = (_event, info) => callback({ version: String(info?.version || '') });
    ipcRenderer.on('updater:downloaded', listener);
    return () => ipcRenderer.removeListener('updater:downloaded', listener);
  },
  onUpdateError: (callback) => {
    const listener = (_event, message) => callback(String(message || ''));
    ipcRenderer.on('updater:error', listener);
    return () => ipcRenderer.removeListener('updater:error', listener);
  },
  // v1.1.0 Taskbar Voice Dictation Overlay & Shortcut Controls
  setVoiceShortcut: (shortcut) => ipcRenderer.invoke('voice:set-shortcut', String(shortcut || '')),
  setVoiceShortcutEnabled: (enabled) =>
    ipcRenderer.invoke('voice:set-shortcut-enabled', Boolean(enabled)),
  toggleVoiceOverlay: () => ipcRenderer.invoke('voice:toggle-overlay'),
  hideVoiceOverlay: () => ipcRenderer.invoke('voice:hide-overlay'),
  setOverlayFocusable: (focusable) => ipcRenderer.invoke('voice:set-focusable', Boolean(focusable)),
  notifyOverlayListening: (listening) =>
    ipcRenderer.invoke('voice:set-listening', Boolean(listening)),
  notifyOverlayReady: () => ipcRenderer.send('overlay:ready'),
  getOverlayBounds: () => ipcRenderer.invoke('voice:get-overlay-bounds'),
  openWindowsSpeechSettings: () => ipcRenderer.invoke('voice:open-speech-settings'),
  onOverlayCommand: (callback) => {
    const listener = (_event, payload) => callback(payload || {});
    ipcRenderer.on('overlay:command', listener);
    return () => ipcRenderer.removeListener('overlay:command', listener);
  },
});
