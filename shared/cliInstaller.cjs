'use strict';

/**
 * Shared Headless + GUI Windows CLI Shim Installer (ag / agenda / agendamea).
 * Works identically from Electron main process AND directly from Node/CLI without GUI!
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

function getCliBinDir(customBinDir) {
  if (typeof customBinDir === 'string' && customBinDir.trim()) {
    return path.resolve(customBinDir.trim());
  }
  const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  return path.join(localAppData, 'Agendamea', 'bin');
}

function isCliShimsInstalled(customBinDir) {
  const binDir = getCliBinDir(customBinDir);
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
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Programs', 'Agendamea', 'Agendamea.exe') : null,
    process.env.ProgramFiles ? path.join(process.env.ProgramFiles, 'Agendamea', 'Agendamea.exe') : null,
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return process.execPath;
}

function writeCliShimFiles({ runtimeRoot, execPath, binDir: customBinDir } = {}) {
  const resolvedRoot = runtimeRoot ? path.resolve(runtimeRoot) : path.resolve(__dirname, '..');
  const cliScript = path.join(resolvedRoot, 'cli', 'agendamea.cjs');
  const targetExec = execPath || resolveDefaultElectronExec(resolvedRoot);
  const binDir = getCliBinDir(customBinDir);
  fs.mkdirSync(binDir, { recursive: true });

  const psHelper = [
    "$env:ELECTRON_RUN_AS_NODE = '1'",
    '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
    '$exe = $args[0]',
    '$script = $args[1]',
    '$rest = @()',
    'if ($args.Length -gt 2) { $rest = $args[2..($args.Length - 1)] }',
    '& $exe $script @rest | Out-Host',
    'exit $LASTEXITCODE',
    '',
  ].join('\r\n');
  fs.writeFileSync(path.join(binDir, 'run-cli.ps1'), psHelper, 'utf8');

  const shimBody = [
    '@echo off',
    'setlocal',
    'chcp 65001 >nul 2>&1',
    'if /I "%~1"=="mcp" (',
    '  set "ELECTRON_RUN_AS_NODE=1"',
    `  "${targetExec}" "${cliScript}" %*`,
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

async function runHiddenPowerShell(psScript) {
  await new Promise((resolve) => {
    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', psScript],
      { stdio: 'ignore', windowsHide: true },
    );
    child.on('exit', () => resolve());
    child.on('error', () => resolve());
  });
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
  return { ok: true, binDir, installed: true };
}

async function uninstallCliShims(options = {}) {
  if (process.platform !== 'win32') {
    return { ok: false, error: 'Only supported on Windows' };
  }
  const binDir = getCliBinDir(options.binDir);
  for (const file of ['ag.cmd', 'agenda.cmd', 'agendamea.cmd', 'run-cli.ps1']) {
    const full = path.join(binDir, file);
    try {
      if (fs.existsSync(full)) fs.rmSync(full, { force: true });
    } catch {
      // Ignore individual cleanup errors
    }
  }
  if (!options.skipPathUpdate) {
    const escapedBin = binDir.replace(/'/g, "''");
    const psScript = `$b='${escapedBin}'.TrimEnd('\\').ToLowerInvariant(); $cur=[Environment]::GetEnvironmentVariable('Path','User'); if ($cur) { $parts=$cur -split ';' | Where-Object { $_ -and $_.Trim() -ne '' -and $_.Trim().TrimEnd('\\').ToLowerInvariant() -ne $b }; [Environment]::SetEnvironmentVariable('Path',($parts -join ';'),'User') }`;
    await runHiddenPowerShell(psScript);
  }
  return { ok: true, binDir, installed: false };
}

module.exports = {
  getCliBinDir,
  isCliShimsInstalled,
  writeCliShimFiles,
  installCliShims,
  uninstallCliShims,
};
