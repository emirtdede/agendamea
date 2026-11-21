const { app, BrowserWindow, ipcMain, Menu, nativeImage, session, shell, Tray } = require('electron');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const {
  APP_USER_MODEL_ID,
  ensureDynamicIconFiles,
  readSavedActiveIcon,
  updateWindowsShortcuts,
} = require('./iconGenerator.cjs');

// Windows 11 Taskbar & Jump List AppUserModelID (matches electron-builder appId)
if (process.platform === 'win32') {
  app.setAppUserModelId(APP_USER_MODEL_ID);
}

// Single-instance guard prevents duplicate colliding desktop windows & DB locks
if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

// Fixed preferred local port list keeps localStorage (anti-FOUC theme cache) stable across restarts
// while safely bypassing Windows Hyper-V / WinNAT excluded port ranges (EACCES) and busy ports (EADDRINUSE)
const PREFERRED_PORTS = [38721, 47821, 39721, 41721, 0];

let mainWindow = null;
let tray = null;
let serverProcess = null;
let logFd = null;
let isQuitting = false;
let activePort = null;
let backendRestartCount = 0;
let activeCloseBehavior = 'ask';
let trayLabels = {
  openLabel: 'Open Agendamea',
  newTaskLabel: 'New Task',
  quitLabel: 'Quit',
};

function readWindowPrefs(userDataDir) {
  try {
    const prefsPath = path.join(userDataDir, 'window-prefs.json');
    if (fs.existsSync(prefsPath)) {
      const parsed = JSON.parse(fs.readFileSync(prefsPath, 'utf8'));
      if (
        parsed &&
        (parsed.closeBehavior === 'ask' ||
          parsed.closeBehavior === 'tray' ||
          parsed.closeBehavior === 'quit')
      ) {
        return parsed.closeBehavior;
      }
    }
  } catch {
    // Ignore unreadable prefs
  }
  return 'ask';
}

function saveWindowPrefs(userDataDir, closeBehavior) {
  try {
    fs.mkdirSync(userDataDir, { recursive: true });
    fs.writeFileSync(
      path.join(userDataDir, 'window-prefs.json'),
      JSON.stringify({ closeBehavior }, null, 2),
      'utf8',
    );
  } catch {
    // Ignore write failure
  }
}

function readInstallerSelectedLocale(userDataDir) {
  try {
    const langFile = path.join(userDataDir, 'installer-language.txt');
    if (fs.existsSync(langFile)) {
      const raw = fs.readFileSync(langFile, 'utf8').replace(/^\uFEFF/, '').trim();
      if (raw && /^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,4})?$/.test(raw)) {
        return raw;
      }
    }
  } catch {
    // Ignore file read errors
  }
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

function showAndFocusMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (!mainWindow.isVisible()) mainWindow.show();
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
}

app.on('second-instance', () => {
  showAndFocusMainWindow();
});

function getAvailablePort(candidates = PREFERRED_PORTS) {
  const list = Array.isArray(candidates) ? candidates : [candidates, 0];
  const [preferred, ...rest] = list.length > 0 ? list : [0];
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.once('error', (err) => {
      if (
        err &&
        (err.code === 'EADDRINUSE' || err.code === 'EACCES') &&
        preferred !== 0
      ) {
        resolve(getAvailablePort(rest.length > 0 ? rest : [0]));
      } else {
        reject(err);
      }
    });
    srv.listen(preferred, '127.0.0.1', () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : 3000;
      srv.close(() => resolve(port));
    });
  });
}

function openServerLogFd(userDataDir) {
  try {
    fs.mkdirSync(userDataDir, { recursive: true });
    const logPath = path.join(userDataDir, 'server.log');
    if (fs.existsSync(logPath) && fs.statSync(logPath).size > 256 * 1024) {
      fs.truncateSync(logPath, 0);
    }
    return fs.openSync(logPath, 'a');
  } catch {
    return 'ignore';
  }
}

function resolveRuntimeRoot() {
  const defaultRoot = path.join(__dirname, '..');
  if (defaultRoot.includes('app.asar')) {
    const unpackedRoot = defaultRoot.replace('app.asar', 'app.asar.unpacked');
    if (fs.existsSync(path.join(unpackedRoot, 'dist-server', 'server.mjs'))) {
      return unpackedRoot;
    }
  }
  return defaultRoot;
}

function resolveFallbackIconPath(runtimeRoot) {
  const defaultRoot = path.join(__dirname, '..');
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
    (p) =>
      (!p.includes('app.asar') || p.includes('app.asar.unpacked')) &&
      fs.existsSync(p),
  );
}

function resolveStartupIcons(runtimeRoot) {
  const userDataDir = app.getPath('userData');
  const saved = readSavedActiveIcon(userDataDir);
  if (saved && saved.icoPath && fs.existsSync(saved.icoPath)) {
    return {
      icoPath: saved.icoPath,
      trayPath: saved.trayPngPath && fs.existsSync(saved.trayPngPath) ? saved.trayPngPath : saved.icoPath,
    };
  }
  const fallback = resolveFallbackIconPath(runtimeRoot);
  return { icoPath: fallback, trayPath: fallback };
}

function buildTrayImage(iconPath) {
  if (!iconPath || !fs.existsSync(iconPath)) {
    return nativeImage.createEmpty();
  }
  const img = nativeImage.createFromPath(iconPath);
  if (img.isEmpty()) return img;
  return img.resize({ width: 16, height: 16, quality: 'best' });
}

function rebuildTrayMenu() {
  if (!tray) return;
  const menu = Menu.buildFromTemplate([
    {
      label: trayLabels.openLabel || 'Open Agendamea',
      click: () => showAndFocusMainWindow(),
    },
    {
      label: trayLabels.newTaskLabel || 'New Task',
      click: () => {
        showAndFocusMainWindow();
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('app:focus-quick-add');
        }
      },
    },
    { type: 'separator' },
    {
      label: trayLabels.quitLabel || 'Quit',
      click: () => {
        performFullQuit();
      },
    },
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
      if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible() && !mainWindow.isMinimized()) {
        mainWindow.focus();
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

function performFullQuit() {
  isQuitting = true;
  if (tray) {
    try {
      tray.destroy();
    } catch {
      // Ignore already destroyed tray
    }
    tray = null;
  }
  stopBackend();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.destroy();
    mainWindow = null;
  }
  app.quit();
}

function isAllowedExternalUrl(targetUrl) {
  try {
    const parsed = new URL(targetUrl);
    if (
      parsed.protocol === 'https:' &&
      (parsed.hostname === 'vellium.dev' || parsed.hostname === 'github.com')
    ) {
      return true;
    }
    if (
      parsed.protocol === 'mailto:' &&
      parsed.pathname.toLowerCase().endsWith('@vellium.dev')
    ) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

function startBackend(port) {
  const runtimeRoot = resolveRuntimeRoot();
  const userDataDir = app.getPath('userData');
  const bundledServer = path.join(runtimeRoot, 'dist-server', 'server.mjs');
  const tsxCli = path.join(runtimeRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  const devServer = path.join(runtimeRoot, 'server.ts');

  const args = fs.existsSync(bundledServer)
    ? [bundledServer]
    : fs.existsSync(tsxCli)
      ? [tsxCli, devServer]
      : [devServer];

  const stderrTarget = openServerLogFd(userDataDir);
  if (typeof stderrTarget === 'number') {
    logFd = stderrTarget;
  }

  const localeInfo = getInitialLocaleInfo();

  // Always use writable userDataDir as cwd (avoids ASAR ENOTDIR / Program Files permission errors)
  const proc = spawn(process.execPath, args, {
    cwd: userDataDir,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      NODE_ENV: 'production',
      HOST: '127.0.0.1',
      PORT: String(port),
      AGENDAMEA_DATA_DIR: userDataDir,
      AGENDAMEA_APP_ROOT: runtimeRoot,
      AGENDAMEA_INITIAL_LOCALE: localeInfo.preferred,
    },
    stdio: ['ignore', 'ignore', stderrTarget, 'ipc'],
    windowsHide: true,
  });
  serverProcess = proc;
  activePort = port;

  // Self-healing watchdog: automatically restart local backend if it crashes unexpectedly
  proc.on('exit', (code) => {
    if (serverProcess === proc) {
      serverProcess = null;
    }
    if (!isQuitting && code !== 0 && backendRestartCount < 5 && activePort) {
      backendRestartCount += 1;
      setTimeout(() => {
        if (!isQuitting && !serverProcess) {
          startBackend(activePort);
        }
      }, 600);
    }
  });
}

function stopBackend() {
  const proc = serverProcess;
  serverProcess = null;
  if (proc && !proc.killed) {
    try {
      if (proc.connected) {
        proc.send('shutdown');
      } else {
        proc.kill();
      }
    } catch {
      try {
        proc.kill();
      } catch {
        // Ignore already exited process
      }
    }
    const forceTimer = setTimeout(() => {
      try {
        if (proc.exitCode === null && !proc.killed) {
          proc.kill();
        }
      } catch {
        // Ignore already exited process
      }
    }, 1500);
    forceTimer.unref();
  }
  if (typeof logFd === 'number') {
    try {
      fs.closeSync(logFd);
    } catch {
      // Ignore already closed descriptor
    }
    logFd = null;
  }
}

async function waitForServer(url, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    // Fail fast if backend process already crashed
    if (serverProcess && serverProcess.exitCode !== null) {
      return false;
    }
    try {
      const res = await fetch(`${url}/api/health`, {
        signal: typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(1000) : undefined,
      });
      if (res.ok) return true;
    } catch {
      // Wait for server readiness
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  return false;
}

async function createWindow(appUrl) {
  const runtimeRoot = resolveRuntimeRoot();
  const allowedOrigin = new URL(appUrl).origin;
  const { icoPath: resolvedIcon } = resolveStartupIcons(runtimeRoot);

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 860,
    minHeight: 580,
    frame: false,
    thickFrame: true,
    resizable: true,
    minimizable: true,
    maximizable: true,
    closable: true,
    autoHideMenuBar: true,
    title: 'Agendamea',
    icon: resolvedIcon,
    backgroundColor: '#fafafa',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (resolvedIcon && typeof mainWindow.setIcon === 'function') {
    try {
      mainWindow.setIcon(resolvedIcon);
    } catch {
      // Ignore platform setIcon fallback
    }
  }

  // Remove default Electron menu so Alt+Arrow shortcuts never trigger a phantom menu bar on Windows 11
  mainWindow.setMenu(null);

  // Ensure System Tray is always ready for minimize-to-tray close actions
  ensureTray(runtimeRoot);

  // Allow only whitelisted Vellium links to open in the user's default browser/mail client
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url)) {
      void shell.openExternal(url);
    }
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, targetUrl) => {
    try {
      if (new URL(targetUrl).origin !== allowedOrigin) {
        event.preventDefault();
        if (isAllowedExternalUrl(targetUrl)) {
          void shell.openExternal(targetUrl);
        }
      }
    } catch {
      event.preventDefault();
    }
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    mainWindow?.focus();
  });

  // PowerPilot-style close behavior interception: Ask | Minimize to Tray | Quit Completely
  mainWindow.on('close', (event) => {
    if (isQuitting) return;

    // If renderer crashed or fallback error page is loaded, allow immediate close
    const currentUrl = mainWindow?.webContents?.getURL?.() || '';
    if (!currentUrl.startsWith(allowedOrigin)) {
      isQuitting = true;
      return;
    }

    if (activeCloseBehavior === 'quit') {
      isQuitting = true;
      return;
    }

    if (activeCloseBehavior === 'tray') {
      event.preventDefault();
      ensureTray(runtimeRoot);
      mainWindow?.hide();
      return;
    }

    // Default ('ask'): delegate decision to renderer CloseActionModal
    event.preventDefault();
    if (mainWindow && !mainWindow.isDestroyed()) {
      showAndFocusMainWindow();
      mainWindow.webContents.send('window:close-requested');
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.on('maximize', () => {
    mainWindow?.webContents.send('window:maximized-changed', true);
  });

  mainWindow.on('unmaximize', () => {
    mainWindow?.webContents.send('window:maximized-changed', false);
  });

  mainWindow.on('enter-full-screen', () => {
    mainWindow?.webContents.send('window:maximized-changed', true);
  });

  mainWindow.on('leave-full-screen', () => {
    mainWindow?.webContents.send('window:maximized-changed', mainWindow?.isMaximized() ?? false);
  });

  // Self-healing renderer crash recovery: automatically reload UI if Chromium renderer crashes
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    if (!isQuitting && details && details.reason !== 'clean-exit') {
      setTimeout(() => {
        if (!isQuitting && mainWindow && !mainWindow.isDestroyed()) {
          void mainWindow.loadURL(appUrl);
        }
      }, 500);
    }
  });

  const ready = await waitForServer(appUrl);
  if (ready && mainWindow) {
    await mainWindow.loadURL(appUrl);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
    }
  } else if (mainWindow) {
    const isTrLocale = String(getInitialLocaleInfo().preferred || 'en').toLowerCase().startsWith('tr');
    const htmlLang = isTrLocale ? 'tr' : 'en';
    const errHeading = isTrLocale ? 'Agendamea başlatılamadı' : 'Unable to start Agendamea';
    const errBody = isTrLocale
      ? 'Yerel sunucu başlatılamadı. Lütfen yeniden deneyin veya uygulamayı kapatıp tekrar açın.'
      : 'The local service could not be started. Please retry or reopen the application.';
    const retryLabel = isTrLocale ? 'Tekrar Dene' : 'Retry';
    const closeLabel = isTrLocale ? 'Kapat' : 'Close';
    const fallbackHtml = [
      `<!doctype html><html lang="${htmlLang}"><head><meta charset="utf-8"><title>Agendamea</title></head>`,
      '<body style="font-family:Segoe UI,system-ui,sans-serif;display:flex;flex-direction:column;height:100vh;margin:0;background:#09090b;color:#fafafa;user-select:none;">',
      '<div style="-webkit-app-region:drag;height:40px;display:flex;align-items:center;justify-content:space-between;padding:0 12px;border-bottom:1px solid #27272a;">',
      '<div style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600;">',
      '<svg width="18" height="18" viewBox="0 0 64 64" fill="none"><rect width="64" height="64" rx="16" fill="#18181b"/><path d="M18 33L27.5 42.5L46 22" stroke="#fafafa" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
      '<span>Agendamea</span></div>',
      `<button type="button" aria-label="${closeLabel}" onclick="if(window.agendameaWindow&&window.agendameaWindow.performCloseAction){window.agendameaWindow.performCloseAction('quit')}else{window.close()}" style="-webkit-app-region:no-drag;background:transparent;border:none;color:#a1a1aa;font-size:18px;line-height:1;width:32px;height:28px;border-radius:6px;cursor:pointer;">&times;</button>`,
      '</div>',
      '<div style="flex:1;display:flex;align-items:center;justify-content:center;padding:24px;">',
      '<div style="max-width:380px;text-align:center;background:#18181b;border:1px solid #27272a;border-radius:16px;padding:28px 24px;">',
      '<div style="margin:0 auto 14px;width:44px;height:44px;border-radius:12px;background:#27272a;display:flex;align-items:center;justify-content:center;">',
      '<svg width="24" height="24" viewBox="0 0 64 64" fill="none"><path d="M18 33L27.5 42.5L46 22" stroke="#fafafa" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
      '</div>',
      `<h2 style="margin:0 0 8px;font-size:17px;font-weight:700;">${errHeading}</h2>`,
      `<p style="margin:0 0 20px;font-size:13px;line-height:1.5;color:#a1a1aa;">${errBody}</p>`,
      '<div style="display:flex;gap:8px;justify-content:center;">',
      `<button type="button" onclick="window.location.href='${appUrl}'" style="background:#fafafa;color:#09090b;border:none;border-radius:8px;padding:8px 16px;font-size:12px;font-weight:600;cursor:pointer;">${retryLabel}</button>`,
      `<button type="button" onclick="if(window.agendameaWindow&&window.agendameaWindow.performCloseAction){window.agendameaWindow.performCloseAction('quit')}else{window.close()}" style="background:#27272a;color:#fafafa;border:1px solid #3f3f46;border-radius:8px;padding:8px 16px;font-size:12px;font-weight:500;cursor:pointer;">${closeLabel}</button>`,
      '</div></div></div></body></html>',
    ].join('');
    await mainWindow.loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(fallbackHtml)}`,
    );
    mainWindow.show();
  }
}

function resolveSenderWindow(event) {
  return BrowserWindow.fromWebContents(event.sender) ?? mainWindow;
}

ipcMain.handle('window:minimize', (event) => {
  const win = resolveSenderWindow(event);
  win?.minimize();
});

ipcMain.handle('window:toggle-maximize', (event) => {
  const win = resolveSenderWindow(event);
  if (!win) return false;
  if (win.isFullScreen()) {
    win.setFullScreen(false);
    return false;
  }
  if (win.isMaximized()) {
    win.unmaximize();
    return false;
  }
  win.maximize();
  return true;
});

ipcMain.handle('window:is-maximized', (event) => {
  const win = resolveSenderWindow(event);
  if (!win) return false;
  return win.isMaximized() || win.isFullScreen();
});

ipcMain.handle('window:close', (event) => {
  const win = resolveSenderWindow(event);
  win?.close();
});

ipcMain.handle('window:set-close-behavior', (_event, behavior) => {
  if (behavior === 'ask' || behavior === 'tray' || behavior === 'quit') {
    activeCloseBehavior = behavior;
    saveWindowPrefs(app.getPath('userData'), behavior);
    return { ok: true, closeBehavior: activeCloseBehavior };
  }
  return { ok: false, closeBehavior: activeCloseBehavior };
});

ipcMain.handle('window:perform-close-action', (event, action) => {
  if (action === 'tray') {
    const win = resolveSenderWindow(event);
    ensureTray(resolveRuntimeRoot());
    win?.hide();
    return { ok: true, action: 'tray' };
  }
  if (action === 'quit') {
    performFullQuit();
    return { ok: true, action: 'quit' };
  }
  return { ok: false };
});

ipcMain.handle('tray:update-labels', (_event, labels) => {
  if (labels && typeof labels === 'object') {
    trayLabels = {
      openLabel: typeof labels.openLabel === 'string' && labels.openLabel.trim() ? labels.openLabel.trim() : trayLabels.openLabel,
      newTaskLabel: typeof labels.newTaskLabel === 'string' && labels.newTaskLabel.trim() ? labels.newTaskLabel.trim() : trayLabels.newTaskLabel,
      quitLabel: typeof labels.quitLabel === 'string' && labels.quitLabel.trim() ? labels.quitLabel.trim() : trayLabels.quitLabel,
    };
    rebuildTrayMenu();
  }
  return { ok: true };
});

ipcMain.handle('window:set-zoom', (event, factor) => {
  const win = resolveSenderWindow(event);
  const num = Number(factor);
  if (!win || !Number.isFinite(num)) return { ok: false };
  const clamped = Math.max(0.8, Math.min(1.5, num));
  win.webContents.setZoomFactor(clamped);
  return { ok: true, factor: clamped };
});

ipcMain.handle('app:get-initial-locale', () => {
  return getInitialLocaleInfo();
});

ipcMain.handle('icon:apply', (event, payload) => {
  try {
    const bg = payload && typeof payload.bg === 'string' ? payload.bg : '#18181b';
    const fg = payload && typeof payload.fg === 'string' ? payload.fg : '#ffffff';
    const shouldUpdateShortcuts = payload?.updateShortcuts !== false;
    const userDataDir = app.getPath('userData');
    const generated = ensureDynamicIconFiles(userDataDir, bg, fg);

    const win = resolveSenderWindow(event);
    if (win && !win.isDestroyed() && typeof win.setIcon === 'function') {
      const winImg = nativeImage.createFromPath(generated.icoPath);
      if (!winImg.isEmpty()) {
        win.setIcon(winImg);
      } else {
        win.setIcon(generated.icoPath);
      }
    }

    if (tray) {
      const trayImg = buildTrayImage(generated.trayPngPath);
      if (!trayImg.isEmpty()) {
        tray.setImage(trayImg);
      }
    }

    let shortcuts = { updated: [], skipped: true };
    if (shouldUpdateShortcuts) {
      shortcuts = updateWindowsShortcuts(generated.icoPath, {
        shell,
        app,
        isStoreBuild: Boolean(process.windowsStore),
      });
    }

    return {
      ok: true,
      icoPath: generated.icoPath,
      updatedShortcuts: shortcuts.updated.length,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Icon update failed',
    };
  }
});

const GITHUB_RELEASES_API = 'https://api.github.com/repos/emirtdede/agendamea/releases/latest';
const GITHUB_RELEASES_HTML = 'https://github.com/emirtdede/agendamea/releases/latest';

function compareSemver(a, b) {
  const cleanA = String(a || '').trim().replace(/^v/i, '').split('-')[0];
  const cleanB = String(b || '').trim().replace(/^v/i, '').split('-')[0];
  const partsA = cleanA.split('.').map((n) => Number.parseInt(n, 10) || 0);
  const partsB = cleanB.split('.').map((n) => Number.parseInt(n, 10) || 0);
  const len = Math.max(partsA.length, partsB.length, 3);
  for (let i = 0; i < len; i += 1) {
    const va = partsA[i] || 0;
    const vb = partsB[i] || 0;
    if (va > vb) return 1;
    if (va < vb) return -1;
  }
  return 0;
}

function isAllowedUpdateDownloadUrl(targetUrl) {
  try {
    const parsed = new URL(targetUrl);
    if (parsed.protocol !== 'https:') return false;
    const lowerPath = parsed.pathname.toLowerCase();
    if (
      parsed.hostname === 'github.com' &&
      lowerPath.startsWith('/emirtdede/agendamea/releases/download/') &&
      (lowerPath.endsWith('.exe') || lowerPath.endsWith('.msix') || lowerPath.endsWith('.appx'))
    ) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

function detectDefaultOneDriveFolder() {
  const candidates = [
    process.env.OneDriveConsumer,
    process.env.OneDrive,
    process.env.OneDriveCommercial,
    path.join(os.homedir(), 'OneDrive'),
  ].filter((p) => typeof p === 'string' && p.trim().length > 0);

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
        return path.join(candidate, 'Agendamea');
      }
    } catch {
      // Ignore inaccessible path
    }
  }
  return path.join(app.getPath('userData'), 'OneDrive-Agendamea');
}

ipcMain.handle('onedrive:open-folder', async (_event, customFolderPath) => {
  try {
    const defaultFolder = detectDefaultOneDriveFolder();
    let targetFolder = defaultFolder;
    if (typeof customFolderPath === 'string' && customFolderPath.trim().length > 0) {
      const candidate = path.resolve(customFolderPath.trim());
      const baseName = path.basename(candidate).toLowerCase();
      if (
        candidate === defaultFolder ||
        baseName.includes('agendamea') ||
        fs.existsSync(path.join(candidate, 'agendamea-onedrive-sync.json'))
      ) {
        targetFolder = candidate;
      }
    }
    fs.mkdirSync(targetFolder, { recursive: true });
    const errMsg = await shell.openPath(targetFolder);
    return { ok: !errMsg, path: targetFolder };
  } catch {
    return { ok: false };
  }
});

ipcMain.handle('updater:check', async () => {
  const currentVersion = app.getVersion() || '1.0.0';
  const checkedAt = new Date().toISOString();
  try {
    const res = await fetch(GITHUB_RELEASES_API, {
      signal: typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(8000) : undefined,
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': `Agendamea/${currentVersion} (Vellium)`,
      },
    });
    if (!res.ok) {
      return {
        ok: false,
        currentVersion,
        latestVersion: currentVersion,
        updateAvailable: false,
        releaseName: `Agendamea v${currentVersion}`,
        releaseNotes: '',
        publishedAt: null,
        releaseUrl: GITHUB_RELEASES_HTML,
        setupUrl: null,
        portableUrl: null,
        msixUrl: null,
        checkedAt,
      };
    }
    const data = await res.json();
    const latestVersion = String(data?.tag_name || currentVersion).replace(/^v/i, '') || currentVersion;
    const updateAvailable = compareSemver(latestVersion, currentVersion) > 0;
    const assets = Array.isArray(data?.assets) ? data.assets : [];
    const setupAsset = assets.find(
      (a) => typeof a?.name === 'string' && /setup.*\.exe$/i.test(a.name),
    );
    const portableAsset = assets.find(
      (a) => typeof a?.name === 'string' && /portable.*\.exe$/i.test(a.name),
    );
    const msixAsset = assets.find(
      (a) => typeof a?.name === 'string' && /\.(msix|appx)$/i.test(a.name),
    );
    return {
      ok: true,
      currentVersion,
      latestVersion,
      updateAvailable,
      releaseName:
        typeof data?.name === 'string' && data.name ? data.name : `Agendamea v${latestVersion}`,
      releaseNotes: typeof data?.body === 'string' ? data.body.slice(0, 4000) : '',
      publishedAt: typeof data?.published_at === 'string' ? data.published_at : null,
      releaseUrl:
        typeof data?.html_url === 'string' && data.html_url ? data.html_url : GITHUB_RELEASES_HTML,
      setupUrl:
        typeof setupAsset?.browser_download_url === 'string'
          ? setupAsset.browser_download_url
          : null,
      portableUrl:
        typeof portableAsset?.browser_download_url === 'string'
          ? portableAsset.browser_download_url
          : null,
      msixUrl:
        typeof msixAsset?.browser_download_url === 'string'
          ? msixAsset.browser_download_url
          : null,
      checkedAt,
    };
  } catch {
    return {
      ok: false,
      currentVersion,
      latestVersion: currentVersion,
      updateAvailable: false,
      releaseName: `Agendamea v${currentVersion}`,
      releaseNotes: '',
      publishedAt: null,
      releaseUrl: GITHUB_RELEASES_HTML,
      setupUrl: null,
      portableUrl: null,
      msixUrl: null,
      checkedAt,
    };
  }
});

ipcMain.handle('updater:download-and-install', async (event, downloadUrl) => {
  if (process.windowsStore) {
    return { ok: false, storeManaged: true };
  }
  const win = resolveSenderWindow(event);
  if (typeof downloadUrl !== 'string' || !isAllowedUpdateDownloadUrl(downloadUrl)) {
    void shell.openExternal(GITHUB_RELEASES_HTML);
    return { ok: true, launchedExternal: true };
  }

  const lowerUrl = downloadUrl.toLowerCase();
  const ext = lowerUrl.endsWith('.msix')
    ? '.msix'
    : lowerUrl.endsWith('.appx')
      ? '.appx'
      : '.exe';
  const tempFilePath = path.join(app.getPath('temp'), `Agendamea-Update${ext}`);
  try {
    const res = await fetch(downloadUrl, {
      headers: { 'User-Agent': `Agendamea/${app.getVersion() || '1.0.0'} (Vellium)` },
    });
    if (!res.ok || !res.body) {
      void shell.openExternal(downloadUrl);
      return { ok: true, launchedExternal: true };
    }

    const totalBytes = Number(res.headers.get('content-length') || 0);
    let receivedBytes = 0;
    const fileStream = fs.createWriteStream(tempFilePath);
    const reader = res.body.getReader();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        receivedBytes += value.byteLength;
        fileStream.write(Buffer.from(value));
        if (totalBytes > 0 && win && !win.isDestroyed()) {
          const pct = Math.min(100, Math.round((receivedBytes / totalBytes) * 100));
          win.webContents.send('updater:progress', pct);
        }
      }
    }

    await new Promise((resolve, reject) => {
      fileStream.end((err) => (err ? reject(err) : resolve()));
    });

    if (ext === '.msix' || ext === '.appx') {
      await shell.openPath(tempFilePath);
    } else {
      const child = spawn(tempFilePath, [], {
        detached: true,
        stdio: 'ignore',
      });
      child.unref();
    }
    performFullQuit();
    return { ok: true, launchedInstaller: true };
  } catch {
    void shell.openExternal(downloadUrl);
    return { ok: true, launchedExternal: true };
  }
});

app
  .whenReady()
  .then(async () => {
    activeCloseBehavior = readWindowPrefs(app.getPath('userData'));

    // Deny unexpected browser permission prompts (camera, microphone, geolocation, notifications)
    session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => {
      callback(false);
    });
    session.defaultSession.setPermissionCheckHandler(() => false);

    const port = process.env.PORT ? Number(process.env.PORT) : await getAvailablePort();
    const appUrl = `http://127.0.0.1:${port}`;
    startBackend(port);
    await createWindow(appUrl);
  })
  .catch((err) => {
    console.error('Agendamea Electron startup error:', err);
    stopBackend();
    app.quit();
  });

app.on('before-quit', () => {
  isQuitting = true;
  if (tray) {
    try {
      tray.destroy();
    } catch {
      // Ignore
    }
    tray = null;
  }
  stopBackend();
});

app.on('window-all-closed', () => {
  if (isQuitting || !tray) {
    isQuitting = true;
    stopBackend();
    app.quit();
  }
});

process.on('exit', () => {
  stopBackend();
});
