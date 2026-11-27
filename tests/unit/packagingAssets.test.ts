import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { TodoDatabase } from '../../src/db/database';
import {
  buildCustomThemeTokens,
  clampZoomPercent,
  getContrastingForeground,
  isValidAppIconId,
  isValidThemeId,
  resolveAppIconColors,
  resolveEffectiveThemeMode,
} from '../../src/utils/themes';

test('QA: Agendamea Windows, Microsoft Store, and PWA icons & logos exist with valid headers', () => {
  const requiredFiles = [
    'public/favicon.ico',
    'public/icon.svg',
    'public/icon-maskable.svg',
    'public/pwa-192x192.png',
    'public/pwa-512x512.png',
    'public/pwa-maskable-192x192.png',
    'public/pwa-maskable-512x512.png',
    'public/apple-touch-icon.png',
    'public/browserconfig.xml',
    'public/og-image.png',
    'public/icons/agendamea.ico',
    'public/icons/favicon-16x16.png',
    'public/icons/favicon-32x32.png',
    'public/icons/icon-1024x1024.png',
    'public/icons/icon-512x512.webp',
    'public/icons/mstile-144x144.png',
    'public/icons/mstile-310x150.png',
    'public/icons/windows/SmallTile.scale-100.png',
    'public/icons/windows/Square44x44Logo.targetsize-256.png',
    'public/icons/windows/Square150x150Logo.scale-200.png',
    'public/icons/windows/Wide310x150Logo.scale-200.png',
    'public/icons/windows/LargeTile.scale-200.png',
    'public/icons/windows/StoreLogo.scale-200.png',
    'public/icons/windows/SplashScreen.scale-200.png',
    'public/logos/agendamea-logo-light.svg',
    'public/logos/agendamea-logo-dark.svg',
    'public/logos/agendamea-logo-light.png',
    'public/logos/agendamea-logo-dark.png',
  ];

  for (const rel of requiredFiles) {
    const full = path.join(process.cwd(), rel);
    assert.ok(fs.existsSync(full), `Missing asset: ${rel}`);
    const stat = fs.statSync(full);
    assert.ok(stat.size > 100, `Asset unexpectedly empty: ${rel}`);
  }

  // Verify Windows ICO header (00 00 01 00 + 7 embedded resolutions: 16..256)
  const ico = fs.readFileSync(path.join(process.cwd(), 'public/favicon.ico'));
  assert.equal(ico.readUInt16LE(0), 0);
  assert.equal(ico.readUInt16LE(2), 1);
  assert.equal(ico.readUInt16LE(4), 7);
});

test('QA: Windows 11 Electron installer/uninstaller assets, BMP headers, UTF-8 BOM nsh & Vellium metadata are valid', () => {
  const root = process.cwd();
  const resDir = path.join(root, 'electron-resources');

  // 1. Validate 24-bit uncompressed Windows DIB BMP headers & exact NSIS dimensions
  const expectedBmps: Array<[string, number, number]> = [
    ['installerSidebar.bmp', 164, 314],
    ['uninstallerSidebar.bmp', 164, 314],
    ['installerHeader.bmp', 150, 57],
  ];
  for (const [file, width, height] of expectedBmps) {
    const buf = fs.readFileSync(path.join(resDir, file));
    assert.equal(buf.subarray(0, 2).toString('ascii'), 'BM', `${file} must have BM magic`);
    assert.equal(buf.readInt32LE(18), width, `${file} width mismatch`);
    assert.equal(buf.readInt32LE(22), height, `${file} height mismatch`);
    assert.equal(buf.readUInt16LE(28), 24, `${file} must be 24-bit BMP for NSIS MUI2`);
    assert.equal(buf.readUInt32LE(30), 0, `${file} must be uncompressed BI_RGB`);
  }

  // 2. Validate Windows multi-resolution ICO headers & full alignment across app/setup/uninstaller/runtime icons
  const appIcoBuf = fs.readFileSync(path.join(resDir, 'icon.ico'));
  for (const icoFile of ['icon.ico', 'installer.ico', 'uninstaller.ico']) {
    const buf = fs.readFileSync(path.join(resDir, icoFile));
    assert.equal(buf.readUInt16LE(0), 0);
    assert.equal(buf.readUInt16LE(2), 1);
    assert.ok(buf.readUInt16LE(4) >= 7, `${icoFile} should have at least 7 resolutions`);
    assert.ok(
      buf.equals(appIcoBuf),
      `${icoFile} must match icon.ico with clean centered pure-white monogram`,
    );
  }
  assert.ok(
    !fs.existsSync(path.join(root, 'public', 'assets', 'aistudio')),
    'Unused public/assets/aistudio directory must stay removed',
  );

  // 3. Validate UTF-8 BOM NSIS script, DisplayIcon override, shell cache refresh & Vellium publisher info
  const nshBuf = fs.readFileSync(path.join(resDir, 'installer.nsh'));
  assert.equal(nshBuf[0], 0xef);
  assert.equal(nshBuf[1], 0xbb);
  assert.equal(nshBuf[2], 0xbf);
  const nshText = nshBuf.toString('utf8');
  assert.ok(nshText.includes('Vellium'));
  assert.ok(nshText.includes('https://vellium.dev'));
  assert.ok(nshText.includes('support@vellium.dev'));
  // biome-ignore lint/suspicious/noTemplateCurlyInString: literal NSIS installer macro syntax
  assert.ok(nshText.includes('"DisplayIcon" "$INSTDIR\\${APP_EXECUTABLE_FILENAME},0"'));
  assert.ok(nshText.includes('Shell32::SHChangeNotify'));

  // 4. Validate electron-builder.yml, Microsoft Store appx assets (zero SampleAppx Electron icon leakage) & package.json alignment
  const appxDir = path.join(resDir, 'appx');
  const requiredAppxAssets = [
    'StoreLogo.png',
    'StoreLogo.scale-100.png',
    'StoreLogo.scale-200.png',
    'Square150x150Logo.png',
    'Square150x150Logo.scale-100.png',
    'Square150x150Logo.scale-200.png',
    'Square44x44Logo.png',
    'Square44x44Logo.scale-100.png',
    'Square44x44Logo.targetsize-256.png',
    'Square44x44Logo.altform-unplated_targetsize-256.png',
    'Wide310x150Logo.png',
    'Wide310x150Logo.scale-100.png',
    'LargeTile.png',
    'LargeTile.scale-100.png',
    'SmallTile.png',
    'SmallTile.scale-100.png',
    'SplashScreen.png',
    'SplashScreen.scale-100.png',
    'BadgeLogo.png',
    'BadgeLogo.scale-100.png',
  ];
  for (const assetName of requiredAppxAssets) {
    const assetPath = path.join(appxDir, assetName);
    assert.ok(
      fs.existsSync(assetPath),
      `Missing Microsoft Store AppX asset: electron-resources/appx/${assetName}`,
    );
    assert.ok(fs.statSync(assetPath).size > 100, `Empty AppX asset: ${assetName}`);
  }

  const builderYml = fs.readFileSync(path.join(root, 'electron-builder.yml'), 'utf8');
  assert.ok(builderYml.includes('appId: dev.vellium.agendamea'));
  assert.ok(builderYml.includes('Vellium (vellium.dev)'));
  assert.ok(builderYml.includes('identityName: Vellium.Agendamea'));
  assert.ok(builderYml.includes('publisherDisplayName: Vellium'));
  assert.ok(builderYml.includes('electron-resources/icon.ico'));
  assert.ok(builderYml.includes('installerSidebar: electron-resources/installerSidebar.bmp'));
  assert.ok(builderYml.includes('uninstallerSidebar: electron-resources/uninstallerSidebar.bmp'));
  assert.ok(builderYml.includes('installerHeader: electron-resources/installerHeader.bmp'));
  assert.ok(
    builderYml.includes('unpackDirName: true'),
    'portable.unpackDirName must be true so second portable launches unpack into isolated $PLUGINSDIR instead of wiping active runtime files',
  );
  const electronMainSrc = fs.readFileSync(path.join(root, 'electron', 'main.cjs'), 'utf8');
  assert.ok(electronMainSrc.includes('PORTABLE_EXECUTABLE_FILE'));
  assert.ok(electronMainSrc.includes('icudtl.dat'));

  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.main, 'electron/main.cjs');
  assert.equal(pkg.version, '1.1.0');
  assert.equal(pkg.author.name, 'Vellium');
  assert.equal(pkg.author.email, 'support@vellium.dev');
  assert.equal(pkg.homepage, 'https://vellium.dev');
  assert.equal(pkg.repository.url, 'https://github.com/emirtdede/agendamea.git');
  assert.equal(pkg.bugs.url, 'https://github.com/emirtdede/agendamea/issues');
  assert.equal(pkg.dependencies['@google/genai'], undefined);
});

test('QA: Custom HEX theme tokens, dynamic App Icon generator (.ico), accessibility & closeBehavior persist cleanly', async () => {
  // 1. Custom HEX theme generator produces WCAG-contrasting tokens in both light and dark modes
  assert.equal(isValidThemeId('custom'), true);
  assert.equal(isValidAppIconId('match-theme'), true);
  assert.equal(isValidAppIconId('obsidian-light'), true);
  assert.equal(isValidAppIconId('custom'), true);
  assert.equal(getContrastingForeground('#ffffff'), '#09090b');
  assert.equal(getContrastingForeground('#18181b'), '#ffffff');

  const lightCustom = buildCustomThemeTokens('#14b8a6', 'light');
  const darkCustom = buildCustomThemeTokens('#14b8a6', 'dark');
  assert.equal(lightCustom.accent, '#14b8a6');
  assert.ok(darkCustom.canvas.startsWith('#') && darkCustom.accentFg.startsWith('#'));

  const obsidianDarkMatch = resolveAppIconColors('match-theme', 'obsidian', 'dark');
  assert.equal(obsidianDarkMatch.bg, '#111114');
  assert.equal(obsidianDarkMatch.fg, '#fafafa');
  const obsidianLightManual = resolveAppIconColors('obsidian-light', 'obsidian', 'dark');
  assert.equal(obsidianLightManual.bg, '#fafafa');
  assert.equal(obsidianLightManual.fg, '#111114');

  const iconMatch = resolveAppIconColors('match-theme', 'custom', 'dark', '#ff4d8d');
  assert.equal(iconMatch.bg, '#ff4d8d');
  const iconCustom = resolveAppIconColors('custom', 'obsidian', 'light', '#2563eb', '#f59e0b');
  assert.equal(iconCustom.bg, '#f59e0b');
  assert.equal(iconCustom.fg, '#09090b');

  // 2. Accessibility zoom clamping
  assert.equal(clampZoomPercent(50), 80);
  assert.equal(clampZoomPercent(124), 125);
  assert.equal(clampZoomPercent(220), 150);

  // 3. Pure-Node dynamic .ico generator produces valid multi-resolution Windows ICO with 7 PNG frames
  const { createRequire } = await import('node:module');
  const req = createRequire(import.meta.url);
  const iconGen = req(path.join(process.cwd(), 'electron', 'iconGenerator.cjs'));
  const { icoBuffer, trayPngBuffer } = iconGen.buildMultiSizeIcoBuffer('#7c3aed', '#ffffff');
  assert.equal(icoBuffer.readUInt16LE(0), 0);
  assert.equal(icoBuffer.readUInt16LE(2), 1);
  assert.equal(icoBuffer.readUInt16LE(4), 7);
  assert.deepEqual(
    Array.from(trayPngBuffer.subarray(0, 8)),
    [137, 80, 78, 71, 13, 10, 26, 10],
    'Tray icon buffer must be a valid PNG image',
  );

  // 4. SQLite persistence for customThemeColor, appIconId, customIconColor, zoomPercent, highContrast, reducedMotion, closeBehavior
  const db = new TodoDatabase(':memory:');
  try {
    const updated = db.updateSettings({
      themeId: 'custom',
      customThemeColor: '#0EA5E9',
      appIconId: 'custom',
      customIconColor: '#EC4899',
      zoomPercent: 125,
      highContrast: true,
      reducedMotion: true,
      closeBehavior: 'tray',
      themeMode: 'system',
      launchAtStartup: true,
      globalQuickAddShortcut: false,
    });
    assert.equal(updated.themeId, 'custom');
    assert.equal(updated.customThemeColor, '#0ea5e9');
    assert.equal(updated.appIconId, 'custom');
    assert.equal(updated.customIconColor, '#ec4899');
    assert.equal(updated.zoomPercent, 125);
    assert.equal(updated.highContrast, true);
    assert.equal(updated.reducedMotion, true);
    assert.equal(updated.closeBehavior, 'tray');
    assert.equal(updated.themeMode, 'system');
    assert.equal(updated.launchAtStartup, true);
    assert.equal(updated.globalQuickAddShortcut, false);
    assert.ok(['light', 'dark'].includes(resolveEffectiveThemeMode('system')));
  } finally {
    db.close();
  }

  // 5. NSIS installer.nsh & electron-builder.yml enable native .onInit language switching for Setup & Uninstaller
  const nshText = fs.readFileSync(
    path.join(process.cwd(), 'electron-resources', 'installer.nsh'),
    'utf8',
  );
  const ebYml = fs.readFileSync(path.join(process.cwd(), 'electron-builder.yml'), 'utf8');
  assert.ok(
    ebYml.includes('displayLanguageSelector: true'),
    'Setup must show native language selector before wizard opens',
  );
  assert.ok(
    nshText.includes('GetUserDefaultUILanguage'),
    'Setup must auto-detect Windows display language',
  );
  assert.ok(
    nshText.includes('StrCpy $LANGUAGE 1033'),
    'Setup must fall back to English (1033) for unsupported OS languages',
  );
  assert.ok(
    nshText.includes('!macro preInit'),
    'Windows language detection must run in preInit before MUI_LANGDLL_DISPLAY',
  );
  assert.ok(
    nshText.includes('!macro customUnInit'),
    'Uninstaller must restore Setup language in customUnInit before UI opens',
  );
  assert.ok(
    nshText.includes('MUI_LANGDLL_ALLLANGUAGES'),
    'Unicode language selector must show all bundled languages',
  );
  assert.ok(
    nshText.includes('InstallerLanguage'),
    'Setup and Uninstaller must share chosen language via registry',
  );
  assert.ok(
    nshText.includes('installer-language.txt'),
    'Setup must pass chosen language to Agendamea on first launch',
  );
  assert.ok(
    nshText.includes('LangString UN_DATA_TITLE 1055'),
    'Uninstaller custom page must be localized via LangString',
  );
  assert.ok(
    nshText.includes('LangString UN_DATA_TITLE 1031'),
    'Uninstaller custom page must include non-TR/EN LangStrings',
  );

  // 6. Winget manifest files exist and contain valid Vellium.Agendamea 1.0.0 schema metadata
  const wingetDir = path.join(
    process.cwd(),
    'winget',
    'manifests',
    'v',
    'Vellium',
    'Agendamea',
    '1.0.0',
  );
  for (const manifestFile of [
    'Vellium.Agendamea.yaml',
    'Vellium.Agendamea.installer.yaml',
    'Vellium.Agendamea.locale.en-US.yaml',
    'Vellium.Agendamea.locale.tr-TR.yaml',
  ]) {
    const manifestText = fs.readFileSync(path.join(wingetDir, manifestFile), 'utf8');
    assert.ok(
      manifestText.includes('PackageIdentifier: Vellium.Agendamea'),
      `${manifestFile} must specify PackageIdentifier`,
    );
    assert.ok(
      manifestText.includes('PackageVersion: 1.0.0'),
      `${manifestFile} must specify PackageVersion 1.0.0`,
    );
  }

  // 7. Zero-cost silent/delta auto-updater (electron-updater) wiring & Microsoft Store Policy 10.2.7 isolation
  const electronSources = [
    path.join(process.cwd(), 'electron', 'main.cjs'),
    path.join(process.cwd(), 'electron', 'modules', 'updater.cjs'),
    path.join(process.cwd(), 'electron', 'modules', 'backendProcess.cjs'),
  ]
    .map((fp) => fs.readFileSync(fp, 'utf8'))
    .join('\n');
  const releaseYml = fs.readFileSync(
    path.join(process.cwd(), '.github', 'workflows', 'release.yml'),
    'utf8',
  );
  assert.ok(
    ebYml.includes('provider: github'),
    'electron-builder.yml must configure GitHub publish provider for latest.yml & app-update.yml',
  );
  assert.ok(
    ebYml.includes('node_modules/electron-updater/**'),
    'electron-builder.yml must bundle electron-updater in files',
  );
  assert.ok(
    releaseYml.includes('release/latest.yml'),
    'GitHub Release workflow must publish latest.yml for delta auto-updates',
  );
  assert.ok(
    electronSources.includes("require('electron-updater')"),
    'Electron main process must integrate electron-updater',
  );
  assert.ok(
    electronSources.includes('quitAndInstall(true, true)'),
    'Electron main process must support silent quitAndInstall',
  );
  assert.ok(
    electronSources.includes('!process.windowsStore'),
    'Native auto-updater must stay disabled inside Microsoft Store builds',
  );
});
