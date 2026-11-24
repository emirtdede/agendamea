import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
const version = process.argv[2] || pkg.version || '1.1.0';

const setupExePath = path.join(rootDir, 'release', `Agendamea-Setup-${version}-win-x64.exe`);
const installerYamlPath = path.join(
  rootDir,
  'winget',
  'manifests',
  'v',
  'Vellium',
  'Agendamea',
  version,
  'Vellium.Agendamea.installer.yaml',
);

if (!fs.existsSync(setupExePath)) {
  console.error(`Setup executable not found at: ${setupExePath}`);
  process.exit(1);
}
if (!fs.existsSync(installerYamlPath)) {
  console.error(`WinGet installer manifest not found at: ${installerYamlPath}`);
  process.exit(1);
}

const sha256 = crypto
  .createHash('sha256')
  .update(fs.readFileSync(setupExePath))
  .digest('hex')
  .toUpperCase();

const yaml = fs.readFileSync(installerYamlPath, 'utf8');
const updated = yaml.replace(/InstallerSha256:\s*[0-9A-Fa-f]{64}/, `InstallerSha256: ${sha256}`);
fs.writeFileSync(installerYamlPath, updated, 'utf8');
console.log(`Updated winget ${version} InstallerSha256 -> ${sha256}`);
