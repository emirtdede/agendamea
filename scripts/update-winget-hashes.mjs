import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const setupExePath = path.join(rootDir, 'release', 'Agendamea-Setup-1.0.0-win-x64.exe');
const installerYamlPath = path.join(
  rootDir,
  'winget',
  'manifests',
  'v',
  'Vellium',
  'Agendamea',
  '1.0.0',
  'Vellium.Agendamea.installer.yaml',
);

if (!fs.existsSync(setupExePath)) {
  console.error(`Setup executable not found at: ${setupExePath}`);
  process.exit(1);
}

const sha256 = crypto
  .createHash('sha256')
  .update(fs.readFileSync(setupExePath))
  .digest('hex')
  .toUpperCase();

const yaml = fs.readFileSync(installerYamlPath, 'utf8');
const updated = yaml.replace(
  /InstallerSha256:\s*[0-9A-Fa-f]{64}/,
  `InstallerSha256: ${sha256}`,
);
fs.writeFileSync(installerYamlPath, updated, 'utf8');
console.log(`Updated winget InstallerSha256 -> ${sha256}`);
