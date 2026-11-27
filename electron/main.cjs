'use strict';

const {
  app,
  BrowserWindow,
  dialog,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  nativeTheme,
  Notification,
  session,
  shell,
  Tray,
} = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { createBackendManager } = require('./modules/backendProcess.cjs');
const { registerCoreIpcHandlers } = require('./modules/ipcHandlers.cjs');
const { registerUpdaterIpcHandlers } = require('./modules/updater.cjs');
const { createTrayAndShellManager } = require('./modules/trayAndJumpList.cjs');
const { createShortcutAndStartupManager } = require('./modules/shortcutManager.cjs');
const { createMainWindow } = require('./modules/windowFactory.cjs');

const APP_USER_MODEL_ID = 'dev.vellium.agendamea';
let _loggerMod = null;
let _crashDiagnostics = null;
let _voiceOverlayMod = null;

function getLoggerMod() {
  if (!_loggerMod) _loggerMod = require('../shared/logger.cjs');
  return _loggerMod;
}

function getCrashDiagnostics() {
  if (!_crashDiagnostics) _crashDiagnostics = require('../shared/crashDiagnostics.cjs');
  return _crashDiagnostics;
}

if (process.env.AGENDAMEA_DATA_DIR && String(process.env.AGENDAMEA_DATA_DIR).trim()) {
  const customDataDir = path.resolve(String(process.env.AGENDAMEA_DATA_DIR).trim());
  try {
    fs.mkdirSync(customDataDir, { recursive: true });
    app.setPath('userData', customDataDir);
  } catch {
    // Keep default userData if custom path cannot be initialized
  }
}

let mainLogger = null;
function getMainLogger() {
  if (!mainLogger) {
    let dataDir;
    try {
      dataDir = app.getPath('userData');
    } catch {
      dataDir = undefined;
    }
    mainLogger = getLoggerMod().getAppLogger('main', dataDir);
  }
  return mainLogger;
}

process.on('uncaughtException', (err) => {
  try {
    getMainLogger().error({ err }, 'Uncaught Electron main exception');
    getCrashDiagnostics().writeCrashReport({
      source: 'electron-main-uncaught',
      error: err,
      dataDir: app.getPath('userData'),
    });
  } catch {
    // Ignore secondary crash handler failure
  }
});

process.on('unhandledRejection', (reason) => {
  try {
    getMainLogger().error({ err: reason }, 'Unhandled Electron main rejection');
    getCrashDiagnostics().writeCrashReport({
      source: 'electron-main-rejection',
      error: reason,
      dataDir: app.getPath('userData'),
    });
  } catch {
    // Ignore secondary crash handler failure
  }
});

const PKG_VERSION = (() => {
  try {
    return String(require('../package.json')?.version || '1.1.0');
  } catch {
    return '1.1.0';
  }
})();

if (process.platform === 'win32' && !process.windowsStore) {
  app.setAppUserModelId(APP_USER_MODEL_ID);
}

let mainWindow = null;
let isQuitting = false;
let activeCloseBehavior = 'ask';
let activeThemeMode = 'light';
let voiceOverlayManager = null;
let consumedInstallerLocale;

function readWindowPrefs(userDataDir) {
  try {
    const prefsPath = path.join(userDataDir, 'window-prefs.json');
    if (fs.existsSync(prefsPath)) {
      const parsed = JSON.parse(fs.readFileSync(prefsPath, 'utf8'));
      const closeBehavior =
        parsed &&
        (parsed.closeBehavior === 'ask' ||
          parsed.closeBehavior === 'tray' ||
          parsed.closeBehavior === 'quit')
          ? parsed.closeBehavior
          : 'ask';
      const themeMode =
        parsed &&
        (parsed.themeMode === 'dark' ||
          parsed.themeMode === 'light' ||
          parsed.themeMode === 'system')
          ? parsed.themeMode
          : 'light';
      return {
        closeBehavior,
        themeMode,
        launchAtStartup: Boolean(parsed?.launchAtStartup),
        launchMinimizedToTray: Boolean(parsed?.launchMinimizedToTray),
        globalQuickAdd: parsed?.globalQuickAdd !== false,
        globalQuickAddKey:
          typeof parsed?.globalQuickAddKey === 'string' && parsed.globalQuickAddKey.trim()
            ? parsed.globalQuickAddKey.trim()
            : 'CommandOrControl+Alt+N',
        voiceShortcutEnabled: parsed?.voiceShortcutEnabled !== false,
        voiceShortcut:
          typeof parsed?.voiceShortcut === 'string' && parsed.voiceShortcut.trim()
            ? parsed.voiceShortcut.trim()
            : 'CommandOrControl+Alt+D',
      };
    }
  } catch {
    // Ignore corrupted prefs file
  }
  return {
    closeBehavior: 'ask',
    themeMode: 'light',
    launchAtStartup: false,
    launchMinimizedToTray: false,
    globalQuickAdd: true,
    globalQuickAddKey: 'CommandOrControl+Alt+N',
    voiceShortcutEnabled: true,
    voiceShortcut: 'CommandOrControl+Alt+D',
  };
}

function resolveWindowBackgroundColor() {
  if (activeThemeMode === 'dark') return '#09090b';
  if (activeThemeMode === 'system' && nativeTheme?.shouldUseDarkColors) return '#09090b';
  return '#fafafa';
}

function readInstallerSelectedLocale(userDataDir) {
  if (consumedInstallerLocale !== undefined) return consumedInstallerLocale;
  try {
    const markerPath = path.join(userDataDir, 'installer-language.txt');
    if (fs.existsSync(markerPath)) {
      const raw = fs
        .readFileSync(markerPath, 'utf8')
        .replace(/^\uFEFF/, '')
        .trim();
      try {
        fs.unlinkSync(markerPath);
      } catch {
        // Ignore cleanup failure
      }
      consumedInstallerLocale = raw || null;
      return consumedInstallerLocale;
    }
  } catch {
    // Ignore missing installer marker
  }
  consumedInstallerLocale = null;
  return null;
}

function getInitialLocaleInfo() {
  const userDataDir = app.getPath('userData');
  const installerLocale = readInstallerSelectedLocale(userDataDir);
  const osLocale = typeof app.getLocale === 'function' ? app.getLocale() : 'en';
  return {
    installerLocale,
    osLocale,
    preferred: installerLocale || osLocale || 'en',
  };
}

const backend = createBackendManager({
  app,
  electronDir: __dirname,
  getInitialLocaleInfo,
  isQuitting: () => isQuitting,
});

function showAndFocusMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (!mainWindow.isVisible()) mainWindow.show();
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
}

function ensureVoiceOverlayManager() {
  if (!voiceOverlayManager) {
    if (!_voiceOverlayMod) _voiceOverlayMod = require('./voiceOverlay.cjs');
    voiceOverlayManager = new _voiceOverlayMod.VoiceOverlayManager({
      preloadPath: path.join(__dirname, 'preload.cjs'),
      onBlockedByLock: showAndFocusMainWindow,
      onVoiceActivity: () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('window:voice-activity');
        }
      },
    });
  }
  return voiceOverlayManager;
}

function teardownAppResources() {
  isQuitting = true;
  if (voiceOverlayManager) {
    voiceOverlayManager.destroy();
    voiceOverlayManager = null;
  }
  trayShell.destroyTray();
  backend.stopBackend();
}

function performFullQuit() {
  teardownAppResources();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.destroy();
    mainWindow = null;
  }
  app.quit();
}

function performAppRelaunch() {
  try {
    app.releaseSingleInstanceLock();
  } catch {
    // Ignore lock release failure
  }
  try {
    const cleanArgs = process.argv
      .slice(1)
      .filter((arg) => arg !== '--minimized' && arg !== '--tray' && arg !== '--hidden');
    app.relaunch({ args: cleanArgs });
  } catch {
    try {
      app.relaunch();
    } catch {
      // Ignore relaunch failure
    }
  }
  teardownAppResources();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.destroy();
    mainWindow = null;
  }
  app.exit(0);
}

const trayShell = createTrayAndShellManager({
  app,
  Menu,
  nativeImage,
  shell,
  Tray,
  electronDir: __dirname,
  getMainWindow: () => mainWindow,
  getActivePort: () => backend.getActivePort(),
  getRuntimeRoot: () => backend.getRuntimeRoot(),
  showAndFocusMainWindow,
  ensureVoiceOverlayManager,
  performFullQuit,
});

const shortcuts = createShortcutAndStartupManager({
  app,
  globalShortcut,
  getMainWindow: () => mainWindow,
  getActivePort: () => backend.getActivePort(),
  showAndFocusMainWindow,
  ensureVoiceOverlayManager,
});

function saveWindowPrefs(userDataDir) {
  try {
    fs.mkdirSync(userDataDir, { recursive: true });
    const st = shortcuts.getState();
    fs.writeFileSync(
      path.join(userDataDir, 'window-prefs.json'),
      JSON.stringify({ closeBehavior: activeCloseBehavior, themeMode: activeThemeMode, ...st }),
      'utf8',
    );
  } catch {
    // Ignore write failures
  }
}

function getPortableIdentity() {
  const portableFile =
    typeof process.env.PORTABLE_EXECUTABLE_FILE === 'string' &&
    process.env.PORTABLE_EXECUTABLE_FILE.trim()
      ? path.resolve(process.env.PORTABLE_EXECUTABLE_FILE.trim())
      : '';
  if (!portableFile) {
    return { portableFile: '', portableSize: 0, portableMtimeMs: 0 };
  }
  try {
    const stat = fs.statSync(portableFile);
    return {
      portableFile,
      portableSize: stat.size,
      portableMtimeMs: Math.round(stat.mtimeMs),
    };
  } catch {
    return { portableFile, portableSize: 0, portableMtimeMs: 0 };
  }
}

const CURRENT_PORTABLE_IDENTITY = getPortableIdentity();

async function acquireSingleInstanceLockWithHandoff() {
  const lockPayload = {
    execPath: process.execPath,
    ...CURRENT_PORTABLE_IDENTITY,
  };
  if (app.requestSingleInstanceLock(lockPayload)) return true;
  for (let i = 0; i < 20; i += 1) {
    await new Promise((r) => setTimeout(r, 150));
    if (app.requestSingleInstanceLock(lockPayload)) return true;
  }
  return false;
}

app.on('second-instance', (_event, commandLine, _workingDir, additionalData) => {
  const extraData =
    /** @type {{ execPath?: unknown; portableFile?: unknown; portableSize?: unknown; portableMtimeMs?: unknown } | null | undefined} */ (
      additionalData
    );
  const incomingExecPath =
    (extraData && typeof extraData.execPath === 'string' && extraData.execPath) ||
    (Array.isArray(commandLine) && typeof commandLine[0] === 'string' ? commandLine[0] : '');
  const incomingPortableFile =
    extraData && typeof extraData.portableFile === 'string' ? extraData.portableFile : '';
  const incomingPortableSize = Number(extraData?.portableSize || 0);
  const incomingPortableMtimeMs = Number(extraData?.portableMtimeMs || 0);

  const runtimeRoot = backend.getRuntimeRoot();
  const exeDir = path.dirname(process.execPath);
  const icuPath = path.join(exeDir, 'icudtl.dat');
  const runtimeIntact =
    fs.existsSync(path.join(runtimeRoot, 'dist-server', 'server.mjs')) &&
    fs.existsSync(path.join(runtimeRoot, 'dist', 'voice-worklet.js')) &&
    (!app.isPackaged || fs.existsSync(icuPath));

  const bothSamePortableExe =
    Boolean(CURRENT_PORTABLE_IDENTITY.portableFile && incomingPortableFile) &&
    path.resolve(CURRENT_PORTABLE_IDENTITY.portableFile).toLowerCase() ===
      path.resolve(incomingPortableFile).toLowerCase() &&
    CURRENT_PORTABLE_IDENTITY.portableSize === incomingPortableSize &&
    CURRENT_PORTABLE_IDENTITY.portableMtimeMs === incomingPortableMtimeMs;

  const isDifferentExecutable =
    !bothSamePortableExe &&
    Boolean(incomingExecPath) &&
    path.resolve(incomingExecPath).toLowerCase() !== path.resolve(process.execPath).toLowerCase();

  if (isDifferentExecutable || !runtimeIntact) {
    try {
      app.releaseSingleInstanceLock();
    } catch {
      // Ignore
    }
    performFullQuit();
    return;
  }
  if (!trayShell.dispatchJumpListArgs(commandLine)) {
    showAndFocusMainWindow();
  }
});

function resolveSenderWindow(event) {
  return BrowserWindow.fromWebContents(event.sender) ?? mainWindow;
}

function assertTrustedIpcSender(event) {
  const senderUrl = event?.senderFrame?.url || event?.sender?.getURL?.() || '';
  const port = backend.getActivePort();
  if (!port) {
    throw new Error('UNTRUSTED_IPC_SENDER');
  }
  const allowedOrigin = `http://127.0.0.1:${port}`;
  if (senderUrl !== allowedOrigin && !senderUrl.startsWith(`${allowedOrigin}/`)) {
    throw new Error('UNTRUSTED_IPC_SENDER');
  }
}

registerCoreIpcHandlers({
  app,
  dialog,
  ipcMain,
  nativeImage,
  Notification,
  shell,
  pkgVersion: PKG_VERSION,
  resolveSenderWindow,
  assertTrustedIpcSender,
  getMainWindow: () => mainWindow,
  getActivePort: () => backend.getActivePort(),
  getRuntimeRoot: () => backend.getRuntimeRoot(),
  getTray: trayShell.getTray,
  ensureTray: trayShell.ensureTray,
  buildTrayImage: trayShell.buildTrayImage,
  resolveStartupIcons: trayShell.resolveStartupIcons,
  showAndFocusMainWindow,
  performFullQuit,
  performAppRelaunch,
  setCloseBehavior: (behavior) => {
    if (behavior === 'ask' || behavior === 'tray' || behavior === 'quit') {
      if (activeCloseBehavior === behavior) {
        return { ok: true, closeBehavior: activeCloseBehavior };
      }
      activeCloseBehavior = behavior;
      saveWindowPrefs(app.getPath('userData'));
      return { ok: true, closeBehavior: activeCloseBehavior };
    }
    return { ok: false, closeBehavior: activeCloseBehavior };
  },
  setWindowThemeMode: (mode) => {
    if (mode === 'light' || mode === 'dark' || mode === 'system') {
      const changed = activeThemeMode !== mode;
      activeThemeMode = mode;
      if (changed) {
        saveWindowPrefs(app.getPath('userData'));
      }
      if (
        changed &&
        mainWindow &&
        !mainWindow.isDestroyed() &&
        typeof mainWindow.setBackgroundColor === 'function'
      ) {
        try {
          mainWindow.setBackgroundColor(resolveWindowBackgroundColor());
        } catch {
          // Ignore background update error
        }
      }
      return { ok: true };
    }
    return { ok: false };
  },
  applyLoginItemSetting: shortcuts.applyLoginItemSetting,
  syncGlobalQuickAddShortcut: shortcuts.syncGlobalQuickAddShortcut,
  syncVoiceDictationShortcut: shortcuts.syncVoiceDictationShortcut,
  getShortcutRegistrationStatus: shortcuts.getRegistrationStatus,
  autoResolveBlockedShortcuts: shortcuts.autoResolveBlockedShortcuts,
  saveWindowPrefs,
  ensureVoiceOverlayManager,
  getVoiceOverlayManager: () => voiceOverlayManager,
  updateTrayLabels: trayShell.updateTrayLabels,
  rebuildWindowsJumpList: trayShell.rebuildWindowsJumpList,
  invalidateIconCache: trayShell.invalidateIconCache,
  consumeInitialLocaleInfo: () => {
    const info = getInitialLocaleInfo();
    consumedInstallerLocale = null;
    return info;
  },
});

registerUpdaterIpcHandlers({
  app,
  ipcMain,
  shell,
  pkgVersion: PKG_VERSION,
  getMainWindow: () => mainWindow,
  resolveSenderWindow,
  assertTrustedIpcSender,
  performFullQuit,
  prepareQuitForNativeUpdate: teardownAppResources,
});

app
  .whenReady()
  .then(async () => {
    const gotLock = await acquireSingleInstanceLockWithHandoff();
    if (!gotLock) {
      app.quit();
      process.exit(0);
      return;
    }
    const prefs = readWindowPrefs(app.getPath('userData'));
    activeCloseBehavior = prefs.closeBehavior;
    activeThemeMode = prefs.themeMode;
    shortcuts.hydrateState(prefs);
    const quickRes = shortcuts.syncGlobalQuickAddShortcut(
      prefs.globalQuickAdd,
      prefs.globalQuickAddKey,
      { autoFallback: true },
    );
    const voiceRes = shortcuts.syncVoiceDictationShortcut(
      prefs.voiceShortcut,
      prefs.voiceShortcutEnabled,
      { autoFallback: true },
    );
    if (quickRes.key !== prefs.globalQuickAddKey || voiceRes.shortcut !== prefs.voiceShortcut) {
      saveWindowPrefs(app.getPath('userData'));
    }

    const { port, reusedExternalDaemon } = await backend.detectOrAllocatePort();
    const appUrl = `http://127.0.0.1:${port}`;
    const allowedOrigin = new URL(appUrl).origin;

    if (!reusedExternalDaemon) {
      backend.startBackend(port);
    }
    backend.lockCriticalRuntimeFiles();

    session.defaultSession.setPermissionRequestHandler((wc, permission, callback, details) => {
      try {
        const origin = new URL(wc.getURL() || '').origin;
        const permName = String(permission);
        const mediaTypes = /** @type {{ mediaTypes?: string[] } | undefined} */ (details)
          ?.mediaTypes;
        const isMicOnly =
          (permName === 'media' || permName === 'audioCapture') &&
          (!Array.isArray(mediaTypes) ||
            mediaTypes.length === 0 ||
            (mediaTypes.includes('audio') && !mediaTypes.includes('video')));
        callback(origin === allowedOrigin && isMicOnly);
      } catch {
        callback(false);
      }
    });
    session.defaultSession.setPermissionCheckHandler((wc, permission, requestingOrigin) => {
      try {
        const origin = requestingOrigin
          ? new URL(requestingOrigin).origin
          : new URL(wc?.getURL?.() || '').origin;
        const permName = String(permission);
        return origin === allowedOrigin && (permName === 'media' || permName === 'audioCapture');
      } catch {
        return false;
      }
    });

    await createMainWindow({
      app,
      BrowserWindow,
      shell,
      electronDir: __dirname,
      appUrl,
      backend,
      trayShell,
      getInitialLocaleInfo,
      getBackgroundColor: resolveWindowBackgroundColor,
      getCloseBehavior: () => activeCloseBehavior,
      isQuitting: () => isQuitting,
      setQuitting: (val) => {
        isQuitting = Boolean(val);
      },
      setMainWindow: (win) => {
        mainWindow = win;
      },
      showAndFocusMainWindow,
      getMainLogger,
      crashDiagnostics: {
        writeCrashReport: (opts) => getCrashDiagnostics().writeCrashReport(opts),
      },
    });

    // Defer non-critical Windows shell integration tasks until after window first paint
    const deferredShellTimer = setTimeout(() => {
      if (isQuitting) return;
      trayShell.rebuildWindowsJumpList();
      trayShell.syncExistingCliShimsOnStartup();
      trayShell.ensureStartMenuShortcutAumid();
    }, 1500);
    deferredShellTimer.unref?.();
  })
  .catch((err) => {
    getMainLogger().error({ err }, 'Agendamea Electron startup error');
    try {
      getCrashDiagnostics().writeCrashReport({
        source: 'electron-startup',
        error: err,
        dataDir: app.getPath('userData'),
      });
    } catch {
      // Ignore crash report failure during early boot
    }
    backend.stopBackend();
    if (_loggerMod) _loggerMod.closeAllLoggers();
    app.quit();
  });

app.on('before-quit', () => {
  try {
    globalShortcut.unregisterAll();
  } catch {
    // Ignore
  }
  teardownAppResources();
  if (_loggerMod) _loggerMod.closeAllLoggers();
});

app.on('window-all-closed', () => {
  if (isQuitting || !trayShell.getTray()) {
    isQuitting = true;
    backend.stopBackend();
    app.quit();
  }
});

process.on('exit', () => {
  backend.stopBackend();
});
