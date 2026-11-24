import crypto from 'node:crypto';
import type Database from 'better-sqlite3';
import type { AppSettings, BootstrapPayload, Category, Priority, Todo } from '../types.ts';
import { normalizeDateRange, sanitizeDueTime, sanitizeTags } from '../utils/todoLogic.ts';
import {
  MAX_CATEGORY_NAME_LEN,
  MAX_IMPORT_CATEGORIES,
  MAX_IMPORT_SUBTASKS,
  MAX_IMPORT_TODOS,
  MAX_SUBTASK_TITLE_LEN,
  MAX_SUBTASKS_PER_TODO,
  MAX_TODO_NOTES_LEN,
  MAX_TODO_TITLE_LEN,
  sanitizeColor,
  sanitizeDueDate,
  sanitizeId,
  sanitizeIsoTimestamp,
  sanitizePriority,
  ValidationError,
} from './sanitizers.ts';

export function importBackupDao(
  db: Database.Database,
  payload: Partial<BootstrapPayload>,
  applySettingsPatchInTx: (patch: Partial<AppSettings>) => void,
): void {
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
  const trashedCats = Array.isArray(payload.trashedCategories) ? payload.trashedCategories : [];
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
          throw new ValidationError(
            'Yedek dosyası izin verilen maksimum alt görev sınırını aşıyor.',
          );
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

  const rawCount = allCats.length + allTodos.length;
  if (rawCount > 0 && preparedCats.length === 0 && preparedTodos.length === 0) {
    throw new ValidationError('Yedek dosyasındaki kayıtlar bozuk veya okunamıyor.');
  }

  const tx = db.transaction(() => {
    db.prepare('DELETE FROM todo_embedding_chunks').run();
    db.prepare('DELETE FROM webhook_reminder_dispatches').run();
    db.prepare('DELETE FROM subtasks').run();
    db.prepare('DELETE FROM todos').run();
    db.prepare('DELETE FROM categories').run();

    const catInsert = db.prepare(
      'INSERT INTO categories (id, name, color, pinned, sort_order, created_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    );
    for (const c of preparedCats) {
      catInsert.run(c.id, c.name, c.color, c.pinned, c.sortOrder, c.createdAt, c.deletedAt);
    }

    const todoInsert = db.prepare(`
      INSERT INTO todos (
        id, title, notes, completed, important, pinned, priority, start_date, due_date, due_time, tags, category_id, sort_order, created_at, updated_at, deleted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const subInsert = db.prepare(
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

    if (
      payload.settings &&
      typeof payload.settings === 'object' &&
      !Array.isArray(payload.settings)
    ) {
      applySettingsPatchInTx(payload.settings);
    }
    db.exec("INSERT INTO todos_fts(todos_fts) VALUES('rebuild')");
  });

  tx();
}
