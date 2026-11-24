'use strict';

const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');

const PREFERRED_PORTS = [38721, 47821, 39721, 41721, 0];

function resolveRuntimeRoot(electronDir) {
  const defaultRoot = path.join(electronDir, '..');
  if (defaultRoot.includes('app.asar')) {
    const unpackedRoot = defaultRoot.replace('app.asar', 'app.asar.unpacked');
    if (fs.existsSync(path.join(unpackedRoot, 'dist-server', 'server.mjs'))) {
      return unpackedRoot;
    }
  }
  return defaultRoot;
}

function getAvailablePort(candidates = PREFERRED_PORTS) {
  const list = Array.isArray(candidates) ? candidates : [candidates, 0];
  const [preferred, ...rest] = list.length > 0 ? list : [0];
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.once('error', (err) => {
      const errCode = /** @type {NodeJS.ErrnoException} */ (err)?.code;
      if ((errCode === 'EADDRINUSE' || errCode === 'EACCES') && preferred !== 0) {
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

function writeRuntimePortFile(userDataDir, port) {
  try {
    fs.mkdirSync(userDataDir, { recursive: true });
    fs.writeFileSync(
      path.join(userDataDir, 'runtime-port.json'),
      JSON.stringify(
        { port: Number(port), pid: process.pid, updatedAt: new Date().toISOString() },
        null,
        2,
      ),
      'utf8',
    );
  } catch {
    // Ignore runtime port write error
  }
}

function createBackendManager(deps) {
  const { app, electronDir, getInitialLocaleInfo, isQuitting } = deps;
  let serverProcess = null;
  let logFd = null;
  let lockedRuntimeFds = [];
  let activePort = null;
  let backendRestartCount = 0;
  let backendStabilityTimer = null;
  let restartTimer = null;
  let reusedExternalDaemon = false;

  const getRuntimeRoot = () => resolveRuntimeRoot(electronDir);

  function lockCriticalRuntimeFiles() {
    const runtimeRoot = getRuntimeRoot();
    const targets = [
      path.join(runtimeRoot, 'dist', 'index.html'),
      path.join(runtimeRoot, 'dist-server', 'server.mjs'),
    ];
    for (const target of targets) {
      try {
        if (fs.existsSync(target)) {
          lockedRuntimeFds.push(fs.openSync(target, 'r'));
        }
      } catch {
        // Ignore lock errors
      }
    }
  }

  function unlockCriticalRuntimeFiles() {
    for (const fd of lockedRuntimeFds) {
      try {
        fs.closeSync(fd);
      } catch {
        // Ignore already closed
      }
    }
    lockedRuntimeFds = [];
  }

  function removeRuntimePortFile() {
    try {
      const portFile = path.join(app.getPath('userData'), 'runtime-port.json');
      if (fs.existsSync(portFile)) {
        fs.rmSync(portFile, { force: true });
      }
    } catch {
      // Ignore cleanup error
    }
  }

  function startBackend(port) {
    const runtimeRoot = getRuntimeRoot();
    const userDataDir = app.getPath('userData');
    const bundledServer = path.join(runtimeRoot, 'dist-server', 'server.mjs');
    const tsxCli = path.join(runtimeRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs');
    const devServer = path.join(runtimeRoot, 'server.ts');

    const args = fs.existsSync(bundledServer)
      ? [bundledServer]
      : fs.existsSync(tsxCli)
        ? [tsxCli, devServer]
        : [devServer];

    if (typeof logFd === 'number') {
      try {
        fs.closeSync(logFd);
      } catch {
        // Ignore already-closed descriptor
      }
      logFd = null;
    }
    const stderrTarget = openServerLogFd(userDataDir);
    if (typeof stderrTarget === 'number') {
      logFd = stderrTarget;
    }

    const localeInfo = getInitialLocaleInfo();

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
    writeRuntimePortFile(userDataDir, port);

    if (backendStabilityTimer) {
      clearTimeout(backendStabilityTimer);
      backendStabilityTimer = null;
    }
    backendStabilityTimer = setTimeout(() => {
      backendStabilityTimer = null;
      if (serverProcess === proc && !isQuitting()) {
        backendRestartCount = 0;
      }
    }, 60_000);
    backendStabilityTimer.unref?.();

    proc.on('exit', (code) => {
      if (backendStabilityTimer) {
        clearTimeout(backendStabilityTimer);
        backendStabilityTimer = null;
      }
      if (serverProcess === proc) {
        serverProcess = null;
      }
      if (!isQuitting() && code !== 0 && backendRestartCount < 5 && activePort) {
        backendRestartCount += 1;
        if (restartTimer) {
          clearTimeout(restartTimer);
          restartTimer = null;
        }
        restartTimer = setTimeout(() => {
          restartTimer = null;
          if (!isQuitting() && !serverProcess) {
            startBackend(activePort);
          }
        }, 600);
        restartTimer.unref?.();
      }
    });
  }

  function stopBackend() {
    if (restartTimer) {
      clearTimeout(restartTimer);
      restartTimer = null;
    }
    if (backendStabilityTimer) {
      clearTimeout(backendStabilityTimer);
      backendStabilityTimer = null;
    }
    if (reusedExternalDaemon) {
      reusedExternalDaemon = false;
      unlockCriticalRuntimeFiles();
      return;
    }
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
    unlockCriticalRuntimeFiles();
    removeRuntimePortFile();
  }

  async function waitForServer(url, timeoutMs = 15000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
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

  async function detectOrAllocatePort() {
    let port = null;
    try {
      const existingPortFile = path.join(app.getPath('userData'), 'runtime-port.json');
      if (fs.existsSync(existingPortFile)) {
        const meta = JSON.parse(fs.readFileSync(existingPortFile, 'utf8'));
        const existingPort = Number(meta?.port);
        if (Number.isInteger(existingPort) && existingPort > 0 && existingPort < 65536) {
          const probeRes = await fetch(`http://127.0.0.1:${existingPort}/api/health`, {
            signal:
              typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(700) : undefined,
          });
          if (probeRes.ok) {
            const health = await probeRes.json().catch(() => null);
            if (
              health &&
              health.ok === true &&
              typeof health.version === 'string' &&
              (health.app === 'Agendamea' || health.headless === true)
            ) {
              port = existingPort;
              activePort = existingPort;
              reusedExternalDaemon = true;
            }
          }
        }
      }
    } catch {
      // No live daemon; launch managed backend
    }

    if (!port) {
      port = process.env.PORT ? Number(process.env.PORT) : await getAvailablePort();
    }
    return { port, reusedExternalDaemon };
  }

  return {
    getRuntimeRoot,
    getActivePort: () => activePort,
    lockCriticalRuntimeFiles,
    unlockCriticalRuntimeFiles,
    startBackend,
    stopBackend,
    waitForServer,
    detectOrAllocatePort,
  };
}

module.exports = {
  PREFERRED_PORTS,
  resolveRuntimeRoot,
  getAvailablePort,
  createBackendManager,
};
