import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSfxV2Bundle } from './pack-sfx-payload.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
const version = pkg.version || '1.1.0';

const portableProjectDir = path.join(rootDir, 'installer', 'Agendamea.Portable');
const portablePublishDir = path.join(
  portableProjectDir,
  'bin',
  'Release',
  'net10.0-windows',
  'win-x64',
  'publish',
);
const stubExePath = path.join(portablePublishDir, 'Agendamea.Portable.exe');
const unpackedDir = path.join(rootDir, 'release', 'win-unpacked');
const finalPortableExe = path.join(rootDir, 'release', `Agendamea-Portable-${version}-win-x64.exe`);

function run(cmd, args, cwd = rootDir) {
  console.log(`[fast-portable] > ${cmd} ${args.join(' ')}`);
  execFileSync(cmd, args, { cwd, stdio: 'inherit' });
}

// 1. Ensure win-unpacked exists (run electron-builder --dir if missing or --rebuild-app passed)
if (
  !fs.existsSync(path.join(unpackedDir, 'Agendamea.exe')) ||
  process.argv.includes('--rebuild-app')
) {
  const ebCli = path.join(rootDir, 'node_modules', 'electron-builder', 'cli.js');
  run(process.execPath, [ebCli, '--win', '--x64', '--dir', '--publish', 'never']);
}

// 2. Publish NativeAOT .NET 10 portable cache launcher stub (~2 MB, zero %TEMP%\.net extract, <5ms warm start)
run('dotnet', [
  'publish',
  path.join(portableProjectDir, 'Agendamea.Portable.csproj'),
  '-c',
  'Release',
  '-r',
  'win-x64',
]);

if (!fs.existsSync(stubExePath)) {
  throw new Error(`Published NativeAOT portable stub not found at ${stubExePath}`);
}

const stubMb = (fs.statSync(stubExePath).size / (1024 * 1024)).toFixed(2);
console.log(`[fast-portable] NativeAOT launcher stub: ${stubMb} MB`);

// 3. Pack win-unpacked into parallel indexed Brotli AGM_SFX2 directly onto NativeAOT stub
const packStats = await buildSfxV2Bundle({
  stubExePath,
  sourceDir: unpackedDir,
  outputExePath: finalPortableExe,
  quality: 8,
});

const finalStat = fs.statSync(finalPortableExe);
const finalSizeMb = (finalStat.size / (1024 * 1024)).toFixed(2);
const rawMb = (packStats.rawBytes / (1024 * 1024)).toFixed(2);
console.log(
  `[fast-portable] Built NativeAOT + Brotli AGM_SFX2 portable: ${finalPortableExe} (${finalSizeMb} MB from ${rawMb} MB / ${packStats.fileCount} files in ${(packStats.elapsedMs / 1000).toFixed(1)}s)`,
);
