import crypto from 'node:crypto';
import type Database from 'better-sqlite3';
import todoRepository from '../../shared/todoRepository.cjs';
import type { Category, CategoryPatch } from '../types.ts';
import {
  type CategoryRow,
  MAX_CATEGORY_NAME_LEN,
  MAX_IMPORT_CATEGORIES,
  sanitizeColor,
  sanitizeId,
  ValidationError,
} from './sanitizers.ts';

function mapCategory(row: CategoryRow): Category {
  return todoRepository.mapCategoryRow(row as unknown as Record<string, unknown>) as Category;
}

export function getCategoryByIdDao(db: Database.Database, id: string): Category | null {
  const row = db.prepare('SELECT * FROM categories WHERE id = ?').get(id) as
    | CategoryRow
    | undefined;
  return row ? mapCategory(row) : null;
}

export function createCategoryDao(
  db: Database.Database,
  input: { id?: string; name: string; color?: string; pinned?: boolean },
): Category {
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

  const tx = db.transaction((): Category => {
    let id = requestedId ?? crypto.randomUUID();
    if (requestedId) {
      const existing = getCategoryByIdDao(db, requestedId);
      if (existing) {
        if (existing.deletedAt === null) {
          return existing;
        }
        id = crypto.randomUUID();
      }
    }

    const maxRow = db
      .prepare('SELECT COALESCE(MAX(sort_order), -1) as maxOrder FROM categories')
      .get() as { maxOrder: number };

    const now = new Date().toISOString();
    const sortOrder = maxRow.maxOrder + 1;

    db.prepare(
      'INSERT INTO categories (id, name, color, pinned, sort_order, created_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, NULL)',
    ).run(id, name, color, pinned, sortOrder, now);

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

export function updateCategoryDao(
  db: Database.Database,
  id: string,
  patch: CategoryPatch,
): Category | null {
  const tx = db.transaction((): Category | null => {
    const existing = db
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
      typeof patch.color === 'string' ? sanitizeColor(patch.color, existing.color) : existing.color;
    const nextPinned = typeof patch.pinned === 'boolean' ? (patch.pinned ? 1 : 0) : existing.pinned;

    db.prepare('UPDATE categories SET name = ?, color = ?, pinned = ? WHERE id = ?').run(
      nextName,
      nextColor,
      nextPinned,
      id,
    );

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

export function softDeleteCategoryDao(db: Database.Database, id: string): Category | null {
  const existing = db
    .prepare('SELECT * FROM categories WHERE id = ? AND deleted_at IS NULL')
    .get(id) as CategoryRow | undefined;
  if (!existing) return null;

  const deletedAt = new Date().toISOString();
  db.prepare('UPDATE categories SET deleted_at = ? WHERE id = ?').run(deletedAt, id);

  return mapCategory({ ...existing, deleted_at: deletedAt });
}

export function restoreCategoryDao(db: Database.Database, id: string): Category | null {
  const existing = db
    .prepare('SELECT * FROM categories WHERE id = ? AND deleted_at IS NOT NULL')
    .get(id) as CategoryRow | undefined;
  if (!existing) return null;

  db.prepare('UPDATE categories SET deleted_at = NULL WHERE id = ?').run(id);

  return mapCategory({ ...existing, deleted_at: null });
}

export function permanentDeleteCategoryDao(db: Database.Database, id: string): boolean {
  const result = db
    .prepare('DELETE FROM categories WHERE id = ? AND deleted_at IS NOT NULL')
    .run(id);
  return result.changes > 0;
}

export function reorderCategoriesDao(db: Database.Database, orderedIds: string[]): void {
  const uniqueIds = Array.from(new Set(orderedIds));
  if (uniqueIds.length > MAX_IMPORT_CATEGORIES) {
    throw new ValidationError('Kategori sıralama listesi izin verilen sınırı aşıyor.');
  }
  const stmt = db.prepare(
    'UPDATE categories SET sort_order = ? WHERE id = ? AND deleted_at IS NULL',
  );
  const tx = db.transaction((ids: string[]) => {
    ids.forEach((categoryId, index) => {
      stmt.run(index, categoryId);
    });
  });
  tx(uniqueIds);
}
