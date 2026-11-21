import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { isValidLanguageCode, type LanguageCode } from '../i18n/languages.ts';
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
} from '../types.ts';
import {
  clampZoomPercent,
  isValidAppIconId,
  isValidThemeId,
  normalizeHexColor,
} from '../utils/themes.ts';
import {
  isValidIsoDateString,
  normalizeDateRange,
  sanitizeDueTime,
  sanitizeTags,
} from '../utils/todoLogic.ts';

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

interface CategoryRow {
  id: string;
  name: string;
  color: string;
  pinned: number;
  sort_order: number;
  created_at: string;
  deleted_at: string | null;
}

interface TodoRow {
  id: string;
  title: string;
  notes: string;
  completed: number;
  important: number;
  pinned: number;
  priority: Priority;
  start_date?: string | null;
  due_date: string | null;
  due_time?: string | null;
  tags?: string;
  category_id: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

interface SubtaskRow {
  id: string;
  todo_id: string;
  title: string;
  completed: number;
  sort_order: number;
}

interface SettingRow {
  key: string;
  value: string;
}

interface TableInfoRow {
  name: string;
}

const MAX_CATEGORY_NAME_LEN = 60;
const MAX_TODO_TITLE_LEN = 300;
const MAX_TODO_NOTES_LEN = 10000;
const MAX_SUBTASK_TITLE_LEN = 200;
const MAX_ID_LEN = 128;
const SUBTASK_QUERY_CHUNK_SIZE = 400;
const MAX_IMPORT_CATEGORIES = 500;
const MAX_IMPORT_TODOS = 10000;
const MAX_SUBTASKS_PER_TODO = 200;
const MAX_IMPORT_SUBTASKS = 50000;
const SCHEMA_VERSION = 3;

function sanitizeId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_ID_LEN) return null;
  return trimmed;
}

function sanitizeColor(value: unknown, fallback = '#2563eb'): string {
  if (typeof value !== 'string') return fallback;
  return normalizeHexColor(value) ?? fallback;
}

function sanitizeDueDate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return isValidIsoDateString(trimmed) ? trimmed : null;
}

function sanitizeIsoTimestamp(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const dt = new Date(value);
  return Number.isNaN(dt.getTime()) ? fallback : dt.toISOString();
}

function sanitizePriority(value: unknown, fallback: Priority = 'normal'): Priority {
  if (value === 'high' || value === 'normal' || value === 'low') {
    return value;
  }
  return fallback;
}

export class TodoDatabase {
  private db: Database.Database;

  constructor(dbPath?: string) {
    const defaultDir = process.env.AGENDAMEA_DATA_DIR
      ? path.resolve(process.env.AGENDAMEA_DATA_DIR)
      : path.join(process.cwd(), 'data');
    const resolvedPath = dbPath ?? path.join(defaultDir, 'agendamea.db');

    if (resolvedPath !== ':memory:') {
      const dir = path.dirname(resolvedPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }

    this.db = this.openDatabaseWithRecovery(resolvedPath);
    this.ensureDefaultSettings();
  }

  private openDatabaseWithRecovery(resolvedPath: string): Database.Database {
    const configureAndMigrate = (instance: Database.Database): Database.Database => {
      this.db = instance;
      instance.pragma('journal_mode = WAL');
      instance.pragma('synchronous = NORMAL');
      instance.pragma('foreign_keys = ON');
      instance.pragma('busy_timeout = 5000');
      this.initSchema();
      return instance;
    };

    try {
      const instance = new Database(resolvedPath);
      return configureAndMigrate(instance);
    } catch (err) {
      if (resolvedPath === ':memory:') {
        throw err;
      }
      // Self-healing corruption recovery: preserve corrupted file as .bak and initialize clean DB
      try {
        if (this.db) {
          this.db.close();
        }
      } catch {
        // Ignore close error on broken handle
      }
      const backupCorruptPath = `${resolvedPath}.corrupt-${Date.now()}.bak`;
      try {
        if (fs.existsSync(resolvedPath)) {
          fs.renameSync(resolvedPath, backupCorruptPath);
        }
        for (const suffix of ['-wal', '-shm']) {
          if (fs.existsSync(`${resolvedPath}${suffix}`)) {
            fs.rmSync(`${resolvedPath}${suffix}`, { force: true });
          }
        }
      } catch {
        // Ignore filesystem move errors
      }
      const recovered = new Database(resolvedPath);
      return configureAndMigrate(recovered);
    }
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        color TEXT NOT NULL DEFAULT '#2563eb',
        pinned INTEGER NOT NULL DEFAULT 0,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        deleted_at TEXT DEFAULT NULL
      );

      CREATE TABLE IF NOT EXISTS todos (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        notes TEXT NOT NULL DEFAULT '',
        completed INTEGER NOT NULL DEFAULT 0,
        important INTEGER NOT NULL DEFAULT 0,
        pinned INTEGER NOT NULL DEFAULT 0,
        priority TEXT NOT NULL DEFAULT 'normal',
        start_date TEXT DEFAULT NULL,
        due_date TEXT,
        due_time TEXT DEFAULT NULL,
        tags TEXT NOT NULL DEFAULT '[]',
        category_id TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT DEFAULT NULL,
        FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS subtasks (
        id TEXT PRIMARY KEY,
        todo_id TEXT NOT NULL,
        title TEXT NOT NULL,
        completed INTEGER NOT NULL DEFAULT 0,
        sort_order INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (todo_id) REFERENCES todos(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_todos_category ON todos(category_id);
      CREATE INDEX IF NOT EXISTS idx_subtasks_todo ON subtasks(todo_id);
    `);

    // Versioned schema migration using PRAGMA user_version (also upgrades legacy v0 DBs safely)
    const currentVersion = Number(this.db.pragma('user_version', { simple: true }) ?? 0);
    if (currentVersion < SCHEMA_VERSION) {
      const catCols = this.db.pragma('table_info(categories)') as TableInfoRow[];
      if (!catCols.some((c) => c.name === 'deleted_at')) {
        this.db.exec('ALTER TABLE categories ADD COLUMN deleted_at TEXT DEFAULT NULL');
      }
      if (!catCols.some((c) => c.name === 'pinned')) {
        this.db.exec('ALTER TABLE categories ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0');
      }

      const todoCols = this.db.pragma('table_info(todos)') as TableInfoRow[];
      if (!todoCols.some((c) => c.name === 'deleted_at')) {
        this.db.exec('ALTER TABLE todos ADD COLUMN deleted_at TEXT DEFAULT NULL');
      }
      if (!todoCols.some((c) => c.name === 'pinned')) {
        this.db.exec('ALTER TABLE todos ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0');
      }

      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_categories_deleted ON categories(deleted_at);
        CREATE INDEX IF NOT EXISTS idx_todos_deleted ON todos(deleted_at);
        CREATE INDEX IF NOT EXISTS idx_todos_active_order
          ON todos(pinned DESC, sort_order ASC, created_at DESC)
          WHERE deleted_at IS NULL;
        CREATE INDEX IF NOT EXISTS idx_categories_active_order
          ON categories(pinned DESC, sort_order ASC, created_at ASC)
          WHERE deleted_at IS NULL;
      `);
      this.db.pragma(`user_version = ${SCHEMA_VERSION}`);
    }

    // Ensure optional start_date, due_time & tags columns exist on todos across all schema versions
    const latestTodoCols = this.db.pragma('table_info(todos)') as TableInfoRow[];
    if (!latestTodoCols.some((c) => c.name === 'start_date')) {
      this.db.exec('ALTER TABLE todos ADD COLUMN start_date TEXT DEFAULT NULL');
    }
    if (!latestTodoCols.some((c) => c.name === 'due_time')) {
      this.db.exec('ALTER TABLE todos ADD COLUMN due_time TEXT DEFAULT NULL');
    }
    if (!latestTodoCols.some((c) => c.name === 'tags')) {
      this.db.exec("ALTER TABLE todos ADD COLUMN tags TEXT NOT NULL DEFAULT '[]'");
    }
  }

  private ensureDefaultSettings(): void {
    const stmt = this.db.prepare(
      'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)',
    );
    const tx = this.db.transaction(() => {
      stmt.run('themeMode', 'light');
      stmt.run('themeId', 'obsidian');
      stmt.run('dragLocked', '0');
      stmt.run('sidebarCollapsed', '0');
      stmt.run('themeCustomized', '0');
      stmt.run('language', 'tr');
      stmt.run('autoUpdateCheck', '1');
      stmt.run('onedriveAutoSync', '0');
      stmt.run('onedriveCustomPath', '');
      stmt.run('onboardingCompleted', '0');
    });
    tx();
  }

  private mapCategory(row: CategoryRow): Category {
    return {
      id: row.id,
      name: row.name,
      color: row.color,
      pinned: Boolean(row.pinned),
      sortOrder: row.sort_order,
      createdAt: row.created_at,
      deletedAt: row.deleted_at ?? null,
    };
  }

  private mapSubtask(row: SubtaskRow): Subtask {
    return {
      id: row.id,
      todoId: row.todo_id,
      title: row.title,
      completed: Boolean(row.completed),
      sortOrder: row.sort_order,
    };
  }

  private mapTodo(row: TodoRow, subtasks: Subtask[]): Todo {
    return {
      id: row.id,
      title: row.title,
      notes: row.notes,
      completed: Boolean(row.completed),
      important: Boolean(row.important),
      pinned: Boolean(row.pinned),
      priority: row.priority,
      startDate: row.start_date ?? null,
      dueDate: row.due_date,
      dueTime: sanitizeDueTime(row.due_time),
      tags: sanitizeTags(row.tags),
      categoryId: row.category_id,
      sortOrder: row.sort_order,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at ?? null,
      subtasks,
    };
  }

  // Scoped chunked query avoids full-table scans on subtasks across active/trashed queries
  private attachSubtasks(todoRows: TodoRow[]): Todo[] {
    if (todoRows.length === 0) return [];

    const subtasksByTodo = new Map<string, Subtask[]>();
    const ids = todoRows.map((r) => r.id);

    for (let i = 0; i < ids.length; i += SUBTASK_QUERY_CHUNK_SIZE) {
      const chunk = ids.slice(i, i + SUBTASK_QUERY_CHUNK_SIZE);
      const placeholders = chunk.map(() => '?').join(',');
      const subtaskRows = this.db
        .prepare(
          `SELECT * FROM subtasks WHERE todo_id IN (${placeholders}) ORDER BY sort_order ASC`,
        )
        .all(...chunk) as SubtaskRow[];

      for (const row of subtaskRows) {
        const list = subtasksByTodo.get(row.todo_id) ?? [];
        list.push(this.mapSubtask(row));
        subtasksByTodo.set(row.todo_id, list);
      }
    }

    return todoRows.map((row) =>
      this.mapTodo(row, subtasksByTodo.get(row.id) ?? []),
    );
  }

  getSettings(): AppSettings {
    const keys = [
      'themeMode',
      'themeId',
      'customThemeColor',
      'appIconId',
      'customIconColor',
      'zoomPercent',
      'highContrast',
      'reducedMotion',
      'closeBehavior',
      'dragLocked',
      'sidebarCollapsed',
      'themeCustomized',
      'language',
      'autoUpdateCheck',
      'onedriveAutoSync',
      'onedriveCustomPath',
      'onboardingCompleted',
    ];
    const placeholders = keys.map(() => '?').join(', ');
    const rows = this.db
      .prepare(`SELECT key, value FROM settings WHERE key IN (${placeholders})`)
      .all(...keys) as SettingRow[];

    const map = new Map(rows.map((r) => [r.key, r.value]));
    const rawMode = map.get('themeMode');
    const rawThemeId = map.get('themeId') ?? 'obsidian';
    const rawCustomThemeColor = map.get('customThemeColor');
    const rawAppIconId = map.get('appIconId');
    const rawCustomIconColor = map.get('customIconColor');
    const rawZoomPercent = map.get('zoomPercent');
    const rawHighContrast = map.get('highContrast');
    const rawReducedMotion = map.get('reducedMotion');
    const rawCloseBehavior = map.get('closeBehavior');
    const rawDragLocked = map.get('dragLocked');
    const rawSidebarCollapsed = map.get('sidebarCollapsed');
    const rawThemeCustomized = map.get('themeCustomized');
    const rawLanguage = map.get('language');
    const rawAutoUpdate = map.get('autoUpdateCheck');
    const rawOnedriveAutoSync = map.get('onedriveAutoSync');
    const rawOnedrivePath = map.get('onedriveCustomPath') ?? '';
    const rawOnboardingCompleted = map.get('onboardingCompleted');

    const settings: AppSettings = {
      themeMode: rawMode === 'dark' ? 'dark' : 'light',
      themeId: isValidThemeId(rawThemeId) ? rawThemeId : 'obsidian',
      dragLocked: rawDragLocked === '1' || rawDragLocked === 'true',
      sidebarCollapsed: rawSidebarCollapsed === '1' || rawSidebarCollapsed === 'true',
      themeCustomized: rawThemeCustomized === '1' || rawThemeCustomized === 'true',
      language: isValidLanguageCode(rawLanguage) ? (rawLanguage as LanguageCode) : 'tr',
      autoUpdateCheck: rawAutoUpdate === undefined ? true : rawAutoUpdate === '1' || rawAutoUpdate === 'true',
    };
    const normCustomTheme = rawCustomThemeColor ? normalizeHexColor(rawCustomThemeColor) : null;
    if (normCustomTheme) {
      settings.customThemeColor = normCustomTheme;
    }
    if (isValidAppIconId(rawAppIconId) && rawAppIconId !== 'match-theme') {
      settings.appIconId = rawAppIconId;
    }
    const normCustomIcon = rawCustomIconColor ? normalizeHexColor(rawCustomIconColor) : null;
    if (normCustomIcon) {
      settings.customIconColor = normCustomIcon;
    }
    if (rawZoomPercent !== undefined) {
      const parsedZoom = clampZoomPercent(rawZoomPercent);
      if (parsedZoom !== 100) {
        settings.zoomPercent = parsedZoom;
      }
    }
    if (rawHighContrast === '1' || rawHighContrast === 'true') {
      settings.highContrast = true;
    }
    if (rawReducedMotion === '1' || rawReducedMotion === 'true') {
      settings.reducedMotion = true;
    }
    if (rawCloseBehavior === 'tray' || rawCloseBehavior === 'quit' || rawCloseBehavior === 'ask') {
      if (rawCloseBehavior !== 'ask') {
        settings.closeBehavior = rawCloseBehavior;
      }
    }
    if (rawOnedriveAutoSync === '1' || rawOnedriveAutoSync === 'true') {
      settings.onedriveAutoSync = true;
    }
    if (rawOnedrivePath.length > 0) {
      settings.onedriveCustomPath = rawOnedrivePath;
    }
    if (rawOnboardingCompleted === '1' || rawOnboardingCompleted === 'true') {
      settings.onboardingCompleted = true;
    }
    return settings;
  }

  private applySettingsPatchInTx(patch: Partial<AppSettings>): void {
    const stmt = this.db.prepare(
      'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
    );
    if (patch.themeMode === 'light' || patch.themeMode === 'dark') {
      stmt.run('themeMode', patch.themeMode);
      stmt.run('themeCustomized', '1');
    }
    if (patch.themeId && isValidThemeId(patch.themeId)) {
      stmt.run('themeId', patch.themeId);
      stmt.run('themeCustomized', '1');
    }
    if (typeof patch.customThemeColor === 'string') {
      const norm = normalizeHexColor(patch.customThemeColor);
      if (norm) {
        stmt.run('customThemeColor', norm);
        stmt.run('themeCustomized', '1');
      }
    }
    if (patch.appIconId !== undefined && isValidAppIconId(patch.appIconId)) {
      stmt.run('appIconId', patch.appIconId);
    }
    if (typeof patch.customIconColor === 'string') {
      const norm = normalizeHexColor(patch.customIconColor);
      if (norm) {
        stmt.run('customIconColor', norm);
      }
    }
    if (typeof patch.zoomPercent === 'number' && Number.isFinite(patch.zoomPercent)) {
      stmt.run('zoomPercent', String(clampZoomPercent(patch.zoomPercent)));
    }
    if (typeof patch.highContrast === 'boolean') {
      stmt.run('highContrast', patch.highContrast ? '1' : '0');
    }
    if (typeof patch.reducedMotion === 'boolean') {
      stmt.run('reducedMotion', patch.reducedMotion ? '1' : '0');
    }
    if (
      patch.closeBehavior === 'ask' ||
      patch.closeBehavior === 'tray' ||
      patch.closeBehavior === 'quit'
    ) {
      stmt.run('closeBehavior', patch.closeBehavior);
    }
    if (typeof patch.dragLocked === 'boolean') {
      stmt.run('dragLocked', patch.dragLocked ? '1' : '0');
    }
    if (typeof patch.sidebarCollapsed === 'boolean') {
      stmt.run('sidebarCollapsed', patch.sidebarCollapsed ? '1' : '0');
    }
    if (patch.language && isValidLanguageCode(patch.language)) {
      stmt.run('language', patch.language);
    }
    if (typeof patch.autoUpdateCheck === 'boolean') {
      stmt.run('autoUpdateCheck', patch.autoUpdateCheck ? '1' : '0');
    }
    if (typeof patch.onedriveAutoSync === 'boolean') {
      stmt.run('onedriveAutoSync', patch.onedriveAutoSync ? '1' : '0');
    }
    if (typeof patch.onedriveCustomPath === 'string') {
      stmt.run('onedriveCustomPath', patch.onedriveCustomPath.trim().slice(0, 500));
    }
    if (typeof patch.onboardingCompleted === 'boolean') {
      stmt.run('onboardingCompleted', patch.onboardingCompleted ? '1' : '0');
    }
  }

  updateSettings(patch: Partial<AppSettings>): AppSettings {
    const tx = this.db.transaction(() => {
      this.applySettingsPatchInTx(patch);
    });
    tx();
    return this.getSettings();
  }

  getCategories(): Category[] {
    const rows = this.db
      .prepare(
        'SELECT * FROM categories WHERE deleted_at IS NULL ORDER BY pinned DESC, sort_order ASC, created_at ASC',
      )
      .all() as CategoryRow[];
    return rows.map((r) => this.mapCategory(r));
  }

  getTrashedCategories(): Category[] {
    const rows = this.db
      .prepare(
        'SELECT * FROM categories WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC',
      )
      .all() as CategoryRow[];
    return rows.map((r) => this.mapCategory(r));
  }

  getTodos(): Todo[] {
    const todoRows = this.db
      .prepare(
        'SELECT * FROM todos WHERE deleted_at IS NULL ORDER BY pinned DESC, sort_order ASC, created_at DESC',
      )
      .all() as TodoRow[];
    return this.attachSubtasks(todoRows);
  }

  getTrashedTodos(): Todo[] {
    const todoRows = this.db
      .prepare(
        'SELECT * FROM todos WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC',
      )
      .all() as TodoRow[];
    return this.attachSubtasks(todoRows);
  }

  getTodoById(id: string): Todo | null {
    const row = this.db
      .prepare('SELECT * FROM todos WHERE id = ?')
      .get(id) as TodoRow | undefined;
    if (!row) return null;

    const subtaskRows = this.db
      .prepare('SELECT * FROM subtasks WHERE todo_id = ? ORDER BY sort_order ASC')
      .all(id) as SubtaskRow[];

    return this.mapTodo(
      row,
      subtaskRows.map((s) => this.mapSubtask(s)),
    );
  }

  getCategoryById(id: string): Category | null {
    const row = this.db
      .prepare('SELECT * FROM categories WHERE id = ?')
      .get(id) as CategoryRow | undefined;
    return row ? this.mapCategory(row) : null;
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

  createCategory(input: { id?: string; name: string; color?: string; pinned?: boolean }): Category {
    if (typeof input.name !== 'string') {
      throw new ValidationError('Kategori adı geçersiz.');
    }
    const name = input.name.trim().slice(0, MAX_CATEGORY_NAME_LEN);
    if (!name) {
      throw new ValidationError('Kategori adı boş olamaz.');
    }

    const requestedId = sanitizeId(input.id);
    const color = sanitizeColor(input.color, '#2563eb');
    const pinned = input.pinned ? 1 : 0;

    const tx = this.db.transaction((): Category => {
      // Idempotent guard: return existing ONLY if still active (not trashed)
      let id = requestedId ?? crypto.randomUUID();
      if (requestedId) {
        const existing = this.getCategoryById(requestedId);
        if (existing) {
          if (existing.deletedAt === null) {
            return existing;
          }
          id = crypto.randomUUID();
        }
      }

      const maxRow = this.db
        .prepare('SELECT COALESCE(MAX(sort_order), -1) as maxOrder FROM categories')
        .get() as { maxOrder: number };

      const now = new Date().toISOString();
      const sortOrder = maxRow.maxOrder + 1;

      this.db
        .prepare(
          'INSERT INTO categories (id, name, color, pinned, sort_order, created_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, NULL)',
        )
        .run(id, name, color, pinned, sortOrder, now);

      return {
        id,
        name,
        color,
        pinned: Boolean(pinned),
        sortOrder,
        createdAt: now,
        deletedAt: null,
      };
    });

    return tx();
  }

  updateCategory(id: string, patch: CategoryPatch): Category | null {
    const tx = this.db.transaction((): Category | null => {
      const existing = this.db
        .prepare('SELECT * FROM categories WHERE id = ? AND deleted_at IS NULL')
        .get(id) as CategoryRow | undefined;
      if (!existing) return null;

      let nextName = existing.name;
      if (typeof patch.name === 'string') {
        const trimmed = patch.name.trim().slice(0, MAX_CATEGORY_NAME_LEN);
        if (!trimmed) {
          throw new ValidationError('Kategori adı boş olamaz.');
        }
        nextName = trimmed;
      }
      const nextColor =
        typeof patch.color === 'string'
          ? sanitizeColor(patch.color, existing.color)
          : existing.color;
      const nextPinned =
        typeof patch.pinned === 'boolean' ? (patch.pinned ? 1 : 0) : existing.pinned;

      this.db
        .prepare('UPDATE categories SET name = ?, color = ?, pinned = ? WHERE id = ?')
        .run(nextName, nextColor, nextPinned, id);

      return {
        id: existing.id,
        name: nextName,
        color: nextColor,
        pinned: Boolean(nextPinned),
        sortOrder: existing.sort_order,
        createdAt: existing.created_at,
        deletedAt: null,
      };
    });
    return tx();
  }

  // Soft delete category (preserves todo category_id links so restoring reconnects tasks)
  softDeleteCategory(id: string): Category | null {
    const existing = this.db
      .prepare('SELECT * FROM categories WHERE id = ? AND deleted_at IS NULL')
      .get(id) as CategoryRow | undefined;
    if (!existing) return null;

    const deletedAt = new Date().toISOString();
    this.db
      .prepare('UPDATE categories SET deleted_at = ? WHERE id = ?')
      .run(deletedAt, id);

    return this.mapCategory({ ...existing, deleted_at: deletedAt });
  }

  restoreCategory(id: string): Category | null {
    const existing = this.db
      .prepare('SELECT * FROM categories WHERE id = ? AND deleted_at IS NOT NULL')
      .get(id) as CategoryRow | undefined;
    if (!existing) return null;

    this.db
      .prepare('UPDATE categories SET deleted_at = NULL WHERE id = ?')
      .run(id);

    return this.mapCategory({ ...existing, deleted_at: null });
  }

  permanentDeleteCategory(id: string): boolean {
    const result = this.db
      .prepare('DELETE FROM categories WHERE id = ? AND deleted_at IS NOT NULL')
      .run(id);
    return result.changes > 0;
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
    if (typeof input.title !== 'string') {
      throw new ValidationError('Görev başlığı geçersiz.');
    }
    const title = input.title.trim().slice(0, MAX_TODO_TITLE_LEN);
    if (!title) {
      throw new ValidationError('Görev başlığı boş olamaz.');
    }

    const requestedId = sanitizeId(input.id);
    const notes =
      typeof input.notes === 'string' ? input.notes.slice(0, MAX_TODO_NOTES_LEN) : '';
    const completed = input.completed ? 1 : 0;
    const important = input.important ? 1 : 0;
    const pinned = input.pinned ? 1 : 0;
    const priority = sanitizePriority(input.priority, 'normal');
    const { startDate, dueDate } = normalizeDateRange(
      sanitizeDueDate(input.startDate),
      sanitizeDueDate(input.dueDate),
    );
    const dueTime = sanitizeDueTime(input.dueTime);
    const tagsJson = JSON.stringify(sanitizeTags(input.tags));
    const rawCategoryId =
      typeof input.categoryId === 'string' && input.categoryId.trim() ? input.categoryId.trim() : null;
    const subtasksInput = Array.isArray(input.subtasks)
      ? input.subtasks.slice(0, MAX_SUBTASKS_PER_TODO)
      : [];

    const tx = this.db.transaction((): Todo => {
      // Idempotent guard: return existing ONLY if still active (not trashed)
      let id = requestedId ?? crypto.randomUUID();
      if (requestedId) {
        const existing = this.getTodoById(requestedId);
        if (existing) {
          if (existing.deletedAt === null) {
            return existing;
          }
          id = crypto.randomUUID();
        }
      }

      const minRow = this.db
        .prepare('SELECT COALESCE(MIN(sort_order), 1) as minOrder FROM todos')
        .get() as { minOrder: number };

      let categoryId = rawCategoryId;
      if (categoryId) {
        const catExists = this.db
          .prepare('SELECT id FROM categories WHERE id = ? AND deleted_at IS NULL')
          .get(categoryId);
        if (!catExists) categoryId = null;
      }

      const now = new Date().toISOString();
      const sortOrder = minRow.minOrder - 1;

      this.db
        .prepare(`
          INSERT INTO todos (
            id, title, notes, completed, important, pinned, priority, start_date, due_date, due_time, tags, category_id, sort_order, created_at, updated_at, deleted_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
        `)
        .run(
          id,
          title,
          notes,
          completed,
          important,
          pinned,
          priority,
          startDate,
          dueDate,
          dueTime,
          tagsJson,
          categoryId,
          sortOrder,
          now,
          now,
        );

      if (subtasksInput.length > 0) {
        const subStmt = this.db.prepare(
          'INSERT INTO subtasks (id, todo_id, title, completed, sort_order) VALUES (?, ?, ?, ?, ?)',
        );
        subtasksInput.forEach((s, idx) => {
          if (typeof s?.title === 'string') {
            const stTitle = s.title.trim().slice(0, MAX_SUBTASK_TITLE_LEN);
            if (stTitle) {
              subStmt.run(crypto.randomUUID(), id, stTitle, s.completed ? 1 : 0, idx);
            }
          }
        });
      }

      return this.getTodoById(id)!;
    });

    return tx();
  }

  updateTodo(id: string, patch: TodoPatch): Todo | null {
    const tx = this.db.transaction((): Todo | null => {
      const existing = this.db
        .prepare('SELECT * FROM todos WHERE id = ? AND deleted_at IS NULL')
        .get(id) as TodoRow | undefined;
      if (!existing) return null;

      let title = existing.title;
      if (typeof patch.title === 'string') {
        const trimmed = patch.title.trim().slice(0, MAX_TODO_TITLE_LEN);
        if (!trimmed) {
          throw new ValidationError('Görev başlığı boş olamaz.');
        }
        title = trimmed;
      }
      const notes =
        typeof patch.notes === 'string'
          ? patch.notes.slice(0, MAX_TODO_NOTES_LEN)
          : existing.notes;
      const completed =
        typeof patch.completed === 'boolean' ? (patch.completed ? 1 : 0) : existing.completed;
      const important =
        typeof patch.important === 'boolean' ? (patch.important ? 1 : 0) : existing.important;
      const pinned =
        typeof patch.pinned === 'boolean' ? (patch.pinned ? 1 : 0) : existing.pinned;
      const priority = sanitizePriority(patch.priority, existing.priority);

      let startDate = existing.start_date ?? null;
      if (patch.startDate !== undefined) {
        if (patch.startDate === null || patch.startDate === '') {
          startDate = null;
        } else {
          const sanitizedStart = sanitizeDueDate(patch.startDate);
          if (sanitizedStart !== null) {
            startDate = sanitizedStart;
          }
        }
      }

      let dueDate = existing.due_date;
      if (patch.dueDate !== undefined) {
        if (patch.dueDate === null || patch.dueDate === '') {
          dueDate = null;
        } else {
          const sanitized = sanitizeDueDate(patch.dueDate);
          if (sanitized !== null) {
            dueDate = sanitized;
          }
        }
      }

      const normalizedDates = normalizeDateRange(startDate, dueDate);
      startDate = normalizedDates.startDate;
      dueDate = normalizedDates.dueDate;

      let dueTime = sanitizeDueTime(existing.due_time);
      if (patch.dueTime !== undefined) {
        if (patch.dueTime === null || patch.dueTime === '') {
          dueTime = null;
        } else {
          const sanitizedTime = sanitizeDueTime(patch.dueTime);
          if (sanitizedTime !== null) {
            dueTime = sanitizedTime;
          }
        }
      }

      let tagsJson = existing.tags ?? '[]';
      if (patch.tags !== undefined) {
        tagsJson = JSON.stringify(sanitizeTags(patch.tags));
      }

      let categoryId = existing.category_id;
      if (patch.categoryId !== undefined) {
        if (patch.categoryId === null || patch.categoryId === '') {
          categoryId = null;
        } else if (typeof patch.categoryId === 'string') {
          const catExists = this.db
            .prepare('SELECT id FROM categories WHERE id = ? AND deleted_at IS NULL')
            .get(patch.categoryId);
          if (catExists) {
            categoryId = patch.categoryId;
          }
        }
      }

      const updatedAt = new Date().toISOString();

      this.db
        .prepare(`
          UPDATE todos
          SET title = ?, notes = ?, completed = ?, important = ?, pinned = ?, priority = ?, start_date = ?, due_date = ?, due_time = ?, tags = ?, category_id = ?, updated_at = ?
          WHERE id = ?
        `)
        .run(
          title,
          notes,
          completed,
          important,
          pinned,
          priority,
          startDate,
          dueDate,
          dueTime,
          tagsJson,
          categoryId,
          updatedAt,
          id,
        );

      return this.getTodoById(id);
    });
    return tx();
  }

  // Soft delete todo -> moves to trash
  softDeleteTodo(id: string): Todo | null {
    const existing = this.db
      .prepare('SELECT * FROM todos WHERE id = ? AND deleted_at IS NULL')
      .get(id) as TodoRow | undefined;
    if (!existing) return null;

    const deletedAt = new Date().toISOString();
    this.db
      .prepare('UPDATE todos SET deleted_at = ?, updated_at = ? WHERE id = ?')
      .run(deletedAt, deletedAt, id);

    return this.getTodoById(id);
  }

  restoreTodo(id: string): Todo | null {
    const existing = this.db
      .prepare('SELECT * FROM todos WHERE id = ? AND deleted_at IS NOT NULL')
      .get(id) as TodoRow | undefined;
    if (!existing) return null;

    const updatedAt = new Date().toISOString();
    this.db
      .prepare('UPDATE todos SET deleted_at = NULL, updated_at = ? WHERE id = ?')
      .run(updatedAt, id);

    return this.getTodoById(id);
  }

  permanentDeleteTodo(id: string): boolean {
    const result = this.db
      .prepare('DELETE FROM todos WHERE id = ? AND deleted_at IS NOT NULL')
      .run(id);
    return result.changes > 0;
  }

  // Soft delete completed todos -> moves them to trash atomically
  clearCompleted(categoryId?: string | null): Todo[] {
    const deletedAt = new Date().toISOString();
    let affectedRows: TodoRow[] = [];

    const tx = this.db.transaction(() => {
      if (categoryId) {
        affectedRows = this.db
          .prepare(
            'SELECT * FROM todos WHERE completed = 1 AND deleted_at IS NULL AND category_id = ?',
          )
          .all(categoryId) as TodoRow[];
        if (affectedRows.length > 0) {
          this.db
            .prepare(
              'UPDATE todos SET deleted_at = ?, updated_at = ? WHERE completed = 1 AND deleted_at IS NULL AND category_id = ?',
            )
            .run(deletedAt, deletedAt, categoryId);
        }
      } else {
        affectedRows = this.db
          .prepare('SELECT * FROM todos WHERE completed = 1 AND deleted_at IS NULL')
          .all() as TodoRow[];
        if (affectedRows.length > 0) {
          this.db
            .prepare(
              'UPDATE todos SET deleted_at = ?, updated_at = ? WHERE completed = 1 AND deleted_at IS NULL',
            )
            .run(deletedAt, deletedAt);
        }
      }
    });

    tx();
    if (affectedRows.length === 0) return [];
    const updatedRows = affectedRows.map((row) => ({
      ...row,
      deleted_at: deletedAt,
      updated_at: deletedAt,
    }));
    return this.attachSubtasks(updatedRows);
  }

  emptyTrash(): { deletedTodos: number; deletedCategories: number } {
    let deletedTodos = 0;
    let deletedCategories = 0;

    const tx = this.db.transaction(() => {
      const todoRes = this.db
        .prepare('DELETE FROM todos WHERE deleted_at IS NOT NULL')
        .run();
      const catRes = this.db
        .prepare('DELETE FROM categories WHERE deleted_at IS NOT NULL')
        .run();
      deletedTodos = todoRes.changes;
      deletedCategories = catRes.changes;
    });

    tx();
    return { deletedTodos, deletedCategories };
  }

  reorderCategories(orderedIds: string[]): void {
    const uniqueIds = Array.from(new Set(orderedIds));
    if (uniqueIds.length > MAX_IMPORT_CATEGORIES) {
      throw new ValidationError('Kategori sıralama listesi izin verilen sınırı aşıyor.');
    }
    const stmt = this.db.prepare(
      'UPDATE categories SET sort_order = ? WHERE id = ? AND deleted_at IS NULL',
    );
    const tx = this.db.transaction((ids: string[]) => {
      ids.forEach((categoryId, index) => {
        stmt.run(index, categoryId);
      });
    });
    tx(uniqueIds);
  }

  reorderTodos(orderedIds: string[]): void {
    const uniqueIds = Array.from(new Set(orderedIds));
    if (uniqueIds.length > MAX_IMPORT_TODOS) {
      throw new ValidationError('Görev sıralama listesi izin verilen sınırı aşıyor.');
    }
    const stmt = this.db.prepare(
      'UPDATE todos SET sort_order = ? WHERE id = ? AND deleted_at IS NULL',
    );
    const tx = this.db.transaction((ids: string[]) => {
      ids.forEach((todoId, index) => {
        stmt.run(index, todoId);
      });
    });
    tx(uniqueIds);
  }

  createSubtask(todoId: string, title: string): Subtask | null {
    if (typeof title !== 'string') {
      throw new ValidationError('Alt görev başlığı geçersiz.');
    }
    const trimmed = title.trim().slice(0, MAX_SUBTASK_TITLE_LEN);
    if (!trimmed) {
      throw new ValidationError('Alt görev başlığı boş olamaz.');
    }

    const tx = this.db.transaction((): Subtask | null => {
      const parent = this.db
        .prepare('SELECT id FROM todos WHERE id = ? AND deleted_at IS NULL')
        .get(todoId);
      if (!parent) return null;

      const statsRow = this.db
        .prepare(
          'SELECT COUNT(*) as subCount, COALESCE(MAX(sort_order), -1) as maxOrder FROM subtasks WHERE todo_id = ?',
        )
        .get(todoId) as { subCount: number; maxOrder: number };

      if (statsRow.subCount >= MAX_SUBTASKS_PER_TODO) {
        throw new ValidationError(
          `Bir görevde en fazla ${MAX_SUBTASKS_PER_TODO} alt görev bulunabilir.`,
        );
      }

      const id = crypto.randomUUID();
      const sortOrder = statsRow.maxOrder + 1;

      this.db
        .prepare(
          'INSERT INTO subtasks (id, todo_id, title, completed, sort_order) VALUES (?, ?, ?, 0, ?)',
        )
        .run(id, todoId, trimmed, sortOrder);

      return {
        id,
        todoId,
        title: trimmed,
        completed: false,
        sortOrder,
      };
    });

    return tx();
  }

  updateSubtask(id: string, patch: SubtaskPatch): Subtask | null {
    // Only allow mutating subtasks belonging to an active (non-trashed) todo
    const existing = this.db
      .prepare(`
        SELECT s.* FROM subtasks s
        INNER JOIN todos t ON t.id = s.todo_id
        WHERE s.id = ? AND t.deleted_at IS NULL
      `)
      .get(id) as SubtaskRow | undefined;
    if (!existing) return null;

    let title = existing.title;
    if (typeof patch.title === 'string') {
      const trimmed = patch.title.trim().slice(0, MAX_SUBTASK_TITLE_LEN);
      if (!trimmed) {
        throw new ValidationError('Alt görev başlığı boş olamaz.');
      }
      title = trimmed;
    }
    const completed =
      typeof patch.completed === 'boolean' ? (patch.completed ? 1 : 0) : existing.completed;

    this.db
      .prepare('UPDATE subtasks SET title = ?, completed = ? WHERE id = ?')
      .run(title, completed, id);

    return {
      id: existing.id,
      todoId: existing.todo_id,
      title,
      completed: Boolean(completed),
      sortOrder: existing.sort_order,
    };
  }

  deleteSubtask(id: string): boolean {
    const result = this.db
      .prepare(
        'DELETE FROM subtasks WHERE id = ? AND todo_id IN (SELECT id FROM todos WHERE deleted_at IS NULL)',
      )
      .run(id);
    return result.changes > 0;
  }

  // Atomic JSON backup import (deduplicated IDs + pre-validated before replacing state)
  importBackup(payload: Partial<BootstrapPayload>): BootstrapPayload {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new ValidationError('Geçersiz yedek dosyası formatı.');
    }

    const hasRecognizedCollection =
      Array.isArray(payload.categories) ||
      Array.isArray(payload.trashedCategories) ||
      Array.isArray(payload.todos) ||
      Array.isArray(payload.trashedTodos);

    if (!hasRecognizedCollection) {
      throw new ValidationError('Yedek dosyasında geçerli görev veya kategori verisi bulunamadı.');
    }

    const activeCats = Array.isArray(payload.categories) ? payload.categories : [];
    const trashedCats = Array.isArray(payload.trashedCategories)
      ? payload.trashedCategories
      : [];
    const activeTodos = Array.isArray(payload.todos) ? payload.todos : [];
    const trashedTodos = Array.isArray(payload.trashedTodos) ? payload.trashedTodos : [];

    const now = new Date().toISOString();

    const preparedCats: Array<{
      id: string;
      name: string;
      color: string;
      pinned: number;
      sortOrder: number;
      createdAt: string;
      deletedAt: string | null;
    }> = [];
    const validCategoryIds = new Set<string>();

    const allCats: Array<{ item: Partial<Category>; isTrashed: boolean }> = [
      ...activeCats.map((item) => ({ item, isTrashed: false })),
      ...trashedCats.map((item) => ({ item, isTrashed: true })),
    ];

    if (
      allCats.length > MAX_IMPORT_CATEGORIES ||
      activeTodos.length + trashedTodos.length > MAX_IMPORT_TODOS
    ) {
      throw new ValidationError('Yedek dosyası izin verilen maksimum kayıt sınırını aşıyor.');
    }

    allCats.forEach(({ item, isTrashed }, idx) => {
      if (!item || typeof item !== 'object' || typeof item.name !== 'string') return;
      const name = item.name.trim().slice(0, MAX_CATEGORY_NAME_LEN);
      if (!name) return;
      const rawId = sanitizeId(item.id);
      const id = rawId && !validCategoryIds.has(rawId) ? rawId : crypto.randomUUID();
      validCategoryIds.add(id);

      preparedCats.push({
        id,
        name,
        color: sanitizeColor(item.color, '#2563eb'),
        pinned: item.pinned ? 1 : 0,
        sortOrder:
          typeof item.sortOrder === 'number' && Number.isFinite(item.sortOrder)
            ? Math.trunc(item.sortOrder)
            : idx,
        createdAt: sanitizeIsoTimestamp(item.createdAt, now),
        deletedAt: isTrashed ? sanitizeIsoTimestamp(item.deletedAt, now) : null,
      });
    });

    const preparedTodos: Array<{
      id: string;
      title: string;
      notes: string;
      completed: number;
      important: number;
      pinned: number;
      priority: Priority;
      startDate: string | null;
      dueDate: string | null;
      dueTime: string | null;
      tagsJson: string;
      categoryId: string | null;
      sortOrder: number;
      createdAt: string;
      updatedAt: string;
      deletedAt: string | null;
      subtasks: Array<{
        id: string;
        title: string;
        completed: number;
        sortOrder: number;
      }>;
    }> = [];
    const seenTodoIds = new Set<string>();
    const seenSubtaskIds = new Set<string>();

    const allTodos: Array<{ item: Partial<Todo>; isTrashed: boolean }> = [
      ...activeTodos.map((item) => ({ item, isTrashed: false })),
      ...trashedTodos.map((item) => ({ item, isTrashed: true })),
    ];

    allTodos.forEach(({ item, isTrashed }, idx) => {
      if (!item || typeof item !== 'object' || typeof item.title !== 'string') return;
      const title = item.title.trim().slice(0, MAX_TODO_TITLE_LEN);
      if (!title) return;
      const rawId = sanitizeId(item.id);
      const id = rawId && !seenTodoIds.has(rawId) ? rawId : crypto.randomUUID();
      seenTodoIds.add(id);

      const rawCatId = sanitizeId(item.categoryId);
      const categoryId = rawCatId && validCategoryIds.has(rawCatId) ? rawCatId : null;
      const createdAt = sanitizeIsoTimestamp(item.createdAt, now);
      const updatedAt = sanitizeIsoTimestamp(item.updatedAt, createdAt);
      const subtasks: Array<{
        id: string;
        title: string;
        completed: number;
        sortOrder: number;
      }> = [];

      if (Array.isArray(item.subtasks)) {
        if (item.subtasks.length > MAX_SUBTASKS_PER_TODO) {
          throw new ValidationError('Bir görevdeki alt görev sayısı izin verilen sınırı aşıyor.');
        }
        item.subtasks.forEach((sub, subIdx) => {
          if (!sub || typeof sub !== 'object' || typeof sub.title !== 'string') return;
          const stTitle = sub.title.trim().slice(0, MAX_SUBTASK_TITLE_LEN);
          if (!stTitle) return;
          if (seenSubtaskIds.size >= MAX_IMPORT_SUBTASKS) {
            throw new ValidationError('Yedek dosyası izin verilen maksimum alt görev sınırını aşıyor.');
          }
          const rawSubId = sanitizeId(sub.id);
          const subId = rawSubId && !seenSubtaskIds.has(rawSubId) ? rawSubId : crypto.randomUUID();
          seenSubtaskIds.add(subId);
          subtasks.push({
            id: subId,
            title: stTitle,
            completed: sub.completed ? 1 : 0,
            sortOrder:
              typeof sub.sortOrder === 'number' && Number.isFinite(sub.sortOrder)
                ? Math.trunc(sub.sortOrder)
                : subIdx,
          });
        });
      }

      const normDates = normalizeDateRange(
        sanitizeDueDate(item.startDate),
        sanitizeDueDate(item.dueDate),
      );
      preparedTodos.push({
        id,
        title,
        notes: typeof item.notes === 'string' ? item.notes.slice(0, MAX_TODO_NOTES_LEN) : '',
        completed: item.completed ? 1 : 0,
        important: item.important ? 1 : 0,
        pinned: item.pinned ? 1 : 0,
        priority: sanitizePriority(item.priority, 'normal'),
        startDate: normDates.startDate,
        dueDate: normDates.dueDate,
        dueTime: sanitizeDueTime(item.dueTime),
        tagsJson: JSON.stringify(sanitizeTags(item.tags)),
        categoryId,
        sortOrder:
          typeof item.sortOrder === 'number' && Number.isFinite(item.sortOrder)
            ? Math.trunc(item.sortOrder)
            : idx,
        createdAt,
        updatedAt,
        deletedAt: isTrashed ? sanitizeIsoTimestamp(item.deletedAt, now) : null,
        subtasks,
      });
    });

    // Guard against corrupted files with non-empty arrays containing only malformed junk
    const rawCount = allCats.length + allTodos.length;
    if (rawCount > 0 && preparedCats.length === 0 && preparedTodos.length === 0) {
      throw new ValidationError('Yedek dosyasındaki kayıtlar bozuk veya okunamıyor.');
    }

    const tx = this.db.transaction(() => {
      this.db.prepare('DELETE FROM subtasks').run();
      this.db.prepare('DELETE FROM todos').run();
      this.db.prepare('DELETE FROM categories').run();

      const catInsert = this.db.prepare(
        'INSERT INTO categories (id, name, color, pinned, sort_order, created_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      );
      for (const c of preparedCats) {
        catInsert.run(c.id, c.name, c.color, c.pinned, c.sortOrder, c.createdAt, c.deletedAt);
      }

      const todoInsert = this.db.prepare(`
        INSERT INTO todos (
          id, title, notes, completed, important, pinned, priority, start_date, due_date, due_time, tags, category_id, sort_order, created_at, updated_at, deleted_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const subInsert = this.db.prepare(
        'INSERT INTO subtasks (id, todo_id, title, completed, sort_order) VALUES (?, ?, ?, ?, ?)',
      );

      for (const t of preparedTodos) {
        todoInsert.run(
          t.id,
          t.title,
          t.notes,
          t.completed,
          t.important,
          t.pinned,
          t.priority,
          t.startDate,
          t.dueDate,
          t.dueTime,
          t.tagsJson,
          t.categoryId,
          t.sortOrder,
          t.createdAt,
          t.updatedAt,
          t.deletedAt,
        );
        for (const s of t.subtasks) {
          subInsert.run(s.id, t.id, s.title, s.completed, s.sortOrder);
        }
      }

      if (payload.settings && typeof payload.settings === 'object' && !Array.isArray(payload.settings)) {
        this.applySettingsPatchInTx(payload.settings);
      }
    });

    tx();
    return this.getBootstrap();
  }

  close(): void {
    try {
      // Flush WAL frames into the primary database file cleanly on shutdown
      this.db.pragma('wal_checkpoint(TRUNCATE)');
    } catch {
      // Ignore for :memory: or already-closed handles
    }
    this.db.close();
  }
}
