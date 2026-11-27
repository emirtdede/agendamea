import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import settingsCodec from '../../shared/settingsCodec.cjs';
import sqliteCore from '../../shared/sqliteCore.cjs';
import todoRepository from '../../shared/todoRepository.cjs';
import { isValidLanguageCode, resolveSystemLanguage } from '../i18n/languages.ts';
import type {
  AppSettings,
  BootstrapPayload,
  Category,
  CategoryPatch,
  Priority,
  Subtask,
  SubtaskPatch,
  Todo,
  TodoPatch,
  WebhookFormat,
  WebhookLogEntry,
  WebhookOutboxEntry,
} from '../types.ts';
import {
  clampNotificationLeadMinutes,
  isValidNotificationProfileId,
  sanitizeNotificationChannels,
} from '../utils/notifications.ts';
import { sanitizeCustomShortcuts } from '../utils/shortcuts.ts';
import { clampZoomPercent, isValidAppIconId, isValidThemeId } from '../utils/themes.ts';
import { importBackupDao } from './backupTx.ts';
import {
  createCategoryDao,
  getCategoryByIdDao,
  permanentDeleteCategoryDao,
  reorderCategoriesDao,
  restoreCategoryDao,
  softDeleteCategoryDao,
  updateCategoryDao,
} from './categoryDao.ts';
import { isGenuineSqliteCorruption, ValidationError } from './sanitizers.ts';
import {
  clearCompletedDao,
  createSubtaskDao,
  createTodoDao,
  deleteSubtaskDao,
  findTodoBySelectorDao,
  getTodoByIdDao,
  permanentDeleteTodoDao,
  REPO_MAP_OPTIONS,
  reorderTodosDao,
  resolveTodoByVoiceSelectorDao,
  restoreTodoDao,
  softDeleteTodoDao,
  updateSubtaskDao,
  updateTodoDao,
} from './todoDao.ts';
import {
  claimReminderDispatchDao,
  clearWebhookLogsDao,
  enqueueWebhookOutboxDao,
  getDueWebhookOutboxDao,
  getWebhookLogsDao,
  getWebhookOutboxDao,
  getWebhookOutboxRowByIdDao,
  recordWebhookLogDao,
  updateWebhookOutboxEntryDao,
} from './webhookDao.ts';

export { ValidationError } from './sanitizers.ts';

const SETTINGS_CODEC_OPTIONS = {
  isValidThemeId,
  isValidAppIconId,
  isValidLanguageCode,
  clampZoomPercent,
  clampNotificationLeadMinutes,
  isValidNotificationProfileId,
  sanitizeCustomShortcuts,
  sanitizeNotificationChannels,
  strictWebhookUrl: true,
  createValidationError: (msg: string) => new ValidationError(msg),
};

export class TodoDatabase {
  private db: Database.Database;
  private dbPath: string;
  private cachedSettings: AppSettings | null = null;

  constructor(dbPath?: string) {
    const defaultDir = process.env.AGENDAMEA_DATA_DIR
      ? path.resolve(process.env.AGENDAMEA_DATA_DIR)
      : path.join(process.cwd(), 'data');
    const resolvedPath = dbPath ?? path.join(defaultDir, 'agendamea.db');
    this.dbPath = resolvedPath;

    if (resolvedPath !== ':memory:') {
      const dir = path.dirname(resolvedPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }

    this.db = this.openDatabaseWithRecovery(resolvedPath);
    const envInitialLocale = process.env.AGENDAMEA_INITIAL_LOCALE?.trim();
    const resolvedInitialLocale =
      resolvedPath !== ':memory:' && envInitialLocale
        ? resolveSystemLanguage([envInitialLocale], 'en')
        : 'tr';
    sqliteCore.seedDefaultSettings(this.db, resolvedInitialLocale);

    // If Setup explicitly wrote a fresh installer language marker, honor it immediately on startup
    const envInstallerLocale = process.env.AGENDAMEA_INSTALLER_LOCALE?.trim();
    if (resolvedPath !== ':memory:' && envInstallerLocale) {
      const setupLocale = resolveSystemLanguage([envInstallerLocale], 'en');
      if (isValidLanguageCode(setupLocale)) {
        this.db
          .prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
          .run('language', setupLocale);
      }
    }
  }

  private openDatabaseWithRecovery(resolvedPath: string): Database.Database {
    const configureAndMigrate = (instance: Database.Database): Database.Database => {
      this.db = instance;
      instance.pragma('journal_mode = WAL');
      instance.pragma('synchronous = NORMAL');
      instance.pragma('foreign_keys = ON');
      instance.pragma('busy_timeout = 5000');
      instance.pragma('cache_size = -16000');
      instance.pragma('temp_store = MEMORY');
      if (resolvedPath !== ':memory:') {
        instance.pragma('mmap_size = 67108864');
      }
      sqliteCore.applyAgendameaSchema(this.db, { selfHealFts: true });
      return instance;
    };

    try {
      const instance = new Database(resolvedPath);
      return configureAndMigrate(instance);
    } catch (err) {
      if (resolvedPath === ':memory:' || !isGenuineSqliteCorruption(err)) {
        throw err;
      }
      try {
        if (this.db) this.db.close();
      } catch {
        // Ignore close error on broken handle
      }
      const backupCorruptPath = `${resolvedPath}.corrupt-${Date.now()}.bak`;
      try {
        if (fs.existsSync(resolvedPath)) fs.renameSync(resolvedPath, backupCorruptPath);
        for (const suffix of ['-wal', '-shm']) {
          if (fs.existsSync(`${resolvedPath}${suffix}`)) {
            fs.rmSync(`${resolvedPath}${suffix}`, { force: true });
          }
        }
      } catch {
        // Ignore filesystem move errors
      }
      return configureAndMigrate(new Database(resolvedPath));
    }
  }

  getSettings(): AppSettings {
    if (!this.cachedSettings) {
      this.cachedSettings = settingsCodec.readSettingsFromDb(
        this.db,
        SETTINGS_CODEC_OPTIONS,
      ) as AppSettings;
    }
    return { ...this.cachedSettings };
  }

  private applySettingsPatchInTx(patch: Partial<AppSettings>): void {
    settingsCodec.applySettingsPatchToDb(this.db, patch, SETTINGS_CODEC_OPTIONS);
    this.cachedSettings = null;
  }

  updateSettings(patch: Partial<AppSettings>): AppSettings {
    const tx = this.db.transaction(() => {
      this.applySettingsPatchInTx(patch);
    });
    tx();
    this.cachedSettings = null;
    return this.getSettings();
  }

  getCategories(): Category[] {
    return todoRepository.getActiveCategories(this.db) as Category[];
  }

  getTrashedCategories(): Category[] {
    return todoRepository.getTrashedCategories(this.db) as Category[];
  }

  getTodos(): Todo[] {
    return todoRepository.getActiveTodos(this.db, REPO_MAP_OPTIONS) as Todo[];
  }

  getScheduledActiveTodos(): Todo[] {
    return todoRepository.getScheduledActiveTodos(this.db, REPO_MAP_OPTIONS) as Todo[];
  }

  getTrashedTodos(): Todo[] {
    return todoRepository.getTrashedTodos(this.db, REPO_MAP_OPTIONS) as Todo[];
  }

  getTodoById(id: string): Todo | null {
    return getTodoByIdDao(this.db, id);
  }

  findTodoBySelector(selector: string): Todo | null {
    return findTodoBySelectorDao(this.db, selector);
  }

  resolveTodoByVoiceSelector(selector: string): Todo | null {
    return resolveTodoByVoiceSelectorDao(this.db, selector);
  }

  getCategoryById(id: string): Category | null {
    return getCategoryByIdDao(this.db, id);
  }

  getBootstrap(): BootstrapPayload {
    const readSnapshot = this.db.transaction(() => ({
      categories: this.getCategories(),
      todos: this.getTodos(),
      trashedCategories: this.getTrashedCategories(),
      trashedTodos: this.getTrashedTodos(),
      settings: this.getSettings(),
    }));
    return readSnapshot();
  }

  getSystemCounts(): {
    activeTodos: number;
    completedTodos: number;
    trashedTodos: number;
    categoriesCount: number;
    trashedCategories: number;
    aiTier: string;
  } {
    const readCounts = this.db.transaction(() => {
      const todoRow = this.db
        .prepare(
          `SELECT
             SUM(CASE WHEN deleted_at IS NULL AND completed = 0 THEN 1 ELSE 0 END) AS activeTodos,
             SUM(CASE WHEN deleted_at IS NULL AND completed = 1 THEN 1 ELSE 0 END) AS completedTodos,
             SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) AS trashedTodos
           FROM todos`,
        )
        .get() as {
        activeTodos?: number | null;
        completedTodos?: number | null;
        trashedTodos?: number | null;
      };
      const catRow = this.db
        .prepare(
          `SELECT
             SUM(CASE WHEN deleted_at IS NULL THEN 1 ELSE 0 END) AS categoriesCount,
             SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) AS trashedCategories
           FROM categories`,
        )
        .get() as { categoriesCount?: number | null; trashedCategories?: number | null };
      return {
        activeTodos: Number(todoRow?.activeTodos || 0),
        completedTodos: Number(todoRow?.completedTodos || 0),
        trashedTodos: Number(todoRow?.trashedTodos || 0),
        categoriesCount: Number(catRow?.categoriesCount || 0),
        trashedCategories: Number(catRow?.trashedCategories || 0),
        aiTier: this.getSettings().aiTier || 'tier-light',
      };
    });
    return readCounts();
  }

  createCategory(input: { id?: string; name: string; color?: string; pinned?: boolean }): Category {
    return createCategoryDao(this.db, input);
  }

  updateCategory(id: string, patch: CategoryPatch): Category | null {
    return updateCategoryDao(this.db, id, patch);
  }

  softDeleteCategory(id: string): Category | null {
    return softDeleteCategoryDao(this.db, id);
  }

  restoreCategory(id: string): Category | null {
    return restoreCategoryDao(this.db, id);
  }

  permanentDeleteCategory(id: string): boolean {
    return permanentDeleteCategoryDao(this.db, id);
  }

  createTodo(input: {
    id?: string;
    title: string;
    notes?: string;
    completed?: boolean;
    important?: boolean;
    pinned?: boolean;
    priority?: Priority;
    startDate?: string | null;
    dueDate?: string | null;
    dueTime?: string | null;
    tags?: string[];
    categoryId?: string | null;
    subtasks?: Array<{ title: string; completed?: boolean }>;
  }): Todo {
    return createTodoDao(this.db, input);
  }

  updateTodo(id: string, patch: TodoPatch): Todo | null {
    return updateTodoDao(this.db, id, patch);
  }

  softDeleteTodo(id: string): Todo | null {
    return softDeleteTodoDao(this.db, id);
  }

  restoreTodo(id: string): Todo | null {
    return restoreTodoDao(this.db, id);
  }

  permanentDeleteTodo(id: string): boolean {
    return permanentDeleteTodoDao(this.db, id);
  }

  clearCompleted(categoryId?: string | null): Todo[] {
    return clearCompletedDao(this.db, categoryId);
  }

  emptyTrash(): { deletedTodos: number; deletedCategories: number } {
    return todoRepository.emptyTrashTx(this.db);
  }

  reorderCategories(orderedIds: string[]): void {
    reorderCategoriesDao(this.db, orderedIds);
  }

  reorderTodos(orderedIds: string[]): void {
    reorderTodosDao(this.db, orderedIds);
  }

  createSubtask(todoId: string, title: string): Subtask | null {
    return createSubtaskDao(this.db, todoId, title);
  }

  updateSubtask(id: string, patch: SubtaskPatch): Subtask | null {
    return updateSubtaskDao(this.db, id, patch);
  }

  deleteSubtask(id: string): boolean {
    return deleteSubtaskDao(this.db, id);
  }

  importBackup(payload: Partial<BootstrapPayload>): BootstrapPayload {
    importBackupDao(this.db, payload, (patch) => this.applySettingsPatchInTx(patch));
    this.cachedSettings = null;
    return this.getBootstrap();
  }

  resetAllData(options?: { resetSettings?: boolean }): BootstrapPayload {
    const resetSettings = Boolean(options?.resetSettings);
    const currentLang = this.getSettings().language ?? 'en';
    todoRepository.resetAllDataTx(this.db, { resetSettings, currentLang });
    this.cachedSettings = null;
    return this.getBootstrap();
  }

  recordWebhookLog(entry: {
    direction: 'outgoing' | 'incoming';
    event: string;
    targetUrl?: string;
    statusCode?: number | null;
    ok: boolean;
    attempts?: number;
    latencyMs?: number;
    error?: string;
  }): WebhookLogEntry {
    return recordWebhookLogDao(this.db, entry);
  }

  getWebhookLogs(limit = 30): WebhookLogEntry[] {
    return getWebhookLogsDao(this.db, limit);
  }

  clearWebhookLogs(): number {
    return clearWebhookLogsDao(this.db);
  }

  enqueueWebhookOutbox(entry: {
    eventId: string;
    event: string;
    targetUrl: string;
    format: WebhookFormat;
    payloadJson: string;
    status?: 'pending' | 'delivered' | 'dead_letter';
    attempts?: number;
    maxAttempts?: number;
    nextAttemptAt?: string;
    lastStatusCode?: number | null;
    lastError?: string;
  }): WebhookOutboxEntry {
    return enqueueWebhookOutboxDao(this.db, entry);
  }

  getWebhookOutbox(limit = 30): WebhookOutboxEntry[] {
    return getWebhookOutboxDao(this.db, limit);
  }

  getDueWebhookOutbox(
    nowIso: string,
    limit = 15,
  ): Array<WebhookOutboxEntry & { payloadJson: string }> {
    return getDueWebhookOutboxDao(this.db, nowIso, limit);
  }

  getWebhookOutboxRowById(id: string): (WebhookOutboxEntry & { payloadJson: string }) | null {
    return getWebhookOutboxRowByIdDao(this.db, id);
  }

  updateWebhookOutboxEntry(
    id: string,
    patch: {
      status: 'pending' | 'delivered' | 'dead_letter';
      attempts: number;
      nextAttemptAt: string;
      lastStatusCode: number | null;
      lastError: string;
    },
  ): void {
    updateWebhookOutboxEntryDao(this.db, id, patch);
  }

  claimReminderDispatch(todoId: string, kind: 'upcoming' | 'due', scheduleKey: string): boolean {
    return claimReminderDispatchDao(this.db, todoId, kind, scheduleKey);
  }

  getRawDb(): Database.Database {
    return this.db;
  }

  getDbPath(): string {
    return this.dbPath;
  }

  getSchemaVersion(): number {
    try {
      const val = this.db.pragma('user_version', { simple: true });
      return Number(val) || 0;
    } catch {
      return 0;
    }
  }

  purgeExpiredTrash(retentionDays: number): { deletedTodos: number; deletedCategories: number } {
    if (!Number.isFinite(retentionDays) || retentionDays <= 0) {
      return { deletedTodos: 0, deletedCategories: 0 };
    }
    const cutoffIso = new Date(Date.now() - retentionDays * 86_400_000).toISOString();
    const tx = this.db.transaction(() => {
      const todoRes = this.db
        .prepare('DELETE FROM todos WHERE deleted_at IS NOT NULL AND deleted_at < ?')
        .run(cutoffIso);
      const catRes = this.db
        .prepare('DELETE FROM categories WHERE deleted_at IS NOT NULL AND deleted_at < ?')
        .run(cutoffIso);
      return {
        deletedTodos: Number(todoRes.changes || 0),
        deletedCategories: Number(catRes.changes || 0),
      };
    });
    return tx();
  }

  restoreAllTrash(): { restoredTodos: number; restoredCategories: number } {
    const tx = this.db.transaction(() => {
      const catRes = this.db
        .prepare('UPDATE categories SET deleted_at = NULL WHERE deleted_at IS NOT NULL')
        .run();
      const todoRes = this.db
        .prepare('UPDATE todos SET deleted_at = NULL WHERE deleted_at IS NOT NULL')
        .run();
      return {
        restoredCategories: Number(catRes.changes || 0),
        restoredTodos: Number(todoRes.changes || 0),
      };
    });
    return tx();
  }

  rebuildSearchIndex(): void {
    try {
      this.db.exec("INSERT INTO todos_fts(todos_fts) VALUES('rebuild')");
    } catch {
      // Ignore rebuild error if FTS table is unavailable
    }
  }

  getRagChunkCount(): number {
    try {
      const row = this.db.prepare('SELECT COUNT(*) as c FROM todo_embedding_chunks').get() as {
        c: number;
      };
      return Number(row?.c || 0);
    } catch {
      return 0;
    }
  }

  searchHybridRag(
    query: string,
    options?: {
      topK?: number;
      minScore?: number;
      vectorHits?: Array<{
        todoId: string;
        chunkIndex: number;
        chunkText: string;
        cosine: number;
      }>;
    },
  ): {
    hits: Array<{
      todoId: string;
      title: string;
      notes: string;
      dueDate: string | null;
      dueTime: string | null;
      priority: Priority;
      completed: boolean;
      score: number;
      matchedChunkText: string;
      matchedChunkIndex: number;
    }>;
    disambiguationRequired: boolean;
    mode: 'hybrid-rrf' | 'fts5-only';
  } {
    return sqliteCore.searchHybridRagCore(this.db, query, {
      ...options,
      getActiveTodos: () => this.getTodos(),
      getTodoById: (id: string) => this.getTodoById(id),
    }) as {
      hits: Array<{
        todoId: string;
        title: string;
        notes: string;
        dueDate: string | null;
        dueTime: string | null;
        priority: Priority;
        completed: boolean;
        score: number;
        matchedChunkText: string;
        matchedChunkIndex: number;
      }>;
      disambiguationRequired: boolean;
      mode: 'hybrid-rrf' | 'fts5-only';
    };
  }

  close(): void {
    try {
      this.db.pragma('wal_checkpoint(TRUNCATE)');
    } catch {
      // Ignore for :memory: or already-closed handles
    }
    this.db.close();
  }
}
