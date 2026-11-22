import { execFile } from 'node:child_process';
import http from 'node:http';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { TodoDatabase, ValidationError } from './src/db/database.ts';
import type { CloudProviderId, DetectedCloudProvider, OneDriveStatus } from './src/types.ts';
import { getLocalDateString } from './src/utils/todoLogic.ts';
import releaseUtils from './shared/releaseUtils.cjs';

const APP_VERSION = '1.0.0';
const GITHUB_RELEASES_API = 'https://api.github.com/repos/emirtdede/agendamea/releases/latest';
const GITHUB_RELEASES_HTML = 'https://github.com/emirtdede/agendamea/releases/latest';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isLoopbackAddress(remoteAddress: string | undefined): boolean {
  if (!remoteAddress) return false;
  return (
    remoteAddress === '127.0.0.1' ||
    remoteAddress === '::1' ||
    remoteAddress === '::ffff:127.0.0.1'
  );
}

function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return normalized === '127.0.0.1' || normalized === 'localhost' || normalized === '::1' || normalized === '[::1]';
}

function parseHostHeaderHostname(hostHeader: string | undefined): string | null {
  if (!hostHeader) return null;
  try {
    return new URL(`http://${hostHeader}`).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function sendRouteError(
  res: express.Response,
  routeLabel: string,
  err: unknown,
  fallbackMessage: string,
): void {
  if (err instanceof ValidationError) {
    res.status(400).json({ error: err.message });
    return;
  }
  console.error(`${routeLabel} error:`, err);
  res.status(500).json({ error: fallbackMessage });
}

async function startServer() {
  const app = express();
  const httpServer = http.createServer(app);
  const db = new TodoDatabase();
  const PORT = Number(process.env.PORT) || 3000;

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

  function detectCloudProviders(): DetectedCloudProvider[] {
    const home = os.homedir();

    const oneDriveRoot = findFirstExistingDir([
      process.env.OneDriveConsumer,
      process.env.OneDrive,
      process.env.OneDriveCommercial,
      path.join(home, 'OneDrive'),
    ]);

    // Google Drive for Desktop creates either a virtual drive (often G:\My Drive or G:\Drive'ım) or user-home folder
    const googleCandidates: string[] = [
      path.join(home, 'Google Drive'),
      path.join(home, 'My Drive'),
    ];
    if (process.platform === 'win32') {
      for (const letter of ['G', 'H', 'I', 'D', 'E', 'F']) {
        googleCandidates.push(`${letter}:\\My Drive`);
        googleCandidates.push(`${letter}:\\Drive'ım`);
        googleCandidates.push(`${letter}:\\Mon Drive`);
        googleCandidates.push(`${letter}:\\Meine Ablage`);
      }
    }
    const googleDriveRoot = findFirstExistingDir(googleCandidates);

    const iCloudRoot = findFirstExistingDir([
      path.join(home, 'iCloudDrive'),
      path.join(home, 'iCloud Drive'),
      path.join(home, 'Library', 'Mobile Documents', 'com~apple~CloudDocs'),
    ]);

    const dropboxRoot = findFirstExistingDir([
      path.join(home, 'Dropbox'),
      path.join(home, 'Dropbox (Personal)'),
    ]);

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
    if (normalized.includes('google drive') || normalized.includes('my drive') || normalized.includes("drive'ım")) {
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

  function readValidOneDriveBackup(folderPath: string): {
    filePath: string;
    mtimeIso: string;
    todoCount: number;
    categoryCount: number;
    payload: Record<string, unknown>;
  } | null {
    const candidates = listOneDriveBackupCandidateFiles(folderPath);
    for (const filePath of candidates) {
      try {
        const raw = fs.readFileSync(filePath, 'utf8');
        if (!raw || !raw.trim()) continue;
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) continue;
        const todosArr = Array.isArray(parsed.todos) ? parsed.todos : null;
        const catsArr = Array.isArray(parsed.categories) ? parsed.categories : null;
        if (!todosArr && !catsArr) continue;
        const stat = fs.statSync(filePath);
        return {
          filePath,
          mtimeIso: stat.mtime.toISOString(),
          todoCount: todosArr ? todosArr.length : 0,
          categoryCount: catsArr ? catsArr.length : 0,
          payload: parsed,
        };
      } catch {
        // Automatically skip corrupted / half-synced file and fall back to previous snapshot
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

  function atomicWriteJsonFile(targetPath: string, jsonText: string): void {
    const tmpPath = `${targetPath}.tmp-${process.pid}`;
    fs.writeFileSync(tmpPath, jsonText, 'utf8');
    try {
      fs.renameSync(tmpPath, targetPath);
    } catch {
      // Fallback if Windows OneDrive sync client briefly locks targetPath during rename
      fs.copyFileSync(tmpPath, targetPath);
      try {
        fs.rmSync(tmpPath, { force: true });
      } catch {
        // Ignore cleanup failure
      }
    }
  }

  function writeOneDriveSyncSnapshot(targetFolder?: string, allowEmptyOverwrite = false): OneDriveStatus {
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

    // Never silently clobber a non-empty OneDrive backup with a completely empty DB during background auto-sync
    const existingValid = readValidOneDriveBackup(folder);
    if (
      isLocalEmpty &&
      !allowEmptyOverwrite &&
      existingValid &&
      (existingValid.todoCount > 0 || existingValid.categoryCount > 0)
    ) {
      return resolveOneDriveStatus();
    }

    // Preserve previous valid sync file before writing new snapshot
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
      provider: 'OneDrive',
      ...snapshot,
    };
    const jsonText = JSON.stringify(payload, null, 2);
    atomicWriteJsonFile(syncFile, jsonText);

    if (!isLocalEmpty) {
      try {
        atomicWriteJsonFile(dailyFile, jsonText);
        // Keep last 15 rolling daily snapshots
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

  let autoSyncTimer: ReturnType<typeof setTimeout> | null = null;

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

  function triggerOneDriveAutoSync(): void {
    if (autoSyncTimer) {
      clearTimeout(autoSyncTimer);
    }
    autoSyncTimer = setTimeout(() => {
      autoSyncTimer = null;
      flushOneDriveAutoSync();
    }, 200);
  }
  // Bind loopback on Windows desktop by default; 0.0.0.0 in Linux containers unless HOST is set
  const HOST = process.env.HOST || (process.platform === 'win32' ? '127.0.0.1' : '0.0.0.0');

  app.disable('x-powered-by');
  const isLoopbackServer = isLoopbackHostname(HOST);
  app.use((req, res, next) => {
    // Prevent DNS rebinding when bound to local desktop loopback
    if (isLoopbackServer) {
      const hostName = parseHostHeaderHostname(req.headers.host);
      if (hostName && !isLoopbackHostname(hostName)) {
        res.status(403).json({ error: 'Geçersiz ana bilgisayar başlığı.' });
        return;
      }
    }
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (!process.env.CSP_HEADER_VALUE) {
      res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    }
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (process.env.NODE_ENV === 'production' && !process.env.CSP_HEADER_VALUE) {
      res.setHeader(
        'Content-Security-Policy',
        "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'self'; form-action 'self'",
      );
    }
    next();
  });

  app.use(express.json({ limit: '5mb' }));
  app.use('/api', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');

    const isMutation =
      req.method === 'POST' ||
      req.method === 'PATCH' ||
      req.method === 'PUT' ||
      req.method === 'DELETE';

    if (isMutation) {
      // Block cross-site browser requests (CSRF / simple-request protection on localhost API)
      const fetchSite = req.headers['sec-fetch-site'];
      if (typeof fetchSite === 'string' && fetchSite.toLowerCase() === 'cross-site') {
        res.status(403).json({ error: 'Siteler arası API isteği reddedildi.' });
        return;
      }
      const origin = req.headers.origin;
      if (typeof origin === 'string' && origin.length > 0) {
        try {
          const originUrl = new URL(origin);
          const reqHost = parseHostHeaderHostname(req.headers.host);
          const originHost = originUrl.hostname.toLowerCase();
          if (!isLoopbackHostname(originHost) && originHost !== reqHost) {
            res.status(403).json({ error: 'Yetkisiz kaynak üzerinden istek reddedildi.' });
            return;
          }
        } catch {
          res.status(403).json({ error: 'Geçersiz Origin başlığı.' });
          return;
        }
      }
    }

    if (
      (req.method === 'POST' || req.method === 'PATCH' || req.method === 'PUT') &&
      req.body !== undefined &&
      !isPlainObject(req.body)
    ) {
      res.status(400).json({ error: 'Geçersiz istek gövdesi.' });
      return;
    }

    if (
      isMutation &&
      !req.path.startsWith('/onedrive/') &&
      !req.path.startsWith('/window/')
    ) {
      res.on('finish', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          triggerOneDriveAutoSync();
        }
      });
    }
    next();
  });

  // Lightweight health probe for Electron / Windows launcher startup checks
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  // Bootstrap all active + trashed state and settings in one round-trip
  app.get('/api/bootstrap', (_req, res) => {
    try {
      res.json(db.getBootstrap());
    } catch (err) {
      sendRouteError(res, 'GET /api/bootstrap', err, 'Veriler yüklenemedi.');
    }
  });

  // Categories
  app.post('/api/categories', (req, res) => {
    try {
      const { id, name, color, pinned } = req.body ?? {};
      if (typeof name !== 'string' || !name.trim()) {
        res.status(400).json({ error: 'Kategori adı gereklidir.' });
        return;
      }
      const created = db.createCategory({
        id: typeof id === 'string' ? id : undefined,
        name,
        color: typeof color === 'string' ? color : undefined,
        pinned: typeof pinned === 'boolean' ? pinned : undefined,
      });
      res.status(201).json(created);
    } catch (err) {
      sendRouteError(res, 'POST /api/categories', err, 'Kategori oluşturulamadı.');
    }
  });

  app.patch('/api/categories/reorder', (req, res) => {
    try {
      const { orderedIds } = req.body ?? {};
      if (!Array.isArray(orderedIds)) {
        res.status(400).json({ error: 'Geçersiz kategori sıralama listesi.' });
        return;
      }
      db.reorderCategories(orderedIds.filter((x): x is string => typeof x === 'string'));
      res.json({ ok: true });
    } catch (err) {
      sendRouteError(res, 'PATCH /api/categories/reorder', err, 'Kategori sıralaması kaydedilemedi.');
    }
  });

  app.patch('/api/categories/:id', (req, res) => {
    try {
      const body = req.body ?? {};
      const updated = db.updateCategory(req.params.id, {
        name: typeof body.name === 'string' ? body.name : undefined,
        color: typeof body.color === 'string' ? body.color : undefined,
        pinned: typeof body.pinned === 'boolean' ? body.pinned : undefined,
      });
      if (!updated) {
        res.status(404).json({ error: 'Kategori bulunamadı.' });
        return;
      }
      res.json(updated);
    } catch (err) {
      sendRouteError(res, 'PATCH /api/categories/:id', err, 'Kategori güncellenemedi.');
    }
  });

  // Soft delete category -> moves to trash
  app.delete('/api/categories/:id', (req, res) => {
    try {
      const trashed = db.softDeleteCategory(req.params.id);
      if (!trashed) {
        res.status(404).json({ error: 'Kategori bulunamadı.' });
        return;
      }
      res.json(trashed);
    } catch (err) {
      sendRouteError(res, 'DELETE /api/categories/:id', err, 'Kategori çöp kutusuna taşınamadı.');
    }
  });

  app.post('/api/categories/:id/restore', (req, res) => {
    try {
      const restored = db.restoreCategory(req.params.id);
      if (!restored) {
        res.status(404).json({ error: 'Kategori çöp kutusunda bulunamadı.' });
        return;
      }
      res.json(restored);
    } catch (err) {
      sendRouteError(res, 'POST /api/categories/:id/restore', err, 'Kategori geri yüklenemedi.');
    }
  });

  app.delete('/api/categories/:id/permanent', (req, res) => {
    try {
      const deleted = db.permanentDeleteCategory(req.params.id);
      if (!deleted) {
        res.status(404).json({ error: 'Kategori çöp kutusunda bulunamadı.' });
        return;
      }
      res.json({ ok: true });
    } catch (err) {
      sendRouteError(
        res,
        'DELETE /api/categories/:id/permanent',
        err,
        'Kategori kalıcı olarak silinemedi.',
      );
    }
  });

  // Todos
  app.post('/api/todos', (req, res) => {
    try {
      const body = req.body ?? {};
      if (typeof body.title !== 'string' || !body.title.trim()) {
        res.status(400).json({ error: 'Görev başlığı gereklidir.' });
        return;
      }
      const created = db.createTodo({
        id: typeof body.id === 'string' ? body.id : undefined,
        title: body.title,
        notes: typeof body.notes === 'string' ? body.notes : undefined,
        completed: typeof body.completed === 'boolean' ? body.completed : undefined,
        important: typeof body.important === 'boolean' ? body.important : undefined,
        pinned: typeof body.pinned === 'boolean' ? body.pinned : undefined,
        priority: body.priority,
        startDate:
          body.startDate === null || typeof body.startDate === 'string'
            ? body.startDate
            : undefined,
        dueDate:
          body.dueDate === null || typeof body.dueDate === 'string' ? body.dueDate : undefined,
        dueTime:
          body.dueTime === null || typeof body.dueTime === 'string' ? body.dueTime : undefined,
        tags: Array.isArray(body.tags) ? body.tags : undefined,
        categoryId:
          body.categoryId === null || typeof body.categoryId === 'string'
            ? body.categoryId
            : undefined,
        subtasks: Array.isArray(body.subtasks) ? body.subtasks : undefined,
      });
      res.status(201).json(created);
    } catch (err) {
      sendRouteError(res, 'POST /api/todos', err, 'Görev eklenemedi.');
    }
  });

  app.patch('/api/todos/reorder', (req, res) => {
    try {
      const { orderedIds } = req.body ?? {};
      if (!Array.isArray(orderedIds)) {
        res.status(400).json({ error: 'Geçersiz sıralama listesi.' });
        return;
      }
      db.reorderTodos(orderedIds.filter((x): x is string => typeof x === 'string'));
      res.json({ ok: true });
    } catch (err) {
      sendRouteError(res, 'PATCH /api/todos/reorder', err, 'Sıralama kaydedilemedi.');
    }
  });

  // Soft delete completed todos -> moves to trash
  app.delete('/api/todos/completed', (req, res) => {
    try {
      const categoryId =
        typeof req.query.categoryId === 'string' && req.query.categoryId.length > 0
          ? req.query.categoryId
          : null;
      const trashedTodos = db.clearCompleted(categoryId);
      res.json({ ok: true, trashedTodos });
    } catch (err) {
      sendRouteError(
        res,
        'DELETE /api/todos/completed',
        err,
        'Tamamlananlar çöp kutusuna taşınamadı.',
      );
    }
  });

  app.patch('/api/todos/:id', (req, res) => {
    try {
      const body = req.body ?? {};
      const updated = db.updateTodo(req.params.id, {
        title: typeof body.title === 'string' ? body.title : undefined,
        notes: typeof body.notes === 'string' ? body.notes : undefined,
        completed: typeof body.completed === 'boolean' ? body.completed : undefined,
        important: typeof body.important === 'boolean' ? body.important : undefined,
        pinned: typeof body.pinned === 'boolean' ? body.pinned : undefined,
        priority: body.priority,
        startDate:
          body.startDate === null || typeof body.startDate === 'string'
            ? body.startDate
            : undefined,
        dueDate:
          body.dueDate === null || typeof body.dueDate === 'string' ? body.dueDate : undefined,
        dueTime:
          body.dueTime === null || typeof body.dueTime === 'string' ? body.dueTime : undefined,
        tags: Array.isArray(body.tags) ? body.tags : undefined,
        categoryId:
          body.categoryId === null || typeof body.categoryId === 'string'
            ? body.categoryId
            : undefined,
      });
      if (!updated) {
        res.status(404).json({ error: 'Görev bulunamadı.' });
        return;
      }
      res.json(updated);
    } catch (err) {
      sendRouteError(res, 'PATCH /api/todos/:id', err, 'Görev güncellenemedi.');
    }
  });

  // Soft delete todo -> moves to trash
  app.delete('/api/todos/:id', (req, res) => {
    try {
      const trashed = db.softDeleteTodo(req.params.id);
      if (!trashed) {
        res.status(404).json({ error: 'Görev bulunamadı.' });
        return;
      }
      res.json(trashed);
    } catch (err) {
      sendRouteError(res, 'DELETE /api/todos/:id', err, 'Görev çöp kutusuna taşınamadı.');
    }
  });

  app.post('/api/todos/:id/restore', (req, res) => {
    try {
      const restored = db.restoreTodo(req.params.id);
      if (!restored) {
        res.status(404).json({ error: 'Görev çöp kutusunda bulunamadı.' });
        return;
      }
      res.json(restored);
    } catch (err) {
      sendRouteError(res, 'POST /api/todos/:id/restore', err, 'Görev geri yüklenemedi.');
    }
  });

  app.delete('/api/todos/:id/permanent', (req, res) => {
    try {
      const deleted = db.permanentDeleteTodo(req.params.id);
      if (!deleted) {
        res.status(404).json({ error: 'Görev çöp kutusunda bulunamadı.' });
        return;
      }
      res.json({ ok: true });
    } catch (err) {
      sendRouteError(res, 'DELETE /api/todos/:id/permanent', err, 'Görev kalıcı olarak silinemedi.');
    }
  });

  // Empty entire trash permanently
  app.delete('/api/trash', (_req, res) => {
    try {
      const result = db.emptyTrash();
      res.json({ ok: true, ...result });
    } catch (err) {
      sendRouteError(res, 'DELETE /api/trash', err, 'Çöp kutusu boşaltılamadı.');
    }
  });

  // Subtasks
  app.post('/api/todos/:id/subtasks', (req, res) => {
    try {
      const { title } = req.body ?? {};
      if (typeof title !== 'string' || !title.trim()) {
        res.status(400).json({ error: 'Alt görev başlığı gereklidir.' });
        return;
      }
      const created = db.createSubtask(req.params.id, title);
      if (!created) {
        res.status(404).json({ error: 'Üst görev bulunamadı.' });
        return;
      }
      res.status(201).json(created);
    } catch (err) {
      sendRouteError(res, 'POST /api/todos/:id/subtasks', err, 'Alt görev eklenemedi.');
    }
  });

  app.patch('/api/subtasks/:id', (req, res) => {
    try {
      const body = req.body ?? {};
      const updated = db.updateSubtask(req.params.id, {
        title: typeof body.title === 'string' ? body.title : undefined,
        completed: typeof body.completed === 'boolean' ? body.completed : undefined,
      });
      if (!updated) {
        res.status(404).json({ error: 'Alt görev bulunamadı.' });
        return;
      }
      res.json(updated);
    } catch (err) {
      sendRouteError(res, 'PATCH /api/subtasks/:id', err, 'Alt görev güncellenemedi.');
    }
  });

  app.delete('/api/subtasks/:id', (req, res) => {
    try {
      const deleted = db.deleteSubtask(req.params.id);
      if (!deleted) {
        res.status(404).json({ error: 'Alt görev bulunamadı.' });
        return;
      }
      res.json({ ok: true });
    } catch (err) {
      sendRouteError(res, 'DELETE /api/subtasks/:id', err, 'Alt görev silinemedi.');
    }
  });

  // Settings (theme mode, color theme, drag lock, sidebar, language & autoUpdateCheck persisted to SQLite)
  app.patch('/api/settings', (req, res) => {
    try {
      const updated = db.updateSettings(req.body ?? {});
      res.json(updated);
    } catch (err) {
      sendRouteError(res, 'PATCH /api/settings', err, 'Ayarlar kaydedilemedi.');
    }
  });

  // Version & Update Check (cached 30s to protect GitHub unauthenticated rate limits; ?force=1 bypasses)
  let updateCheckCache: { expiresAt: number; payload: Record<string, unknown> } | null = null;
  app.get('/api/update-check', async (req, res) => {
    const force = req.query.force === '1' || req.query.force === 'true';
    if (!force && updateCheckCache && Date.now() < updateCheckCache.expiresAt) {
      res.json(updateCheckCache.payload);
      return;
    }
    const checkedAt = new Date().toISOString();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(GITHUB_RELEASES_API, {
        signal: controller.signal,
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': `Agendamea/${APP_VERSION} (Vellium)`,
        },
      });
      if (!response.ok) {
        res.json({
          ok: false,
          currentVersion: APP_VERSION,
          latestVersion: APP_VERSION,
          updateAvailable: false,
          releaseName: `Agendamea v${APP_VERSION}`,
          releaseNotes: '',
          publishedAt: null,
          releaseUrl: GITHUB_RELEASES_HTML,
          setupUrl: null,
          portableUrl: null,
          msixUrl: null,
          checkedAt,
        });
        return;
      }
      const data = (await response.json()) as Record<string, unknown>;
      const resultPayload = releaseUtils.parseGitHubRelease(
        data,
        APP_VERSION,
        GITHUB_RELEASES_HTML,
        checkedAt,
      );
      updateCheckCache = {
        expiresAt: Date.now() + 30_000,
        payload: resultPayload,
      };
      res.json(resultPayload);
    } catch {
      res.json({
        ok: false,
        currentVersion: APP_VERSION,
        latestVersion: APP_VERSION,
        updateAvailable: false,
        releaseName: `Agendamea v${APP_VERSION}`,
        releaseNotes: '',
        publishedAt: null,
        releaseUrl: GITHUB_RELEASES_HTML,
        setupUrl: null,
        portableUrl: null,
        msixUrl: null,
        checkedAt,
      });
    } finally {
      clearTimeout(timer);
    }
  });

  // Windows 10/11 native minimize fallback (loopback-only + concurrency guard; bypassed inside Windows Store MSIX)
  let isMinimizing = false;
  app.post('/api/window/minimize', (req, res) => {
    const isWinStore = Boolean((process as NodeJS.Process & { windowsStore?: boolean }).windowsStore);
    if (process.platform !== 'win32' || isWinStore) {
      res.json({ ok: true, supported: false });
      return;
    }
    if (!isLoopbackAddress(req.socket.remoteAddress)) {
      res.status(403).json({ error: 'Yalnızca yerel erişime izin verilir.' });
      return;
    }
    if (isMinimizing) {
      res.json({ ok: true, supported: true });
      return;
    }

    isMinimizing = true;
    const psScript =
      'Add-Type -TypeDefinition "using System; using System.Runtime.InteropServices; public class Win32Min { [DllImport(\\"user32.dll\\")] public static extern IntPtr GetForegroundWindow(); [DllImport(\\"user32.dll\\")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow); }"; $h = [Win32Min]::GetForegroundWindow(); if ($h -ne [IntPtr]::Zero) { [void][Win32Min]::ShowWindow($h, 6) }';

    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', psScript],
      { timeout: 3000 },
      (err) => {
        isMinimizing = false;
        if (err) {
          res.json({ ok: false, supported: true });
          return;
        }
        res.json({ ok: true, supported: true });
      },
    );
  });

  // JSON Backup Export
  app.get('/api/export', (req, res) => {
    try {
      const snapshot = db.getBootstrap();
      const payload = {
        exportedAt: new Date().toISOString(),
        app: 'Agendamea',
        ...snapshot,
      };
      const reqLang = typeof req.query.lang === 'string' ? req.query.lang : snapshot.settings.language;
      const fileSlug = reqLang === 'tr' ? 'yedek' : 'backup';
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="agendamea-${fileSlug}-${getLocalDateString()}.json"`,
      );
      res.send(JSON.stringify(payload, null, 2));
    } catch (err) {
      sendRouteError(res, 'GET /api/export', err, 'Yedek oluşturulamadı.');
    }
  });

  // JSON Backup Import (atomic restore; never leaks internal SQLite errors)
  app.post('/api/import', (req, res) => {
    try {
      const restored = db.importBackup(req.body ?? {});
      res.json(restored);
    } catch (err) {
      sendRouteError(res, 'POST /api/import', err, 'Yedek dosyası içe aktarılamadı.');
    }
  });

  // Zero-Cost OneDrive Cloud Sync Endpoints
  app.get('/api/onedrive/status', (_req, res) => {
    try {
      res.json(resolveOneDriveStatus());
    } catch (err) {
      sendRouteError(res, 'GET /api/onedrive/status', err, 'OneDrive durumu alınamadı.');
    }
  });

  app.post('/api/onedrive/connect', (req, res) => {
    try {
      const body = req.body ?? {};
      const requestedPath =
        typeof body.folderPath === 'string' && body.folderPath.trim().length > 0
          ? path.resolve(body.folderPath.trim())
          : detectDefaultOneDriveRoot();
      const autoSync = typeof body.autoSync === 'boolean' ? body.autoSync : true;
      db.updateSettings({
        onedriveCustomPath: requestedPath,
        onedriveAutoSync: autoSync,
      });

      // Format/fresh-install safeguard: if local DB is empty and OneDrive already has a valid backup, restore it instead of overwriting!
      const localSnap = db.getBootstrap();
      const isLocalEmpty =
        localSnap.todos.length === 0 &&
        localSnap.categories.length === 0 &&
        localSnap.trashedTodos.length === 0 &&
        localSnap.trashedCategories.length === 0;
      const existingRemote = readValidOneDriveBackup(requestedPath);

      if (
        isLocalEmpty &&
        existingRemote &&
        (existingRemote.todoCount > 0 || existingRemote.categoryCount > 0)
      ) {
        const restoredBootstrap = db.importBackup(existingRemote.payload);
        res.json({
          ...resolveOneDriveStatus(),
          restoredBootstrap,
        });
        return;
      }

      if (isLocalEmpty && !existingRemote) {
        fs.mkdirSync(requestedPath, { recursive: true });
        res.json(resolveOneDriveStatus());
        return;
      }

      const status = writeOneDriveSyncSnapshot(requestedPath, true);
      res.json(status);
    } catch (err) {
      sendRouteError(res, 'POST /api/onedrive/connect', err, 'OneDrive bağlantısı kurulamadı.');
    }
  });

  app.post('/api/onedrive/disconnect', (_req, res) => {
    try {
      db.updateSettings({
        onedriveCustomPath: '',
        onedriveAutoSync: false,
      });
      res.json(resolveOneDriveStatus());
    } catch (err) {
      sendRouteError(res, 'POST /api/onedrive/disconnect', err, 'OneDrive bağlantısı kesilemedi.');
    }
  });

  app.post('/api/onedrive/sync-push', (_req, res) => {
    try {
      const current = resolveOneDriveStatus();
      if (!current.connected && current.folderPath) {
        db.updateSettings({ onedriveCustomPath: current.folderPath, onedriveAutoSync: true });
      }
      const status = writeOneDriveSyncSnapshot(undefined, true);
      res.json(status);
    } catch (err) {
      sendRouteError(res, 'POST /api/onedrive/sync-push', err, 'OneDrive eşitlemesi başarısız oldu.');
    }
  });

  app.post('/api/onedrive/sync-pull', (_req, res) => {
    try {
      const current = resolveOneDriveStatus();
      const folder = current.folderPath ?? detectDefaultOneDriveRoot();
      const validBackup = readValidOneDriveBackup(folder);
      if (!validBackup) {
        throw new ValidationError('OneDrive yedek dosyası bulunamadı.');
      }
      if (!current.connected) {
        db.updateSettings({
          onedriveCustomPath: folder,
          onedriveAutoSync: true,
        });
      }
      const bootstrap = db.importBackup(validBackup.payload);
      res.json({
        status: resolveOneDriveStatus(),
        bootstrap,
      });
    } catch (err) {
      sendRouteError(res, 'POST /api/onedrive/sync-pull', err, 'OneDrive verisi geri yüklenemedi.');
    }
  });

  app.post('/api/onedrive/open-folder', (req, res) => {
    try {
      if (!isLoopbackAddress(req.socket.remoteAddress)) {
        res.status(403).json({ error: 'Yalnızca yerel erişime izin verilir.' });
        return;
      }
      const current = resolveOneDriveStatus();
      const folder = current.folderPath ?? detectDefaultOneDriveRoot();
      fs.mkdirSync(folder, { recursive: true });
      if (process.platform === 'win32') {
        execFile('explorer.exe', [folder], { timeout: 5000 }, () => {});
      }
      res.json({ ok: true, path: folder });
    } catch (err) {
      sendRouteError(res, 'POST /api/onedrive/open-folder', err, 'OneDrive klasörü açılamadı.');
    }
  });

  // Unknown API routes return clean JSON 404 instead of SPA index.html
  app.all('/api/*', (_req, res) => {
    res.status(404).json({ error: 'API uç noktası bulunamadı.' });
  });

  // Clean JSON error handler (handles malformed JSON, 413 payload limit, and prevents stack trace leaks)
  app.use(
    (
      err: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      if (err instanceof SyntaxError && 'body' in err) {
        res.status(400).json({ error: 'Geçersiz JSON formatı.' });
        return;
      }
      const typedErr = err as { type?: string; status?: number };
      if (typedErr?.type === 'entity.too.large' || typedErr?.status === 413) {
        res.status(413).json({ error: 'İstek boyutu çok büyük (en fazla 5 MB).' });
        return;
      }
      console.error('Unhandled Express error:', err);
      res.status(500).json({ error: 'Beklenmeyen bir sunucu hatası oluştu.' });
    },
  );

  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const appRoot = process.env.AGENDAMEA_APP_ROOT
    ? path.resolve(process.env.AGENDAMEA_APP_ROOT)
    : fs.existsSync(path.resolve(currentDir, 'dist'))
      ? currentDir
      : path.resolve(currentDir, '..');
  const distDir = path.join(appRoot, 'dist');
  const isProd = process.env.NODE_ENV === 'production' && fs.existsSync(distDir);

  let viteServer: { close: () => Promise<void> } | null = null;

  if (isProd) {
    interface InMemoryAsset {
      raw: Buffer;
      gzip: Buffer | null;
      contentType: string;
      immutable: boolean;
    }

    const MIME_BY_EXT: Record<string, string> = {
      '.html': 'text/html; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.mjs': 'application/javascript; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.svg': 'image/svg+xml',
      '.json': 'application/json; charset=utf-8',
      '.webmanifest': 'application/manifest+json; charset=utf-8',
      '.xml': 'application/xml; charset=utf-8',
      '.png': 'image/png',
      '.ico': 'image/x-icon',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.webp': 'image/webp',
      '.woff2': 'font/woff2',
      '.woff': 'font/woff',
      '.txt': 'text/plain; charset=utf-8',
    };

    const COMPRESSIBLE_EXT = new Set([
      '.html',
      '.js',
      '.mjs',
      '.css',
      '.svg',
      '.json',
      '.webmanifest',
      '.xml',
      '.txt',
    ]);

    // Preload all dist assets into RAM at startup so Windows Portable %TEMP% cleanup
    // can never cause ENOENT on index.html or JS/CSS bundles while the app is running
    const inMemoryAssets = new Map<string, InMemoryAsset>();
    const preloadDir = (dir: string, prefix = '') => {
      try {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const fullPath = path.join(dir, entry.name);
          const relKey = prefix ? `${prefix}/${entry.name}` : entry.name;
          if (entry.isDirectory()) {
            preloadDir(fullPath, relKey);
          } else if (entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase();
            const contentType = MIME_BY_EXT[ext] ?? 'application/octet-stream';
            const raw = fs.readFileSync(fullPath);
            const shouldGzip = COMPRESSIBLE_EXT.has(ext) && raw.length >= 512;
            inMemoryAssets.set(relKey, {
              raw,
              gzip: shouldGzip ? zlib.gzipSync(raw, { level: 6 }) : null,
              contentType,
              immutable:
                relKey.startsWith('assets/') &&
                !relKey.endsWith('index.html') &&
                !relKey.endsWith('sw.js'),
            });
          }
        }
      } catch {
        // Ignore directory read errors
      }
    };
    preloadDir(distDir);

    const serveInMemoryEntry = (
      req: express.Request,
      res: express.Response,
      entry: InMemoryAsset,
    ) => {
      res.setHeader('Content-Type', entry.contentType);
      res.setHeader(
        'Cache-Control',
        entry.immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
      );
      const acceptEnc = String(req.headers['accept-encoding'] ?? '');
      if (entry.gzip && acceptEnc.includes('gzip')) {
        res.setHeader('Content-Encoding', 'gzip');
        res.setHeader('Vary', 'Accept-Encoding');
        res.send(entry.gzip);
        return;
      }
      res.send(entry.raw);
    };

    app.use((req, res, next) => {
      if ((req.method !== 'GET' && req.method !== 'HEAD') || req.path.startsWith('/api/')) {
        next();
        return;
      }
      const relKey = req.path === '/' ? 'index.html' : req.path.replace(/^\/+/, '');
      const memEntry = inMemoryAssets.get(relKey);
      if (memEntry) {
        serveInMemoryEntry(req, res, memEntry);
        return;
      }
      // If request is for a static asset path (e.g. /assets/* or has a file extension), return 404 cleanly
      if (relKey.startsWith('assets/') || /\.[a-z0-9]{2,12}$/i.test(relKey)) {
        const diskPath = path.resolve(distDir, relKey);
        if (
          diskPath.startsWith(distDir + path.sep) &&
          fs.existsSync(diskPath) &&
          fs.statSync(diskPath).isFile()
        ) {
          next();
          return;
        }
        res.status(404).end();
        return;
      }
      next();
    });

    app.use(express.static(distDir));

    app.get('*', (req, res) => {
      const indexEntry = inMemoryAssets.get('index.html');
      if (indexEntry) {
        serveInMemoryEntry(req, res, indexEntry);
        return;
      }
      const indexPath = path.join(distDir, 'index.html');
      if (fs.existsSync(indexPath)) {
        res.setHeader('Cache-Control', 'no-cache');
        res.sendFile(indexPath);
        return;
      }
      res.status(503).type('html').send('<!doctype html><html><body>Agendamea</body></html>');
    });
  } else {
    // Dynamic import keeps devDependency 'vite' out of production/Electron startup path
    const { createServer: createViteServer } = await import('vite');
    const hmrDisabled = process.env.DISABLE_HMR === 'true';
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: hmrDisabled ? false : { server: httpServer },
        ...(hmrDisabled ? { ws: false as const } : {}),
        watch: hmrDisabled ? null : {},
      },
      appType: 'spa',
    });
    viteServer = vite;

    if (hmrDisabled) {
      // Vite 8 injects /@vite/client even when hmr/ws are disabled, causing client-side
      // WebSocket connection errors behind proxies. Serve a zero-WebSocket shim with the
      // standard Vite client exports required by CSS/HMR transforms.
      const noopViteClient = [
        'const sheetsMap = new Map();',
        'export function updateStyle(id, content) {',
        '  let style = sheetsMap.get(id);',
        '  if (!style) {',
        '    style = document.createElement("style");',
        '    style.setAttribute("type", "text/css");',
        '    style.setAttribute("data-vite-dev-id", id);',
        '    style.textContent = content;',
        '    document.head.appendChild(style);',
        '    sheetsMap.set(id, style);',
        '  } else if (style.textContent !== content) {',
        '    style.textContent = content;',
        '  }',
        '}',
        'export function removeStyle(id) {',
        '  const style = sheetsMap.get(id);',
        '  if (style) {',
        '    style.remove();',
        '    sheetsMap.delete(id);',
        '  }',
        '}',
        'export function createHotContext() {',
        '  return {',
        '    data: {},',
        '    accept() {},',
        '    acceptExports() {},',
        '    dispose() {},',
        '    prune() {},',
        '    decline() {},',
        '    invalidate() {},',
        '    on() {},',
        '    off() {},',
        '    send() {},',
        '  };',
        '}',
        'export function injectQuery(url, queryToInject) {',
        '  if (url[0] !== "." && url[0] !== "/") return url;',
        '  const pathname = url.replace(/[?#].*$/, "");',
        '  const { search, hash } = new URL(url, "http://vite.dev");',
        '  return `${pathname}?${queryToInject}${search ? "&" + search.slice(1) : ""}${hash || ""}`;',
        '}',
        'export class ErrorOverlay extends HTMLElement {}',
      ].join('\n');

      app.get('/@vite/client', (_req, res) => {
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache');
        res.send(noopViteClient);
      });
    }

    app.use(vite.middlewares);
  }

  httpServer.on('error', (err) => {
    console.error('Agendamea HTTP server error:', err);
    try {
      db.close();
    } catch {
      // Ignore already-closed handle
    }
    process.exit(1);
  });

  const server = httpServer.listen(PORT, HOST, () => {
    console.log(`Agendamea server running on http://${HOST}:${PORT}`);
  });

  let shuttingDown = false;
  const shutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    flushOneDriveAutoSync();

    const forceExit = setTimeout(() => {
      try {
        db.close();
      } catch {
        // Ignore already-closed handle
      }
      process.exit(0);
    }, 1500);
    forceExit.unref();

    server.closeIdleConnections?.();
    server.close(() => {
      const finish = () => {
        clearTimeout(forceExit);
        try {
          db.close();
        } catch {
          // Ignore already-closed handle
        }
        process.exit(0);
      };
      if (viteServer) {
        void viteServer.close().catch(() => {}).finally(finish);
      } else {
        finish();
      }
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  process.on('message', (msg) => {
    if (msg === 'shutdown') {
      shutdown();
    }
  });
  process.on('disconnect', () => {
    shutdown();
  });
}

startServer().catch((err) => {
  console.error('Failed to start Agendamea server:', err);
  process.exit(1);
});
