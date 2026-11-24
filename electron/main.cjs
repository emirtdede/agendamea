'use strict';

const {
  app,
  BrowserWindow,
  dialog,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  Notification,
  session,
  shell,
  Tray,
} = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { APP_USER_MODEL_ID } = require('./iconGenerator.cjs');
const { VoiceOverlayManager } = require('./voiceOverlay.cjs');
const { createBackendManager } = require('./modules/backendProcess.cjs');
const { registerCoreIpcHandlers } = require('./modules/ipcHandlers.cjs');
const { registerUpdaterIpcHandlers } = require('./modules/updater.cjs');
const { createTrayAndShellManager } = require('./modules/trayAndJumpList.cjs');
const { createShortcutAndStartupManager } = require('./modules/shortcutManager.cjs');
const { createMainWindow } = require('./modules/windowFactory.cjs');
const { getAppLogger, closeAllLoggers } = require('../shared/logger.cjs');
const crashDiagnostics = require('../shared/crashDiagnostics.cjs');

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
    mainLogger = getAppLogger('main', dataDir);
  }
  return mainLogger;
}

process.on('uncaughtException', (err) => {
  try {
    getMainLogger().error({ err }, 'Uncaught Electron main exception');
    crashDiagnostics.writeCrashReport({
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
    crashDiagnostics.writeCrashReport({
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

if (process.platform === 'win32') {
  app.setAppUserModelId(APP_USER_MODEL_ID);
}

let mainWindow = null;
let isQuitting = false;
let activeCloseBehavior = 'ask';
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
      return {
        closeBehavior,
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
            : 'CommandOrControl+Alt+Space',
      };
    }
  } catch {
    // Ignore corrupted prefs file
  }
  return {
    closeBehavior: 'ask',
    launchAtStartup: false,
    launchMinimizedToTray: false,
    globalQuickAdd: true,
    globalQuickAddKey: 'CommandOrControl+Alt+N',
    voiceShortcutEnabled: true,
    voiceShortcut: 'CommandOrControl+Alt+Space',
  };
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
    voiceOverlayManager = new VoiceOverlayManager({
      preloadPath: path.join(__dirname, 'preload.cjs'),
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
      JSON.stringify({ closeBehavior: activeCloseBehavior, ...st }),
      'utf8',
    );
  } catch {
    // Ignore write failures
  }
}

async function acquireSingleInstanceLockWithHandoff() {
  const lockPayload = { execPath: process.execPath };
  if (app.requestSingleInstanceLock(lockPayload)) return true;
  for (let i = 0; i < 20; i += 1) {
    await new Promise((r) => setTimeout(r, 150));
    if (app.requestSingleInstanceLock(lockPayload)) return true;
  }
  return false;
}

app.on('second-instance', (_event, commandLine, _workingDir, additionalData) => {
  const extraData = /** @type {{ execPath?: unknown } | null | undefined} */ (additionalData);
  const incomingExecPath =
    (extraData && typeof extraData.execPath === 'string' && extraData.execPath) ||
    (Array.isArray(commandLine) && typeof commandLine[0] === 'string' ? commandLine[0] : '');

  const runtimeRoot = backend.getRuntimeRoot();
  const runtimeIntact = fs.existsSync(path.join(runtimeRoot, 'dist-server', 'server.mjs'));
  const isDifferentExecutable =
    incomingExecPath &&
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
  setCloseBehavior: (behavior) => {
    if (behavior === 'ask' || behavior === 'tray' || behavior === 'quit') {
      activeCloseBehavior = behavior;
      saveWindowPrefs(app.getPath('userData'));
      return { ok: true, closeBehavior: activeCloseBehavior };
    }
    return { ok: false, closeBehavior: activeCloseBehavior };
  },
  applyLoginItemSetting: shortcuts.applyLoginItemSetting,
  syncGlobalQuickAddShortcut: shortcuts.syncGlobalQuickAddShortcut,
  syncVoiceDictationShortcut: shortcuts.syncVoiceDictationShortcut,
  getShortcutRegistrationStatus: shortcuts.getRegistrationStatus,
  saveWindowPrefs,
  ensureVoiceOverlayManager,
  getVoiceOverlayManager: () => voiceOverlayManager,
  updateTrayLabels: trayShell.updateTrayLabels,
  rebuildWindowsJumpList: trayShell.rebuildWindowsJumpList,
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
    backend.lockCriticalRuntimeFiles();

    const prefs = readWindowPrefs(app.getPath('userData'));
    activeCloseBehavior = prefs.closeBehavior;
    shortcuts.hydrateState(prefs);
    shortcuts.syncGlobalQuickAddShortcut(prefs.globalQuickAdd, prefs.globalQuickAddKey);
    shortcuts.syncVoiceDictationShortcut(prefs.voiceShortcut, prefs.voiceShortcutEnabled);
    trayShell.rebuildWindowsJumpList();
    trayShell.syncExistingCliShimsOnStartup();
    trayShell.ensureStartMenuShortcutAumid();

    const { port, reusedExternalDaemon } = await backend.detectOrAllocatePort();
    const appUrl = `http://127.0.0.1:${port}`;
    const allowedOrigin = new URL(appUrl).origin;

    session.defaultSession.setPermissionRequestHandler((wc, permission, callback, details) => {
      try {
        const origin = new URL(wc.getURL() || '').origin;
        const permName = String(permission);
        const mediaTypes = /** @type {{ mediaTypes?: string[] } | undefined} */ (details)
          ?.mediaTypes;
        const isMicOnly =
          (permName === 'media' || permName === 'audioCapture') &&
          (!Array.isArray(mediaTypes) ||
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

    if (!reusedExternalDaemon) {
      backend.startBackend(port);
    }
    await createMainWindow({
      app,
      BrowserWindow,
      shell,
      electronDir: __dirname,
      appUrl,
      backend,
      trayShell,
      getInitialLocaleInfo,
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
      crashDiagnostics,
    });
  })
  .catch((err) => {
    getMainLogger().error({ err }, 'Agendamea Electron startup error');
    try {
      crashDiagnostics.writeCrashReport({
        source: 'electron-startup',
        error: err,
        dataDir: app.getPath('userData'),
      });
    } catch {
      // Ignore crash report failure during early boot
    }
    backend.stopBackend();
    closeAllLoggers();
    app.quit();
  });

app.on('before-quit', () => {
  try {
    globalShortcut.unregisterAll();
  } catch {
    // Ignore
  }
  teardownAppResources();
  closeAllLoggers();
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
