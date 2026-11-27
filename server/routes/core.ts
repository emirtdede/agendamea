import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import crashDiagnostics from '../../shared/crashDiagnostics.cjs';
import releaseUtils from '../../shared/releaseUtils.cjs';
import schemas from '../../shared/schemas/index.cjs';
import {
  buildCsvExport,
  buildIcsExport,
  buildMarkdownExport,
} from '../../src/utils/exportFormats.ts';
import { getLocalDateString } from '../../src/utils/todoLogic.ts';
import { isLoopbackAddress, sendRouteError } from '../middleware/security.ts';
import { validateBody } from '../middleware/validate.ts';
import type { ServerContext } from '../types.ts';

export function registerCoreRoutes(ctx: ServerContext): () => void {
  const {
    app,
    db,
    dataDir,
    webhooks,
    sseClients,
    maxSseClients,
    appVersion,
    githubReleasesApi,
    githubReleasesHtml,
  } = ctx;

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      app: 'Agendamea',
      version: appVersion,
      pid: process.pid,
      headless: process.env.AGENDAMEA_HEADLESS_DAEMON === '1',
    });
  });

  // Periodic automatic Trash purge when trashAutoPurgeDays > 0
  const runTrashAutoPurgeIfEnabled = () => {
    try {
      const days = db.getSettings().trashAutoPurgeDays ?? 0;
      if (days > 0) {
        db.purgeExpiredTrash(days);
      }
    } catch {
      // Non-fatal background maintenance
    }
  };
  runTrashAutoPurgeIfEnabled();
  const purgeInterval = setInterval(runTrashAutoPurgeIfEnabled, 6 * 60 * 60 * 1000);
  if (typeof purgeInterval.unref === 'function') purgeInterval.unref();

  app.get('/api/system/info', (req, res) => {
    try {
      if (!isLoopbackAddress(req.socket.remoteAddress)) {
        res.status(403).json({ error: 'Yalnızca yerel erişime izin verilir.' });
        return;
      }
      const dbPath = db.getDbPath();
      let dbSizeBytes = 0;
      if (dbPath && dbPath !== ':memory:') {
        try {
          if (fs.existsSync(dbPath)) dbSizeBytes += fs.statSync(dbPath).size;
          if (fs.existsSync(`${dbPath}-wal`)) dbSizeBytes += fs.statSync(`${dbPath}-wal`).size;
        } catch {
          // Ignore transient stat error
        }
      }
      const counts = db.getSystemCounts();
      const oneDriveStatus = ctx.cloudSync.resolveOneDriveStatus();
      const reports = crashDiagnostics.listCrashReports(dataDir);

      res.json({
        appVersion,
        schemaVersion: db.getSchemaVersion(),
        dbSizeBytes,
        modelsDiskBytes: ctx.aiRuntime.modelManager.getInstalledDiskUsageBytes(),
        activeTodos: counts.activeTodos,
        completedTodos: counts.completedTodos,
        trashedTodos: counts.trashedTodos,
        categoriesCount: counts.categoriesCount,
        trashedCategories: counts.trashedCategories,
        runtimePort: ctx.getActiveListenPort(),
        uptimeSeconds: Math.floor(process.uptime()),
        crashReportCount: Array.isArray(reports) ? reports.length : 0,
        dataDir,
        logsDir: path.join(dataDir, 'logs'),
        modelsDir: ctx.aiRuntime.aiModelsDir,
        aiTier: counts.aiTier,
        cloudConnected: oneDriveStatus.connected,
        cloudProvider: oneDriveStatus.activeProvider ?? null,
      });
    } catch (err) {
      sendRouteError(res, 'GET /api/system/info', err, 'Sistem bilgisi alınamadı.');
    }
  });

  app.get('/api/settings', (_req, res) => {
    try {
      res.json(db.getSettings());
    } catch (err) {
      sendRouteError(res, 'GET /api/settings', err, 'Ayarlar yüklenemedi.');
    }
  });

  app.get('/api/events', (req, res) => {
    if (sseClients.size >= maxSseClients) {
      res.status(503).json({ error: 'Maksimum canlı bağlantı sınırına ulaşıldı.' });
      return;
    }
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();
    res.write(': connected\n\n');
    sseClients.add(res);
    const keepalive = setInterval(() => {
      try {
        res.write(': ping\n\n');
      } catch {
        clearInterval(keepalive);
        sseClients.delete(res);
      }
    }, 25_000);
    if (typeof keepalive.unref === 'function') keepalive.unref();
    req.on('close', () => {
      clearInterval(keepalive);
      sseClients.delete(res);
    });
  });

  app.get('/api/bootstrap', (_req, res) => {
    try {
      res.json(db.getBootstrap());
    } catch (err) {
      sendRouteError(res, 'GET /api/bootstrap', err, 'Veriler yüklenemedi.');
    }
  });

  // Categories
  app.post(
    '/api/categories',
    validateBody(schemas.CreateCategoryBodySchema, 'Kategori adı gereklidir.'),
    (req, res) => {
      try {
        const { id, name, color, pinned } = req.body ?? {};
        const created = db.createCategory({
          id: typeof id === 'string' ? id : undefined,
          name,
          color: typeof color === 'string' ? color : undefined,
          pinned: typeof pinned === 'boolean' ? pinned : undefined,
        });
        webhooks.dispatchConfiguredWebhook('category.created', created);
        res.status(201).json(created);
      } catch (err) {
        sendRouteError(res, 'POST /api/categories', err, 'Kategori oluşturulamadı.');
      }
    },
  );

  app.patch(
    '/api/categories/reorder',
    validateBody(schemas.ReorderIdsBodySchema, 'Geçersiz kategori sıralama listesi.'),
    (req, res) => {
      try {
        const { orderedIds } = req.body ?? {};
        db.reorderCategories(
          (orderedIds as unknown[]).filter((x): x is string => typeof x === 'string'),
        );
        res.json({ ok: true });
      } catch (err) {
        sendRouteError(
          res,
          'PATCH /api/categories/reorder',
          err,
          'Kategori sıralaması kaydedilemedi.',
        );
      }
    },
  );

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
      webhooks.dispatchConfiguredWebhook('category.updated', updated);
      res.json(updated);
    } catch (err) {
      sendRouteError(res, 'PATCH /api/categories/:id', err, 'Kategori güncellenemedi.');
    }
  });

  app.delete('/api/categories/:id', (req, res) => {
    try {
      const trashed = db.softDeleteCategory(req.params.id);
      if (!trashed) {
        res.status(404).json({ error: 'Kategori bulunamadı.' });
        return;
      }
      webhooks.dispatchConfiguredWebhook('category.deleted', trashed);
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
      webhooks.dispatchConfiguredWebhook('category.restored', restored);
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
  app.post(
    '/api/todos',
    validateBody(schemas.CreateTodoBodySchema, 'Görev başlığı gereklidir.'),
    (req, res) => {
      try {
        const body = req.body ?? {};
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
        webhooks.dispatchConfiguredWebhook('todo.created', created);
        res.status(201).json(created);
      } catch (err) {
        sendRouteError(res, 'POST /api/todos', err, 'Görev eklenemedi.');
      }
    },
  );

  app.patch(
    '/api/todos/reorder',
    validateBody(schemas.ReorderIdsBodySchema, 'Geçersiz sıralama listesi.'),
    (req, res) => {
      try {
        const { orderedIds } = req.body ?? {};
        db.reorderTodos(
          (orderedIds as unknown[]).filter((x): x is string => typeof x === 'string'),
        );
        res.json({ ok: true });
      } catch (err) {
        sendRouteError(res, 'PATCH /api/todos/reorder', err, 'Sıralama kaydedilemedi.');
      }
    },
  );

  app.delete('/api/todos/completed', (req, res) => {
    try {
      const categoryId =
        typeof req.query.categoryId === 'string' && req.query.categoryId.length > 0
          ? req.query.categoryId
          : null;
      const trashedTodos = db.clearCompleted(categoryId);
      webhooks.dispatchConfiguredWebhook('todos.cleared_completed', {
        clearedCount: trashedTodos.length,
        categoryId,
      });
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
      const prevTodo = db.getTodoById(req.params.id);
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
      webhooks.dispatchConfiguredWebhook(
        !prevTodo?.completed && updated.completed ? 'todo.completed' : 'todo.updated',
        updated,
      );
      res.json(updated);
    } catch (err) {
      sendRouteError(res, 'PATCH /api/todos/:id', err, 'Görev güncellenemedi.');
    }
  });

  app.delete('/api/todos/:id', (req, res) => {
    try {
      const trashed = db.softDeleteTodo(req.params.id);
      if (!trashed) {
        res.status(404).json({ error: 'Görev bulunamadı.' });
        return;
      }
      webhooks.dispatchConfiguredWebhook('todo.deleted', trashed);
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
      webhooks.dispatchConfiguredWebhook('todo.restored', restored);
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
      sendRouteError(
        res,
        'DELETE /api/todos/:id/permanent',
        err,
        'Görev kalıcı olarak silinemedi.',
      );
    }
  });

  app.post('/api/trash/restore-all', (_req, res) => {
    try {
      const result = db.restoreAllTrash();
      res.json({ ok: true, ...result, bootstrap: db.getBootstrap() });
    } catch (err) {
      sendRouteError(res, 'POST /api/trash/restore-all', err, 'Çöp kutusu geri yüklenemedi.');
    }
  });

  app.delete('/api/trash', (_req, res) => {
    try {
      const result = db.emptyTrash();
      webhooks.dispatchConfiguredWebhook('trash.emptied', result);
      res.json({ ok: true, ...result });
    } catch (err) {
      sendRouteError(res, 'DELETE /api/trash', err, 'Çöp kutusu boşaltılamadı.');
    }
  });

  // Subtasks
  app.post(
    '/api/todos/:id/subtasks',
    validateBody(schemas.CreateSubtaskBodySchema, 'Alt görev başlığı gereklidir.'),
    (req, res) => {
      try {
        const { title } = req.body ?? {};
        const created = db.createSubtask(String(req.params.id ?? ''), title);
        if (!created) {
          res.status(404).json({ error: 'Üst görev bulunamadı.' });
          return;
        }
        webhooks.dispatchConfiguredWebhook('subtask.created', created);
        res.status(201).json(created);
      } catch (err) {
        sendRouteError(res, 'POST /api/todos/:id/subtasks', err, 'Alt görev eklenemedi.');
      }
    },
  );

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
      webhooks.dispatchConfiguredWebhook('subtask.updated', updated);
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
      webhooks.dispatchConfiguredWebhook('subtask.deleted', { id: req.params.id });
      res.json({ ok: true });
    } catch (err) {
      sendRouteError(res, 'DELETE /api/subtasks/:id', err, 'Alt görev silinemedi.');
    }
  });

  app.patch('/api/settings', (req, res) => {
    try {
      const updated = db.updateSettings(req.body ?? {});
      res.json(updated);
    } catch (err) {
      sendRouteError(res, 'PATCH /api/settings', err, 'Ayarlar kaydedilemedi.');
    }
  });

  const isWinStoreRuntime = () =>
    Boolean(
      (process as NodeJS.Process & { windowsStore?: boolean }).windowsStore ||
        process.env.AGENDAMEA_WINDOWS_STORE === '1',
    );

  // Version & Update Check
  let updateCheckCache: { expiresAt: number; payload: Record<string, unknown> } | null = null;
  app.get('/api/update-check', async (req, res) => {
    const checkedAt = new Date().toISOString();
    if (isWinStoreRuntime()) {
      res.json({
        ok: true,
        currentVersion: appVersion,
        latestVersion: appVersion,
        updateAvailable: false,
        storeManaged: true,
        releaseName: `Agendamea v${appVersion}`,
        releaseNotes: '',
        publishedAt: null,
        releaseUrl: 'ms-windows-store://pdp/?ProductId=9MT5X1NGZJXZ',
        setupUrl: null,
        portableUrl: null,
        msixUrl: null,
        checkedAt,
      });
      return;
    }
    const force = req.query.force === '1' || req.query.force === 'true';
    if (!force && updateCheckCache && Date.now() < updateCheckCache.expiresAt) {
      res.json(updateCheckCache.payload);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const fallbackPayload = {
      ok: false,
      currentVersion: appVersion,
      latestVersion: appVersion,
      updateAvailable: false,
      releaseName: `Agendamea v${appVersion}`,
      releaseNotes: '',
      publishedAt: null,
      releaseUrl: githubReleasesHtml,
      setupUrl: null,
      portableUrl: null,
      msixUrl: null,
      checkedAt,
    };
    try {
      const response = await fetch(githubReleasesApi, {
        signal: controller.signal,
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': `Agendamea/${appVersion} (Vellium)`,
        },
      });
      if (!response.ok) {
        res.json(fallbackPayload);
        return;
      }
      const data = (await response.json()) as Record<string, unknown>;
      const resultPayload = releaseUtils.parseGitHubRelease(
        data,
        appVersion,
        githubReleasesHtml,
        checkedAt,
      );
      updateCheckCache = { expiresAt: Date.now() + 30_000, payload: resultPayload };
      res.json(resultPayload);
    } catch {
      res.json(fallbackPayload);
    } finally {
      clearTimeout(timer);
    }
  });

  let isMinimizing = false;
  app.post('/api/window/minimize', (req, res) => {
    const isWinStore = isWinStoreRuntime();
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
        res.json({ ok: !err, supported: true });
      },
    );
  });

  app.get('/api/export', (req, res) => {
    try {
      const snapshot = db.getBootstrap();
      const format = String(req.query.format || 'json')
        .trim()
        .toLowerCase();
      const fileSlug = 'backup';
      const dateStr = getLocalDateString();

      if (format === 'csv') {
        const csvText = buildCsvExport(snapshot.todos, snapshot.categories);
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="agendamea-${fileSlug}-${dateStr}.csv"`,
        );
        res.send(csvText);
        return;
      }
      if (format === 'md' || format === 'markdown') {
        const mdText = buildMarkdownExport(snapshot.todos, snapshot.categories);
        res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="agendamea-${fileSlug}-${dateStr}.md"`,
        );
        res.send(mdText);
        return;
      }
      if (format === 'ics' || format === 'ical') {
        const icsText = buildIcsExport(snapshot.todos, snapshot.categories);
        res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="agendamea-${fileSlug}-${dateStr}.ics"`,
        );
        res.send(icsText);
        return;
      }

      const payload = {
        exportedAt: new Date().toISOString(),
        app: 'Agendamea',
        ...snapshot,
      };
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="agendamea-${fileSlug}-${dateStr}.json"`,
      );
      res.send(JSON.stringify(payload, null, 2));
    } catch (err) {
      sendRouteError(res, 'GET /api/export', err, 'Yedek oluşturulamadı.');
    }
  });

  app.post('/api/import', (req, res) => {
    try {
      const restored = db.importBackup(req.body ?? {});
      webhooks.dispatchConfiguredWebhook('backup.imported', {
        todos: restored.todos.length,
        categories: restored.categories.length,
      });
      res.json(restored);
    } catch (err) {
      sendRouteError(res, 'POST /api/import', err, 'Yedek dosyası içe aktarılamadı.');
    }
  });

  app.post('/api/reset', (req, res) => {
    try {
      const resetSettings = Boolean(req.body?.resetSettings);
      const freshBootstrap = db.resetAllData({ resetSettings });
      if (resetSettings) {
        ctx.appLock?.resetLockState();
      }
      webhooks.dispatchConfiguredWebhook('data.reset', { resetSettings });
      res.json(freshBootstrap);
    } catch (err) {
      sendRouteError(res, 'POST /api/reset', err, 'Veriler sıfırlanamadı.');
    }
  });

  // Local-only redacted crash diagnostics (zero telemetry)
  app.post(
    '/api/diagnostics/crash',
    validateBody(schemas.CrashReportBodySchema, 'Geçersiz hata raporu.'),
    (req, res) => {
      if (!isLoopbackAddress(req.socket.remoteAddress)) {
        res.status(403).json({ error: 'Yalnızca yerel erişime izin verilir.' });
        return;
      }
      const body = req.body as {
        source: string;
        name?: string;
        message: string;
        stack?: string;
        componentStack?: string;
        context?: Record<string, unknown>;
      };
      const result = crashDiagnostics.writeCrashReport({
        source: body.source,
        message: body.message,
        stack: body.stack,
        componentStack: body.componentStack,
        context: body.context,
        dataDir,
      });
      res.status(201).json({ ok: result.ok });
    },
  );

  app.get('/api/diagnostics/crashes', (req, res) => {
    if (!isLoopbackAddress(req.socket.remoteAddress)) {
      res.status(403).json({ error: 'Yalnızca yerel erişime izin verilir.' });
      return;
    }
    res.json({ reports: crashDiagnostics.listCrashReports(dataDir) });
  });

  return () => {
    clearInterval(purgeInterval);
  };
}
