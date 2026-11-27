import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const CLEAN_TARGETS = [
  'dist',
  'dist-server',
  'release',
  'release-build',
  'release-verify',
  'dev-dist',
  'coverage',
  'server.js',
  'cli/bin',
  'public/voice-assets',
  'testsprite_tests',
  '.testsprite',
  '.playwright-cli',
  'installer/Agendamea.Portable/bin',
  'installer/Agendamea.Portable/obj',
  'installer/Agendamea.Setup/bin',
  'installer/Agendamea.Setup/obj',
  'installer/Agendamea.Setup.Tests/bin',
  'installer/Agendamea.Setup.Tests/obj',
  'installer/Agendamea.Cli/bin',
  'installer/Agendamea.Cli/obj',
];

let removedCount = 0;
for (const rel of CLEAN_TARGETS) {
  const fullPath = path.join(rootDir, rel);
  if (fs.existsSync(fullPath)) {
    fs.rmSync(fullPath, { recursive: true, force: true, maxRetries: 4, retryDelay: 50 });
    console.log(`[clean] Removed ${rel}`);
    removedCount += 1;
  }
}

console.log(
  `[clean] Workspace clean (${removedCount} target${removedCount === 1 ? '' : 's'} removed).`,
);
