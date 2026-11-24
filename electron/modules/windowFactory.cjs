'use strict';

const path = require('node:path');
const serverMessagesMod = require('../../shared/serverMessages.cjs');

const RTL_LANGS = new Set(['ar', 'fa', 'he', 'ur']);

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isAllowedExternalUrl(targetUrl) {
  try {
    const parsed = new URL(targetUrl);
    if (parsed.protocol === 'https:' && parsed.hostname === 'vellium.dev') return true;
    if (
      parsed.protocol === 'https:' &&
      parsed.hostname === 'github.com' &&
      (/^\/emirtdede(\/|$)/i.test(parsed.pathname) ||
        /^\/sponsors\/emirtdede(\/|$)/i.test(parsed.pathname))
    ) {
      return true;
    }
    if (parsed.protocol === 'mailto:' && parsed.pathname.toLowerCase().endsWith('@vellium.dev')) {
      return true;
    }
    const lowerUrl = String(targetUrl).toLowerCase();
    if (lowerUrl === 'ms-settings:speech' || lowerUrl === 'ms-settings:notifications') {
      return true;
    }
    if (lowerUrl.startsWith('ms-windows-store://pdp/?productid=9mt5x1ngzjxz')) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

function buildStartupFallbackHtml(appUrl, preferredLocale) {
  const htmlLang = serverMessagesMod.normalizeServerLang(preferredLocale || 'en');
  const dirAttr = RTL_LANGS.has(htmlLang) ? ' dir="rtl"' : '';
  const errHeading = escapeHtml(
    serverMessagesMod.getServerMessage(htmlLang, 'startupErrorHeading'),
  );
  const errBody = escapeHtml(serverMessagesMod.getServerMessage(htmlLang, 'startupErrorBody'));
  const retryLabel = escapeHtml(serverMessagesMod.getServerMessage(htmlLang, 'startupRetryButton'));
  const closeLabel = escapeHtml(serverMessagesMod.getServerMessage(htmlLang, 'startupCloseButton'));
  const safeAppUrl = escapeHtml(appUrl);
  return [
    `<!doctype html><html lang="${htmlLang}"${dirAttr}><head><meta charset="utf-8"><title>Agendamea</title></head>`,
    '<body style="font-family:Segoe UI,system-ui,sans-serif;display:flex;flex-direction:column;height:100vh;margin:0;background:#09090b;color:#fafafa;user-select:none;">',
    '<div style="-webkit-app-region:drag;height:40px;display:flex;align-items:center;justify-content:space-between;padding:0 12px;border-bottom:1px solid #27272a;">',
    '<div style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600;"><svg width="18" height="18" viewBox="0 0 512 512" fill="none" aria-hidden="true"><rect width="512" height="512" rx="112" fill="#fafafa"/><path d="M 144 378 L 252 128 L 294 224" stroke="#09090b" stroke-width="44" stroke-linecap="round" stroke-linejoin="round"/><path d="M 206 278 L 264 338 L 384 198" stroke="#09090b" stroke-width="44" stroke-linecap="round" stroke-linejoin="round"/></svg><span>Agendamea</span></div>',
    `<button type="button" aria-label="${closeLabel}" onclick="if(window.agendameaWindow&&window.agendameaWindow.performCloseAction){window.agendameaWindow.performCloseAction('quit')}else{window.close()}" style="-webkit-app-region:no-drag;background:transparent;border:none;color:#a1a1aa;font-size:18px;line-height:1;width:32px;height:28px;border-radius:6px;cursor:pointer;">&times;</button>`,
    '</div>',
    '<div style="flex:1;display:flex;align-items:center;justify-content:center;padding:24px;">',
    '<div style="max-width:380px;text-align:center;background:#18181b;border:1px solid #27272a;border-radius:16px;padding:28px 24px;">',
    `<h2 style="margin:0 0 8px;font-size:17px;font-weight:700;">${errHeading}</h2>`,
    `<p style="margin:0 0 20px;font-size:13px;line-height:1.5;color:#a1a1aa;">${errBody}</p>`,
    '<div style="display:flex;gap:8px;justify-content:center;">',
    `<button type="button" onclick="window.location.href='${safeAppUrl}'" style="background:#fafafa;color:#09090b;border:none;border-radius:8px;padding:8px 16px;font-size:12px;font-weight:600;cursor:pointer;">${retryLabel}</button>`,
    `<button type="button" onclick="if(window.agendameaWindow&&window.agendameaWindow.performCloseAction){window.agendameaWindow.performCloseAction('quit')}else{window.close()}" style="background:#27272a;color:#fafafa;border:1px solid #3f3f46;border-radius:8px;padding:8px 16px;font-size:12px;font-weight:500;cursor:pointer;">${closeLabel}</button>`,
    '</div></div></div></body></html>',
  ].join('');
}

async function createMainWindow({
  app,
  BrowserWindow,
  shell,
  electronDir,
  appUrl,
  backend,
  trayShell,
  getInitialLocaleInfo,
  getCloseBehavior,
  isQuitting,
  setQuitting,
  setMainWindow,
  showAndFocusMainWindow,
  getMainLogger,
  crashDiagnostics,
}) {
  const runtimeRoot = backend.getRuntimeRoot();
  const allowedOrigin = new URL(appUrl).origin;
  const { icoPath: resolvedIcon } = trayShell.resolveStartupIcons(runtimeRoot);

  const win = new BrowserWindow({
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
      preload: path.join(electronDir, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });
  setMainWindow(win);

  if (resolvedIcon && typeof win.setIcon === 'function') {
    try {
      win.setIcon(resolvedIcon);
    } catch {
      // Ignore platform setIcon fallback
    }
  }
  win.setMenu(null);
  trayShell.ensureTray(runtimeRoot);

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, targetUrl) => {
    try {
      if (new URL(targetUrl).origin !== allowedOrigin) {
        event.preventDefault();
        if (isAllowedExternalUrl(targetUrl)) void shell.openExternal(targetUrl);
      }
    } catch {
      event.preventDefault();
    }
  });

  const startMinimized =
    process.argv.includes('--minimized') ||
    process.argv.includes('--tray') ||
    process.argv.includes('--hidden') ||
    Boolean(
      typeof app.getLoginItemSettings === 'function' &&
        /** @type {any} */ (app.getLoginItemSettings()).wasOpenedAsHidden,
    );

  win.once('ready-to-show', () => {
    if (!startMinimized && !win.isDestroyed()) {
      win.show();
      win.focus();
    }
  });

  win.on('close', (event) => {
    if (isQuitting()) return;
    const currentUrl = win.webContents?.getURL?.() || '';
    const closeBehavior = getCloseBehavior();
    if (!currentUrl.startsWith(allowedOrigin) || closeBehavior === 'quit') {
      setQuitting(true);
      return;
    }
    if (closeBehavior === 'tray') {
      event.preventDefault();
      trayShell.ensureTray(runtimeRoot);
      win.hide();
      return;
    }
    event.preventDefault();
    if (!win.isDestroyed()) {
      showAndFocusMainWindow();
      win.webContents.send('window:close-requested');
    }
  });

  win.on('closed', () => {
    setMainWindow(null);
  });
  win.on('maximize', () => win.webContents.send('window:maximized-changed', true));
  win.on('unmaximize', () => win.webContents.send('window:maximized-changed', false));
  win.on('enter-full-screen', () => win.webContents.send('window:maximized-changed', true));
  win.on('leave-full-screen', () =>
    win.webContents.send('window:maximized-changed', win.isMaximized()),
  );
  win.webContents.on('render-process-gone', (_event, details) => {
    if (!isQuitting() && details && details.reason !== 'clean-exit') {
      getMainLogger().error({ details }, 'Renderer process terminated unexpectedly');
      crashDiagnostics.writeCrashReport({
        source: 'electron-renderer-gone',
        message: `Renderer process gone: ${details.reason}`,
        context: { reason: details.reason, exitCode: details.exitCode },
        dataDir: app.getPath('userData'),
      });
      setTimeout(() => {
        if (!isQuitting() && !win.isDestroyed()) {
          void win.loadURL(appUrl);
        }
      }, 500);
    }
  });

  const ready = await backend.waitForServer(appUrl);
  if (ready && !win.isDestroyed()) {
    await win.loadURL(appUrl);
    if (!win.isDestroyed()) {
      if (!startMinimized) {
        win.show();
        win.focus();
      }
      trayShell.dispatchJumpListArgs(process.argv);
    }
  } else if (!win.isDestroyed()) {
    const fallbackHtml = buildStartupFallbackHtml(appUrl, getInitialLocaleInfo().preferred);
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(fallbackHtml)}`);
    win.show();
  }
  return win;
}

module.exports = {
  isAllowedExternalUrl,
  buildStartupFallbackHtml,
  createMainWindow,
};
