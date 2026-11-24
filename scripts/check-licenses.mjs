import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const lockPath = path.join(rootDir, 'package-lock.json');
if (!fs.existsSync(lockPath)) {
  console.error('[license-check] package-lock.json not found.');
  process.exit(1);
}

const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
const packages = lock.packages || {};

// Strong copyleft licenses prohibited in commercial/MIT desktop runtime bundles
const FORBIDDEN_PATTERN = /\b(AGPL|GPL-2|GPL-3|GPLv2|GPLv3|SSPL|BUSL|CPAL|EUPL)\b/i;

const violations = [];
let checkedProdCount = 0;

for (const [pkgPath, meta] of Object.entries(packages)) {
  if (!pkgPath || pkgPath === '') continue;
  if (meta.dev === true) continue;
  checkedProdCount += 1;
  const license = typeof meta.license === 'string' ? meta.license : 'UNKNOWN';
  // Allow dual-licensed packages that include MIT / Apache-2.0 / BSD / ISC
  const hasPermissiveAlternative = /\b(MIT|Apache-2\.0|BSD|ISC|CC0|Unlicense|0BSD)\b/i.test(
    license,
  );
  if (FORBIDDEN_PATTERN.test(license) && !hasPermissiveAlternative) {
    violations.push({ pkgPath, version: meta.version || '?', license });
  }
}

if (violations.length > 0) {
  console.error('[license-check] FAIL: Forbidden copyleft runtime dependencies detected:');
  for (const v of violations) {
    console.error(`  - ${v.pkgPath}@${v.version}: ${v.license}`);
  }
  process.exit(1);
}

console.log(
  `[license-check] PASS (${checkedProdCount} runtime packages verified, 0 forbidden licenses).`,
);
