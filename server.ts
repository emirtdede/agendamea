import { execFile } from 'node:child_process';
import http from 'node:http';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { TodoDatabase, ValidationError } from './src/db/database.ts';
import type { OneDriveStatus } from './src/types.ts';
import { compareSemver, getLocalDateString } from './src/utils/todoLogic.ts';

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

  function detectDefaultOneDriveRoot(): string {
    const candidates = [
      process.env.OneDriveConsumer,
      process.env.OneDrive,
      process.env.OneDriveCommercial,
      path.join(os.homedir(), 'OneDrive'),
    ].filter((p): p is string => typeof p === 'string' && p.trim().length > 0);

    for (const candidate of candidates) {
      try {
        if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
          return path.join(candidate, 'Agendamea');
        }
      } catch {
        // Ignore inaccessible paths
      }
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
    const status = resolveOneDriveStatus();
    const folder = targetFolder
      ? path.resolve(targetFolder)
      : status.folderPath ?? detectDefaultOneDriveRoot();
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
      console.error('GET /api/bootstrap error:', err);
      res.status(500).json({ error: 'Veriler yüklenemedi.' });
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
      console.error('DELETE /api/categories/:id error:', err);
      res.status(500).json({ error: 'Kategori çöp kutusuna taşınamadı.' });
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
      console.error('POST /api/categories/:id/restore error:', err);
      res.status(500).json({ error: 'Kategori geri yüklenemedi.' });
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
      console.error('DELETE /api/categories/:id/permanent error:', err);
      res.status(500).json({ error: 'Kategori kalıcı olarak silinemedi.' });
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
      triggerOneDriveAutoSync();
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
      console.error('DELETE /api/todos/completed error:', err);
      res.status(500).json({ error: 'Tamamlananlar çöp kutusuna taşınamadı.' });
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
      triggerOneDriveAutoSync();
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
      console.error('DELETE /api/todos/:id error:', err);
      res.status(500).json({ error: 'Görev çöp kutusuna taşınamadı.' });
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
      console.error('POST /api/todos/:id/restore error:', err);
      res.status(500).json({ error: 'Görev geri yüklenemedi.' });
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
      console.error('DELETE /api/todos/:id/permanent error:', err);
      res.status(500).json({ error: 'Görev kalıcı olarak silinemedi.' });
    }
  });

  // Empty entire trash permanently
  app.delete('/api/trash', (_req, res) => {
    try {
      const result = db.emptyTrash();
      res.json({ ok: true, ...result });
    } catch (err) {
      console.error('DELETE /api/trash error:', err);
      res.status(500).json({ error: 'Çöp kutusu boşaltılamadı.' });
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
      console.error('DELETE /api/subtasks/:id error:', err);
      res.status(500).json({ error: 'Alt görev silinemedi.' });
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

  // Version & Update Check (manual and automatic background check via GitHub Releases)
  app.get('/api/update-check', async (_req, res) => {
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
          checkedAt,
        });
        return;
      }
      const data = (await response.json()) as {
        tag_name?: string;
        name?: string;
        body?: string;
        published_at?: string;
        html_url?: string;
        assets?: Array<{ name?: string; browser_download_url?: string }>;
      };
      const latestVersion = String(data.tag_name ?? APP_VERSION).replace(/^v/i, '') || APP_VERSION;
      const updateAvailable = compareSemver(latestVersion, APP_VERSION) > 0;
      const assets = Array.isArray(data.assets) ? data.assets : [];
      const setupAsset = assets.find(
        (a) => typeof a?.name === 'string' && /^Agendamea-Setup-.*\.exe$/i.test(a.name),
      );
      const portableAsset = assets.find(
        (a) => typeof a?.name === 'string' && /^Agendamea-Portable-.*\.exe$/i.test(a.name),
      );
      res.json({
        ok: true,
        currentVersion: APP_VERSION,
        latestVersion,
        updateAvailable,
        releaseName: typeof data.name === 'string' && data.name ? data.name : `Agendamea v${latestVersion}`,
        releaseNotes: typeof data.body === 'string' ? data.body.slice(0, 4000) : '',
        publishedAt: typeof data.published_at === 'string' ? data.published_at : null,
        releaseUrl:
          typeof data.html_url === 'string' && data.html_url ? data.html_url : GITHUB_RELEASES_HTML,
        setupUrl:
          typeof setupAsset?.browser_download_url === 'string'
            ? setupAsset.browser_download_url
            : null,
        portableUrl:
          typeof portableAsset?.browser_download_url === 'string'
            ? portableAsset.browser_download_url
            : null,
        checkedAt,
      });
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
      console.error('GET /api/export error:', err);
      res.status(500).json({ error: 'Yedek oluşturulamadı.' });
    }
  });

  // JSON Backup Import (atomic restore; never leaks internal SQLite errors)
  app.post('/api/import', (req, res) => {
    try {
      const restored = db.importBackup(req.body ?? {});
      triggerOneDriveAutoSync();
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
    app.use(
      express.static(distDir, {
        setHeaders(res, filePath) {
          if (filePath.includes(`${path.sep}assets${path.sep}`)) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          } else if (filePath.endsWith('index.html') || filePath.endsWith('sw.js')) {
            res.setHeader('Cache-Control', 'no-cache');
          } else if (filePath.endsWith('.webmanifest')) {
            res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
          } else if (filePath.endsWith('browserconfig.xml')) {
            res.setHeader('Content-Type', 'application/xml; charset=utf-8');
          }
        },
      }),
    );
    app.get('*', (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(distDir, 'index.html'));
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
