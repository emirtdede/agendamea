'use strict';

const { execFile } = require('node:child_process');

const DEFAULT_QUICK_ADD_KEY = 'CommandOrControl+Alt+N';
const DEFAULT_VOICE_KEY = 'CommandOrControl+Alt+D';
const LEGACY_VOICE_KEY = 'CommandOrControl+Alt+Space';

const QUICK_ADD_FALLBACK_CANDIDATES = [
  'CommandOrControl+Alt+N',
  'CommandOrControl+Shift+Alt+N',
  'CommandOrControl+Alt+Shift+T',
  'CommandOrControl+Alt+T',
];

const VOICE_FALLBACK_CANDIDATES = [
  'CommandOrControl+Alt+D',
  'CommandOrControl+Shift+Alt+D',
  'CommandOrControl+Shift+Alt+V',
  'CommandOrControl+Alt+Shift+M',
  'CommandOrControl+Alt+V',
];

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
  let activeGlobalQuickAddKey = DEFAULT_QUICK_ADD_KEY;
  let activeQuickAddRegistered = true;
  let activeVoiceShortcutEnabled = true;
  let activeVoiceShortcut = DEFAULT_VOICE_KEY;
  let activeVoiceRegistered = true;

  function applyLoginItemSetting(enabled, minimizedToTray) {
    activeLaunchAtStartup = Boolean(enabled);
    if (typeof minimizedToTray === 'boolean') {
      activeLaunchMinimizedToTray = minimizedToTray;
    }
    try {
      if (process.platform === 'win32' && process.windowsStore) {
        // MSIX packages manage startup via the declared windows.startupTask (TaskId="AgendameaStartup")
        const actionCmd = activeLaunchAtStartup
          ? '$op2 = $task.RequestEnableAsync(); $null = $asTask.MakeGenericMethod([Windows.ApplicationModel.StartupTaskState]).Invoke($null, @($op2)).GetAwaiter().GetResult()'
          : '$task.Disable()';
        const psScript = [
          'Add-Type -AssemblyName System.Runtime.WindowsRuntime',
          "$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]",
          '$null = [Windows.ApplicationModel.StartupTask, Windows.ApplicationModel, ContentType=WindowsRuntime]',
          "$op = [Windows.ApplicationModel.StartupTask]::GetAsync('AgendameaStartup')",
          '$task = $asTask.MakeGenericMethod([Windows.ApplicationModel.StartupTask]).Invoke($null, @($op)).GetAwaiter().GetResult()',
          `if ($task) { ${actionCmd} }`,
        ].join('; ');
        try {
          const child = execFile(
            'powershell.exe',
            ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', psScript],
            { windowsHide: true, timeout: 4000 },
            () => {
              // Best-effort MSIX StartupTask synchronization
            },
          );
          child.unref?.();
        } catch {
          // Ignore if WinRT StartupTask API is unavailable
        }
        return activeLaunchAtStartup;
      }
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

  function registerQuickAddKey(key) {
    return Boolean(
      globalShortcut.register(key, () => {
        showAndFocusMainWindow();
        const win = getMainWindow();
        if (win && !win.isDestroyed()) {
          win.webContents.send('app:focus-quick-add');
        }
      }),
    );
  }

  function registerVoiceKey(key) {
    return Boolean(
      globalShortcut.register(key, () => {
        const port = getActivePort();
        if (port) {
          void ensureVoiceOverlayManager().toggle(port);
        }
      }),
    );
  }

  function syncGlobalQuickAddShortcut(enabled, nextKey, options = {}) {
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
        registered = registerQuickAddKey(activeGlobalQuickAddKey);
        if (
          !registered &&
          options.autoFallback &&
          activeGlobalQuickAddKey === DEFAULT_QUICK_ADD_KEY
        ) {
          for (const candidate of QUICK_ADD_FALLBACK_CANDIDATES) {
            if (
              candidate === activeGlobalQuickAddKey ||
              candidate.toLowerCase() === activeVoiceShortcut.toLowerCase()
            ) {
              continue;
            }
            if (registerQuickAddKey(candidate)) {
              activeGlobalQuickAddKey = candidate;
              registered = true;
              break;
            }
          }
        }
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

  function syncVoiceDictationShortcut(nextShortcut, enabled, options = {}) {
    const prev = activeVoiceShortcut;
    if (typeof enabled === 'boolean') {
      activeVoiceShortcutEnabled = enabled;
    }
    const target =
      typeof nextShortcut === 'string' && nextShortcut.trim()
        ? nextShortcut.trim()
        : activeVoiceShortcut || DEFAULT_VOICE_KEY;
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
        registered = registerVoiceKey(activeVoiceShortcut);
        const allowFallback =
          options.autoFallback &&
          (activeVoiceShortcut === DEFAULT_VOICE_KEY || activeVoiceShortcut === LEGACY_VOICE_KEY);
        if (!registered && allowFallback) {
          for (const candidate of VOICE_FALLBACK_CANDIDATES) {
            if (
              candidate === activeVoiceShortcut ||
              candidate.toLowerCase() === activeGlobalQuickAddKey.toLowerCase()
            ) {
              continue;
            }
            if (registerVoiceKey(candidate)) {
              activeVoiceShortcut = candidate;
              registered = true;
              break;
            }
          }
        }
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

  function getRegistrationStatus() {
    // Re-probe any currently blocked global shortcut so closing a conflicting app recovers immediately
    if (activeGlobalQuickAdd && !activeQuickAddRegistered && activeGlobalQuickAddKey) {
      try {
        if (registerQuickAddKey(activeGlobalQuickAddKey)) {
          activeQuickAddRegistered = true;
        }
      } catch {
        // Still unavailable
      }
    }
    if (activeVoiceShortcutEnabled && !activeVoiceRegistered && activeVoiceShortcut) {
      try {
        if (registerVoiceKey(activeVoiceShortcut)) {
          activeVoiceRegistered = true;
        }
      } catch {
        // Still unavailable
      }
    }
    return {
      quickAddEnabled: activeGlobalQuickAdd,
      quickAddKey: activeGlobalQuickAddKey,
      quickAddRegistered: activeQuickAddRegistered,
      voiceEnabled: activeVoiceShortcutEnabled,
      voiceShortcut: activeVoiceShortcut,
      voiceRegistered: activeVoiceRegistered,
    };
  }

  function autoResolveBlockedShortcuts() {
    let resolvedAny = false;
    if (activeGlobalQuickAdd && !activeQuickAddRegistered) {
      // First retry current key; if still blocked, pick first free fallback
      try {
        if (activeGlobalQuickAddKey && registerQuickAddKey(activeGlobalQuickAddKey)) {
          activeQuickAddRegistered = true;
          resolvedAny = true;
        } else {
          for (const candidate of QUICK_ADD_FALLBACK_CANDIDATES) {
            if (candidate.toLowerCase() === activeVoiceShortcut.toLowerCase()) continue;
            if (registerQuickAddKey(candidate)) {
              activeGlobalQuickAddKey = candidate;
              activeQuickAddRegistered = true;
              resolvedAny = true;
              break;
            }
          }
        }
      } catch {
        // Keep blocked state
      }
    }
    if (activeVoiceShortcutEnabled && !activeVoiceRegistered) {
      try {
        if (activeVoiceShortcut && registerVoiceKey(activeVoiceShortcut)) {
          activeVoiceRegistered = true;
          resolvedAny = true;
        } else {
          for (const candidate of VOICE_FALLBACK_CANDIDATES) {
            if (candidate.toLowerCase() === activeGlobalQuickAddKey.toLowerCase()) continue;
            if (registerVoiceKey(candidate)) {
              activeVoiceShortcut = candidate;
              activeVoiceRegistered = true;
              resolvedAny = true;
              break;
            }
          }
        }
      } catch {
        // Keep blocked state
      }
    }
    return {
      ok: activeQuickAddRegistered && activeVoiceRegistered,
      resolvedAny,
      ...getRegistrationStatus(),
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
    getRegistrationStatus,
    autoResolveBlockedShortcuts,
    hydrateState: (prefs) => {
      activeLaunchAtStartup = Boolean(prefs.launchAtStartup);
      activeLaunchMinimizedToTray = Boolean(prefs.launchMinimizedToTray);
      activeGlobalQuickAdd = prefs.globalQuickAdd !== false;
      activeGlobalQuickAddKey = prefs.globalQuickAddKey || DEFAULT_QUICK_ADD_KEY;
      activeVoiceShortcutEnabled = prefs.voiceShortcutEnabled !== false;
      activeVoiceShortcut = prefs.voiceShortcut || DEFAULT_VOICE_KEY;
    },
    applyLoginItemSetting,
    syncGlobalQuickAddShortcut,
    syncVoiceDictationShortcut,
  };
}

module.exports = {
  createShortcutAndStartupManager,
};
