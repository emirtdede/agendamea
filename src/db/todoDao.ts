import crypto from 'node:crypto';
import type Database from 'better-sqlite3';
import sqliteCore from '../../shared/sqliteCore.cjs';
import textNormalize from '../../shared/textNormalize.cjs';
import todoRepository from '../../shared/todoRepository.cjs';
import type { Priority, Subtask, SubtaskPatch, Todo, TodoPatch } from '../types.ts';
import { normalizeDateRange, sanitizeDueTime, sanitizeTags } from '../utils/todoLogic.ts';
import {
  MAX_IMPORT_TODOS,
  MAX_SUBTASK_TITLE_LEN,
  MAX_SUBTASKS_PER_TODO,
  MAX_TODO_NOTES_LEN,
  MAX_TODO_TITLE_LEN,
  type SubtaskRow,
  sanitizeDueDate,
  sanitizeId,
  sanitizePriority,
  type TodoRow,
  ValidationError,
} from './sanitizers.ts';

export const REPO_MAP_OPTIONS = {
  sanitizeDueTime,
  sanitizeTags,
};

export function getTodoByIdDao(db: Database.Database, id: string): Todo | null {
  return todoRepository.getTodoById(db, id, REPO_MAP_OPTIONS) as Todo | null;
}

export function findTodoBySelectorDao(db: Database.Database, selector: string): Todo | null {
  const clean = String(selector || '').trim();
  if (!clean) return null;
  const exactRow = sqliteCore
    .prepareCached(db, 'SELECT id FROM todos WHERE id = ? AND deleted_at IS NULL')
    .get(clean) as { id: string } | undefined;
  if (exactRow) return getTodoByIdDao(db, exactRow.id);

  // Fast SQL prefix match on primary key before scanning titles
  if (!clean.includes('%') && !clean.includes('_')) {
    const prefixRow = sqliteCore
      .prepareCached(
        db,
        'SELECT id FROM todos WHERE id LIKE ? AND deleted_at IS NULL ORDER BY pinned DESC, sort_order ASC, created_at DESC LIMIT 1',
      )
      .get(`${clean}%`) as { id: string } | undefined;
    if (prefixRow) return getTodoByIdDao(db, prefixRow.id);
  }

  const rows = sqliteCore
    .prepareCached(
      db,
      'SELECT id, title FROM todos WHERE deleted_at IS NULL ORDER BY pinned DESC, sort_order ASC, created_at DESC',
    )
    .all() as Array<{ id: string; title: string }>;
  const match =
    rows.find((r) => r.id.startsWith(clean)) ??
    rows.find((r) => textNormalize.matchesNormalized(r.title, clean)) ??
    null;
  return match ? getTodoByIdDao(db, match.id) : null;
}

export function resolveTodoByVoiceSelectorDao(
  db: Database.Database,
  selector: string,
): Todo | null {
  const clean = String(selector || '').trim();
  if (!clean) return null;

  const exactIdRow = sqliteCore
    .prepareCached(db, 'SELECT id FROM todos WHERE LOWER(id) = LOWER(?) AND deleted_at IS NULL')
    .get(clean) as { id: string } | undefined;
  if (exactIdRow) return getTodoByIdDao(db, exactIdRow.id);

  const rows = sqliteCore
    .prepareCached(
      db,
      'SELECT id, title, notes, completed FROM todos WHERE deleted_at IS NULL ORDER BY pinned DESC, sort_order ASC, created_at DESC',
    )
    .all() as Array<{ id: string; title: string; notes: string; completed: number }>;
  const matched = rows.filter(
    (t) =>
      textNormalize.matchesNormalized(t.title, clean) ||
      textNormalize.matchesNormalized(t.notes, clean),
  );
  if (matched.length === 1 && matched[0]) return getTodoByIdDao(db, matched[0].id);
  const activeMatched = matched.filter((t) => !t.completed);
  const chosen = activeMatched[0] ?? matched[0] ?? null;
  return chosen ? getTodoByIdDao(db, chosen.id) : null;
}

export function createTodoDao(
  db: Database.Database,
  input: {
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
  },
): Todo {
  if (typeof input.title !== 'string') {
    throw new ValidationError('Görev başlığı geçersiz.');
  }
  const title = input.title.trim().slice(0, MAX_TODO_TITLE_LEN);
  if (!title) {
    throw new ValidationError('Görev başlığı boş olamaz.');
  }

  const requestedId = sanitizeId(input.id);
  const notes = typeof input.notes === 'string' ? input.notes.slice(0, MAX_TODO_NOTES_LEN) : '';
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
    typeof input.categoryId === 'string' && input.categoryId.trim()
      ? input.categoryId.trim()
      : null;
  const subtasksInput = Array.isArray(input.subtasks)
    ? input.subtasks.slice(0, MAX_SUBTASKS_PER_TODO)
    : [];

  const tx = db.transaction((): Todo => {
    let id = requestedId ?? crypto.randomUUID();
    if (requestedId) {
      const existing = getTodoByIdDao(db, requestedId);
      if (existing) {
        if (existing.deletedAt === null) {
          return existing;
        }
        id = crypto.randomUUID();
      }
    }

    const minRow = db
      .prepare('SELECT COALESCE(MIN(sort_order), 1) as minOrder FROM todos')
      .get() as { minOrder: number };

    let categoryId = rawCategoryId;
    if (categoryId) {
      const catExists = db
        .prepare('SELECT id FROM categories WHERE id = ? AND deleted_at IS NULL')
        .get(categoryId);
      if (!catExists) categoryId = null;
    }

    const now = new Date().toISOString();
    const sortOrder = minRow.minOrder - 1;

    db.prepare(`
      INSERT INTO todos (
        id, title, notes, completed, important, pinned, priority, start_date, due_date, due_time, tags, category_id, sort_order, created_at, updated_at, deleted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
    `).run(
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
      const subStmt = db.prepare(
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

    const created = getTodoByIdDao(db, id);
    if (!created) {
      throw new Error('Failed to load created todo.');
    }
    return created;
  });

  return tx();
}

export function updateTodoDao(db: Database.Database, id: string, patch: TodoPatch): Todo | null {
  const tx = db.transaction((): Todo | null => {
    const existing = db
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
      typeof patch.notes === 'string' ? patch.notes.slice(0, MAX_TODO_NOTES_LEN) : existing.notes;
    const completed =
      typeof patch.completed === 'boolean' ? (patch.completed ? 1 : 0) : existing.completed;
    const important =
      typeof patch.important === 'boolean' ? (patch.important ? 1 : 0) : existing.important;
    const pinned = typeof patch.pinned === 'boolean' ? (patch.pinned ? 1 : 0) : existing.pinned;
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
        const catExists = db
          .prepare('SELECT id FROM categories WHERE id = ? AND deleted_at IS NULL')
          .get(patch.categoryId);
        if (catExists) {
          categoryId = patch.categoryId;
        }
      }
    }

    const updatedAt = new Date().toISOString();

    db.prepare(`
      UPDATE todos
      SET title = ?, notes = ?, completed = ?, important = ?, pinned = ?, priority = ?, start_date = ?, due_date = ?, due_time = ?, tags = ?, category_id = ?, updated_at = ?
      WHERE id = ?
    `).run(
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

    return getTodoByIdDao(db, id);
  });
  return tx();
}

export function softDeleteTodoDao(db: Database.Database, id: string): Todo | null {
  const existing = db.prepare('SELECT * FROM todos WHERE id = ? AND deleted_at IS NULL').get(id) as
    | TodoRow
    | undefined;
  if (!existing) return null;

  const deletedAt = new Date().toISOString();
  db.prepare('UPDATE todos SET deleted_at = ?, updated_at = ? WHERE id = ?').run(
    deletedAt,
    deletedAt,
    id,
  );

  return getTodoByIdDao(db, id);
}

export function restoreTodoDao(db: Database.Database, id: string): Todo | null {
  const existing = db
    .prepare('SELECT * FROM todos WHERE id = ? AND deleted_at IS NOT NULL')
    .get(id) as TodoRow | undefined;
  if (!existing) return null;

  const updatedAt = new Date().toISOString();
  db.prepare('UPDATE todos SET deleted_at = NULL, updated_at = ? WHERE id = ?').run(updatedAt, id);

  return getTodoByIdDao(db, id);
}

export function permanentDeleteTodoDao(db: Database.Database, id: string): boolean {
  const result = db.prepare('DELETE FROM todos WHERE id = ? AND deleted_at IS NOT NULL').run(id);
  return result.changes > 0;
}

export function clearCompletedDao(db: Database.Database, categoryId?: string | null): Todo[] {
  const deletedAt = new Date().toISOString();
  let affectedRows: TodoRow[] = [];

  const tx = db.transaction(() => {
    if (categoryId) {
      affectedRows = db
        .prepare(
          'SELECT * FROM todos WHERE completed = 1 AND deleted_at IS NULL AND category_id = ?',
        )
        .all(categoryId) as TodoRow[];
      if (affectedRows.length > 0) {
        db.prepare(
          'UPDATE todos SET deleted_at = ?, updated_at = ? WHERE completed = 1 AND deleted_at IS NULL AND category_id = ?',
        ).run(deletedAt, deletedAt, categoryId);
      }
    } else {
      affectedRows = db
        .prepare('SELECT * FROM todos WHERE completed = 1 AND deleted_at IS NULL')
        .all() as TodoRow[];
      if (affectedRows.length > 0) {
        db.prepare(
          'UPDATE todos SET deleted_at = ?, updated_at = ? WHERE completed = 1 AND deleted_at IS NULL',
        ).run(deletedAt, deletedAt);
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
  return todoRepository.attachSubtasks(
    db,
    updatedRows as unknown as Array<Record<string, unknown>>,
    REPO_MAP_OPTIONS,
  ) as Todo[];
}

export function reorderTodosDao(db: Database.Database, orderedIds: string[]): void {
  const uniqueIds = Array.from(new Set(orderedIds));
  if (uniqueIds.length > MAX_IMPORT_TODOS) {
    throw new ValidationError('Görev sıralama listesi izin verilen sınırı aşıyor.');
  }
  const stmt = db.prepare('UPDATE todos SET sort_order = ? WHERE id = ? AND deleted_at IS NULL');
  const tx = db.transaction((ids: string[]) => {
    ids.forEach((todoId, index) => {
      stmt.run(index, todoId);
    });
  });
  tx(uniqueIds);
}

export function createSubtaskDao(
  db: Database.Database,
  todoId: string,
  title: string,
): Subtask | null {
  if (typeof title !== 'string') {
    throw new ValidationError('Alt görev başlığı geçersiz.');
  }
  const trimmed = title.trim().slice(0, MAX_SUBTASK_TITLE_LEN);
  if (!trimmed) {
    throw new ValidationError('Alt görev başlığı boş olamaz.');
  }

  const tx = db.transaction((): Subtask | null => {
    const parent = db
      .prepare('SELECT id FROM todos WHERE id = ? AND deleted_at IS NULL')
      .get(todoId);
    if (!parent) return null;

    const statsRow = db
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

    db.prepare(
      'INSERT INTO subtasks (id, todo_id, title, completed, sort_order) VALUES (?, ?, ?, 0, ?)',
    ).run(id, todoId, trimmed, sortOrder);

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

export function updateSubtaskDao(
  db: Database.Database,
  id: string,
  patch: SubtaskPatch,
): Subtask | null {
  const existing = db
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

  db.prepare('UPDATE subtasks SET title = ?, completed = ? WHERE id = ?').run(title, completed, id);

  return {
    id: existing.id,
    todoId: existing.todo_id,
    title,
    completed: Boolean(completed),
    sortOrder: existing.sort_order,
  };
}

export function deleteSubtaskDao(db: Database.Database, id: string): boolean {
  const result = db
    .prepare(
      'DELETE FROM subtasks WHERE id = ? AND todo_id IN (SELECT id FROM todos WHERE deleted_at IS NULL)',
    )
    .run(id);
  return result.changes > 0;
}
