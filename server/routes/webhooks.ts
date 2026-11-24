import type express from 'express';
import schemas from '../../shared/schemas/index.cjs';
import textNormalize from '../../shared/textNormalize.cjs';
import webhookEngine from '../../shared/webhookEngine.cjs';
import { isLoopbackAddress, sendRouteError } from '../middleware/security.ts';
import { validateBody } from '../middleware/validate.ts';
import type { ServerContext } from '../types.ts';

export function registerWebhookRoutes(ctx: ServerContext): void {
  const { app, db, webhooks, appVersion, getActiveListenPort } = ctx;

  app.get('/api/webhooks/logs', (req, res) => {
    try {
      const limit = Number(req.query.limit) || 30;
      res.json(db.getWebhookLogs(limit));
    } catch (err) {
      sendRouteError(res, 'GET /api/webhooks/logs', err, 'Webhook kayıtları alınamadı.');
    }
  });

  app.delete('/api/webhooks/logs', (_req, res) => {
    try {
      const cleared = db.clearWebhookLogs();
      res.json({ ok: true, cleared });
    } catch (err) {
      sendRouteError(res, 'DELETE /api/webhooks/logs', err, 'Webhook kayıtları temizlenemedi.');
    }
  });

  app.get('/api/webhooks/outbox', (req, res) => {
    try {
      const limit = Number(req.query.limit) || 30;
      res.json(db.getWebhookOutbox(limit));
    } catch (err) {
      sendRouteError(res, 'GET /api/webhooks/outbox', err, 'Webhook kuyruğu alınamadı.');
    }
  });

  app.post('/api/webhooks/replay/:id', async (req, res) => {
    try {
      const outboxId = String(req.params.id || '').trim();
      const row = db.getWebhookOutboxRowById(outboxId);
      if (!row) {
        res.status(404).json({ ok: false, error: 'Webhook kuyruk kaydı bulunamadı.' });
        return;
      }
      const settings = db.getSettings();
      const ov = settings.webhookEndpointOverrides?.[row.targetUrl];
      const delivery = await webhookEngine.deliverWebhookOnce({
        targetUrl: row.targetUrl,
        secret: ov?.secret?.trim() || settings.webhookSecret || '',
        event: row.event,
        rawBodyOverride: row.payloadJson,
        eventId: row.eventId,
        format: row.format || ov?.format || settings.webhookFormat || 'auto',
        appVersion,
        allowLocalNetwork: settings.webhookAllowLocalNetwork !== false,
        activeListenPort: getActiveListenPort(),
        timeoutMs: 5000,
      });
      const nextAttempts = row.attempts + 1;
      const nextStatus: 'delivered' | 'pending' | 'dead_letter' = delivery.ok
        ? 'delivered'
        : delivery.retriable
          ? 'pending'
          : 'dead_letter';
      db.updateWebhookOutboxEntry(outboxId, {
        status: nextStatus,
        attempts: nextAttempts,
        nextAttemptAt: new Date(
          Date.now() + webhookEngine.computeFullJitterBackoffMs(nextAttempts),
        ).toISOString(),
        lastStatusCode: delivery.statusCode ?? null,
        lastError: delivery.error ?? '',
      });
      db.recordWebhookLog({
        direction: 'outgoing',
        event: row.event,
        targetUrl: row.targetUrl,
        statusCode: delivery.statusCode ?? null,
        ok: delivery.ok,
        attempts: nextAttempts,
        latencyMs: delivery.latencyMs,
        error: delivery.error ?? '',
      });
      res.json({
        ok: delivery.ok,
        id: outboxId,
        status: nextStatus,
        statusCode: delivery.statusCode ?? null,
        latencyMs: delivery.latencyMs,
        error: delivery.error,
      });
    } catch (err) {
      sendRouteError(res, 'POST /api/webhooks/replay/:id', err, 'Webhook tekrar gönderilemedi.');
    }
  });

  app.post(
    '/api/webhooks/test',
    validateBody(schemas.WebhookTestBodySchema, 'Webhook testi parametreleri geçersiz.'),
    async (req, res) => {
      try {
        const settings = db.getSettings();
        const body = req.body ?? {};
        const targetUrl =
          typeof body.url === 'string' && body.url.trim().length > 0
            ? body.url.trim()
            : (settings.webhookUrl ?? '');
        const secret =
          typeof body.secret === 'string' ? body.secret : (settings.webhookSecret ?? '');
        const format =
          body.format === 'auto' ||
          body.format === 'generic' ||
          body.format === 'discord' ||
          body.format === 'slack'
            ? body.format
            : (settings.webhookFormat ?? 'auto');
        if (!targetUrl) {
          res.status(400).json({ ok: false, error: 'Webhook URL adresi gereklidir.' });
          return;
        }
        const result = await webhooks.deliverWebhookRequest(
          targetUrl,
          secret,
          'webhook.test',
          {
            title: 'Agendamea Webhook Test',
            message: 'Connection verified successfully.',
            priority: 'normal',
          },
          {
            format,
            allowLocalNetwork: settings.webhookAllowLocalNetwork !== false,
            enqueueOnFailure: false,
            endpointOverrides: settings.webhookEndpointOverrides ?? {},
          },
        );
        res.json(result);
      } catch (err) {
        sendRouteError(res, 'POST /api/webhooks/test', err, 'Webhook testi başarısız oldu.');
      }
    },
  );

  app.post('/api/webhook/incoming', (req, res) => {
    const startedAt = Date.now();
    const recordIncoming = (event: string, statusCode: number, ok: boolean, error = '') => {
      try {
        db.recordWebhookLog({
          direction: 'incoming',
          event,
          targetUrl: '/api/webhook/incoming',
          statusCode,
          ok,
          attempts: 1,
          latencyMs: Date.now() - startedAt,
          error,
        });
      } catch {
        // Ignore logging error
      }
    };

    try {
      if (req.headers['x-agendamea-event']) {
        recordIncoming('incoming.loop_blocked', 400, false, 'Self-loop blocked');
        res.status(400).json({ error: 'Döngüsel webhook isteği engellendi.' });
        return;
      }

      const settings = db.getSettings();
      const configuredSecret = (
        settings.webhookIncomingSecret ??
        settings.webhookSecret ??
        ''
      ).trim();
      const isLocalCaller = isLoopbackAddress(req.socket.remoteAddress);

      if (!isLocalCaller && !configuredSecret) {
        recordIncoming('incoming.secret_required', 403, false, 'Secret required for remote access');
        res.status(403).json({
          error:
            'Uzak gelen webhook istekleri için gizli anahtar (webhookIncomingSecret / webhookSecret) zorunludur.',
        });
        return;
      }

      const incomingExplicitlyDisabled = settings.webhookIncomingEnabled === false;
      const incomingAllowed =
        settings.webhookIncomingEnabled === true ||
        (!incomingExplicitlyDisabled &&
          (Boolean(settings.webhookEnabled) || Boolean(configuredSecret)));
      if (!incomingAllowed) {
        recordIncoming('incoming.disabled', 403, false, 'Webhook disabled');
        res.status(403).json({
          error:
            'Gelen webhook erişimi için Gelen Webhook seçeneğini etkinleştirin veya gizli anahtar tanımlayın.',
        });
        return;
      }

      if (configuredSecret) {
        const rawBody =
          (req as express.Request & { rawBody?: string }).rawBody ?? JSON.stringify(req.body ?? {});
        const authResult = webhookEngine.verifyIncomingWebhookAuth({
          headers: req.headers,
          body: req.body ?? {},
          rawBody,
          configuredSecret,
        });

        if (!authResult.ok) {
          recordIncoming('incoming.unauthorized', 401, false, authResult.reason || 'Unauthorized');
          res.status(401).json({
            error:
              authResult.reason === 'stale_timestamp'
                ? 'Webhook zaman damgası geçersiz veya süresi dolmuş (+/- 5 dk).'
                : 'Geçersiz webhook gizli anahtarı veya HMAC imzası.',
          });
          return;
        }
      }

      const body = req.body ?? {};
      const action = typeof body.action === 'string' ? body.action.trim().toLowerCase() : 'add';
      const findCategoryBySelector = (selector: string) => {
        const cats = db.getCategories();
        return (
          cats.find((c) => c.id === selector) ??
          cats.find((c) => textNormalize.equalsNormalized(c.name, selector)) ??
          cats.find(
            (c) => c.id.startsWith(selector) || textNormalize.matchesNormalized(c.name, selector),
          ) ??
          null
        );
      };
      const findTodoBySelector = (selector: string) => db.findTodoBySelector(selector);

      if (action === 'ping' || action === 'test') {
        recordIncoming('incoming.ping', 200, true);
        res.json({
          ok: true,
          action: 'ping',
          listening: true,
          port: getActiveListenPort(),
          version: appVersion,
        });
        return;
      }

      if (action === 'add' || action === 'create') {
        const title = typeof body.title === 'string' ? body.title.trim() : '';
        if (!title) {
          recordIncoming('incoming.add', 400, false, 'Missing title');
          res.status(400).json({ error: 'Görev başlığı (title) gereklidir.' });
          return;
        }
        let resolvedCategoryId = typeof body.categoryId === 'string' ? body.categoryId : undefined;
        if (!resolvedCategoryId && typeof body.category === 'string' && body.category.trim()) {
          resolvedCategoryId = findCategoryBySelector(body.category.trim())?.id;
        }
        const subtasks = Array.isArray(body.subtasks)
          ? body.subtasks
              .map((s: unknown) =>
                typeof s === 'string'
                  ? { title: s.trim(), completed: false }
                  : s && typeof s === 'object' && 'title' in s
                    ? {
                        title: String((s as { title: unknown }).title),
                        completed: Boolean((s as { completed?: unknown }).completed),
                      }
                    : null,
              )
              .filter((x: unknown): x is { title: string; completed: boolean } =>
                Boolean(x && (x as { title: string }).title),
              )
          : undefined;
        const created = db.createTodo({
          title,
          notes: typeof body.notes === 'string' ? body.notes : undefined,
          startDate: typeof body.startDate === 'string' ? body.startDate : undefined,
          dueDate: typeof body.dueDate === 'string' ? body.dueDate : undefined,
          dueTime: typeof body.dueTime === 'string' ? body.dueTime : undefined,
          priority: body.priority,
          important: typeof body.important === 'boolean' ? body.important : undefined,
          pinned: typeof body.pinned === 'boolean' ? body.pinned : undefined,
          tags: Array.isArray(body.tags) ? body.tags : undefined,
          categoryId: resolvedCategoryId,
          subtasks,
        });
        webhooks.dispatchConfiguredWebhook('todo.created', created);
        recordIncoming('incoming.add', 201, true);
        res.status(201).json({ ok: true, action: 'add', todo: created });
        return;
      }

      if (action === 'update' || action === 'edit') {
        const sel = String(body.id ?? body.target ?? '').trim();
        if (!sel) {
          recordIncoming('incoming.update', 400, false, 'Missing id');
          res.status(400).json({ error: 'Görev kimliği (id) gereklidir.' });
          return;
        }
        const found = findTodoBySelector(sel);
        if (!found) {
          recordIncoming('incoming.update', 404, false, 'Task not found');
          res.status(404).json({ error: 'Görev bulunamadı.' });
          return;
        }
        let categoryId =
          body.categoryId === null || typeof body.categoryId === 'string'
            ? body.categoryId
            : undefined;
        if (categoryId === undefined && typeof body.category === 'string') {
          categoryId = body.category.trim()
            ? (findCategoryBySelector(body.category.trim())?.id ?? null)
            : null;
        }
        const updated = db.updateTodo(found.id, {
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
          categoryId,
        });
        webhooks.dispatchConfiguredWebhook(
          !found.completed && updated?.completed ? 'todo.completed' : 'todo.updated',
          updated,
        );
        recordIncoming('incoming.update', 200, true);
        res.json({ ok: true, action: 'update', todo: updated });
        return;
      }

      if (action === 'complete' || action === 'done' || action === 'pin') {
        const sel = String(body.id ?? body.target ?? '').trim();
        if (!sel) {
          recordIncoming(`incoming.${action}`, 400, false, 'Missing id');
          res.status(400).json({ error: 'Görev kimliği (id) gereklidir.' });
          return;
        }
        const found = findTodoBySelector(sel);
        if (!found) {
          recordIncoming(`incoming.${action}`, 404, false, 'Task not found');
          res.status(404).json({ error: 'Görev bulunamadı.' });
          return;
        }
        const patch =
          action === 'pin'
            ? { pinned: body.pinned === undefined ? !found.pinned : Boolean(body.pinned) }
            : { completed: body.completed === undefined ? true : Boolean(body.completed) };
        const updated = db.updateTodo(found.id, patch);
        webhooks.dispatchConfiguredWebhook(
          action !== 'pin' && !found.completed && patch.completed
            ? 'todo.completed'
            : 'todo.updated',
          updated,
        );
        recordIncoming(`incoming.${action}`, 200, true);
        res.json({ ok: true, action: action === 'pin' ? 'pin' : 'complete', todo: updated });
        return;
      }

      if (action === 'delete' || action === 'trash') {
        const sel = String(body.id ?? body.target ?? '').trim();
        if (!sel) {
          recordIncoming('incoming.delete', 400, false, 'Missing id');
          res.status(400).json({ error: 'Görev kimliği (id) gereklidir.' });
          return;
        }
        const found = findTodoBySelector(sel);
        if (!found) {
          recordIncoming('incoming.delete', 404, false, 'Task not found');
          res.status(404).json({ error: 'Görev bulunamadı.' });
          return;
        }
        const trashed = db.softDeleteTodo(found.id);
        webhooks.dispatchConfiguredWebhook('todo.deleted', trashed);
        recordIncoming('incoming.delete', 200, true);
        res.json({ ok: true, action: 'delete', todo: trashed });
        return;
      }

      if (action === 'restore') {
        const sel = String(body.id ?? body.target ?? '').trim();
        const trashedTodos = db.getTrashedTodos();
        const trashedCats = db.getTrashedCategories();
        const matchedTodo = sel
          ? (trashedTodos.find(
              (t) =>
                t.id === sel ||
                t.id.startsWith(sel) ||
                textNormalize.matchesNormalized(t.title, sel),
            ) ?? null)
          : (trashedTodos[0] ?? null);
        if (matchedTodo) {
          const restored = db.restoreTodo(matchedTodo.id);
          webhooks.dispatchConfiguredWebhook('todo.restored', restored);
          recordIncoming('incoming.restore', 200, true);
          res.json({ ok: true, action: 'restore', kind: 'todo', item: restored });
          return;
        }
        const matchedCat = sel
          ? (trashedCats.find(
              (c) =>
                c.id === sel ||
                c.id.startsWith(sel) ||
                textNormalize.matchesNormalized(c.name, sel),
            ) ?? null)
          : (trashedCats[0] ?? null);
        if (matchedCat) {
          const restored = db.restoreCategory(matchedCat.id);
          webhooks.dispatchConfiguredWebhook('category.restored', restored);
          recordIncoming('incoming.restore', 200, true);
          res.json({ ok: true, action: 'restore', kind: 'category', item: restored });
          return;
        }
        recordIncoming('incoming.restore', 404, false, 'Trash item not found');
        res.status(404).json({ error: 'Çöp kutusunda eşleşen öğe bulunamadı.' });
        return;
      }

      if (action === 'clear_completed') {
        const catId =
          typeof body.category === 'string' && body.category.trim()
            ? (findCategoryBySelector(body.category.trim())?.id ?? null)
            : typeof body.categoryId === 'string' && body.categoryId.trim()
              ? body.categoryId.trim()
              : null;
        const trashedTodos = db.clearCompleted(catId);
        webhooks.dispatchConfiguredWebhook('todos.cleared_completed', {
          clearedCount: trashedTodos.length,
          categoryId: catId,
        });
        recordIncoming('incoming.clear_completed', 200, true);
        res.json({ ok: true, action: 'clear_completed', clearedCount: trashedTodos.length });
        return;
      }

      if (
        action === 'subtask.add' ||
        action === 'subtask.toggle' ||
        action === 'subtask.update' ||
        action === 'subtask.delete'
      ) {
        const taskSel = String(body.taskId ?? body.id ?? '').trim();
        const task = taskSel ? findTodoBySelector(taskSel) : null;
        if (!task) {
          recordIncoming(`incoming.${action}`, 404, false, 'Parent task not found');
          res.status(404).json({ error: 'Üst görev bulunamadı.' });
          return;
        }
        if (action === 'subtask.add') {
          const subTitle = typeof body.title === 'string' ? body.title.trim() : '';
          if (!subTitle) {
            recordIncoming('incoming.subtask.add', 400, false, 'Missing subtask title');
            res.status(400).json({ error: 'Alt görev başlığı gereklidir.' });
            return;
          }
          const created = db.createSubtask(task.id, subTitle);
          webhooks.dispatchConfiguredWebhook('subtask.created', created);
          recordIncoming('incoming.subtask.add', 201, true);
          res.status(201).json({ ok: true, action, subtask: created });
          return;
        }
        const subSel = String(body.subtaskId ?? body.subtask ?? '').trim();
        const sub =
          task.subtasks.find(
            (s) =>
              s.id === subSel ||
              s.id.startsWith(subSel) ||
              textNormalize.matchesNormalized(s.title, subSel),
          ) ?? null;
        if (!sub) {
          recordIncoming(`incoming.${action}`, 404, false, 'Subtask not found');
          res.status(404).json({ error: 'Alt görev bulunamadı.' });
          return;
        }
        if (action === 'subtask.delete') {
          db.deleteSubtask(sub.id);
          webhooks.dispatchConfiguredWebhook('subtask.deleted', { id: sub.id, todoId: task.id });
          recordIncoming('incoming.subtask.delete', 200, true);
          res.json({ ok: true, action, id: sub.id });
          return;
        }
        const updatedSub = db.updateSubtask(sub.id, {
          title: typeof body.title === 'string' ? body.title : undefined,
          completed:
            action === 'subtask.toggle'
              ? body.completed === undefined
                ? !sub.completed
                : Boolean(body.completed)
              : typeof body.completed === 'boolean'
                ? body.completed
                : undefined,
        });
        webhooks.dispatchConfiguredWebhook('subtask.updated', updatedSub);
        recordIncoming(`incoming.${action}`, 200, true);
        res.json({ ok: true, action, subtask: updatedSub });
        return;
      }

      if (
        action === 'category.create' ||
        action === 'category.update' ||
        action === 'category.delete'
      ) {
        if (action === 'category.create') {
          const name = typeof body.name === 'string' ? body.name.trim() : '';
          if (!name) {
            recordIncoming('incoming.category.create', 400, false, 'Missing category name');
            res.status(400).json({ error: 'Kategori adı gereklidir.' });
            return;
          }
          const created = db.createCategory({
            name,
            color: typeof body.color === 'string' ? body.color : undefined,
            pinned: typeof body.pinned === 'boolean' ? body.pinned : undefined,
          });
          webhooks.dispatchConfiguredWebhook('category.created', created);
          recordIncoming('incoming.category.create', 201, true);
          res.status(201).json({ ok: true, action, category: created });
          return;
        }
        const catSel = String(body.id ?? body.category ?? body.target ?? '').trim();
        const foundCat = catSel ? findCategoryBySelector(catSel) : null;
        if (!foundCat) {
          recordIncoming(`incoming.${action}`, 404, false, 'Category not found');
          res.status(404).json({ error: 'Kategori bulunamadı.' });
          return;
        }
        if (action === 'category.delete') {
          const trashed = db.softDeleteCategory(foundCat.id);
          webhooks.dispatchConfiguredWebhook('category.deleted', trashed);
          recordIncoming('incoming.category.delete', 200, true);
          res.json({ ok: true, action, category: trashed });
          return;
        }
        const updatedCat = db.updateCategory(foundCat.id, {
          name: typeof body.name === 'string' ? body.name : undefined,
          color: typeof body.color === 'string' ? body.color : undefined,
          pinned: typeof body.pinned === 'boolean' ? body.pinned : undefined,
        });
        webhooks.dispatchConfiguredWebhook('category.updated', updatedCat);
        recordIncoming('incoming.category.update', 200, true);
        res.json({ ok: true, action, category: updatedCat });
        return;
      }

      if (action === 'trash.empty') {
        const result = db.emptyTrash();
        webhooks.dispatchConfiguredWebhook('trash.emptied', result);
        recordIncoming('incoming.trash.empty', 200, true);
        res.json({ ok: true, action, ...result });
        return;
      }

      recordIncoming(`incoming.${action}`, 400, false, 'Unsupported action');
      res.status(400).json({
        error:
          'Desteklenmeyen webhook eylemi (add, update, complete, pin, delete, restore, clear_completed, subtask.*, category.*, trash.empty).',
      });
    } catch (err) {
      recordIncoming('incoming.error', 500, false, 'Internal webhook error');
      sendRouteError(res, 'POST /api/webhook/incoming', err, 'Gelen webhook işlenemedi.');
    }
  });
}
