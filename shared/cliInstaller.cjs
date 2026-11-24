'use strict';

/**
 * Shared Headless + GUI Windows CLI Shim Installer (ag / agenda / agendamea).
 * Primary mode: deploys native console-subsystem `ag.exe` (+ hardlinked `agenda.exe`, `agendamea.exe`)
 * and `ag.target.json` so CLI and MCP stdio work cleanly in cmd.exe, PowerShell, Git Bash, and
 * Windows MCP hosts (`spawn(..., { shell: false })`) with zero `.cmd` ENOENT and zero PowerShell lag.
 * Fallback mode: unified `.cmd` + `run-cli.ps1` if `cli/bin/ag.exe` is unavailable.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const SHIM_EXE_NAMES = ['ag.exe', 'agenda.exe', 'agendamea.exe'];
const LEGACY_CMD_NAMES = ['ag.cmd', 'agenda.cmd', 'agendamea.cmd', 'run-cli.ps1'];

function getCliBinDir(customBinDir) {
  if (typeof customBinDir === 'string' && customBinDir.trim()) {
    return path.resolve(customBinDir.trim());
  }
  const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  return path.join(localAppData, 'Agendamea', 'bin');
}

function getBundledCliExePath(runtimeRoot) {
  const root = runtimeRoot ? path.resolve(runtimeRoot) : path.resolve(__dirname, '..');
  const candidates = [
    path.join(root, 'cli', 'bin', 'ag.exe'),
    path.join(root, 'resources', 'app.asar.unpacked', 'cli', 'bin', 'ag.exe'),
    path.join(root, 'resources', 'bin', 'ag.exe'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function getCliExecutablePath(customBinDir) {
  const binDir = getCliBinDir(customBinDir);
  const exePath = path.join(binDir, 'ag.exe');
  if (fs.existsSync(exePath)) return exePath;
  return null;
}

function isCliShimsInstalled(customBinDir) {
  const binDir = getCliBinDir(customBinDir);
  const hasNative =
    fs.existsSync(path.join(binDir, 'ag.exe')) &&
    fs.existsSync(path.join(binDir, 'agenda.exe')) &&
    fs.existsSync(path.join(binDir, 'agendamea.exe')) &&
    fs.existsSync(path.join(binDir, 'ag.target.json'));
  if (hasNative) return true;
  return (
    fs.existsSync(path.join(binDir, 'ag.cmd')) &&
    fs.existsSync(path.join(binDir, 'agenda.cmd')) &&
    fs.existsSync(path.join(binDir, 'agendamea.cmd')) &&
    fs.existsSync(path.join(binDir, 'run-cli.ps1'))
  );
}

function resolveDefaultElectronExec(runtimeRoot) {
  const exeName = path.basename(process.execPath || '').toLowerCase();
  if (exeName.includes('agendamea') || exeName.includes('electron')) {
    return process.execPath;
  }
  const candidates = [
    path.join(runtimeRoot, 'node_modules', 'electron', 'dist', 'electron.exe'),
    process.env.LOCALAPPDATA
      ? path.join(process.env.LOCALAPPDATA, 'Programs', 'Agendamea', 'Agendamea.exe')
      : null,
    process.env.ProgramFiles
      ? path.join(process.env.ProgramFiles, 'Agendamea', 'Agendamea.exe')
      : null,
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return process.execPath;
}

function cleanupOldStaleBinaries(binDir) {
  try {
    const entries = fs.readdirSync(binDir);
    for (const entry of entries) {
      if (entry.includes('.old.')) {
        try {
          fs.rmSync(path.join(binDir, entry), { force: true });
        } catch {
          // Still locked by a running session; will be cleaned next run
        }
      }
    }
  } catch {
    // Ignore
  }
}

function safeReplaceBinary(srcFile, dstFile, preferHardlinkFrom) {
  // Windows allows renaming a running .exe so updates never fail with EBUSY while `ag mcp` is active
  if (fs.existsSync(dstFile)) {
    try {
      fs.rmSync(dstFile, { force: true });
    } catch {
      const moved = `${dstFile}.old.${process.pid}.${Date.now()}`;
      try {
        fs.renameSync(dstFile, moved);
      } catch {
        // Ignore; copy attempt below will surface real error if unrecoverable
      }
    }
  }
  if (preferHardlinkFrom && fs.existsSync(preferHardlinkFrom)) {
    try {
      fs.linkSync(preferHardlinkFrom, dstFile);
      return;
    } catch {
      // Cross-volume or policy restriction -> fall back to regular copy
    }
  }
  fs.copyFileSync(srcFile, dstFile);
}

function writeAtomicJson(filePath, obj) {
  const tmpPath = `${filePath}.tmp.${process.pid}.${Date.now()}`;
  fs.writeFileSync(tmpPath, `${JSON.stringify(obj, null, 2)}\n`, 'utf8');
  fs.renameSync(tmpPath, filePath);
}

/** @param {{ runtimeRoot?: string, execPath?: string, binDir?: string }} [options] */
function writeCliShimFiles({ runtimeRoot, execPath, binDir: customBinDir } = {}) {
  const resolvedRoot = runtimeRoot ? path.resolve(runtimeRoot) : path.resolve(__dirname, '..');
  const cliScript = path.join(resolvedRoot, 'cli', 'agendamea.cjs');
  const mcpScript = path.join(resolvedRoot, 'mcp', 'server.cjs');
  const targetExec = execPath || resolveDefaultElectronExec(resolvedRoot);
  const binDir = getCliBinDir(customBinDir);
  fs.mkdirSync(binDir, { recursive: true });
  cleanupOldStaleBinaries(binDir);

  const bundledExe = getBundledCliExePath(resolvedRoot);
  if (bundledExe) {
    const targetConfig = {
      schemaVersion: 1,
      execPath: targetExec,
      cliScript,
      mcpScript,
      runtimeRoot: resolvedRoot,
      updatedAt: new Date().toISOString(),
    };
    writeAtomicJson(path.join(binDir, 'ag.target.json'), targetConfig);

    const primaryExe = path.join(binDir, 'ag.exe');
    safeReplaceBinary(bundledExe, primaryExe, null);
    safeReplaceBinary(bundledExe, path.join(binDir, 'agenda.exe'), primaryExe);
    safeReplaceBinary(bundledExe, path.join(binDir, 'agendamea.exe'), primaryExe);

    // Clean up legacy .cmd/.ps1 shims so PATHEXT resolution is deterministic and clutter-free
    for (const legacy of LEGACY_CMD_NAMES) {
      const legacyPath = path.join(binDir, legacy);
      try {
        if (fs.existsSync(legacyPath)) fs.rmSync(legacyPath, { force: true });
      } catch {
        // Non-fatal
      }
    }
    return binDir;
  }

  // Fallback when native ag.exe has not been compiled yet
  const psHelper = [
    "$env:ELECTRON_RUN_AS_NODE = '1'",
    '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
    '$exe = $args[0]',
    '$script = $args[1]',
    '$rest = @()',
    'if ($args.Length -gt 2) { $rest = $args[2..($args.Length - 1)] }',
    '& $exe $script @rest | Write-Output',
    'exit $LASTEXITCODE',
    '',
  ].join('\r\n');
  fs.writeFileSync(path.join(binDir, 'run-cli.ps1'), psHelper, 'utf8');

  const shimBody = [
    '@echo off',
    'setlocal',
    'chcp 65001 >nul 2>&1',
    'if /I "%~1"=="mcp" if "%~2"=="" (',
    '  set "ELECTRON_RUN_AS_NODE=1"',
    `  "${targetExec}" "${mcpScript}"`,
    '  exit /b %ERRORLEVEL%',
    ')',
    'where node >nul 2>&1',
    'if %ERRORLEVEL%==0 (',
    `  node "${cliScript}" %*`,
    '  if not %ERRORLEVEL%==86 exit /b %ERRORLEVEL%',
    ')',
    `powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0run-cli.ps1" "${targetExec}" "${cliScript}" %*`,
    'exit /b %ERRORLEVEL%',
    '',
  ].join('\r\n');

  for (const name of ['ag.cmd', 'agenda.cmd', 'agendamea.cmd']) {
    fs.writeFileSync(path.join(binDir, name), shimBody, 'utf8');
  }
  return binDir;
}

async function runHiddenPowerShell(psScript, timeoutMs = 10_000) {
  await new Promise(
    /** @param {(v?: void) => void} resolve */ (resolve) => {
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve();
      };
      const child = spawn(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', psScript],
        { stdio: 'ignore', windowsHide: true },
      );
      const timer = setTimeout(() => {
        try {
          child.kill();
        } catch {
          // Ignore already-exited process
        }
        done();
      }, timeoutMs);
      if (typeof timer.unref === 'function') timer.unref();
      child.on('exit', done);
      child.on('error', done);
    },
  );
}

async function installCliShims(options = {}) {
  if (process.platform !== 'win32') {
    return { ok: false, error: 'Only supported on Windows' };
  }
  const binDir = writeCliShimFiles(options);
  if (!options.skipPathUpdate) {
    const escapedBin = binDir.replace(/'/g, "''");
    const psScript = `$b='${escapedBin}'; $cur=[Environment]::GetEnvironmentVariable('Path','User'); $parts=@(); if ($cur) { $parts=$cur -split ';' | Where-Object { $_ -and $_.Trim() -ne '' } }; if (-not ($parts | Where-Object { $_.Trim().TrimEnd('\\').ToLowerInvariant() -eq $b.TrimEnd('\\').ToLowerInvariant() })) { $next=(@($parts + $b) -join ';'); [Environment]::SetEnvironmentVariable('Path',$next,'User') }`;
    await runHiddenPowerShell(psScript);
  }
  const nativeExe = path.join(binDir, 'ag.exe');
  return {
    ok: true,
    binDir,
    installed: true,
    nativeShim: fs.existsSync(nativeExe),
    executablePath: fs.existsSync(nativeExe) ? nativeExe : path.join(binDir, 'ag.cmd'),
  };
}

async function uninstallCliShims(options = {}) {
  if (process.platform !== 'win32') {
    return { ok: false, error: 'Only supported on Windows' };
  }
  const binDir = getCliBinDir(options.binDir);
  for (const file of [...SHIM_EXE_NAMES, 'ag.target.json', ...LEGACY_CMD_NAMES]) {
    const full = path.join(binDir, file);
    try {
      if (fs.existsSync(full)) fs.rmSync(full, { force: true });
    } catch {
      // Ignore individual cleanup errors
    }
  }
  cleanupOldStaleBinaries(binDir);
  if (!options.skipPathUpdate) {
    const escapedBin = binDir.replace(/'/g, "''");
    const psScript = `$b='${escapedBin}'.TrimEnd('\\').ToLowerInvariant(); $cur=[Environment]::GetEnvironmentVariable('Path','User'); if ($cur) { $parts=$cur -split ';' | Where-Object { $_ -and $_.Trim() -ne '' -and $_.Trim().TrimEnd('\\').ToLowerInvariant() -ne $b }; [Environment]::SetEnvironmentVariable('Path',($parts -join ';'),'User') }`;
    await runHiddenPowerShell(psScript);
  }
  return { ok: true, binDir, installed: false };
}

module.exports = {
  getCliBinDir,
  getBundledCliExePath,
  getCliExecutablePath,
  isCliShimsInstalled,
  writeCliShimFiles,
  installCliShims,
  uninstallCliShims,
};
