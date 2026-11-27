import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { TodoDatabase } from '../../src/db/database.ts';
import type {
  CloudBackupFileEntry,
  CloudProviderId,
  DetectedCloudProvider,
  OneDriveStatus,
} from '../../src/types.ts';
import { getLocalDateString } from '../../src/utils/todoLogic.ts';

function findFirstExistingDir(candidates: Array<string | undefined>): string | null {
  for (const candidate of candidates) {
    if (typeof candidate !== 'string' || !candidate.trim()) continue;
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
        return candidate;
      }
    } catch {
      // Ignore inaccessible paths
    }
  }
  return null;
}

function atomicWriteJsonFile(targetPath: string, jsonText: string): void {
  const tmpPath = `${targetPath}.tmp-${process.pid}`;
  fs.writeFileSync(tmpPath, jsonText, 'utf8');
  try {
    fs.renameSync(tmpPath, targetPath);
  } catch {
    fs.copyFileSync(tmpPath, targetPath);
    try {
      fs.rmSync(tmpPath, { force: true });
    } catch {
      // Ignore cleanup failure
    }
  }
}

async function atomicWriteJsonFileAsync(targetPath: string, jsonText: string): Promise<void> {
  const tmpPath = `${targetPath}.tmp-${process.pid}-${Date.now()}`;
  await fs.promises.writeFile(tmpPath, jsonText, 'utf8');
  try {
    await fs.promises.rename(tmpPath, targetPath);
  } catch {
    await fs.promises.copyFile(tmpPath, targetPath);
    await fs.promises.rm(tmpPath, { force: true }).catch(() => {
      // Ignore transient temp file cleanup failure
    });
  }
}

export function createCloudSyncService(db: TodoDatabase) {
  let cachedCloudProviders: DetectedCloudProvider[] | null = null;
  let cachedCloudProvidersAt = 0;
  const CLOUD_PROVIDERS_TTL_MS = 300_000;
  const parsedBackupCache = new Map<
    string,
    {
      mtimeMs: number;
      size: number;
      mtimeIso: string;
      todoCount: number;
      categoryCount: number;
      payload: Record<string, unknown>;
    }
  >();
  let autoSyncTimer: ReturnType<typeof setTimeout> | null = null;
  let autoSyncInFlight = false;
  let autoSyncPendingAgain = false;

  function detectCloudProviders(force = false): DetectedCloudProvider[] {
    if (
      !force &&
      cachedCloudProviders &&
      Date.now() - cachedCloudProvidersAt < CLOUD_PROVIDERS_TTL_MS
    ) {
      return cachedCloudProviders;
    }
    const home = os.homedir();

    const oneDriveRoot = findFirstExistingDir([
      process.env.OneDriveConsumer,
      process.env.OneDrive,
      process.env.OneDriveCommercial,
      path.join(home, 'OneDrive'),
    ]);

    const googleCandidates: string[] = [
      path.join(home, 'Google Drive'),
      path.join(home, 'My Drive'),
      path.join(home, "Drive'ım"),
    ];
    if (process.platform === 'win32') {
      // Only probe drive letters whose root actually exists (avoids 5x redundant stats per missing drive)
      for (const letter of ['G', 'H', 'I', 'D', 'E', 'F']) {
        const root = `${letter}:\\`;
        try {
          if (!fs.existsSync(root)) continue;
        } catch {
          continue;
        }
        googleCandidates.push(`${letter}:\\My Drive`);
        googleCandidates.push(`${letter}:\\Drive'ım`);
        googleCandidates.push(`${letter}:\\Mon Drive`);
        googleCandidates.push(`${letter}:\\Meine Ablage`);
        googleCandidates.push(`${letter}:\\Mi unidad`);
      }
    }
    const googleDriveRoot = findFirstExistingDir(googleCandidates);

    const iCloudRoot = findFirstExistingDir([
      path.join(home, 'iCloudDrive'),
      path.join(home, 'iCloud Drive'),
      path.join(home, 'Library', 'Mobile Documents', 'com~apple~CloudDocs'),
    ]);

    const dropboxCandidates: Array<string | undefined> = [
      path.join(home, 'Dropbox'),
      path.join(home, 'Dropbox (Personal)'),
    ];
    for (const infoBase of [process.env.LOCALAPPDATA, process.env.APPDATA]) {
      if (!infoBase) continue;
      try {
        const infoPath = path.join(infoBase, 'Dropbox', 'info.json');
        if (fs.existsSync(infoPath)) {
          const parsed = JSON.parse(fs.readFileSync(infoPath, 'utf8')) as {
            personal?: { path?: string };
            business?: { path?: string };
          };
          if (parsed?.personal?.path) dropboxCandidates.unshift(parsed.personal.path);
          if (parsed?.business?.path) dropboxCandidates.push(parsed.business.path);
        }
      } catch {
        // Ignore unreadable Dropbox metadata
      }
    }
    const dropboxRoot = findFirstExistingDir(dropboxCandidates);

    const providers: DetectedCloudProvider[] = [
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
    cachedCloudProviders = providers;
    cachedCloudProvidersAt = Date.now();
    return providers;
  }

  function detectProviderForFolder(
    folderPath: string,
    providers: DetectedCloudProvider[],
  ): CloudProviderId | 'custom' {
    const normalized = path.resolve(folderPath).toLowerCase();
    for (const p of providers) {
      const pNorm = path.resolve(p.folderPath).toLowerCase();
      const pParent = path.dirname(pNorm);
      if (normalized === pNorm || normalized.startsWith(`${pParent}${path.sep}`)) {
        return p.id;
      }
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

  function detectDefaultOneDriveRoot(): string {
    const providers = detectCloudProviders();
    const firstDetected = providers.find((p) => p.detected);
    if (firstDetected) {
      return firstDetected.folderPath;
    }
    const baseDataDir = process.env.AGENDAMEA_DATA_DIR
      ? path.resolve(process.env.AGENDAMEA_DATA_DIR)
      : path.join(process.cwd(), 'data');
    return path.join(baseDataDir, 'OneDrive-Agendamea');
  }

  function listOneDriveBackupCandidateFiles(folderPath: string): string[] {
    try {
      if (!fs.existsSync(folderPath)) return [];
      const entries = fs.readdirSync(folderPath);
      const primary = 'agendamea-onedrive-sync.json';
      const previous = 'agendamea-onedrive-previous.json';
      const rolling = entries
        .filter((f) => /^agendamea-backup-\d{4}-\d{2}-\d{2}\.json$/i.test(f))
        .sort()
        .reverse();
      const ordered: string[] = [];
      if (entries.includes(primary)) ordered.push(path.join(folderPath, primary));
      if (entries.includes(previous)) ordered.push(path.join(folderPath, previous));
      for (const r of rolling) {
        ordered.push(path.join(folderPath, r));
      }
      return ordered;
    } catch {
      return [];
    }
  }

  function readCachedBackupFile(filePath: string): {
    filePath: string;
    mtimeIso: string;
    sizeBytes: number;
    todoCount: number;
    categoryCount: number;
    payload: Record<string, unknown>;
  } | null {
    try {
      const stat = fs.statSync(filePath);
      const cached = parsedBackupCache.get(filePath);
      if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
        return {
          filePath,
          mtimeIso: cached.mtimeIso,
          sizeBytes: stat.size,
          todoCount: cached.todoCount,
          categoryCount: cached.categoryCount,
          payload: cached.payload,
        };
      }
      const raw = fs.readFileSync(filePath, 'utf8');
      if (!raw?.trim()) return null;
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
      const todosArr = Array.isArray(parsed.todos) ? parsed.todos : null;
      const catsArr = Array.isArray(parsed.categories) ? parsed.categories : null;
      if (!todosArr && !catsArr) return null;
      const entry = {
        mtimeMs: stat.mtimeMs,
        size: stat.size,
        mtimeIso: stat.mtime.toISOString(),
        todoCount: todosArr ? todosArr.length : 0,
        categoryCount: catsArr ? catsArr.length : 0,
        payload: parsed,
      };
      if (parsedBackupCache.size >= 24) {
        const oldest = parsedBackupCache.keys().next().value;
        if (oldest) parsedBackupCache.delete(oldest);
      }
      parsedBackupCache.set(filePath, entry);
      return {
        filePath,
        mtimeIso: entry.mtimeIso,
        sizeBytes: stat.size,
        todoCount: entry.todoCount,
        categoryCount: entry.categoryCount,
        payload: parsed,
      };
    } catch {
      parsedBackupCache.delete(filePath);
      return null;
    }
  }

  function readValidOneDriveBackup(folderPath: string): {
    filePath: string;
    mtimeIso: string;
    todoCount: number;
    categoryCount: number;
    payload: Record<string, unknown>;
  } | null {
    const candidates = listOneDriveBackupCandidateFiles(folderPath);
    for (const filePath of candidates) {
      const entry = readCachedBackupFile(filePath);
      if (entry) {
        return {
          filePath: entry.filePath,
          mtimeIso: entry.mtimeIso,
          todoCount: entry.todoCount,
          categoryCount: entry.categoryCount,
          payload: entry.payload,
        };
      }
    }
    return null;
  }

  function resolveOneDriveStatus(): OneDriveStatus {
    const settings = db.getSettings();
    const detectedProviders = detectCloudProviders();
    const customPath = (settings.onedriveCustomPath ?? '').trim();
    const connected = customPath.length > 0;
    const folderPath = connected ? customPath : detectDefaultOneDriveRoot();
    const syncFilePath = path.join(folderPath, 'agendamea-onedrive-sync.json');
    const candidates = listOneDriveBackupCandidateFiles(folderPath);
    const validBackup = readValidOneDriveBackup(folderPath);

    return {
      available: true,
      connected,
      mode: connected ? 'folder' : 'none',
      folderPath,
      syncFilePath,
      accountEmail: null,
      lastSyncedAt: validBackup ? validBackup.mtimeIso : null,
      autoSync: Boolean(settings.onedriveAutoSync),
      hasRemoteBackup: Boolean(validBackup),
      remoteTodoCount: validBackup ? validBackup.todoCount : 0,
      remoteCategoryCount: validBackup ? validBackup.categoryCount : 0,
      backupFilesCount: candidates.length,
      activeProvider: connected ? detectProviderForFolder(folderPath, detectedProviders) : null,
      detectedProviders,
    };
  }

  function resolveProviderDisplayName(folder: string): string {
    const activeProvider = detectProviderForFolder(folder, detectCloudProviders());
    return activeProvider === 'onedrive'
      ? 'OneDrive'
      : activeProvider === 'googledrive'
        ? 'Google Drive'
        : activeProvider === 'icloud'
          ? 'iCloud Drive'
          : activeProvider === 'dropbox'
            ? 'Dropbox'
            : 'Custom Cloud Folder';
  }

  function writeOneDriveSyncSnapshot(
    targetFolder?: string,
    allowEmptyOverwrite = false,
  ): OneDriveStatus {
    const configuredPath = (db.getSettings().onedriveCustomPath ?? '').trim();
    const folder = targetFolder
      ? path.resolve(targetFolder)
      : configuredPath.length > 0
        ? configuredPath
        : detectDefaultOneDriveRoot();
    fs.mkdirSync(folder, { recursive: true });
    const syncFile = path.join(folder, 'agendamea-onedrive-sync.json');
    const prevFile = path.join(folder, 'agendamea-onedrive-previous.json');
    const dailyFile = path.join(folder, `agendamea-backup-${getLocalDateString()}.json`);

    const snapshot = db.getBootstrap();
    const isLocalEmpty =
      snapshot.todos.length === 0 &&
      snapshot.categories.length === 0 &&
      snapshot.trashedTodos.length === 0 &&
      snapshot.trashedCategories.length === 0;

    const existingValid = readValidOneDriveBackup(folder);
    if (
      isLocalEmpty &&
      !allowEmptyOverwrite &&
      existingValid &&
      (existingValid.todoCount > 0 || existingValid.categoryCount > 0)
    ) {
      return resolveOneDriveStatus();
    }

    if (fs.existsSync(syncFile) && existingValid && existingValid.filePath === syncFile) {
      try {
        fs.copyFileSync(syncFile, prevFile);
      } catch {
        // Ignore copy error
      }
    }

    const payload = {
      exportedAt: new Date().toISOString(),
      app: 'Agendamea',
      provider: resolveProviderDisplayName(folder),
      ...snapshot,
    };
    const jsonText = JSON.stringify(payload, null, 2);
    atomicWriteJsonFile(syncFile, jsonText);

    if (!isLocalEmpty) {
      try {
        atomicWriteJsonFile(dailyFile, jsonText);
        const entries = fs
          .readdirSync(folder)
          .filter((f) => /^agendamea-backup-\d{4}-\d{2}-\d{2}\.json$/i.test(f))
          .sort()
          .reverse();
        for (const oldFile of entries.slice(15)) {
          try {
            fs.rmSync(path.join(folder, oldFile), { force: true });
          } catch {
            // Ignore old snapshot removal failure
          }
        }
      } catch {
        // Rolling snapshot failure must not break primary sync
      }
    }

    return resolveOneDriveStatus();
  }

  async function writeOneDriveSyncSnapshotAsync(): Promise<void> {
    const settings = db.getSettings();
    const configuredPath = (settings.onedriveCustomPath ?? '').trim();
    if (!settings.onedriveAutoSync || configuredPath.length === 0) return;

    const folder = configuredPath;
    await fs.promises.mkdir(folder, { recursive: true });
    const syncFile = path.join(folder, 'agendamea-onedrive-sync.json');
    const prevFile = path.join(folder, 'agendamea-onedrive-previous.json');
    const dailyFile = path.join(folder, `agendamea-backup-${getLocalDateString()}.json`);

    const snapshot = db.getBootstrap();
    const isLocalEmpty =
      snapshot.todos.length === 0 &&
      snapshot.categories.length === 0 &&
      snapshot.trashedTodos.length === 0 &&
      snapshot.trashedCategories.length === 0;

    const existingValid = readValidOneDriveBackup(folder);
    if (
      isLocalEmpty &&
      existingValid &&
      (existingValid.todoCount > 0 || existingValid.categoryCount > 0)
    ) {
      return;
    }

    if (fs.existsSync(syncFile) && existingValid && existingValid.filePath === syncFile) {
      await fs.promises.copyFile(syncFile, prevFile).catch(() => {
        // Previous snapshot backup is best-effort
      });
    }

    const payload = {
      exportedAt: new Date().toISOString(),
      app: 'Agendamea',
      provider: resolveProviderDisplayName(folder),
      ...snapshot,
    };
    const jsonText = JSON.stringify(payload, null, 2);
    await atomicWriteJsonFileAsync(syncFile, jsonText);

    if (!isLocalEmpty) {
      try {
        await atomicWriteJsonFileAsync(dailyFile, jsonText);
        const dirEntries = await fs.promises.readdir(folder);
        const entries = dirEntries
          .filter((f) => /^agendamea-backup-\d{4}-\d{2}-\d{2}\.json$/i.test(f))
          .sort()
          .reverse();
        for (const oldFile of entries.slice(15)) {
          await fs.promises.rm(path.join(folder, oldFile), { force: true }).catch(() => {
            // Ignore rolling backup prune lock
          });
        }
      } catch {
        // Rolling snapshot failure must not break primary sync
      }
    }
  }

  function flushOneDriveAutoSync(): void {
    if (autoSyncTimer) {
      clearTimeout(autoSyncTimer);
      autoSyncTimer = null;
    }
    try {
      const settings = db.getSettings();
      if (settings.onedriveAutoSync && (settings.onedriveCustomPath ?? '').trim().length > 0) {
        writeOneDriveSyncSnapshot();
      }
    } catch {
      // Background auto-sync must never fail primary user mutation
    }
  }

  function runAutoSyncAsyncCycle(): void {
    if (autoSyncInFlight) {
      autoSyncPendingAgain = true;
      return;
    }
    autoSyncInFlight = true;
    void writeOneDriveSyncSnapshotAsync()
      .catch(() => {
        // Background auto-sync must never fail primary user mutation
      })
      .finally(() => {
        autoSyncInFlight = false;
        if (autoSyncPendingAgain) {
          autoSyncPendingAgain = false;
          runAutoSyncAsyncCycle();
        }
      });
  }

  function triggerOneDriveAutoSync(): void {
    if (autoSyncTimer) {
      clearTimeout(autoSyncTimer);
    }
    autoSyncTimer = setTimeout(() => {
      autoSyncTimer = null;
      runAutoSyncAsyncCycle();
    }, 200);
  }

  function listCloudBackupSnapshots(folderOverride?: string): CloudBackupFileEntry[] {
    const status = resolveOneDriveStatus();
    const folder = folderOverride || status.folderPath || detectDefaultOneDriveRoot();
    const candidates = listOneDriveBackupCandidateFiles(folder);
    const results: CloudBackupFileEntry[] = [];
    for (const filePath of candidates) {
      const entry = readCachedBackupFile(filePath);
      if (!entry) continue;
      const fileName = path.basename(filePath);
      const kind: CloudBackupFileEntry['kind'] =
        fileName === 'agendamea-onedrive-sync.json'
          ? 'primary'
          : fileName === 'agendamea-onedrive-previous.json'
            ? 'previous'
            : 'daily';
      results.push({
        fileName,
        kind,
        mtimeIso: entry.mtimeIso,
        sizeBytes: entry.sizeBytes,
        todoCount: entry.todoCount,
        categoryCount: entry.categoryCount,
      });
    }
    return results;
  }

  function readCloudBackupByFileName(
    fileName: string,
    folderOverride?: string,
  ): { filePath: string; payload: Record<string, unknown> } | null {
    const cleanName = path.basename(String(fileName || '').trim());
    if (
      !cleanName ||
      cleanName !== fileName ||
      !(
        cleanName === 'agendamea-onedrive-sync.json' ||
        cleanName === 'agendamea-onedrive-previous.json' ||
        /^agendamea-backup-\d{4}-\d{2}-\d{2}\.json$/i.test(cleanName)
      )
    ) {
      return null;
    }
    const status = resolveOneDriveStatus();
    const folder = folderOverride || status.folderPath || detectDefaultOneDriveRoot();
    const fullPath = path.join(folder, cleanName);
    if (!fs.existsSync(fullPath)) return null;
    try {
      const parsed = JSON.parse(fs.readFileSync(fullPath, 'utf8')) as Record<string, unknown>;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
      return { filePath: fullPath, payload: parsed };
    } catch {
      return null;
    }
  }

  return {
    detectCloudProviders,
    detectProviderForFolder,
    detectDefaultOneDriveRoot,
    readValidOneDriveBackup,
    listCloudBackupSnapshots,
    readCloudBackupByFileName,
    resolveOneDriveStatus,
    writeOneDriveSyncSnapshot,
    writeOneDriveSyncSnapshotAsync,
    flushOneDriveAutoSync,
    triggerOneDriveAutoSync,
  };
}

export type CloudSyncService = ReturnType<typeof createCloudSyncService>;
