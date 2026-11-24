import fs from 'node:fs';
import path from 'node:path';
import releaseUtils from '../../shared/releaseUtils.cjs';
import textNormalize from '../../shared/textNormalize.cjs';
import webhookEngine from '../../shared/webhookEngine.cjs';
import { assertSafeLocalSyncFolder } from '../middleware/security.ts';
import type { ServerContext } from '../types.ts';

export type McpNotifyFn = (reason: string, opts?: { rag?: boolean; cloud?: boolean }) => void;

/**
 * Trash, settings, backup, cloud sync, webhook, update, and AI/RAG operations
 * for the in-process MCP store adapter.
 */
export function createMcpAdminOps(ctx: ServerContext, notifyMutation: McpNotifyFn) {
  const { db, cloudSync, webhooks, aiRuntime, appVersion } = ctx;

  async function listTrash(
    opts: {
      typeFilter?: string;
      sortBy?: string;
      query?: string;
      dateFrom?: string;
      dateTo?: string;
    } = {},
  ) {
    let todos = db.getTrashedTodos();
    let categories = db.getTrashedCategories();
    if (opts.typeFilter === 'todos') categories = [];
    if (opts.typeFilter === 'categories') todos = [];
    if (opts.query?.trim()) {
      const q = opts.query.trim();
      todos = todos.filter(
        (t) =>
          textNormalize.matchesNormalized(t.title, q) ||
          textNormalize.matchesNormalized(t.notes || '', q),
      );
      categories = categories.filter((c) => textNormalize.matchesNormalized(c.name, q));
    }
    const from = opts.dateFrom;
    if (from) {
      todos = todos.filter((t) => (t.deletedAt || '').slice(0, 10) >= from);
      categories = categories.filter((c) => (c.deletedAt || '').slice(0, 10) >= from);
    }
    const to = opts.dateTo;
    if (to) {
      todos = todos.filter((t) => (t.deletedAt || '').slice(0, 10) <= to);
      categories = categories.filter((c) => (c.deletedAt || '').slice(0, 10) <= to);
    }
    if (opts.sortBy === 'oldest') {
      todos.sort((a, b) => String(a.deletedAt || '').localeCompare(String(b.deletedAt || '')));
      categories.sort((a, b) => String(a.deletedAt || '').localeCompare(String(b.deletedAt || '')));
    } else if (opts.sortBy === 'az') {
      todos.sort((a, b) => a.title.localeCompare(b.title));
      categories.sort((a, b) => a.name.localeCompare(b.name));
    } else if (opts.sortBy === 'za') {
      todos.sort((a, b) => b.title.localeCompare(a.title));
      categories.sort((a, b) => b.name.localeCompare(a.name));
    }
    return { todos, categories };
  }

  function findTrashItem(target: string | undefined, itemType: string) {
    const todos = db.getTrashedTodos();
    const cats = db.getTrashedCategories();
    const sel = String(target || '').trim();
    if (!sel) {
      const firstTodo = todos[0];
      if (itemType !== 'category' && firstTodo) return { kind: 'todo' as const, item: firstTodo };
      const firstCat = cats[0];
      if (itemType !== 'todo' && firstCat) return { kind: 'category' as const, item: firstCat };
      throw new Error('Trash is empty.');
    }
    if (itemType !== 'category') {
      if (/^\d+$/.test(sel)) {
        const idx = Number.parseInt(sel, 10);
        const picked = idx >= 1 ? todos[idx - 1] : undefined;
        if (picked) return { kind: 'todo' as const, item: picked };
      }
      const mt =
        todos.find((t) => t.id === sel || t.id.startsWith(sel)) ??
        todos.find((t) => textNormalize.matchesNormalized(t.title, sel));
      if (mt) return { kind: 'todo' as const, item: mt };
    }
    if (itemType !== 'todo') {
      if (/^\d+$/.test(sel)) {
        const idx = Number.parseInt(sel, 10);
        const picked = idx >= 1 ? cats[idx - 1] : undefined;
        if (picked) return { kind: 'category' as const, item: picked };
      }
      const mc =
        cats.find((c) => c.id === sel || c.id.startsWith(sel)) ??
        cats.find((c) => textNormalize.matchesNormalized(c.name, sel));
      if (mc) return { kind: 'category' as const, item: mc };
    }
    throw new Error(`Trash item not found: "${sel}".`);
  }

  async function restoreItem(target?: string, itemType = 'auto') {
    const match = findTrashItem(target, itemType);
    if (match.kind === 'todo') {
      const restored = db.restoreTodo(match.item.id);
      webhooks.dispatchConfiguredWebhook('todo.restored', restored);
      notifyMutation('restore_todo', { rag: true });
      return { kind: 'todo', item: restored };
    }
    const restored = db.restoreCategory(match.item.id);
    webhooks.dispatchConfiguredWebhook('category.restored', restored);
    notifyMutation('restore_category');
    return { kind: 'category', item: restored };
  }

  async function permanentDeleteItem(target?: string, itemType = 'auto') {
    const match = findTrashItem(target, itemType);
    if (match.kind === 'todo') {
      db.permanentDeleteTodo(match.item.id);
      notifyMutation('permanent_delete_todo');
      return { ok: true, kind: 'todo', id: match.item.id };
    }
    db.permanentDeleteCategory(match.item.id);
    notifyMutation('permanent_delete_category');
    return { ok: true, kind: 'category', id: match.item.id };
  }

  async function emptyTrash() {
    const res = db.emptyTrash();
    webhooks.dispatchConfiguredWebhook('trash.emptied', res);
    notifyMutation('empty_trash');
    return { ok: true, ...res };
  }

  async function getSettings() {
    return db.getSettings();
  }

  async function updateSettings(patch: Record<string, unknown>) {
    const updated = db.updateSettings(patch);
    notifyMutation('update_settings');
    return updated;
  }

  async function exportBackup(filePath?: string) {
    const payload = {
      exportedAt: new Date().toISOString(),
      app: 'Agendamea',
      ...db.getBootstrap(),
    };
    if (typeof filePath === 'string' && filePath.trim()) {
      const abs = path.resolve(filePath.trim());
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, JSON.stringify(payload, null, 2), 'utf8');
      return {
        ok: true,
        filePath: abs,
        todos: payload.todos.length,
        categories: payload.categories.length,
      };
    }
    return payload;
  }

  async function importBackup(payloadOrPath: unknown) {
    let payload = payloadOrPath;
    if (typeof payloadOrPath === 'string' && payloadOrPath.trim()) {
      const abs = path.resolve(payloadOrPath.trim());
      payload = JSON.parse(fs.readFileSync(abs, 'utf8'));
    }
    const restored = db.importBackup(payload as Record<string, unknown>);
    webhooks.dispatchConfiguredWebhook('backup.imported', {
      todos: restored.todos.length,
      categories: restored.categories.length,
    });
    notifyMutation('import_backup', { rag: true });
    return restored;
  }

  async function resetAllData(opts?: { resetSettings?: boolean }) {
    const resetSettings = Boolean(opts?.resetSettings);
    const fresh = db.resetAllData({ resetSettings });
    webhooks.dispatchConfiguredWebhook('data.reset', { resetSettings });
    notifyMutation('reset', { rag: true, cloud: false });
    return fresh;
  }

  async function getCloudStatus() {
    return cloudSync.resolveOneDriveStatus();
  }

  async function connectCloud(folderPath?: string, autoSync = true) {
    const target =
      typeof folderPath === 'string' && folderPath.trim()
        ? assertSafeLocalSyncFolder(folderPath)
        : cloudSync.detectDefaultOneDriveRoot();
    db.updateSettings({ onedriveCustomPath: target, onedriveAutoSync: autoSync });
    const status = cloudSync.writeOneDriveSyncSnapshot(target, true);
    notifyMutation('connect_cloud', { cloud: false });
    return status;
  }

  async function disconnectCloud() {
    db.updateSettings({ onedriveCustomPath: '', onedriveAutoSync: false });
    notifyMutation('disconnect_cloud', { cloud: false });
    return cloudSync.resolveOneDriveStatus();
  }

  async function syncCloud() {
    return cloudSync.writeOneDriveSyncSnapshot(undefined, true);
  }

  async function pullCloud() {
    const current = cloudSync.resolveOneDriveStatus();
    const folder = current.folderPath ?? cloudSync.detectDefaultOneDriveRoot();
    const valid = cloudSync.readValidOneDriveBackup(folder);
    if (!valid) throw new Error('Cloud backup file not found.');
    const bootstrap = db.importBackup(valid.payload);
    notifyMutation('pull_cloud', { rag: true, cloud: false });
    return { status: cloudSync.resolveOneDriveStatus(), bootstrap };
  }

  async function testWebhook(urlOverride?: string) {
    const settings = db.getSettings();
    const targetUrl =
      typeof urlOverride === 'string' && urlOverride.trim()
        ? urlOverride.trim()
        : (settings.webhookUrl ?? '');
    if (!targetUrl) throw new Error('Webhook URL is required.');
    return webhooks.deliverWebhookRequest(
      targetUrl,
      settings.webhookSecret ?? '',
      'webhook.test',
      {
        title: 'Agendamea Webhook Test',
        message: 'Connection verified successfully.',
        priority: 'normal',
      },
      {
        format: settings.webhookFormat ?? 'auto',
        allowLocalNetwork: settings.webhookAllowLocalNetwork !== false,
        enqueueOnFailure: false,
        endpointOverrides: settings.webhookEndpointOverrides ?? {},
      },
    );
  }

  async function getWebhookLogs(limit = 30) {
    return db.getWebhookLogs(limit);
  }

  async function clearWebhookLogs() {
    return { ok: true, cleared: db.clearWebhookLogs() };
  }

  async function getWebhookOutbox(limit = 30) {
    return db.getWebhookOutbox(limit);
  }

  async function replayWebhookOutbox(outboxId: string) {
    const row = db.getWebhookOutboxRowById(String(outboxId || '').trim());
    if (!row) throw new Error('Webhook outbox entry not found.');
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
      activeListenPort: ctx.getActiveListenPort(),
      timeoutMs: 5000,
    });
    const nextAttempts = row.attempts + 1;
    const nextStatus: 'delivered' | 'pending' | 'dead_letter' = delivery.ok
      ? 'delivered'
      : delivery.retriable
        ? 'pending'
        : 'dead_letter';
    db.updateWebhookOutboxEntry(row.id, {
      status: nextStatus,
      attempts: nextAttempts,
      nextAttemptAt: new Date(
        Date.now() + webhookEngine.computeFullJitterBackoffMs(nextAttempts),
      ).toISOString(),
      lastStatusCode: delivery.statusCode ?? null,
      lastError: delivery.error ?? '',
    });
    return {
      ok: delivery.ok,
      id: row.id,
      status: nextStatus,
      statusCode: delivery.statusCode ?? null,
    };
  }

  async function getHeadlessServerStatus() {
    return {
      running: true,
      mode: 'in-process',
      port: ctx.getActiveListenPort(),
      pid: process.pid,
      version: appVersion,
    };
  }

  async function startHeadlessServer() {
    return getHeadlessServerStatus();
  }

  async function stopHeadlessServer() {
    return { ok: false, error: 'Cannot stop the active in-process server from within itself.' };
  }

  async function checkForUpdates() {
    const checkedAt = new Date().toISOString();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(ctx.githubReleasesApi, {
        signal: controller.signal,
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': `Agendamea/${appVersion} (Vellium)`,
        },
      });
      if (!response.ok) {
        return {
          ok: false,
          currentVersion: appVersion,
          latestVersion: appVersion,
          updateAvailable: false,
          checkedAt,
        };
      }
      const data = (await response.json()) as Record<string, unknown>;
      return releaseUtils.parseGitHubRelease(data, appVersion, ctx.githubReleasesHtml, checkedAt);
    } catch {
      return {
        ok: false,
        currentVersion: appVersion,
        latestVersion: appVersion,
        updateAvailable: false,
        checkedAt,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  async function semanticSearchRag(query: string, opts?: { topK?: number; minScore?: number }) {
    return aiRuntime.runHybridRagQuery(query, opts);
  }

  async function getAiStatus(opts?: { force?: boolean }) {
    return aiRuntime.getAiStatusSnapshot(Boolean(opts?.force));
  }

  async function askAiAssistant(
    text: string,
    opts?: {
      language?: string;
      readOnly?: boolean;
      confirmToken?: string;
      selectedTodoId?: string;
    },
  ) {
    const language = opts?.language?.trim() || db.getSettings().language || 'tr';
    const runtime = aiRuntime.syncAiRuntimeFromSettings();
    if (runtime.aiUseExternalOllama && !runtime.aiOllamaModel) {
      await aiRuntime.getExternalBackendsCached(true);
      aiRuntime.syncAiRuntimeFromSettings();
    }
    const result = await aiRuntime.voiceOrchestrator.handleUtterance({
      text: String(text || '')
        .trim()
        .slice(0, 2000),
      language,
      readOnly: Boolean(opts?.readOnly),
      confirmToken: opts?.confirmToken ?? null,
      selectedTodoId: opts?.selectedTodoId ?? null,
      storeAdapter: aiRuntime.createVoiceStoreAdapter(),
      ragSearchFn: (q: string, ragOpts?: { topK?: number; minScore?: number }) =>
        aiRuntime.runHybridRagQuery(q, ragOpts),
      llmService: aiRuntime.llmService,
    });
    if (result?.mutated) {
      notifyMutation('ask', { rag: true });
    }
    return result;
  }

  return {
    listTrash,
    restoreItem,
    permanentDeleteItem,
    emptyTrash,
    getSettings,
    updateSettings,
    exportBackup,
    importBackup,
    resetAllData,
    getCloudStatus,
    connectCloud,
    disconnectCloud,
    syncCloud,
    pullCloud,
    testWebhook,
    getWebhookLogs,
    clearWebhookLogs,
    getWebhookOutbox,
    replayWebhookOutbox,
    getHeadlessServerStatus,
    startHeadlessServer,
    stopHeadlessServer,
    checkForUpdates,
    semanticSearchRag,
    getAiStatus,
    askAiAssistant,
  };
}
