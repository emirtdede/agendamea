import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSfxV2Bundle } from './pack-sfx-payload.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
const version = pkg.version || '1.1.0';

const setupProjectDir = path.join(rootDir, 'installer', 'Agendamea.Setup');
const setupPublishDir = path.join(
  setupProjectDir,
  'bin',
  'Release',
  'net10.0-windows',
  'win-x64',
  'publish',
);
const stubExePath = path.join(setupPublishDir, 'Agendamea.Setup.exe');
const unpackedDir = path.join(rootDir, 'release', 'win-unpacked');
const finalSetupExe = path.join(rootDir, 'release', `Agendamea-Setup-${version}-win-x64.exe`);

function run(cmd, args, cwd = rootDir) {
  console.log(`[modern-setup] > ${cmd} ${args.join(' ')}`);
  execFileSync(cmd, args, { cwd, stdio: 'inherit' });
}

// 1. Refresh embedded 73-language localization bundle for the setup UI & native CLI console shim
const tsxCli = path.join(rootDir, 'node_modules', 'tsx', 'dist', 'cli.mjs');
run(process.execPath, [tsxCli, 'scripts/generate-installer-locales.mjs']);
run(process.execPath, [path.join(rootDir, 'scripts', 'build-cli-shim.mjs')]);

// 2. Ensure win-unpacked exists (run electron-builder --dir if missing or --rebuild-app passed)
if (
  !fs.existsSync(path.join(unpackedDir, 'Agendamea.exe')) ||
  process.argv.includes('--rebuild-app')
) {
  const ebCli = path.join(rootDir, 'node_modules', 'electron-builder', 'cli.js');
  run(process.execPath, [ebCli, '--win', '--x64', '--dir', '--publish', 'never']);
}

// Ensure electron-updater metadata exists inside win-unpacked/resources/app-update.yml
const appUpdateYmlPath = path.join(unpackedDir, 'resources', 'app-update.yml');
if (!fs.existsSync(appUpdateYmlPath)) {
  const appUpdateContent = [
    'owner: emirtdede',
    'repo: agendamea',
    'provider: github',
    'releaseType: release',
    'updaterCacheDirName: agendamea-updater',
    '',
  ].join('\n');
  fs.writeFileSync(appUpdateYmlPath, appUpdateContent, 'utf8');
}

// 3. Publish native .NET 10 WPF single-file self-contained setup stub
run('dotnet', [
  'publish',
  path.join(setupProjectDir, 'Agendamea.Setup.csproj'),
  '-c',
  'Release',
  '-r',
  'win-x64',
  '--self-contained',
  'true',
  '-p:PublishSingleFile=true',
  '-p:IncludeNativeLibrariesForSelfExtract=true',
  '-p:EnableCompressionInSingleFile=true',
]);

if (!fs.existsSync(stubExePath)) {
  throw new Error(`Published WPF stub not found at ${stubExePath}`);
}

// 4. Pack win-unpacked into parallel indexed Brotli AGM_SFX2 directly onto the WPF stub
const packStats = await buildSfxV2Bundle({
  stubExePath,
  sourceDir: unpackedDir,
  outputExePath: finalSetupExe,
  quality: 8,
});

// 5. Emit electron-updater compatible release/latest.yml with exact SHA-512 & byte size
const finalStat = fs.statSync(finalSetupExe);
const sha512Hash = crypto.createHash('sha512');
{
  const fd = fs.openSync(finalSetupExe, 'r');
  const buf = Buffer.allocUnsafe(1024 * 1024);
  try {
    let bytesRead = fs.readSync(fd, buf, 0, buf.length, null);
    while (bytesRead > 0) {
      sha512Hash.update(buf.subarray(0, bytesRead));
      bytesRead = fs.readSync(fd, buf, 0, buf.length, null);
    }
  } finally {
    fs.closeSync(fd);
  }
}
const sha512Base64 = sha512Hash.digest('base64');
const setupFileName = path.basename(finalSetupExe);
const latestYmlPath = path.join(rootDir, 'release', 'latest.yml');
const latestYml = [
  `version: ${version}`,
  'files:',
  `  - url: ${setupFileName}`,
  `    sha512: ${sha512Base64}`,
  `    size: ${finalStat.size}`,
  `path: ${setupFileName}`,
  `sha512: ${sha512Base64}`,
  `releaseDate: '${new Date().toISOString()}'`,
  '',
].join('\n');
fs.writeFileSync(latestYmlPath, latestYml, 'utf8');

const finalSizeMb = (finalStat.size / (1024 * 1024)).toFixed(2);
const rawMb = (packStats.rawBytes / (1024 * 1024)).toFixed(2);
console.log(
  `[modern-setup] Built single-file Brotli AGM_SFX2 setup: ${finalSetupExe} (${finalSizeMb} MB from ${rawMb} MB / ${packStats.fileCount} files in ${(packStats.elapsedMs / 1000).toFixed(1)}s)`,
);
console.log(`[modern-setup] Wrote updater manifest: ${latestYmlPath}`);
