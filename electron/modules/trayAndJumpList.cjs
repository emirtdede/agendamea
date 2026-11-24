'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { APP_USER_MODEL_ID, readSavedActiveIcon } = require('../iconGenerator.cjs');
const cliInstaller = require('../../shared/cliInstaller.cjs');

function createTrayAndShellManager({
  app,
  Menu,
  nativeImage,
  shell,
  Tray,
  electronDir,
  getMainWindow,
  getActivePort,
  getRuntimeRoot,
  showAndFocusMainWindow,
  ensureVoiceOverlayManager,
  performFullQuit,
}) {
  let tray = null;
  let trayLabels = {
    openLabel: 'Open Agendamea',
    newTaskLabel: 'New Task',
    dictateLabel: 'Voice Dictation (Ctrl+Alt+Space)',
    todayLabel: 'Today',
    importantLabel: 'Important',
    quitLabel: 'Quit',
  };

  function resolveFallbackIconPath(runtimeRoot) {
    const defaultRoot = path.join(electronDir, '..');
    const unpackedRoot = defaultRoot.includes('app.asar')
      ? defaultRoot.replace('app.asar', 'app.asar.unpacked')
      : runtimeRoot;
    const resourcesRoot = process.resourcesPath || path.dirname(unpackedRoot);

    const candidates = [
      path.join(unpackedRoot, 'electron-resources', 'icon.ico'),
      path.join(unpackedRoot, 'dist', 'icons', 'agendamea.ico'),
      path.join(unpackedRoot, 'public', 'icons', 'agendamea.ico'),
      path.join(resourcesRoot, 'app.asar.unpacked', 'electron-resources', 'icon.ico'),
      path.join(resourcesRoot, 'app.asar.unpacked', 'dist', 'icons', 'agendamea.ico'),
      path.join(resourcesRoot, 'icon.ico'),
      path.join(runtimeRoot, 'electron-resources', 'icon.ico'),
      path.join(runtimeRoot, 'dist', 'icons', 'agendamea.ico'),
      path.join(runtimeRoot, 'public', 'icons', 'agendamea.ico'),
    ];
    return candidates.find(
      (p) => (!p.includes('app.asar') || p.includes('app.asar.unpacked')) && fs.existsSync(p),
    );
  }

  function resolveFallbackNotificationPngPath(runtimeRoot) {
    const defaultRoot = path.join(electronDir, '..');
    const unpackedRoot = defaultRoot.includes('app.asar')
      ? defaultRoot.replace('app.asar', 'app.asar.unpacked')
      : runtimeRoot;
    const resourcesRoot = process.resourcesPath || path.dirname(unpackedRoot);

    const candidates = [
      path.join(unpackedRoot, 'dist', 'icons', 'favicon-256x256.png'),
      path.join(unpackedRoot, 'public', 'icons', 'favicon-256x256.png'),
      path.join(resourcesRoot, 'app.asar.unpacked', 'dist', 'icons', 'favicon-256x256.png'),
      path.join(runtimeRoot, 'dist', 'icons', 'favicon-256x256.png'),
      path.join(runtimeRoot, 'public', 'icons', 'favicon-256x256.png'),
      path.join(unpackedRoot, 'dist', 'icons', 'favicon-128x128.png'),
      path.join(unpackedRoot, 'public', 'icons', 'favicon-128x128.png'),
    ];
    return candidates.find(
      (p) => (!p.includes('app.asar') || p.includes('app.asar.unpacked')) && fs.existsSync(p),
    );
  }

  function resolveStartupIcons(runtimeRoot) {
    const userDataDir = app.getPath('userData');
    const saved = readSavedActiveIcon(userDataDir);
    if (saved?.icoPath && fs.existsSync(saved.icoPath)) {
      const savedNotifPng =
        saved.notifPngPath && fs.existsSync(saved.notifPngPath) ? saved.notifPngPath : null;
      const savedPng =
        saved.trayPngPath && fs.existsSync(saved.trayPngPath) ? saved.trayPngPath : null;
      return {
        icoPath: saved.icoPath,
        trayPath: savedPng || saved.icoPath,
        notifPngPath:
          savedNotifPng ||
          resolveFallbackNotificationPngPath(runtimeRoot) ||
          savedPng ||
          saved.icoPath,
      };
    }
    const fallback = resolveFallbackIconPath(runtimeRoot);
    const fallbackPng = resolveFallbackNotificationPngPath(runtimeRoot);
    return {
      icoPath: fallback,
      trayPath: fallbackPng || fallback,
      notifPngPath: fallbackPng || fallback,
    };
  }

  function buildTrayImage(iconPath) {
    if (!iconPath || !fs.existsSync(iconPath)) {
      return nativeImage.createEmpty();
    }
    const img = nativeImage.createFromPath(iconPath);
    if (img.isEmpty()) return img;
    return img.resize({ width: 16, height: 16, quality: 'best' });
  }

  function rebuildWindowsJumpList() {
    if (process.platform !== 'win32' || typeof app.setUserTasks !== 'function') return;
    try {
      const exePath = process.execPath;
      const { icoPath } = resolveStartupIcons(getRuntimeRoot());
      const iconPath = icoPath && fs.existsSync(icoPath) ? icoPath : exePath;
      app.setUserTasks([
        {
          program: exePath,
          arguments: '--jump-quick-add',
          iconPath,
          iconIndex: 0,
          title: trayLabels.newTaskLabel || 'New Task',
          description: trayLabels.newTaskLabel || 'New Task',
        },
        {
          program: exePath,
          arguments: '--jump-view=today',
          iconPath,
          iconIndex: 0,
          title: trayLabels.todayLabel || 'Today',
          description: trayLabels.todayLabel || 'Today',
        },
        {
          program: exePath,
          arguments: '--jump-view=important',
          iconPath,
          iconIndex: 0,
          title: trayLabels.importantLabel || 'Important',
          description: trayLabels.importantLabel || 'Important',
        },
      ]);
    } catch {
      // Ignore jump list error on restricted shells
    }
  }

  function rebuildTrayMenu() {
    if (!tray) return;
    const menu = Menu.buildFromTemplate([
      { label: trayLabels.openLabel || 'Open Agendamea', click: () => showAndFocusMainWindow() },
      {
        label: trayLabels.newTaskLabel || 'New Task',
        click: () => {
          showAndFocusMainWindow();
          const win = getMainWindow();
          if (win && !win.isDestroyed()) {
            win.webContents.send('app:focus-quick-add');
          }
        },
      },
      {
        label: trayLabels.dictateLabel || 'Voice Dictation (Ctrl+Alt+Space)',
        click: () => {
          const port = getActivePort();
          if (port) void ensureVoiceOverlayManager().toggle(port);
        },
      },
      { type: 'separator' },
      { label: trayLabels.quitLabel || 'Quit', click: () => performFullQuit() },
    ]);
    tray.setContextMenu(menu);
  }

  function ensureTray(runtimeRoot) {
    if (tray) return tray;
    try {
      const { trayPath } = resolveStartupIcons(runtimeRoot);
      const img = buildTrayImage(trayPath);
      if (img.isEmpty()) return null;
      tray = new Tray(img);
      tray.setToolTip('Agendamea');
      tray.on('click', () => {
        const win = getMainWindow();
        if (win && !win.isDestroyed() && win.isVisible() && !win.isMinimized()) {
          win.focus();
        } else {
          showAndFocusMainWindow();
        }
      });
      tray.on('double-click', () => showAndFocusMainWindow());
      rebuildTrayMenu();
      return tray;
    } catch {
      return null;
    }
  }

  function destroyTray() {
    if (tray) {
      try {
        tray.destroy();
      } catch {
        // Ignore already destroyed tray
      }
      tray = null;
    }
  }

  function updateTrayLabels(labels) {
    if (labels && typeof labels === 'object') {
      trayLabels = {
        openLabel:
          typeof labels.openLabel === 'string' && labels.openLabel.trim()
            ? labels.openLabel.trim()
            : trayLabels.openLabel,
        newTaskLabel:
          typeof labels.newTaskLabel === 'string' && labels.newTaskLabel.trim()
            ? labels.newTaskLabel.trim()
            : trayLabels.newTaskLabel,
        dictateLabel:
          typeof labels.dictateLabel === 'string' && labels.dictateLabel.trim()
            ? labels.dictateLabel.trim()
            : trayLabels.dictateLabel,
        todayLabel:
          typeof labels.todayLabel === 'string' && labels.todayLabel.trim()
            ? labels.todayLabel.trim()
            : trayLabels.todayLabel,
        importantLabel:
          typeof labels.importantLabel === 'string' && labels.importantLabel.trim()
            ? labels.importantLabel.trim()
            : trayLabels.importantLabel,
        quitLabel:
          typeof labels.quitLabel === 'string' && labels.quitLabel.trim()
            ? labels.quitLabel.trim()
            : trayLabels.quitLabel,
      };
      rebuildTrayMenu();
      rebuildWindowsJumpList();
    }
  }

  function dispatchJumpListArgs(argv) {
    const win = getMainWindow();
    if (!Array.isArray(argv) || !win || win.isDestroyed()) return false;
    if (argv.includes('--jump-quick-add')) {
      showAndFocusMainWindow();
      win.webContents.send('app:focus-quick-add');
      return true;
    }
    const viewArg = argv.find((a) => typeof a === 'string' && a.startsWith('--jump-view='));
    if (viewArg) {
      const viewId = viewArg.split('=')[1];
      if (viewId === 'today' || viewId === 'important' || viewId === 'all') {
        showAndFocusMainWindow();
        win.webContents.send('app:navigate-smart-view', viewId);
        return true;
      }
    }
    return false;
  }

  function ensureStartMenuShortcutAumid() {
    if (process.platform !== 'win32' || process.windowsStore || !app.isPackaged) return;
    try {
      const appData = process.env.APPDATA;
      if (!appData) return;
      const startLnk = path.join(
        appData,
        'Microsoft',
        'Windows',
        'Start Menu',
        'Programs',
        'Agendamea.lnk',
      );
      if (!fs.existsSync(startLnk)) return;
      const existing = shell.readShortcutLink(startLnk);
      if (
        existing &&
        typeof existing.appUserModelId === 'string' &&
        existing.appUserModelId.toLowerCase() === APP_USER_MODEL_ID
      ) {
        return;
      }
      shell.writeShortcutLink(startLnk, 'update', {
        target: existing?.target || process.execPath,
        cwd: existing?.cwd || path.dirname(process.execPath),
        description: existing?.description || 'Agendamea',
        icon: existing?.icon || process.execPath,
        iconIndex: existing?.iconIndex ?? 0,
        appUserModelId: APP_USER_MODEL_ID,
      });
    } catch {
      // Best-effort AUMID repair for Windows native toast reliability
    }
  }

  function syncExistingCliShimsOnStartup() {
    if (process.platform !== 'win32') return;
    try {
      const binDir = cliInstaller.getCliBinDir();
      if (
        fs.existsSync(path.join(binDir, 'ag.exe')) ||
        fs.existsSync(path.join(binDir, 'ag.cmd')) ||
        fs.existsSync(path.join(binDir, 'agendamea.cmd'))
      ) {
        cliInstaller.writeCliShimFiles({
          runtimeRoot: getRuntimeRoot(),
          execPath: process.execPath,
        });
      }
    } catch {
      // Ignore non-critical startup shim refresh failure
    }
  }

  return {
    getTray: () => tray,
    resolveStartupIcons,
    buildTrayImage,
    rebuildWindowsJumpList,
    rebuildTrayMenu,
    ensureTray,
    destroyTray,
    updateTrayLabels,
    dispatchJumpListArgs,
    ensureStartMenuShortcutAumid,
    syncExistingCliShimsOnStartup,
  };
}

module.exports = {
  createTrayAndShellManager,
};
