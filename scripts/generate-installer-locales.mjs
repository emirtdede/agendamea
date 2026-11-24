import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SUPPORTED_LANGUAGES } from '../src/i18n/languages.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const outPath = path.resolve(
  __dirname,
  '..',
  'installer',
  'Agendamea.Setup',
  'Localization',
  'locales.json',
);

const REQUIRED_KEYS = [
  'windowTitle',
  'uninstallWindowTitle',
  'tagline',
  'installButton',
  'optionsButton',
  'optionsTitle',
  'languageLabel',
  'installDirLabel',
  'browseButton',
  'desktopShortcutLabel',
  'startMenuShortcutLabel',
  'launchAtStartupLabel',
  'installCliLabel',
  'diskRequiredLabel',
  'stepPreparing',
  'stepClosingApp',
  'stepExtracting',
  'stepIntegrating',
  'stepFinalizing',
  'doneTitle',
  'doneSubtitle',
  'closeButton',
  'launchButton',
  'uninstallTitle',
  'uninstallSubtitle',
  'deleteUserDataLabel',
  'cancelButton',
  'uninstallButton',
  'uninstallingStep',
  'uninstalledTitle',
  'uninstalledSubtitle',
  'errorTitle',
  'retryButton',
  'footerText',
  'closeOptionsTooltip',
];

function cleanDash(value) {
  return String(value ?? '').replace(/[\u2013\u2014]/g, '-');
}

const existing = JSON.parse(fs.readFileSync(outPath, 'utf8'));
const byCode = new Map(existing.map((e) => [e.code, e]));

const normalized = SUPPORTED_LANGUAGES.map((meta) => {
  const entry = byCode.get(meta.code);
  if (!entry) {
    throw new Error(`Missing installer locale for ${meta.code} in ${outPath}`);
  }
  const out = {
    code: meta.code,
    nativeName: cleanDash(meta.nativeName),
    englishName: cleanDash(meta.englishName),
    dir: meta.dir,
  };
  for (const key of REQUIRED_KEYS) {
    const val = cleanDash(entry[key]).trim();
    if (!val) {
      throw new Error(`Empty installer locale key ${meta.code}.${key}`);
    }
    if (key !== 'footerText' && val.includes(' · ')) {
      throw new Error(`Synthetic dot-glue detected in ${meta.code}.${key}: ${val}`);
    }
    out[key] = val;
  }
  return out;
});

fs.writeFileSync(outPath, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
console.log(
  `Validated & preserved ${normalized.length} installer locales (${REQUIRED_KEYS.length} keys each) at ${outPath}`,
);
