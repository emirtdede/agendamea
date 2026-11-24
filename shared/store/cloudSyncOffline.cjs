'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  APP_VERSION,
  getTodayStr,
  getCandidateDataDirs,
  resolveApiBaseUrl,
  httpRequest,
} = require('./httpTransport.cjs');
const {
  assertSafeLocalSyncFolder,
  withOfflineDb,
  readSettingsOffline,
  writeSettingsPatchOffline,
  getBootstrapOffline,
} = require('./offlineDb.cjs');

function atomicWriteJsonFileOffline(targetPath, jsonText) {
  const tmpPath = `${targetPath}.tmp-${process.pid}`;
  fs.writeFileSync(tmpPath, jsonText, 'utf8');
  try {
    fs.renameSync(tmpPath, targetPath);
  } catch {
    fs.copyFileSync(tmpPath, targetPath);
    try {
      fs.rmSync(tmpPath, { force: true });
    } catch {
      // Ignore cleanup error
    }
  }
}

function listCloudBackupFilesOffline(folderPath) {
  try {
    if (!fs.existsSync(folderPath)) return [];
    const entries = fs.readdirSync(folderPath);
    const primary = 'agendamea-onedrive-sync.json';
    const previous = 'agendamea-onedrive-previous.json';
    const rolling = entries
      .filter((f) => /^agendamea-backup-\d{4}-\d{2}-\d{2}\.json$/i.test(f))
      .sort()
      .reverse();
    const out = [];
    if (entries.includes(primary)) out.push(path.join(folderPath, primary));
    if (entries.includes(previous)) out.push(path.join(folderPath, previous));
    for (const f of rolling) out.push(path.join(folderPath, f));
    return out;
  } catch {
    return [];
  }
}

function readValidCloudBackupOffline(folderPath) {
  for (const filePath of listCloudBackupFilesOffline(folderPath)) {
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      if (!raw?.trim()) continue;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) continue;
      if (!Array.isArray(parsed.todos) && !Array.isArray(parsed.categories)) continue;
      const stat = fs.statSync(filePath);
      return {
        filePath,
        mtimeIso: stat.mtime.toISOString(),
        todoCount: Array.isArray(parsed.todos) ? parsed.todos.length : 0,
        categoryCount: Array.isArray(parsed.categories) ? parsed.categories.length : 0,
        payload: parsed,
      };
    } catch {
      // Fall back to next valid backup file
    }
  }
  return null;
}

function writeCloudSnapshotOffline(db, folderOverride, allowEmptyOverwrite = false) {
  const settings = readSettingsOffline(db);
  const folder = (folderOverride || settings.onedriveCustomPath || '').trim();
  if (!folder) return null;
  const resolved = path.resolve(folder);
  fs.mkdirSync(resolved, { recursive: true });
  const snapshot = getBootstrapOffline(db);
  const isLocalEmpty =
    snapshot.todos.length === 0 &&
    snapshot.categories.length === 0 &&
    snapshot.trashedTodos.length === 0 &&
    snapshot.trashedCategories.length === 0;
  const existing = readValidCloudBackupOffline(resolved);
  if (
    isLocalEmpty &&
    !allowEmptyOverwrite &&
    existing &&
    (existing.todoCount > 0 || existing.categoryCount > 0)
  ) {
    return {
      ok: true,
      connected: true,
      mode: 'offline-folder',
      folderPath: resolved,
      syncFilePath: path.join(resolved, 'agendamea-onedrive-sync.json'),
      lastSyncedAt: existing.mtimeIso,
    };
  }
  const syncFile = path.join(resolved, 'agendamea-onedrive-sync.json');
  const prevFile = path.join(resolved, 'agendamea-onedrive-previous.json');
  const dailyFile = path.join(resolved, `agendamea-backup-${getTodayStr()}.json`);
  if (fs.existsSync(syncFile) && existing && existing.filePath === syncFile) {
    try {
      fs.copyFileSync(syncFile, prevFile);
    } catch {
      // Ignore copy failure
    }
  }
  const payload = {
    exportedAt: new Date().toISOString(),
    app: 'Agendamea',
    version: APP_VERSION,
    ...snapshot,
  };
  const jsonText = JSON.stringify(payload, null, 2);
  atomicWriteJsonFileOffline(syncFile, jsonText);
  if (!isLocalEmpty) {
    try {
      atomicWriteJsonFileOffline(dailyFile, jsonText);
      const dailies = fs
        .readdirSync(resolved)
        .filter((f) => /^agendamea-backup-\d{4}-\d{2}-\d{2}\.json$/i.test(f))
        .sort()
        .reverse();
      for (const oldFile of dailies.slice(15)) {
        try {
          fs.rmSync(path.join(resolved, oldFile), { force: true });
        } catch {
          // Ignore old snapshot cleanup failure
        }
      }
    } catch {
      // Ignore rolling backup failure
    }
  }
  return {
    ok: true,
    connected: true,
    mode: 'offline-folder',
    folderPath: resolved,
    syncFilePath: syncFile,
    lastSyncedAt: payload.exportedAt,
  };
}

function flushOfflineAutoSync(db) {
  try {
    const settings = readSettingsOffline(db);
    if (settings.onedriveAutoSync && settings.onedriveCustomPath) {
      writeCloudSnapshotOffline(db, settings.onedriveCustomPath, false);
    }
  } catch {
    // Never fail primary mutation on background cloud sync error
  }
}

function findFirstExistingDirOffline(candidates) {
  for (const candidate of candidates) {
    if (typeof candidate !== 'string' || !candidate.trim()) continue;
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) return candidate;
    } catch {
      // Ignore inaccessible path
    }
  }
  return null;
}

function detectCloudProvidersOffline() {
  const home = os.homedir();
  const oneDriveRoot = findFirstExistingDirOffline([
    process.env.OneDriveConsumer,
    process.env.OneDrive,
    process.env.OneDriveCommercial,
    path.join(home, 'OneDrive'),
  ]);
  const googleCandidates = [
    path.join(home, 'Google Drive'),
    path.join(home, 'My Drive'),
    path.join(home, "Drive'ım"),
  ];
  if (process.platform === 'win32') {
    for (const letter of ['G', 'H', 'I', 'D', 'E', 'F', 'J', 'K', 'M', 'Z']) {
      googleCandidates.push(`${letter}:\\My Drive`);
      googleCandidates.push(`${letter}:\\Drive'ım`);
      googleCandidates.push(`${letter}:\\Mon Drive`);
      googleCandidates.push(`${letter}:\\Meine Ablage`);
      googleCandidates.push(`${letter}:\\Mi unidad`);
    }
  }
  const googleDriveRoot = findFirstExistingDirOffline(googleCandidates);
  const iCloudRoot = findFirstExistingDirOffline([
    path.join(home, 'iCloudDrive'),
    path.join(home, 'iCloud Drive'),
    path.join(home, 'Library', 'Mobile Documents', 'com~apple~CloudDocs'),
  ]);
  const dropboxCandidates = [path.join(home, 'Dropbox'), path.join(home, 'Dropbox (Personal)')];
  for (const infoBase of [process.env.LOCALAPPDATA, process.env.APPDATA]) {
    if (!infoBase) continue;
    try {
      const infoPath = path.join(infoBase, 'Dropbox', 'info.json');
      if (fs.existsSync(infoPath)) {
        const parsed = JSON.parse(fs.readFileSync(infoPath, 'utf8'));
        if (parsed?.personal?.path) dropboxCandidates.unshift(parsed.personal.path);
        if (parsed?.business?.path) dropboxCandidates.push(parsed.business.path);
      }
    } catch {
      // Ignore unreadable Dropbox metadata
    }
  }
  const dropboxRoot = findFirstExistingDirOffline(dropboxCandidates);
  return [
    {
      id: 'onedrive',
      label: 'OneDrive',
      folderPath: oneDriveRoot
        ? path.join(oneDriveRoot, 'Agendamea')
        : path.join(home, 'OneDrive', 'Agendamea'),
      detected: Boolean(oneDriveRoot),
    },
    {
      id: 'googledrive',
      label: 'Google Drive',
      folderPath: googleDriveRoot
        ? path.join(googleDriveRoot, 'Agendamea')
        : path.join(home, 'Google Drive', 'Agendamea'),
      detected: Boolean(googleDriveRoot),
    },
    {
      id: 'icloud',
      label: 'iCloud Drive',
      folderPath: iCloudRoot
        ? path.join(iCloudRoot, 'Agendamea')
        : path.join(home, 'iCloudDrive', 'Agendamea'),
      detected: Boolean(iCloudRoot),
    },
    {
      id: 'dropbox',
      label: 'Dropbox',
      folderPath: dropboxRoot
        ? path.join(dropboxRoot, 'Agendamea')
        : path.join(home, 'Dropbox', 'Agendamea'),
      detected: Boolean(dropboxRoot),
    },
  ];
}

function detectProviderForFolderOffline(folderPath, providers) {
  const normalized = path.resolve(folderPath).toLowerCase();
  for (const p of providers) {
    const pNorm = path.resolve(p.folderPath).toLowerCase();
    const pParent = path.dirname(pNorm);
    if (normalized === pNorm || normalized.startsWith(`${pParent}${path.sep}`)) return p.id;
  }
  if (normalized.includes('onedrive')) return 'onedrive';
  if (
    normalized.includes('google drive') ||
    normalized.includes('my drive') ||
    normalized.includes("drive'ım")
  ) {
    return 'googledrive';
  }
  if (normalized.includes('icloud')) return 'icloud';
  if (normalized.includes('dropbox')) return 'dropbox';
  return 'custom';
}

async function getCloudStatus() {
  const baseUrl = await resolveApiBaseUrl();
  if (baseUrl) {
    return httpRequest(baseUrl, 'GET', '/api/onedrive/status');
  }
  return withOfflineDb((db) => {
    const settings = readSettingsOffline(db);
    const detectedProviders = detectCloudProvidersOffline();
    const folder = (settings.onedriveCustomPath || '').trim();
    const connected = folder.length > 0;
    const firstDetected = detectedProviders.find((p) => p.detected);
    const resolvedFolder = connected
      ? path.resolve(folder)
      : firstDetected
        ? firstDetected.folderPath
        : null;
    const validBackup = resolvedFolder ? readValidCloudBackupOffline(resolvedFolder) : null;
    const candidates = resolvedFolder ? listCloudBackupFilesOffline(resolvedFolder) : [];
    return {
      available: true,
      connected,
      mode: connected ? 'offline-folder' : 'none',
      folderPath: resolvedFolder,
      syncFilePath: resolvedFolder
        ? path.join(resolvedFolder, 'agendamea-onedrive-sync.json')
        : null,
      lastSyncedAt: validBackup ? validBackup.mtimeIso : null,
      autoSync: Boolean(settings.onedriveAutoSync),
      hasRemoteBackup: Boolean(validBackup),
      remoteTodoCount: validBackup ? validBackup.todoCount : 0,
      remoteCategoryCount: validBackup ? validBackup.categoryCount : 0,
      backupFilesCount: candidates.length,
      activeProvider: connected
        ? detectProviderForFolderOffline(resolvedFolder, detectedProviders)
        : null,
      detectedProviders,
    };
  });
}

async function connectCloud(folderPath, autoSync = true) {
  const cleanFolder = typeof folderPath === 'string' ? folderPath.trim() : '';
  const baseUrl = await resolveApiBaseUrl();
  if (baseUrl) {
    return httpRequest(baseUrl, 'POST', '/api/onedrive/connect', {
      ...(cleanFolder ? { folderPath: cleanFolder } : {}),
      autoSync: Boolean(autoSync),
    });
  }
  let resolved = cleanFolder ? assertSafeLocalSyncFolder(cleanFolder) : '';
  if (!resolved) {
    const detected = detectCloudProvidersOffline().find((p) => p.detected);
    if (detected) {
      resolved = detected.folderPath;
    } else {
      const baseDataDir = getCandidateDataDirs()[0];
      if (!baseDataDir) {
        throw new Error(
          'No cloud provider detected. Pass an explicit folder: ag sync set "<folder>"',
        );
      }
      resolved = path.join(baseDataDir, 'OneDrive-Agendamea');
    }
  }
  return withOfflineDb((db) => {
    db.transaction(() => {
      writeSettingsPatchOffline(db, {
        onedriveCustomPath: resolved,
        onedriveAutoSync: Boolean(autoSync),
      });
    })();
    fs.mkdirSync(resolved, { recursive: true });
    return writeCloudSnapshotOffline(db, resolved, false);
  });
}

async function disconnectCloud() {
  const baseUrl = await resolveApiBaseUrl();
  if (baseUrl) {
    return httpRequest(baseUrl, 'POST', '/api/onedrive/disconnect');
  }
  return withOfflineDb((db) => {
    db.transaction(() => {
      writeSettingsPatchOffline(db, { onedriveCustomPath: '', onedriveAutoSync: false });
    })();
    return { ok: true, connected: false, mode: 'none', folderPath: null, autoSync: false };
  });
}

async function syncCloud() {
  const baseUrl = await resolveApiBaseUrl();
  if (baseUrl) {
    return httpRequest(baseUrl, 'POST', '/api/onedrive/sync-push');
  }
  return withOfflineDb((db) => {
    const settings = readSettingsOffline(db);
    const folder = (settings.onedriveCustomPath || '').trim();
    if (!folder) {
      throw new Error(
        'No cloud sync folder configured yet. Run: ag sync set "<folder>" or ag sync auto',
      );
    }
    return writeCloudSnapshotOffline(db, folder, true);
  });
}

function createPullCloud(importBackupFn) {
  return async function pullCloud() {
    const baseUrl = await resolveApiBaseUrl();
    if (baseUrl) {
      return httpRequest(baseUrl, 'POST', '/api/onedrive/sync-pull');
    }
    const folder = withOfflineDb((db) => (readSettingsOffline(db).onedriveCustomPath || '').trim());
    if (!folder) {
      throw new Error('No cloud sync folder configured yet. Run: ag sync set "<folder>"');
    }
    const validBackup = readValidCloudBackupOffline(path.resolve(folder));
    if (!validBackup) {
      throw new Error(`No valid cloud backup found in ${path.resolve(folder)}`);
    }
    const bootstrap = await importBackupFn(validBackup.payload);
    const status = await getCloudStatus();
    return { ok: true, status, bootstrap };
  };
}

module.exports = {
  atomicWriteJsonFileOffline,
  listCloudBackupFilesOffline,
  readValidCloudBackupOffline,
  writeCloudSnapshotOffline,
  flushOfflineAutoSync,
  detectCloudProvidersOffline,
  detectProviderForFolderOffline,
  getCloudStatus,
  connectCloud,
  disconnectCloud,
  syncCloud,
  createPullCloud,
};
