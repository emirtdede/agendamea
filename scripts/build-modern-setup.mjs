import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
const version = pkg.version || '1.1.0';

const setupProjectDir = path.join(rootDir, 'installer', 'Agendamea.Setup');
const setupPublishDir = path.join(setupProjectDir, 'bin', 'Release', 'net10.0-windows', 'win-x64', 'publish');
const stubExePath = path.join(setupPublishDir, 'Agendamea.Setup.exe');
const unpackedDir = path.join(rootDir, 'release', 'win-unpacked');
const tempZipPath = path.join(rootDir, 'release', `Agendamea-${version}-payload.zip`);
const finalSetupExe = path.join(rootDir, 'release', `Agendamea-Setup-${version}-win-x64.exe`);

function run(cmd, args, cwd = rootDir) {
  console.log(`[modern-setup] > ${cmd} ${args.join(' ')}`);
  execFileSync(cmd, args, { cwd, stdio: 'inherit' });
}

// 1. Refresh embedded 73-language localization bundle for the setup UI
const tsxCli = path.join(rootDir, 'node_modules', 'tsx', 'dist', 'cli.mjs');
run(process.execPath, [tsxCli, 'scripts/generate-installer-locales.mjs']);

// 2. Ensure win-unpacked exists (run electron-builder --dir if missing or --rebuild-app passed)
if (!fs.existsSync(path.join(unpackedDir, 'Agendamea.exe')) || process.argv.includes('--rebuild-app')) {
  const ebCli = path.join(rootDir, 'node_modules', 'electron-builder', 'cli.js');
  run(process.execPath, [ebCli, '--win', '--x64', '--dir']);
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

// 4. Zip win-unpacked cleanly using System.IO.Compression.ZipFile (fast, native, UTF-8 safe)
if (fs.existsSync(tempZipPath)) {
  fs.rmSync(tempZipPath, { force: true });
}
const psZipCmd = [
  'Add-Type -AssemblyName System.IO.Compression.FileSystem;',
  `[System.IO.Compression.ZipFile]::CreateFromDirectory('${unpackedDir.replace(/'/g, "''")}', '${tempZipPath.replace(/'/g, "''")}', [System.IO.Compression.CompressionLevel]::Optimal, $false)`,
].join(' ');
run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', psZipCmd]);

// 5. Append ZIP payload + 24-byte AGM_SFX1 trailer onto the WPF stub executable
fs.mkdirSync(path.dirname(finalSetupExe), { recursive: true });
const stubStat = fs.statSync(stubExePath);
const zipStat = fs.statSync(tempZipPath);
const payloadOffset = BigInt(stubStat.size);
const payloadLength = BigInt(zipStat.size);

const outFd = fs.openSync(finalSetupExe, 'w');
try {
  const copyFileInto = (srcPath) => {
    const inFd = fs.openSync(srcPath, 'r');
    const buf = Buffer.allocUnsafe(1024 * 1024);
    try {
      let bytesRead = 0;
      while ((bytesRead = fs.readSync(inFd, buf, 0, buf.length, null)) > 0) {
        fs.writeSync(outFd, buf, 0, bytesRead);
      }
    } finally {
      fs.closeSync(inFd);
    }
  };

  copyFileInto(stubExePath);
  copyFileInto(tempZipPath);

  const footer = Buffer.alloc(24);
  footer.write('AGM_SFX1', 0, 8, 'ascii');
  footer.writeBigInt64LE(payloadOffset, 8);
  footer.writeBigInt64LE(payloadLength, 16);
  fs.writeSync(outFd, footer, 0, footer.length);
} finally {
  fs.closeSync(outFd);
}

// Clean up temporary payload zip
fs.rmSync(tempZipPath, { force: true });

const finalSizeMb = (fs.statSync(finalSetupExe).size / (1024 * 1024)).toFixed(2);
console.log(`[modern-setup] Built single-file modern setup: ${finalSetupExe} (${finalSizeMb} MB)`);
