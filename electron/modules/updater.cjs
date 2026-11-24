'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { compareSemver, parseGitHubRelease } = require('../../shared/releaseUtils.cjs');
const { GITHUB_RELEASES_API, GITHUB_RELEASES_HTML } = require('../../shared/constants.cjs');
const { getAppLogger } = require('../../shared/logger.cjs');

const updaterLog = () => getAppLogger('main');

function isAllowedUpdateDownloadUrl(targetUrl) {
  try {
    const parsed = new URL(targetUrl);
    if (parsed.protocol !== 'https:') return false;
    const lowerPath = parsed.pathname.toLowerCase();
    return (
      parsed.hostname === 'github.com' &&
      lowerPath.startsWith('/emirtdede/agendamea/releases/download/') &&
      (lowerPath.endsWith('.exe') || lowerPath.endsWith('.msix') || lowerPath.endsWith('.appx'))
    );
  } catch {
    return false;
  }
}

function buildUpdateCheckResponse(currentVersion, checkedAt, overrides = {}) {
  const latestVersion = overrides.latestVersion || currentVersion;
  return {
    ok: true,
    currentVersion,
    latestVersion,
    updateAvailable: false,
    releaseName: `Agendamea v${latestVersion}`,
    releaseNotes: '',
    publishedAt: null,
    releaseUrl: GITHUB_RELEASES_HTML,
    setupUrl: null,
    portableUrl: null,
    msixUrl: null,
    checkedAt,
    ...overrides,
  };
}

async function fetchExpectedUpdateSha512(downloadUrl, userAgent) {
  try {
    const parsed = new URL(downloadUrl);
    const fileName = decodeURIComponent(path.posix.basename(parsed.pathname));
    const dirUrl = downloadUrl.slice(0, downloadUrl.lastIndexOf('/') + 1);
    const ymlUrl = `${dirUrl}latest.yml`;
    const res = await fetch(ymlUrl, {
      signal: typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(8000) : undefined,
      headers: { 'User-Agent': userAgent },
    });
    if (!res.ok) return null;
    const text = await res.text();
    const lines = text.split(/\r?\n/);
    let matchedUrl = false;
    let topLevelPathMatch = false;
    for (const rawLine of lines) {
      const trimmed = rawLine.trim();
      const urlMatch = trimmed.match(/^-?\s*url:\s*['"]?([^'"]+)['"]?$/i);
      if (urlMatch) {
        matchedUrl = urlMatch[1].trim() === fileName;
        continue;
      }
      const pathMatch = trimmed.match(/^path:\s*['"]?([^'"]+)['"]?$/i);
      if (pathMatch) {
        topLevelPathMatch = pathMatch[1].trim() === fileName;
        continue;
      }
      const shaMatch = trimmed.match(/^sha512:\s*['"]?([A-Za-z0-9+/=]+)['"]?$/i);
      if (shaMatch && (matchedUrl || topLevelPathMatch)) {
        return shaMatch[1].trim();
      }
    }
    return null;
  } catch {
    return null;
  }
}

function registerUpdaterIpcHandlers(deps) {
  const {
    app,
    ipcMain,
    shell,
    pkgVersion,
    getMainWindow,
    resolveSenderWindow,
    assertTrustedIpcSender,
    performFullQuit,
    prepareQuitForNativeUpdate,
  } = deps;

  let nativeAutoUpdater = null;
  let nativeCheckHasUpdate = false;
  let nativeDownloadedVersion = null;
  let activeDownloadAbortController = null;

  function canUseNativeAutoUpdater() {
    return (
      Boolean(app.isPackaged) &&
      !process.windowsStore &&
      !process.env.PORTABLE_EXECUTABLE_FILE &&
      fs.existsSync(path.join(process.resourcesPath || '', 'app-update.yml'))
    );
  }

  function getNativeAutoUpdater() {
    if (!canUseNativeAutoUpdater()) return null;
    if (nativeAutoUpdater) return nativeAutoUpdater;
    try {
      const { autoUpdater } = require('electron-updater');
      autoUpdater.autoDownload = false;
      autoUpdater.autoInstallOnAppQuit = true;
      autoUpdater.allowPrerelease = false;
      autoUpdater.disableWebInstaller = true;
      autoUpdater.logger = null;

      autoUpdater.on('download-progress', (progress) => {
        const pct = Math.min(100, Math.max(0, Math.round(Number(progress?.percent) || 0)));
        const win = getMainWindow();
        if (win && !win.isDestroyed()) {
          win.webContents.send('updater:progress', pct);
        }
      });

      autoUpdater.on('update-downloaded', (info) => {
        nativeDownloadedVersion =
          (info && typeof info.version === 'string' && info.version) ||
          nativeDownloadedVersion ||
          '';
        const win = getMainWindow();
        if (win && !win.isDestroyed()) {
          win.webContents.send('updater:downloaded', {
            version: nativeDownloadedVersion,
          });
        }
      });

      autoUpdater.on('error', (err) => {
        updaterLog().error({ err }, 'AutoUpdater error');
        const win = getMainWindow();
        if (win && !win.isDestroyed()) {
          win.webContents.send('updater:error', 'Update error');
        }
      });

      nativeAutoUpdater = autoUpdater;
      return nativeAutoUpdater;
    } catch {
      return null;
    }
  }

  ipcMain.handle('updater:check', async (event) => {
    assertTrustedIpcSender(event);
    const currentVersion = app.getVersion() || pkgVersion;
    const checkedAt = new Date().toISOString();

    if (process.windowsStore) {
      return buildUpdateCheckResponse(currentVersion, checkedAt, { storeManaged: true });
    }

    let nativeAutoUpdateReady = false;
    let nativeLatestVersion = null;
    const nativeUpdater = getNativeAutoUpdater();
    if (nativeUpdater) {
      try {
        const checkResult = await nativeUpdater.checkForUpdates();
        const ver = checkResult?.updateInfo?.version;
        if (typeof ver === 'string' && compareSemver(ver, currentVersion) > 0) {
          nativeAutoUpdateReady = true;
          nativeCheckHasUpdate = true;
          nativeLatestVersion = ver;
        } else {
          nativeCheckHasUpdate = false;
        }
      } catch {
        nativeCheckHasUpdate = false;
      }
    }

    const alreadyDownloaded =
      Boolean(nativeDownloadedVersion) &&
      compareSemver(nativeDownloadedVersion, currentVersion) > 0;

    const fallbackResult = () => {
      if (nativeAutoUpdateReady && nativeLatestVersion) {
        return buildUpdateCheckResponse(currentVersion, checkedAt, {
          ok: true,
          latestVersion: nativeLatestVersion,
          updateAvailable: true,
          nativeAutoUpdateReady: true,
          downloaded: alreadyDownloaded,
        });
      }
      return buildUpdateCheckResponse(currentVersion, checkedAt, { ok: false });
    };

    try {
      const res = await fetch(GITHUB_RELEASES_API, {
        signal: typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(8000) : undefined,
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': `Agendamea/${currentVersion} (Vellium)`,
        },
      });
      if (!res.ok) return fallbackResult();
      const data = await res.json();
      return parseGitHubRelease(data, currentVersion, GITHUB_RELEASES_HTML, checkedAt, {
        nativeLatestVersion,
        nativeAutoUpdateReady,
        downloaded: alreadyDownloaded,
      });
    } catch {
      return fallbackResult();
    }
  });

  ipcMain.handle('updater:download-and-install', async (event, downloadUrl) => {
    assertTrustedIpcSender(event);
    if (process.windowsStore) {
      return { ok: false, storeManaged: true };
    }

    const nativeUpdater = getNativeAutoUpdater();
    if (nativeUpdater && nativeCheckHasUpdate) {
      try {
        await nativeUpdater.downloadUpdate();
        return { ok: true, downloaded: true, nativeAutoUpdater: true };
      } catch {
        // Fall back cleanly to verified direct GitHub installer download below
      }
    }

    const win = resolveSenderWindow(event);
    if (typeof downloadUrl !== 'string' || !isAllowedUpdateDownloadUrl(downloadUrl)) {
      void shell.openExternal(GITHUB_RELEASES_HTML);
      return { ok: true, launchedExternal: true };
    }

    const userAgent = `Agendamea/${app.getVersion() || pkgVersion} (Vellium)`;
    const expectedSha512 = await fetchExpectedUpdateSha512(downloadUrl, userAgent);
    if (!expectedSha512) {
      void shell.openExternal(GITHUB_RELEASES_HTML);
      return { ok: true, launchedExternal: true };
    }

    const lowerUrl = downloadUrl.toLowerCase();
    const ext = lowerUrl.endsWith('.msix')
      ? '.msix'
      : lowerUrl.endsWith('.appx')
        ? '.appx'
        : '.exe';
    const tempFilePath = path.join(app.getPath('temp'), `Agendamea-Update-${process.pid}${ext}`);
    const MAX_UPDATE_BYTES = 512 * 1024 * 1024;
    let fileStream = null;
    const downloadController = new AbortController();
    activeDownloadAbortController = downloadController;
    const downloadTimer = setTimeout(() => downloadController.abort(), 120_000);
    try {
      const res = await fetch(downloadUrl, {
        signal: downloadController.signal,
        headers: { 'User-Agent': userAgent },
      });
      if (!res.ok || !res.body) {
        void shell.openExternal(GITHUB_RELEASES_HTML);
        return { ok: true, launchedExternal: true };
      }

      const totalBytes = Number(res.headers.get('content-length') || 0);
      if (totalBytes > MAX_UPDATE_BYTES) {
        throw new Error('UPDATE_SIZE_EXCEEDED');
      }
      let receivedBytes = 0;
      let writeErr = null;
      const sha512Hash = crypto.createHash('sha512');
      fileStream = fs.createWriteStream(tempFilePath);
      fileStream.on('error', (err) => {
        writeErr = err;
      });
      const reader = res.body.getReader();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (writeErr) throw writeErr;
        if (value) {
          receivedBytes += value.byteLength;
          if (receivedBytes > MAX_UPDATE_BYTES) {
            throw new Error('UPDATE_SIZE_EXCEEDED');
          }
          const chunkBuf = Buffer.from(value);
          sha512Hash.update(chunkBuf);
          if (!fileStream.write(chunkBuf)) {
            await new Promise(
              /** @param {(v?: void) => void} resolve */ (resolve, reject) => {
                const onDrain = () => {
                  fileStream.off('error', onErr);
                  resolve();
                };
                const onErr = (e) => {
                  fileStream.off('drain', onDrain);
                  reject(e);
                };
                fileStream.once('drain', onDrain);
                fileStream.once('error', onErr);
              },
            );
          }
          if (totalBytes > 0 && win && !win.isDestroyed()) {
            const pct = Math.min(100, Math.round((receivedBytes / totalBytes) * 100));
            win.webContents.send('updater:progress', pct);
          }
        }
      }

      await new Promise(
        /** @param {(v?: void) => void} resolve */ (resolve, reject) => {
          fileStream.end((err) => (err ? reject(err) : resolve()));
        },
      );
      if (writeErr) throw writeErr;
      if (totalBytes > 0 && receivedBytes !== totalBytes) {
        throw new Error('INCOMPLETE_UPDATE_DOWNLOAD');
      }

      const actualSha512 = sha512Hash.digest('base64');
      const aBuf = Buffer.from(actualSha512, 'utf8');
      const bBuf = Buffer.from(expectedSha512, 'utf8');
      if (aBuf.length !== bBuf.length || !crypto.timingSafeEqual(aBuf, bBuf)) {
        throw new Error('UPDATE_SHA512_MISMATCH');
      }

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
    } catch (err) {
      const wasCancelled = Boolean(downloadController.signal.aborted);
      if (!wasCancelled) {
        updaterLog().error({ err }, 'Fallback update download failed');
      }
      if (fileStream) {
        try {
          fileStream.destroy();
        } catch {
          // Ignore stream destroy error
        }
      }
      try {
        if (fs.existsSync(tempFilePath)) fs.rmSync(tempFilePath, { force: true });
      } catch {
        // Ignore partial file cleanup error
      }
      if (wasCancelled) {
        return { ok: false, cancelled: true };
      }
      void shell.openExternal(GITHUB_RELEASES_HTML);
      return { ok: true, launchedExternal: true };
    } finally {
      clearTimeout(downloadTimer);
      if (activeDownloadAbortController === downloadController) {
        activeDownloadAbortController = null;
      }
    }
  });

  ipcMain.handle('updater:cancel-download', (event) => {
    assertTrustedIpcSender(event);
    if (activeDownloadAbortController) {
      try {
        activeDownloadAbortController.abort();
      } catch {
        // Ignore abort failure
      }
      activeDownloadAbortController = null;
      return { ok: true, cancelled: true };
    }
    return { ok: true, cancelled: false };
  });

  ipcMain.handle('updater:quit-and-install', (event) => {
    assertTrustedIpcSender(event);
    if (process.windowsStore) {
      return { ok: false, storeManaged: true };
    }
    const nativeUpdater = getNativeAutoUpdater();
    if (!nativeUpdater || !nativeDownloadedVersion) {
      return { ok: false };
    }
    prepareQuitForNativeUpdate();
    setImmediate(() => {
      nativeUpdater.quitAndInstall(true, true);
    });
    return { ok: true };
  });
}

module.exports = {
  isAllowedUpdateDownloadUrl,
  buildUpdateCheckResponse,
  fetchExpectedUpdateSha512,
  registerUpdaterIpcHandlers,
};
