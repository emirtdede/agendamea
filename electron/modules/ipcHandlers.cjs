'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { ensureDynamicIconFiles, updateWindowsShortcuts } = require('../iconGenerator.cjs');
const cliInstaller = require('../../shared/cliInstaller.cjs');
const mcpClients = require('../../shared/mcpClients.cjs');
const { getAppLogger } = require('../../shared/logger.cjs');

const ipcLog = () => getAppLogger('main');

function detectDefaultOneDriveFolder(app) {
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

function registerCoreIpcHandlers(ctx) {
  const {
    app,
    dialog,
    ipcMain,
    nativeImage,
    Notification,
    shell,
    pkgVersion,
    resolveSenderWindow,
    assertTrustedIpcSender,
    getMainWindow,
    getActivePort,
    getRuntimeRoot,
    getTray,
    ensureTray,
    buildTrayImage,
    resolveStartupIcons,
    showAndFocusMainWindow,
    performFullQuit,
    setCloseBehavior,
    applyLoginItemSetting,
    syncGlobalQuickAddShortcut,
    syncVoiceDictationShortcut,
    getShortcutRegistrationStatus,
    saveWindowPrefs,
    ensureVoiceOverlayManager,
    getVoiceOverlayManager,
    updateTrayLabels,
    rebuildWindowsJumpList,
    consumeInitialLocaleInfo,
  } = ctx;

  const activeNotifications = new Set();

  ipcMain.handle('window:minimize', (event) => {
    resolveSenderWindow(event)?.minimize();
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
    resolveSenderWindow(event)?.close();
  });

  ipcMain.handle('window:set-close-behavior', (event, behavior) => {
    assertTrustedIpcSender(event);
    return setCloseBehavior(behavior);
  });

  ipcMain.handle('startup:set-login-item', (event, enabled, minimizedToTray) => {
    assertTrustedIpcSender(event);
    const val = applyLoginItemSetting(
      Boolean(enabled),
      typeof minimizedToTray === 'boolean' ? minimizedToTray : undefined,
    );
    saveWindowPrefs(app.getPath('userData'));
    return { ok: true, launchAtStartup: val };
  });

  ipcMain.handle('shortcut:set-global-quick-add', (event, enabled) => {
    assertTrustedIpcSender(event);
    const state = syncGlobalQuickAddShortcut(Boolean(enabled));
    saveWindowPrefs(app.getPath('userData'));
    return {
      ok: true,
      registered: state.registered,
      globalQuickAddShortcut: state.enabled,
    };
  });

  ipcMain.handle('shortcut:set-global-quick-add-key', (event, shortcutKey) => {
    assertTrustedIpcSender(event);
    const state = syncGlobalQuickAddShortcut(undefined, shortcutKey);
    saveWindowPrefs(app.getPath('userData'));
    return {
      ok: state.registered,
      registered: state.registered,
      globalQuickAddShortcutKey: state.key,
    };
  });

  ipcMain.handle('shortcut:get-status', (event) => {
    assertTrustedIpcSender(event);
    return typeof getShortcutRegistrationStatus === 'function'
      ? getShortcutRegistrationStatus()
      : {
          quickAddEnabled: true,
          quickAddRegistered: true,
          voiceEnabled: true,
          voiceRegistered: true,
        };
  });

  ipcMain.handle('notification:show', (event, payload) => {
    assertTrustedIpcSender(event);
    try {
      if (
        !Notification ||
        typeof Notification.isSupported !== 'function' ||
        !Notification.isSupported()
      ) {
        return { ok: false, supported: false };
      }
      const title =
        typeof payload?.title === 'string' && payload.title.trim()
          ? payload.title.trim().slice(0, 120)
          : 'Agendamea';
      const body = typeof payload?.body === 'string' ? payload.body.trim().slice(0, 260) : '';
      const todoId = typeof payload?.todoId === 'string' ? payload.todoId : null;
      const { icoPath, notifPngPath } = resolveStartupIcons(getRuntimeRoot());
      const notifIconPath =
        notifPngPath && fs.existsSync(notifPngPath)
          ? notifPngPath
          : icoPath && fs.existsSync(icoPath)
            ? icoPath
            : undefined;
      const notif = new Notification({
        title,
        body,
        icon: notifIconPath,
        silent: Boolean(payload?.silent),
      });
      activeNotifications.add(notif);
      let released = false;
      const releaseNotif = () => {
        if (released) return;
        released = true;
        activeNotifications.delete(notif);
        clearTimeout(cleanupTimer);
      };
      const cleanupTimer = setTimeout(releaseNotif, 60_000);
      cleanupTimer.unref?.();

      notif.on('click', () => {
        releaseNotif();
        showAndFocusMainWindow();
        const win = getMainWindow();
        if (todoId && win && !win.isDestroyed()) {
          win.webContents.send('app:focus-todo', todoId);
        }
      });
      notif.on('close', releaseNotif);
      notif.on('failed', releaseNotif);
      notif.show();
      return { ok: true, supported: true };
    } catch {
      return { ok: false };
    }
  });

  ipcMain.handle('voice:set-shortcut', (event, shortcut) => {
    assertTrustedIpcSender(event);
    const state = syncVoiceDictationShortcut(shortcut);
    saveWindowPrefs(app.getPath('userData'));
    return {
      ok: state.registered,
      registered: state.registered,
      voiceShortcut: state.shortcut,
      voiceShortcutEnabled: state.enabled,
    };
  });

  ipcMain.handle('voice:set-shortcut-enabled', (event, enabled) => {
    assertTrustedIpcSender(event);
    const state = syncVoiceDictationShortcut(undefined, Boolean(enabled));
    saveWindowPrefs(app.getPath('userData'));
    return {
      ok: state.registered,
      registered: state.registered,
      voiceShortcut: state.shortcut,
      voiceShortcutEnabled: state.enabled,
    };
  });

  ipcMain.handle('voice:toggle-overlay', async (event) => {
    assertTrustedIpcSender(event);
    const port = getActivePort();
    if (!port) return { ok: false };
    return ensureVoiceOverlayManager().toggle(port);
  });

  ipcMain.handle('voice:hide-overlay', (event) => {
    assertTrustedIpcSender(event);
    const mgr = getVoiceOverlayManager();
    if (!mgr) return { ok: true, visible: false };
    return mgr.hide();
  });

  ipcMain.handle('voice:set-focusable', (event, focusable) => {
    assertTrustedIpcSender(event);
    const mgr = getVoiceOverlayManager();
    if (!mgr) return { ok: false };
    return mgr.setFocusable(Boolean(focusable));
  });

  ipcMain.handle('voice:set-listening', (event, listening) => {
    assertTrustedIpcSender(event);
    const mgr = getVoiceOverlayManager();
    if (!mgr) return { ok: false };
    return mgr.setListeningState(Boolean(listening));
  });

  ipcMain.handle('voice:get-overlay-bounds', (event) => {
    assertTrustedIpcSender(event);
    const mgr = getVoiceOverlayManager();
    return mgr ? mgr.getBounds() : null;
  });

  ipcMain.handle('voice:open-speech-settings', async (event) => {
    assertTrustedIpcSender(event);
    try {
      await shell.openExternal('ms-settings:speech');
      return { ok: true };
    } catch {
      return { ok: false };
    }
  });

  ipcMain.handle('cli:install-shims', async (event) => {
    assertTrustedIpcSender(event);
    try {
      return await cliInstaller.installCliShims({
        runtimeRoot: getRuntimeRoot(),
        execPath: process.execPath,
      });
    } catch (err) {
      ipcLog().error({ err }, 'CLI shim install error');
      return { ok: false, error: 'CLI_INSTALL_FAILED' };
    }
  });

  ipcMain.handle('mcp:list-clients', (event) => {
    assertTrustedIpcSender(event);
    try {
      return { ok: true, clients: mcpClients.listMcpClients() };
    } catch (err) {
      ipcLog().error({ err }, 'MCP list clients error');
      return { ok: false, clients: [], error: 'MCP_LIST_FAILED' };
    }
  });

  ipcMain.handle('mcp:install-client', (event, clientId) => {
    assertTrustedIpcSender(event);
    try {
      const runtimeRoot = getRuntimeRoot();
      return mcpClients.installMcpClient(String(clientId || ''), {
        runtimeRoot,
        execPath: process.execPath,
        mcpPath: path.join(runtimeRoot, 'mcp', 'server.cjs'),
      });
    } catch (err) {
      ipcLog().error({ err, clientId }, 'MCP client install error');
      return { ok: false, error: 'MCP_INSTALL_FAILED' };
    }
  });

  ipcMain.handle('mcp:uninstall-client', (event, clientId) => {
    assertTrustedIpcSender(event);
    try {
      return mcpClients.uninstallMcpClient(String(clientId || ''));
    } catch (err) {
      ipcLog().error({ err, clientId }, 'MCP client uninstall error');
      return { ok: false, error: 'MCP_UNINSTALL_FAILED' };
    }
  });

  ipcMain.handle('mcp:test-server', async (event) => {
    assertTrustedIpcSender(event);
    try {
      const runtimeRoot = getRuntimeRoot();
      return await mcpClients.probeMcpServer({
        runtimeRoot,
        execPath: process.execPath,
        mcpPath: path.join(runtimeRoot, 'mcp', 'server.cjs'),
      });
    } catch (err) {
      ipcLog().error({ err }, 'MCP server probe error');
      return { ok: false, error: 'MCP_PROBE_FAILED' };
    }
  });

  ipcMain.handle('cli:open-terminal', async (event) => {
    assertTrustedIpcSender(event);
    try {
      if (process.platform === 'win32') {
        const binDir = cliInstaller.writeCliShimFiles({
          runtimeRoot: getRuntimeRoot(),
          execPath: process.execPath,
        });
        const escapedBin = binDir.replace(/'/g, "''");
        const initCmd = `[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $env:Path='${escapedBin};'+$env:Path; ag stat; Write-Host ''; ag`;
        const wtPath = path.join(
          process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'),
          'Microsoft',
          'WindowsApps',
          'wt.exe',
        );
        const useWt = fs.existsSync(wtPath);
        const child = useWt
          ? spawn(
              wtPath,
              ['-w', '0', 'nt', 'powershell.exe', '-NoProfile', '-NoExit', '-Command', initCmd],
              {
                detached: true,
                stdio: 'ignore',
              },
            )
          : spawn('powershell.exe', ['-NoProfile', '-NoExit', '-Command', initCmd], {
              detached: true,
              stdio: 'ignore',
            });
        child.unref();
        return { ok: true, terminal: useWt ? 'windows-terminal' : 'powershell' };
      }
      if (process.platform === 'darwin') {
        const child = spawn('open', ['-a', 'Terminal'], { detached: true, stdio: 'ignore' });
        child.unref();
        return { ok: true, terminal: 'terminal' };
      }
      const child = spawn('x-terminal-emulator', [], { detached: true, stdio: 'ignore' });
      child.unref();
      return { ok: true, terminal: 'x-terminal-emulator' };
    } catch (err) {
      ipcLog().error({ err }, 'Terminal launch error');
      return { ok: false, error: 'Terminal launch failed' };
    }
  });

  ipcMain.handle('app:get-diagnostics', (event) => {
    assertTrustedIpcSender(event);
    const runtimeRoot = getRuntimeRoot();
    const cliPath = path.join(runtimeRoot, 'cli', 'agendamea.cjs');
    const mcpPath = path.join(runtimeRoot, 'mcp', 'server.cjs');
    const cliExePath = cliInstaller.getCliExecutablePath();
    const userDataDir = app.getPath('userData');
    const logsDir = path.join(userDataDir, 'logs');
    const modelsDir = path.join(userDataDir, 'models');
    const distributionChannel = process.windowsStore
      ? 'store'
      : process.env.PORTABLE_EXECUTABLE_FILE
        ? 'portable'
        : app.isPackaged
          ? 'setup'
          : 'dev';
    const shortcutStatus =
      typeof getShortcutRegistrationStatus === 'function' ? getShortcutRegistrationStatus() : null;
    return {
      appVersion: app.getVersion() || pkgVersion,
      electronVersion: process.versions.electron || '',
      chromeVersion: process.versions.chrome || '',
      nodeVersion: process.versions.node || '',
      platform: process.platform,
      arch: process.arch,
      osRelease: typeof os.release === 'function' ? os.release() : '',
      isWindowsStore: Boolean(process.windowsStore),
      distributionChannel,
      locale: typeof app.getLocale === 'function' ? app.getLocale() : 'en',
      execPath: process.execPath,
      cliPath,
      mcpPath,
      cliBinDir: cliInstaller.getCliBinDir(),
      cliExePath: cliExePath || '',
      cliInstalled: cliInstaller.isCliShimsInstalled(),
      runtimePort: getActivePort(),
      userDataDir,
      logsDir,
      modelsDir,
      quickAddRegistered: shortcutStatus ? Boolean(shortcutStatus.quickAddRegistered) : true,
      voiceRegistered: shortcutStatus ? Boolean(shortcutStatus.voiceRegistered) : true,
    };
  });

  ipcMain.handle('app:open-data-folder', async (event) => {
    assertTrustedIpcSender(event);
    try {
      const target = app.getPath('userData');
      fs.mkdirSync(target, { recursive: true });
      const errMsg = await shell.openPath(target);
      return { ok: !errMsg, path: target };
    } catch {
      return { ok: false };
    }
  });

  ipcMain.handle('app:open-logs-folder', async (event) => {
    assertTrustedIpcSender(event);
    try {
      const target = path.join(app.getPath('userData'), 'logs');
      fs.mkdirSync(target, { recursive: true });
      const errMsg = await shell.openPath(target);
      return { ok: !errMsg, path: target };
    } catch {
      return { ok: false };
    }
  });

  ipcMain.handle('app:open-models-folder', async (event) => {
    assertTrustedIpcSender(event);
    try {
      const target = path.join(app.getPath('userData'), 'models');
      fs.mkdirSync(target, { recursive: true });
      const errMsg = await shell.openPath(target);
      return { ok: !errMsg, path: target };
    } catch {
      return { ok: false };
    }
  });

  ipcMain.handle('app:open-file-location', async (event, targetPath) => {
    assertTrustedIpcSender(event);
    try {
      if (typeof targetPath !== 'string' || !targetPath.trim() || targetPath.includes('\0')) {
        return { ok: false };
      }
      const resolved = path.resolve(targetPath.trim());
      if (resolved.startsWith('\\\\')) return { ok: false };
      if (fs.existsSync(resolved)) {
        shell.showItemInFolder(resolved);
        return { ok: true, path: resolved };
      }
      const parentDir = path.dirname(resolved);
      if (fs.existsSync(parentDir)) {
        const errMsg = await shell.openPath(parentDir);
        return { ok: !errMsg, path: parentDir };
      }
      return { ok: false };
    } catch {
      return { ok: false };
    }
  });

  ipcMain.handle('app:open-windows-notifications', async (event) => {
    assertTrustedIpcSender(event);
    try {
      await shell.openExternal('ms-settings:notifications');
      return { ok: true };
    } catch {
      return { ok: false };
    }
  });

  ipcMain.handle('app:open-microsoft-store', async (event) => {
    assertTrustedIpcSender(event);
    try {
      await shell.openExternal('ms-windows-store://pdp/?ProductId=9MT5X1NGZJXZ');
      return { ok: true };
    } catch {
      return { ok: false };
    }
  });

  ipcMain.handle('app:run-cli-dry', async (event, commandName) => {
    assertTrustedIpcSender(event);
    const allowed = new Set(['stat', 'doctor']);
    const cmd = String(commandName || '')
      .trim()
      .toLowerCase();
    if (!allowed.has(cmd)) {
      return { ok: false, stdout: '', stderr: 'UNSUPPORTED_COMMAND' };
    }
    try {
      const runtimeRoot = getRuntimeRoot();
      const cliEntry = path.join(runtimeRoot, 'cli', 'agendamea.cjs');
      return await new Promise((resolve) => {
        const child = spawn(process.execPath, [cliEntry, cmd], {
          env: {
            ...process.env,
            ELECTRON_RUN_AS_NODE: '1',
            AGENDAMEA_DATA_DIR: app.getPath('userData'),
          },
          windowsHide: true,
        });
        let stdout = '';
        let stderr = '';
        const timer = setTimeout(() => {
          try {
            child.kill();
          } catch {
            // Ignore timeout kill failure
          }
          resolve({ ok: false, stdout: stdout.slice(0, 8000), stderr: 'TIMEOUT' });
        }, 6000);
        child.stdout?.on('data', (chunk) => {
          if (stdout.length < 8000) {
            stdout += String(chunk).slice(0, 8000 - stdout.length);
          }
        });
        child.stderr?.on('data', (chunk) => {
          if (stderr.length < 2000) {
            stderr += String(chunk).slice(0, 2000 - stderr.length);
          }
        });
        child.on('error', (err) => {
          clearTimeout(timer);
          resolve({ ok: false, stdout: '', stderr: String(err?.message || 'CLI_RUN_FAILED') });
        });
        child.on('close', (code) => {
          clearTimeout(timer);
          resolve({
            ok: code === 0,
            stdout: stdout.slice(0, 8000),
            stderr: stderr.slice(0, 2000),
          });
        });
      });
    } catch (err) {
      ipcLog().error({ err, cmd }, 'CLI dry-run failed');
      return { ok: false, stdout: '', stderr: 'CLI_RUN_FAILED' };
    }
  });

  ipcMain.handle('window:perform-close-action', (event, action) => {
    if (action === 'tray') {
      const win = resolveSenderWindow(event);
      ensureTray(getRuntimeRoot());
      win?.hide();
      return { ok: true, action: 'tray' };
    }
    if (action === 'quit') {
      performFullQuit();
      return { ok: true, action: 'quit' };
    }
    return { ok: false };
  });

  ipcMain.handle('tray:update-labels', (event, labels) => {
    assertTrustedIpcSender(event);
    updateTrayLabels(labels);
    return { ok: true };
  });

  ipcMain.handle('window:set-zoom', (event, factor) => {
    assertTrustedIpcSender(event);
    const win = resolveSenderWindow(event);
    const num = Number(factor);
    if (!win || !Number.isFinite(num)) return { ok: false };
    const clamped = Math.max(0.8, Math.min(1.5, num));
    win.webContents.setZoomFactor(clamped);
    return { ok: true, factor: clamped };
  });

  ipcMain.handle('app:get-initial-locale', (event) => {
    assertTrustedIpcSender(event);
    return consumeInitialLocaleInfo();
  });

  ipcMain.handle('icon:apply', (event, payload) => {
    assertTrustedIpcSender(event);
    try {
      const bg = payload && typeof payload.bg === 'string' ? payload.bg : '#18181b';
      const fg = payload && typeof payload.fg === 'string' ? payload.fg : '#ffffff';
      const shouldUpdateShortcuts = payload?.updateShortcuts !== false;
      const userDataDir = app.getPath('userData');
      const generated = ensureDynamicIconFiles(userDataDir, bg, fg);

      const win = resolveSenderWindow(event);
      if (win && !win.isDestroyed() && typeof win.setIcon === 'function') {
        const winImg = nativeImage.createFromPath(generated.icoPath);
        win.setIcon(!winImg.isEmpty() ? winImg : generated.icoPath);
      }

      const activeTray = getTray();
      if (activeTray) {
        const trayImg = buildTrayImage(generated.trayPngPath);
        if (!trayImg.isEmpty()) {
          activeTray.setImage(trayImg);
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
      rebuildWindowsJumpList();

      return {
        ok: true,
        icoPath: generated.icoPath,
        updatedShortcuts: shortcuts.updated.length,
      };
    } catch (err) {
      ipcLog().error({ err }, 'Icon update error');
      return { ok: false, error: 'Icon update failed' };
    }
  });

  ipcMain.handle('onedrive:pick-folder', async (event) => {
    assertTrustedIpcSender(event);
    try {
      const win = resolveSenderWindow(event);
      const defaultFolder = detectDefaultOneDriveFolder(app);
      const res = await dialog.showOpenDialog(win ?? undefined, {
        defaultPath: fs.existsSync(defaultFolder) ? defaultFolder : os.homedir(),
        properties: ['openDirectory', 'createDirectory'],
      });
      if (res.canceled || !Array.isArray(res.filePaths) || !res.filePaths[0]) {
        return { ok: false, canceled: true };
      }
      return { ok: true, canceled: false, folderPath: path.resolve(res.filePaths[0]) };
    } catch {
      return { ok: false, canceled: true };
    }
  });

  ipcMain.handle('onedrive:open-folder', async (event, customFolderPath) => {
    assertTrustedIpcSender(event);
    try {
      const defaultFolder = detectDefaultOneDriveFolder(app);
      let targetFolder = defaultFolder;
      if (typeof customFolderPath === 'string' && customFolderPath.trim().length > 0) {
        const raw = customFolderPath.trim();
        if (!raw.startsWith('\\\\') && !raw.startsWith('//') && !raw.includes('\0')) {
          const candidate = path.resolve(raw);
          if (candidate.startsWith('\\\\')) {
            return { ok: false };
          }
          const root = path.parse(candidate).root.toLowerCase();
          const winDir = (process.env.SystemRoot || 'C:\\Windows').toLowerCase();
          const lower = candidate.toLowerCase();
          const isSafe =
            lower !== root && lower !== winDir && !lower.startsWith(`${winDir}${path.sep}`);
          const parentDir = path.dirname(candidate);
          if (
            isSafe &&
            (candidate === defaultFolder ||
              (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) ||
              (fs.existsSync(parentDir) && fs.statSync(parentDir).isDirectory()))
          ) {
            targetFolder = candidate;
          }
        }
      }
      fs.mkdirSync(targetFolder, { recursive: true });
      const errMsg = await shell.openPath(targetFolder);
      return { ok: !errMsg, path: targetFolder };
    } catch {
      return { ok: false };
    }
  });
}

module.exports = {
  registerCoreIpcHandlers,
};
