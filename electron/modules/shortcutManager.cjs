'use strict';

const { execFile } = require('node:child_process');

function createShortcutAndStartupManager({
  app,
  globalShortcut,
  getMainWindow,
  getActivePort,
  showAndFocusMainWindow,
  ensureVoiceOverlayManager,
}) {
  let activeLaunchAtStartup = false;
  let activeLaunchMinimizedToTray = false;
  let activeGlobalQuickAdd = true;
  let activeGlobalQuickAddKey = 'CommandOrControl+Alt+N';
  let activeQuickAddRegistered = true;
  let activeVoiceShortcutEnabled = true;
  let activeVoiceShortcut = 'CommandOrControl+Alt+Space';
  let activeVoiceRegistered = true;

  function applyLoginItemSetting(enabled, minimizedToTray) {
    activeLaunchAtStartup = Boolean(enabled);
    if (typeof minimizedToTray === 'boolean') {
      activeLaunchMinimizedToTray = minimizedToTray;
    }
    try {
      if (process.platform === 'win32' && typeof app.setLoginItemSettings === 'function') {
        app.setLoginItemSettings({
          openAtLogin: activeLaunchAtStartup,
          path: process.execPath,
          args: activeLaunchMinimizedToTray ? ['--tray'] : [],
        });
      }
      if (process.platform === 'win32' && !process.windowsStore && !activeLaunchAtStartup) {
        try {
          const child = execFile(
            'reg.exe',
            [
              'delete',
              'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run',
              '/v',
              'Agendamea',
              '/f',
            ],
            { windowsHide: true, timeout: 3000 },
            () => {
              // Ignore reg.exe exit code when value is already absent
            },
          );
          child.unref?.();
        } catch {
          // Ignore if registry value does not exist
        }
      }
    } catch {
      // Ignore unsupported portable / dev environments
    }
    return activeLaunchAtStartup;
  }

  function syncGlobalQuickAddShortcut(enabled, nextKey) {
    const prevKey = activeGlobalQuickAddKey;
    if (enabled !== undefined) {
      activeGlobalQuickAdd = Boolean(enabled);
    }
    if (typeof nextKey === 'string' && nextKey.trim()) {
      activeGlobalQuickAddKey = nextKey.trim();
    }
    let registered = true;
    try {
      if (prevKey) globalShortcut.unregister(prevKey);
      if (activeGlobalQuickAddKey && activeGlobalQuickAddKey !== prevKey) {
        globalShortcut.unregister(activeGlobalQuickAddKey);
      }
      if (activeGlobalQuickAdd && activeGlobalQuickAddKey) {
        registered = Boolean(
          globalShortcut.register(activeGlobalQuickAddKey, () => {
            showAndFocusMainWindow();
            const win = getMainWindow();
            if (win && !win.isDestroyed()) {
              win.webContents.send('app:focus-quick-add');
            }
          }),
        );
      }
    } catch {
      registered = false;
    }
    activeQuickAddRegistered = activeGlobalQuickAdd ? registered : true;
    return {
      registered: activeQuickAddRegistered,
      enabled: activeGlobalQuickAdd,
      key: activeGlobalQuickAddKey,
    };
  }

  function syncVoiceDictationShortcut(nextShortcut, enabled) {
    const prev = activeVoiceShortcut;
    if (typeof enabled === 'boolean') {
      activeVoiceShortcutEnabled = enabled;
    }
    const target =
      typeof nextShortcut === 'string' && nextShortcut.trim()
        ? nextShortcut.trim()
        : activeVoiceShortcut || 'CommandOrControl+Alt+Space';
    try {
      if (prev) globalShortcut.unregister(prev);
      if (target && target !== prev) globalShortcut.unregister(target);
    } catch {
      // Ignore previous unregister error
    }
    activeVoiceShortcut = target;
    let registered = true;
    if (activeVoiceShortcutEnabled && activeVoiceShortcut) {
      try {
        registered = Boolean(
          globalShortcut.register(activeVoiceShortcut, () => {
            const port = getActivePort();
            if (port) {
              void ensureVoiceOverlayManager().toggle(port);
            }
          }),
        );
      } catch {
        registered = false;
      }
    }
    activeVoiceRegistered = activeVoiceShortcutEnabled ? registered : true;
    return {
      registered: activeVoiceRegistered,
      enabled: activeVoiceShortcutEnabled,
      shortcut: activeVoiceShortcut,
    };
  }

  return {
    getState: () => ({
      launchAtStartup: activeLaunchAtStartup,
      launchMinimizedToTray: activeLaunchMinimizedToTray,
      globalQuickAdd: activeGlobalQuickAdd,
      globalQuickAddKey: activeGlobalQuickAddKey,
      voiceShortcutEnabled: activeVoiceShortcutEnabled,
      voiceShortcut: activeVoiceShortcut,
    }),
    getRegistrationStatus: () => ({
      quickAddEnabled: activeGlobalQuickAdd,
      quickAddKey: activeGlobalQuickAddKey,
      quickAddRegistered: activeQuickAddRegistered,
      voiceEnabled: activeVoiceShortcutEnabled,
      voiceShortcut: activeVoiceShortcut,
      voiceRegistered: activeVoiceRegistered,
    }),
    hydrateState: (prefs) => {
      activeLaunchAtStartup = Boolean(prefs.launchAtStartup);
      activeLaunchMinimizedToTray = Boolean(prefs.launchMinimizedToTray);
      activeGlobalQuickAdd = prefs.globalQuickAdd !== false;
      activeGlobalQuickAddKey = prefs.globalQuickAddKey || 'CommandOrControl+Alt+N';
      activeVoiceShortcutEnabled = prefs.voiceShortcutEnabled !== false;
      activeVoiceShortcut = prefs.voiceShortcut || 'CommandOrControl+Alt+Space';
    },
    applyLoginItemSetting,
    syncGlobalQuickAddShortcut,
    syncVoiceDictationShortcut,
  };
}

module.exports = {
  createShortcutAndStartupManager,
};
