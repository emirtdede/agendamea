import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import Database from 'better-sqlite3';
import { TodoDatabase, ValidationError } from '../../src/db/database';
import type { Category, Todo } from '../../src/types';
import { getVerticalDropPosition } from '../../src/utils/todoLogic';

test('QA: Backend sanitizes invalid color/dueDate, ignores trashed IDs for idempotency, and imports JSON backups atomically', () => {
  const db = new TodoDatabase(':memory:');
  try {
    // 1. Invalid color falls back safely; invalid dueDate becomes null
    const badCat = db.createCategory({ name: 'Güvenli', color: 'javascript:alert(1)' });
    assert.equal(badCat.color, '#2563eb');
    const badTodo = db.createTodo({
      title: 'Tarih testi',
      dueDate: '2026-02-31',
      categoryId: badCat.id,
    });
    assert.equal(badTodo.dueDate, null);

    // 2. Idempotency never returns a soft-deleted record as newly created active record
    const c = db.createCategory({ id: 'recycle-id', name: 'Silinecek', color: '#dc2626' });
    db.softDeleteCategory(c.id);
    const recreated = db.createCategory({ id: 'recycle-id', name: 'Yeni Aktif', color: '#16a34a' });
    assert.notEqual(recreated.id, 'recycle-id');
    assert.equal(recreated.deletedAt, null);

    // 3. Export snapshot & atomic importBackup restore
    const snapshot = db.getBootstrap();
    const targetDb = new TodoDatabase(':memory:');
    try {
      const restored = targetDb.importBackup(snapshot);
      assert.equal(restored.categories.length, snapshot.categories.length);
      assert.equal(restored.trashedCategories.length, snapshot.trashedCategories.length);
      assert.equal(restored.todos.length, snapshot.todos.length);
      assert.equal(restored.todos[0]?.title, 'Tarih testi');
    } finally {
      targetDb.close();
    }
  } finally {
    db.close();
  }
});

test('QA: Audit hardening - ValidationError on bad imports, duplicate-ID subtask safety, trashed subtask guard, dueDate preservation & AGENDAMEA_DATA_DIR', () => {
  const db = new TodoDatabase(':memory:');
  try {
    // 1. Invalid dueDate in updateTodo preserves existing valid dueDate instead of wiping it
    const t = db.createTodo({ title: 'Tarih koruma', dueDate: '2026-11-25' });
    const afterInvalid = db.updateTodo(t.id, { dueDate: '2026-99-99' });
    assert.equal(afterInvalid?.dueDate, '2026-11-25');
    const afterClear = db.updateTodo(t.id, { dueDate: null });
    assert.equal(afterClear?.dueDate, null);

    // 2. Subtasks belonging to a soft-deleted todo cannot be mutated or deleted
    const sub = db.createSubtask(t.id, 'Alt adım');
    assert.ok(sub);
    db.softDeleteTodo(t.id);
    assert.equal(db.updateSubtask(sub.id, { completed: true }), null);
    assert.equal(db.deleteSubtask(sub.id), false);

    // 3. Corrupted non-empty backup throws ValidationError without wiping existing DB
    assert.throws(
      () =>
        db.importBackup({
          todos: [null as unknown as Todo, {} as Todo],
        }),
      (err) => err instanceof ValidationError,
    );
    assert.equal(db.getTrashedTodos().length, 1);

    // 4. Duplicate todo IDs in backup do not cascade-wipe subtasks and truncate fractional sortOrder
    const restored = db.importBackup({
      categories: [],
      todos: [
        {
          id: 'dup-id',
          title: 'İlk görev',
          notes: '',
          completed: false,
          important: false,
          pinned: false,
          priority: 'normal',
          dueDate: null,
          categoryId: null,
          sortOrder: 1.9,
          createdAt: '2026-11-19T00:00:00.000Z',
          updatedAt: '2026-11-19T00:00:00.000Z',
          deletedAt: null,
          subtasks: [
            {
              id: 's1',
              todoId: 'dup-id',
              title: 'Korunan alt görev',
              completed: false,
              sortOrder: 0.7,
            },
          ],
        },
        {
          id: 'dup-id',
          title: 'İkinci görev (çakışan id)',
          notes: '',
          completed: false,
          important: false,
          pinned: false,
          priority: 'normal',
          dueDate: null,
          categoryId: null,
          sortOrder: 2.4,
          createdAt: '2026-11-19T00:00:00.000Z',
          updatedAt: '2026-11-19T00:00:00.000Z',
          deletedAt: null,
          subtasks: [],
        },
      ],
    });
    assert.equal(restored.todos.length, 2);
    const first = restored.todos.find((x) => x.title === 'İlk görev');
    assert.equal(first?.subtasks.length, 1);
    assert.equal(first?.sortOrder, 1);
    assert.equal(first?.subtasks[0]?.sortOrder, 0);
  } finally {
    db.close();
  }

  // 5. AGENDAMEA_DATA_DIR overrides default DB directory (required for Windows Program Files installs)
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agendamea-appdata-'));
  const prevEnv = process.env.AGENDAMEA_DATA_DIR;
  process.env.AGENDAMEA_DATA_DIR = tmpDir;
  try {
    const envDb = new TodoDatabase();
    envDb.createTodo({ title: 'AppData testi' });
    envDb.close();
    assert.ok(fs.existsSync(path.join(tmpDir, 'agendamea.db')));
  } finally {
    if (prevEnv === undefined) {
      delete process.env.AGENDAMEA_DATA_DIR;
    } else {
      process.env.AGENDAMEA_DATA_DIR = prevEnv;
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('QA: Third-pass audit hardening - drop helper, non-destructive categoryId, import caps & schema v3 partial indexes', () => {
  // 1. getVerticalDropPosition splits midpoint cleanly
  const rect = { top: 100, height: 40 } as DOMRect;
  assert.equal(getVerticalDropPosition(110, rect), 'before');
  assert.equal(getVerticalDropPosition(120, rect), 'after');
  assert.equal(getVerticalDropPosition(135, rect), 'after');

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agendamea-v3-'));
  const dbPath = path.join(tmpDir, 'audit-v3.db');
  const db = new TodoDatabase(dbPath);
  try {
    // 2. Invalid/non-active categoryId in updateTodo preserves existing categoryId
    const cat = db.createCategory({ name: 'Sabit', color: '#2563eb' });
    const todo = db.createTodo({ title: 'Kategori koruma', categoryId: cat.id });
    const afterInvalidCat = db.updateTodo(todo.id, { categoryId: 'non-existent-id' });
    assert.equal(afterInvalidCat?.categoryId, cat.id);
    const afterExplicitClear = db.updateTodo(todo.id, { categoryId: null });
    assert.equal(afterExplicitClear?.categoryId, null);

    // 3. importBackup rejects oversized category collections cleanly with ValidationError
    const tooManyCats = Array.from({ length: 501 }, (_, i) => ({
      id: `c-${i}`,
      name: `Cat ${i}`,
      color: '#2563eb',
    }));
    assert.throws(
      () => db.importBackup({ categories: tooManyCats as Category[] }),
      (err) => err instanceof ValidationError,
    );

    // 4. Transactional getBootstrap snapshot returns consistent state
    const snap = db.getBootstrap();
    assert.equal(snap.categories.length, 1);
    assert.equal(snap.todos.length, 1);
  } finally {
    db.close();
  }

  // 5. Schema v3 upgrades cleanly to v6 and creates composite partial indexes
  const raw = new Database(dbPath);
  try {
    const version = raw.pragma('user_version', { simple: true });
    assert.equal(version, 6);
    const indexes = raw
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index'")
      .all() as Array<{ name: string }>;
    const names = new Set(indexes.map((i) => i.name));
    assert.ok(names.has('idx_todos_active_order'));
    assert.ok(names.has('idx_categories_active_order'));
    assert.ok(names.has('idx_todos_active_schedule'));
  } finally {
    raw.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('QA: Fourth-pass audit hardening - blank PATCH rejection, reorder caps & subtask import cap', () => {
  const db = new TodoDatabase(':memory:');
  try {
    const cat = db.createCategory({ name: 'Çalışma', color: '#2563eb' });
    const todo = db.createTodo({ title: 'Asıl görev', categoryId: cat.id });
    const sub = db.createSubtask(todo.id, 'Alt adım');
    assert.ok(sub);

    // 1. Blank PATCH strings throw ValidationError consistently across category, todo, and subtask
    assert.throws(
      () => db.updateCategory(cat.id, { name: '   ' }),
      (err) => err instanceof ValidationError,
    );
    assert.throws(
      () => db.updateTodo(todo.id, { title: '   ' }),
      (err) => err instanceof ValidationError,
    );
    assert.throws(
      () => db.updateSubtask(sub.id, { title: '' }),
      (err) => err instanceof ValidationError,
    );

    // 2. Reorder rejects oversized ID lists and deduplicates safely
    const tooManyCatIds = Array.from({ length: 501 }, (_, i) => `cat-${i}`);
    assert.throws(
      () => db.reorderCategories(tooManyCatIds),
      (err) => err instanceof ValidationError,
    );
    db.reorderCategories([cat.id, cat.id]);
    assert.equal(db.getCategories()[0]?.sortOrder, 0);

    // 3. importBackup enforces per-todo subtask cap cleanly with ValidationError
    const tooManySubs = Array.from({ length: 201 }, (_, i) => ({
      id: `sub-${i}`,
      title: `Alt ${i}`,
      completed: false,
    }));
    assert.throws(
      () =>
        db.importBackup({
          todos: [
            {
              id: 't-cap',
              title: 'Taşan alt görevler',
              subtasks: tooManySubs as unknown as Todo['subtasks'],
            } as Todo,
          ],
        }),
      (err) => err instanceof ValidationError,
    );
  } finally {
    db.close();
  }
});

test('QA: Fifth-pass pre-deployment audit hardening - createSubtask cap, transactional updates & export/import round-trip at cap', () => {
  const db = new TodoDatabase(':memory:');
  try {
    const todo = db.createTodo({ title: 'Alt görev limit testi' });
    for (let i = 0; i < 200; i += 1) {
      const sub = db.createSubtask(todo.id, `Adım ${i + 1}`);
      assert.ok(sub);
    }

    // 201st subtask must throw ValidationError so exported backups always remain re-importable
    assert.throws(
      () => db.createSubtask(todo.id, 'Taşan 201. adım'),
      (err) => err instanceof ValidationError,
    );

    // Exporting and re-importing at max subtask cap (200) must succeed cleanly
    const snapshot = db.getBootstrap();
    const targetDb = new TodoDatabase(':memory:');
    try {
      const restored = targetDb.importBackup(snapshot);
      assert.equal(restored.todos.length, 1);
      assert.equal(restored.todos[0]?.subtasks.length, 200);
    } finally {
      targetDb.close();
    }
  } finally {
    db.close();
  }
});
