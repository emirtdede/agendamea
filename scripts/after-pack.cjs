'use strict';

const fs = require('node:fs');
const path = require('node:path');

const KEEP_CHROMIUM_LOCALES = new Set(['en-US.pak', 'tr.pak']);

function getDirSizeAndCount(targetPath) {
  let bytes = 0;
  let files = 0;
  const walk = (p) => {
    let st;
    try {
      st = fs.lstatSync(p);
    } catch {
      return;
    }
    if (st.isDirectory()) {
      for (const entry of fs.readdirSync(p)) {
        walk(path.join(p, entry));
      }
    } else if (st.isFile()) {
      bytes += st.size;
      files += 1;
    }
  };
  walk(targetPath);
  return { bytes, files };
}

/**
 * Electron Builder afterPack hook:
 * 1. Prunes unused Chromium locales/*.pak (keeps en-US.pak & tr.pak -> saves ~47.6 MB / 53 files).
 * 2. Prunes non-win32-x64 better-sqlite3 prebuilds (saves ~14.5 MB / 7 native binaries).
 * 3. Prunes Windows Store tile assets (dist/icons/windows) on non-APPX builds (saves 95 loose files).
 *
 * @param {import('electron-builder').AfterPackContext} context
 */
exports.default = async function afterPack(context) {
  const appOutDir = context.appOutDir;
  let removedFiles = 0;
  let removedBytes = 0;

  // 1. Prune unused Chromium locale .pak files (Agendamea uses its own JSON i18n bundles)
  const localesDir = path.join(appOutDir, 'locales');
  if (fs.existsSync(localesDir)) {
    for (const file of fs.readdirSync(localesDir)) {
      if (!file.endsWith('.pak') || KEEP_CHROMIUM_LOCALES.has(file)) continue;
      const full = path.join(localesDir, file);
      try {
        const size = fs.statSync(full).size;
        fs.rmSync(full, { force: true });
        removedFiles += 1;
        removedBytes += size;
      } catch {
        // Ignore locked locale file
      }
    }
  }

  // 2. Prune non-win32-x64 better-sqlite3 prebuilds
  const unpackedDir = path.join(appOutDir, 'resources', 'app.asar.unpacked');
  const prebuildsDir = path.join(unpackedDir, 'node_modules', 'better-sqlite3', 'prebuilds');
  if (fs.existsSync(prebuildsDir)) {
    const targetPrefix =
      context.electronPlatformName === 'win32'
        ? context.arch === 3 // Arch.arm64
          ? 'win32-arm64'
          : 'win32-x64'
        : `${context.electronPlatformName}-`;
    for (const entry of fs.readdirSync(prebuildsDir)) {
      if (entry.startsWith(targetPrefix)) continue;
      const full = path.join(prebuildsDir, entry);
      const stats = getDirSizeAndCount(full);
      try {
        fs.rmSync(full, { recursive: true, force: true });
        removedFiles += stats.files;
        removedBytes += stats.bytes;
      } catch {
        // Ignore cleanup failure
      }
    }
  }

  // 3. Prune Microsoft Store tile PNGs (dist/icons/windows) when NOT packaging APPX
  const isAppxTarget = Array.isArray(context.targets)
    ? context.targets.some((t) => String(t?.name || '').toLowerCase() === 'appx')
    : false;
  if (!isAppxTarget) {
    const storeIconsDir = path.join(unpackedDir, 'dist', 'icons', 'windows');
    if (fs.existsSync(storeIconsDir)) {
      const stats = getDirSizeAndCount(storeIconsDir);
      try {
        fs.rmSync(storeIconsDir, { recursive: true, force: true });
        removedFiles += stats.files;
        removedBytes += stats.bytes;
      } catch {
        // Ignore cleanup failure
      }
    }
  }

  // 4. Prune non-runtime build/dev artifacts inside app.asar.unpacked/node_modules/
  // (e.g. MSVC .lib import libs, .cmake, .vcxproj, .filters, .tsbuildinfo, .patch, .sh, .d.ts, .map)
  const unpackedNodeModules = path.join(unpackedDir, 'node_modules');
  const PRUNE_DEV_SUFFIXES = [
    '.lib',
    '.cmake',
    '.vcxproj',
    '.filters',
    '.tsbuildinfo',
    '.patch',
    '.sh',
    '.d.ts',
    '.d.ts.map',
    '.js.map',
  ];
  if (fs.existsSync(unpackedNodeModules)) {
    const pruneDevWalk = (dirPath) => {
      let entries;
      try {
        entries = fs.readdirSync(dirPath, { withFileTypes: true });
      } catch {
        return;
      }
      for (const ent of entries) {
        const full = path.join(dirPath, ent.name);
        if (ent.isDirectory()) {
          pruneDevWalk(full);
        } else if (ent.isFile()) {
          const lower = ent.name.toLowerCase();
          if (PRUNE_DEV_SUFFIXES.some((sfx) => lower.endsWith(sfx))) {
            try {
              const size = fs.statSync(full).size;
              fs.rmSync(full, { force: true });
              removedFiles += 1;
              removedBytes += size;
            } catch {
              // Ignore locked artifact
            }
          }
        }
      }
    };
    pruneDevWalk(unpackedNodeModules);
  }

  const savedMb = (removedBytes / (1024 * 1024)).toFixed(2);
  console.log(
    `[after-pack] Pruned ${removedFiles} unused files (${savedMb} MB saved) from ${path.basename(appOutDir)}`,
  );
};
