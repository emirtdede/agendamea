import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const srcCs = path.join(rootDir, 'installer', 'Agendamea.Cli', 'Program.cs');
const csproj = path.join(rootDir, 'installer', 'Agendamea.Cli', 'Agendamea.Cli.csproj');
const outDir = path.join(rootDir, 'cli', 'bin');
const outExe = path.join(outDir, 'ag.exe');

fs.mkdirSync(outDir, { recursive: true });

/**
 * Build native Windows Console-subsystem (IMAGE_SUBSYSTEM_WINDOWS_CUI) launcher `cli/bin/ag.exe`.
 * Strategy:
 * 1. Prefer Windows built-in .NET Framework 4.x x64 `csc.exe`: produces a ~12 KB CUI binary in <0.5s
 *    with zero external NuGet dependencies and 100% Windows 10/11 compatibility.
 * 2. Fallback: .NET 10 NativeAOT (`PublishAot=true`) or trimmed single-file self-contained `dotnet publish`.
 */
function tryBuildWithFrameworkCsc() {
  const candidates = [
    path.join(
      process.env.WINDIR || 'C:\\Windows',
      'Microsoft.NET',
      'Framework64',
      'v4.0.30319',
      'csc.exe',
    ),
    path.join(
      process.env.WINDIR || 'C:\\Windows',
      'Microsoft.NET',
      'Framework',
      'v4.0.30319',
      'csc.exe',
    ),
  ];
  const csc = candidates.find((p) => fs.existsSync(p));
  if (!csc) return false;

  const iconPath = path.join(rootDir, 'electron-resources', 'icon.ico');
  const args = [
    '/nologo',
    '/target:exe',
    '/platform:x64',
    '/optimize+',
    '/highentropyva+',
    `/out:${outExe}`,
  ];
  if (fs.existsSync(iconPath)) {
    args.push(`/win32icon:${iconPath}`);
  }
  args.push(srcCs);

  execFileSync(csc, args, { cwd: rootDir, stdio: 'inherit' });
  return fs.existsSync(outExe);
}

function tryBuildWithDotnetPublish() {
  const publishDir = path.join(
    rootDir,
    'installer',
    'Agendamea.Cli',
    'bin',
    'Release',
    'net10.0-windows',
    'win-x64',
    'publish',
  );
  execFileSync(
    'dotnet',
    [
      'publish',
      csproj,
      '-c',
      'Release',
      '-r',
      'win-x64',
      '--self-contained',
      'true',
      '-p:PublishSingleFile=true',
      '-p:PublishTrimmed=true',
      '-p:EnableCompressionInSingleFile=true',
    ],
    { cwd: rootDir, stdio: 'inherit' },
  );
  const built = path.join(publishDir, 'ag.exe');
  if (!fs.existsSync(built)) return false;
  fs.copyFileSync(built, outExe);
  return true;
}

if (process.platform !== 'win32') {
  console.log('[build-cli-shim] Skipping Windows ag.exe build on non-Windows platform.');
  process.exit(0);
}

const built = tryBuildWithFrameworkCsc() || tryBuildWithDotnetPublish();
if (!built) {
  throw new Error('Failed to build cli/bin/ag.exe via csc.exe or dotnet publish.');
}

const stat = fs.statSync(outExe);
console.log(
  `[build-cli-shim] Built native console shim: ${outExe} (${(stat.size / 1024).toFixed(1)} KB)`,
);
