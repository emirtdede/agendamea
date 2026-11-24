'use strict';

const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');
const {
  APP_VERSION,
  loadLazy,
  getCandidateDataDirs,
  resolveApiBaseUrl,
  httpRequest,
} = require('./httpTransport.cjs');

const getCliInstaller = () => loadLazy('cliInstaller', () => require('../cliInstaller.cjs'));
const getReleaseUtils = () => loadLazy('releaseUtils', () => require('../releaseUtils.cjs'));

async function checkForUpdates() {
  const baseUrl = await resolveApiBaseUrl();
  if (baseUrl) {
    return httpRequest(baseUrl, 'GET', '/api/update-check?force=1');
  }
  const checkedAt = new Date().toISOString();
  const releasesHtml = 'https://github.com/emirtdede/agendamea/releases/latest';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7000);
  try {
    const res = await fetch('https://api.github.com/repos/emirtdede/agendamea/releases/latest', {
      signal: controller.signal,
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': `Agendamea/${APP_VERSION} (Vellium)`,
      },
    });
    if (!res.ok) {
      return {
        ok: false,
        currentVersion: APP_VERSION,
        latestVersion: APP_VERSION,
        updateAvailable: false,
        releaseUrl: releasesHtml,
        checkedAt,
        error: `HTTP ${res.status}`,
      };
    }
    const data = await res.json();
    return getReleaseUtils().parseGitHubRelease(data, APP_VERSION, releasesHtml, checkedAt);
  } catch (err) {
    return {
      ok: false,
      currentVersion: APP_VERSION,
      latestVersion: APP_VERSION,
      updateAvailable: false,
      releaseUrl: releasesHtml,
      checkedAt,
      error: err instanceof Error ? err.message : 'Update check failed',
    };
  } finally {
    clearTimeout(timer);
  }
}

function findAvailableLoopbackPort(preferred = 38721) {
  const candidates =
    preferred && preferred > 0
      ? [preferred, 47821, 39721, 41721, 0]
      : [38721, 47821, 39721, 41721, 0];
  const tryNext = (list) =>
    new Promise((resolve, reject) => {
      const [port, ...rest] = list.length > 0 ? list : [0];
      const srv = net.createServer();
      srv.unref();
      srv.once('error', (err) => {
        const errCode = /** @type {NodeJS.ErrnoException} */ (err)?.code;
        if ((errCode === 'EADDRINUSE' || errCode === 'EACCES') && port !== 0) {
          resolve(tryNext(rest));
        } else {
          reject(err);
        }
      });
      srv.listen(port, '127.0.0.1', () => {
        const addr = srv.address();
        const chosen = typeof addr === 'object' && addr ? addr.port : 38721;
        srv.close(() => resolve(chosen));
      });
    });
  return tryNext(candidates);
}

function readRuntimePortMeta() {
  const dir = getCandidateDataDirs()[0];
  if (!dir) return null;
  const portFile = path.join(dir, 'runtime-port.json');
  try {
    if (!fs.existsSync(portFile)) return null;
    return { portFile, ...JSON.parse(fs.readFileSync(portFile, 'utf8')) };
  } catch {
    return null;
  }
}

async function getHeadlessServerStatus() {
  const baseUrl = await resolveApiBaseUrl();
  const meta = readRuntimePortMeta();
  if (baseUrl) {
    const portMatch = /:(\d+)$/.exec(baseUrl);
    const port = portMatch ? Number(portMatch[1]) : meta?.port || null;
    return {
      running: true,
      headless: Boolean(meta?.headless),
      pid: meta?.pid || null,
      port,
      url: baseUrl,
      incomingWebhookUrl: `${baseUrl}/api/webhook/incoming`,
    };
  }
  return {
    running: false,
    headless: false,
    pid: null,
    port: null,
    url: null,
    incomingWebhookUrl: null,
  };
}

function resolveServerSpawnSpec() {
  const appRoot = path.resolve(__dirname, '..', '..');
  const builtServer = path.join(appRoot, 'dist-server', 'server.mjs');
  if (fs.existsSync(builtServer)) {
    return { appRoot, args: [builtServer] };
  }
  const tsxCli = path.join(appRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  const devServer = path.join(appRoot, 'server.ts');
  if (fs.existsSync(tsxCli) && fs.existsSync(devServer)) {
    return { appRoot, args: [tsxCli, devServer] };
  }
  throw new Error('Could not locate Agendamea server bundle (dist-server/server.mjs).');
}

async function startHeadlessServer(options = {}) {
  const existing = await getHeadlessServerStatus();
  if (existing.running && !options.forceNew) {
    return { ok: true, alreadyRunning: true, ...existing };
  }
  const dataDir = getCandidateDataDirs()[0];
  if (!dataDir) throw new Error('Could not resolve Agendamea data directory.');
  fs.mkdirSync(dataDir, { recursive: true });

  const requestedPort =
    options.port !== undefined && options.port !== null ? Number(options.port) : 38721;
  const port = await findAvailableLoopbackPort(
    Number.isInteger(requestedPort) && requestedPort > 0 ? requestedPort : 38721,
  );
  const { appRoot, args } = resolveServerSpawnSpec();

  /** @type {Record<string, string | undefined>} */
  const childEnv = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1',
    NODE_ENV: 'production',
    HOST: '127.0.0.1',
    PORT: String(port),
    AGENDAMEA_DATA_DIR: dataDir,
    AGENDAMEA_APP_ROOT: appRoot,
    AGENDAMEA_HEADLESS_DAEMON: '1',
  };
  delete childEnv.AGENDAMEA_FORCE_OFFLINE;

  if (options.foreground) {
    return new Promise((resolve, reject) => {
      const child = spawn(process.execPath, args, {
        cwd: appRoot,
        env: childEnv,
        stdio: 'inherit',
      });
      child.on('error', reject);
      child.on('exit', (code) =>
        resolve({ ok: code === 0, exited: true, exitCode: code ?? 0, port }),
      );
    });
  }

  const child = spawn(process.execPath, args, {
    cwd: appRoot,
    env: childEnv,
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  child.unref();

  const baseUrl = `http://127.0.0.1:${port}`;
  let healthy = false;
  for (let i = 0; i < 45; i += 1) {
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 400);
      const res = await fetch(`${baseUrl}/api/health`, { signal: controller.signal });
      clearTimeout(t);
      if (res.ok) {
        healthy = true;
        break;
      }
    } catch {
      // Wait for boot
    }
    await new Promise((r) => setTimeout(r, 120));
  }
  if (!healthy) {
    throw new Error(`Headless server failed to start on ${baseUrl}`);
  }
  return {
    ok: true,
    running: true,
    headless: true,
    pid: child.pid,
    port,
    url: baseUrl,
    incomingWebhookUrl: `${baseUrl}/api/webhook/incoming`,
  };
}

async function stopHeadlessServer() {
  const meta = readRuntimePortMeta();
  const baseUrl = await resolveApiBaseUrl();
  if (baseUrl && meta?.headless) {
    try {
      await httpRequest(baseUrl, 'POST', '/api/server/shutdown');
      for (let i = 0; i < 20; i += 1) {
        await new Promise((r) => setTimeout(r, 80));
        const stillUp = await resolveApiBaseUrl();
        if (!stillUp) break;
      }
      return { ok: true, stopped: true, pid: meta.pid || null, port: meta.port || null };
    } catch {
      // Fall back to direct PID kill below
    }
  }
  if (meta?.headless && Number.isInteger(meta.pid)) {
    try {
      process.kill(meta.pid);
    } catch {
      // Already exited
    }
    try {
      if (meta.portFile && fs.existsSync(meta.portFile)) {
        fs.rmSync(meta.portFile, { force: true });
      }
    } catch {
      // Ignore cleanup failure
    }
    return { ok: true, stopped: true, pid: meta.pid, port: meta.port || null };
  }
  if (baseUrl) {
    return {
      ok: false,
      stopped: false,
      error:
        'A live desktop GUI server is running (not a headless daemon). Close the desktop app or pass AGENDAMEA_FORCE_OFFLINE=1.',
    };
  }
  return { ok: true, stopped: false, message: 'No headless server is currently running.' };
}

async function installCli(options = {}) {
  return getCliInstaller().installCliShims({
    runtimeRoot: path.resolve(__dirname, '..', '..'),
    ...options,
  });
}

async function uninstallCli(options = {}) {
  return getCliInstaller().uninstallCliShims(options);
}

module.exports = {
  checkForUpdates,
  getHeadlessServerStatus,
  startHeadlessServer,
  stopHeadlessServer,
  installCli,
  uninstallCli,
};
