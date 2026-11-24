import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import test from 'node:test';
import Database from 'better-sqlite3';
import { TodoDatabase } from '../../src/db/database';
import {
  computeViewCounts,
  filterAndSortTodos,
  moveIdRelative,
  sortCategoriesWithPin,
} from '../../src/utils/todoLogic';

test('QA: Fresh SQLite database starts clean with zero dummy test data', () => {
  const db = new TodoDatabase(':memory:');
  try {
    const boot = db.getBootstrap();
    assert.equal(boot.categories.length, 0);
    assert.equal(boot.todos.length, 0);
    assert.equal(boot.trashedCategories.length, 0);
    assert.equal(boot.trashedTodos.length, 0);
    assert.deepEqual(boot.settings, {
      themeMode: 'light',
      themeId: 'obsidian',
      dragLocked: false,
      sidebarCollapsed: false,
      themeCustomized: false,
      language: 'tr',
      autoUpdateCheck: true,
    });
  } finally {
    db.close();
  }
});

test('QA: Soft delete, restore, and permanent delete for todos and categories', () => {
  const db = new TodoDatabase(':memory:');
  try {
    const cat = db.createCategory({ name: 'İş', color: '#059669' });
    const todo = db.createTodo({
      title: 'Raporu tamamla',
      notes: 'Q4 özet',
      priority: 'high',
      categoryId: cat.id,
    });
    const sub = db.createSubtask(todo.id, 'Grafikleri ekle');
    assert.ok(sub);

    // 1. Soft delete todo -> leaves active list, enters trash with subtasks intact
    const trashedTodo = db.softDeleteTodo(todo.id);
    assert.ok(trashedTodo && trashedTodo.deletedAt !== null);
    assert.equal(db.getTodos().length, 0);
    assert.equal(db.getTrashedTodos().length, 1);
    assert.equal(db.getTrashedTodos()[0]?.subtasks.length, 1);

    // 2. Restore todo -> returns to active list with subtasks intact
    const restoredTodo = db.restoreTodo(todo.id);
    assert.ok(restoredTodo && restoredTodo.deletedAt === null);
    assert.equal(db.getTodos().length, 1);
    assert.equal(db.getTrashedTodos().length, 0);
    assert.equal(db.getTodos()[0]?.subtasks[0]?.title, 'Grafikleri ekle');

    // 3. Soft delete category -> leaves active list, enters trash, todo link preserved in DB
    const trashedCat = db.softDeleteCategory(cat.id);
    assert.ok(trashedCat && trashedCat.deletedAt !== null);
    assert.equal(db.getCategories().length, 0);
    assert.equal(db.getTrashedCategories().length, 1);

    // 4. Restore category -> re-links automatically with existing todo
    const restoredCat = db.restoreCategory(cat.id);
    assert.ok(restoredCat && restoredCat.deletedAt === null);
    assert.equal(db.getCategories().length, 1);
    assert.equal(db.getTodos()[0]?.categoryId, cat.id);

    // 5. Soft delete category then permanent delete -> todo preserved as uncategorized (categoryId = null)
    db.softDeleteCategory(cat.id);
    assert.equal(db.permanentDeleteCategory(cat.id), true);
    assert.equal(db.getTrashedCategories().length, 0);
    assert.equal(db.getTodos().length, 1);
    assert.equal(db.getTodos()[0]?.categoryId, null);

    // 6. Soft delete completed todos (clearCompleted) -> goes to trash, not hard-deleted
    db.updateTodo(todo.id, { completed: true });
    const cleared = db.clearCompleted();
    assert.equal(cleared.length, 1);
    assert.equal(db.getTodos().length, 0);
    assert.equal(db.getTrashedTodos().length, 1);

    // 7. Empty trash permanently wipes trashed items only
    const activeTodo = db.createTodo({ title: 'Aktif görev' });
    const emptied = db.emptyTrash();
    assert.equal(emptied.deletedTodos, 1);
    assert.equal(db.getTrashedTodos().length, 0);
    assert.equal(db.getTodos().length, 1);
    assert.equal(db.getTodos()[0]?.id, activeTodo.id);
  } finally {
    db.close();
  }
});

test('QA: Schema auto-migration upgrades legacy DB without deleted_at columns safely', () => {
  const tmpFile = path.join(os.tmpdir(), `agendamea-migrate-${Date.now()}.db`);
  try {
    // Create legacy schema without deleted_at
    const legacy = new Database(tmpFile);
    legacy.exec(`
      CREATE TABLE categories (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        color TEXT NOT NULL,
        sort_order INTEGER NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE todos (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        notes TEXT NOT NULL,
        completed INTEGER NOT NULL,
        important INTEGER NOT NULL,
        priority TEXT NOT NULL,
        due_date TEXT,
        category_id TEXT,
        sort_order INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      INSERT INTO categories VALUES ('old-c1', 'Eski Kategori', '#2563eb', 0, '2026-01-01T00:00:00.000Z');
      INSERT INTO todos VALUES ('old-t1', 'Eski Görev', 'Not', 0, 0, 'normal', NULL, 'old-c1', 0, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
    `);
    legacy.close();

    // Open with TodoDatabase -> should migrate seamlessly and preserve rows
    const migrated = new TodoDatabase(tmpFile);
    try {
      const boot = migrated.getBootstrap();
      assert.equal(boot.categories.length, 1);
      assert.equal(boot.categories[0]?.name, 'Eski Kategori');
      assert.equal(boot.todos.length, 1);
      assert.equal(boot.todos[0]?.title, 'Eski Görev');
      assert.ok(migrated.softDeleteTodo('old-t1'));
      assert.equal(migrated.getTodos().length, 0);
      assert.equal(migrated.getTrashedTodos().length, 1);
    } finally {
      migrated.close();
    }
  } finally {
    for (const suffix of ['', '-wal', '-shm']) {
      if (fs.existsSync(tmpFile + suffix)) fs.unlinkSync(tmpFile + suffix);
    }
  }
});

test('QA: Edge cases reject blank titles and handle Turkish + special characters safely', () => {
  const db = new TodoDatabase(':memory:');
  try {
    assert.throws(() => db.createTodo({ title: '   ' }));
    assert.throws(() => db.createCategory({ name: '   ' }));

    const tricky = `<script>alert("x")</script> & ŞĞÜÖÇİı ' " -- ; DROP TABLE todos;`;
    const todo = db.createTodo({ title: tricky, notes: tricky });
    const loaded = db.getTodoById(todo.id);
    assert.equal(loaded?.title, tricky);
    assert.equal(loaded?.notes, tricky);

    // Permanent delete refuses to hard-delete an active (non-trashed) record
    assert.equal(db.permanentDeleteTodo(todo.id), false);
    assert.equal(db.getTodos().length, 1);
  } finally {
    db.close();
  }
});

test('Performance: 1,000 todos + 50 categories + 500 subtasks stay fast under load', () => {
  const db = new TodoDatabase(':memory:');
  try {
    const tInsertStart = performance.now();
    const catIds: string[] = [];
    for (let c = 0; c < 50; c++) {
      catIds.push(db.createCategory({ name: `Kategori ${c}`, color: '#2563eb' }).id);
    }
    const todoIds: string[] = [];
    for (let i = 0; i < 1000; i++) {
      const t = db.createTodo({
        title: `Görev ${i} - İstanbul planlaması`,
        notes: i % 3 === 0 ? 'Önemli not içeriği' : '',
        priority: i % 5 === 0 ? 'high' : i % 4 === 0 ? 'low' : 'normal',
        important: i % 7 === 0,
        completed: i % 6 === 0,
        dueDate: i % 4 === 0 ? '2026-11-19' : null,
        categoryId: catIds[i % catIds.length],
        subtasks: i < 500 ? [{ title: `Alt adım ${i}` }] : undefined,
      });
      todoIds.push(t.id);
    }
    const insertMs = performance.now() - tInsertStart;

    const tBootStart = performance.now();
    const boot = db.getBootstrap();
    const bootMs = performance.now() - tBootStart;

    const tFilterStart = performance.now();
    const filtered = filterAndSortTodos({
      todos: boot.todos,
      activeView: { type: 'smart', id: 'all' },
      statusFilter: 'active',
      searchQuery: 'istanbul',
      sortBy: 'priority',
      todayStr: '2026-11-19',
    });
    const filterMs = performance.now() - tFilterStart;

    const tCountStart = performance.now();
    const counts = computeViewCounts(boot.todos, boot.categories, '2026-11-19');
    const countMs = performance.now() - tCountStart;

    const firstTodoId = todoIds[0];
    assert.ok(firstTodoId);
    const tSoftDeleteStart = performance.now();
    db.softDeleteTodo(firstTodoId);
    db.restoreTodo(firstTodoId);
    const softRestoreMs = performance.now() - tSoftDeleteStart;

    const tReorderStart = performance.now();
    db.reorderTodos([...todoIds].reverse());
    const reorderMs = performance.now() - tReorderStart;

    assert.equal(boot.todos.length, 1000);
    assert.equal(boot.categories.length, 50);
    assert.ok(filtered.length > 800);
    assert.equal(counts.smart.all + counts.smart.completed, 1000);

    // Performance SLA assertions
    assert.ok(bootMs < 150, `Bootstrap too slow: ${bootMs.toFixed(1)}ms`);
    assert.ok(filterMs < 50, `Filter/sort too slow: ${filterMs.toFixed(1)}ms`);
    assert.ok(countMs < 20, `View count too slow: ${countMs.toFixed(1)}ms`);
    assert.ok(softRestoreMs < 15, `Soft-delete+restore too slow: ${softRestoreMs.toFixed(1)}ms`);
    assert.ok(reorderMs < 100, `Reorder 1000 rows too slow: ${reorderMs.toFixed(1)}ms`);

    console.log(
      `[PERF] 1000 todos + 50 cats + 500 subtasks | insert=${insertMs.toFixed(1)}ms | bootstrap=${bootMs.toFixed(1)}ms | filter+sort=${filterMs.toFixed(1)}ms | counts=${countMs.toFixed(1)}ms | softDelete+restore=${softRestoreMs.toFixed(1)}ms | reorder1000=${reorderMs.toFixed(1)}ms`,
    );
  } finally {
    db.close();
  }
});

test('QA: moveIdRelative and SQLite category reordering + dragLocked setting persist cleanly', () => {
  assert.deepEqual(moveIdRelative(['a', 'b', 'c', 'd'], 'a', 'c', 'after'), ['b', 'c', 'a', 'd']);
  assert.deepEqual(moveIdRelative(['a', 'b', 'c', 'd'], 'd', 'b', 'before'), ['a', 'd', 'b', 'c']);
  assert.deepEqual(moveIdRelative(['a', 'b', 'c'], 'b', 'b', 'before'), ['a', 'b', 'c']);

  const db = new TodoDatabase(':memory:');
  try {
    const c1 = db.createCategory({ name: 'Bir', color: '#dc2626' });
    const c2 = db.createCategory({ name: 'İki', color: '#2563eb' });
    const c3 = db.createCategory({ name: 'Üç', color: '#16a34a' });

    db.reorderCategories([c3.id, c1.id, c2.id]);
    assert.deepEqual(
      db.getCategories().map((c) => c.id),
      [c3.id, c1.id, c2.id],
    );

    assert.equal(db.getSettings().dragLocked, false);
    assert.equal(db.updateSettings({ dragLocked: true }).dragLocked, true);
    assert.equal(db.getSettings().dragLocked, true);
    assert.equal(db.updateSettings({ dragLocked: false }).dragLocked, false);
  } finally {
    db.close();
  }
});

test('QA: Idempotent creation prevents duplicate categories/todos on rapid double-click', () => {
  const db = new TodoDatabase(':memory:');
  try {
    const firstCat = db.createCategory({ id: 'same-cat-id', name: 'Hızlı', color: '#dc2626' });
    const dupCat = db.createCategory({ id: 'same-cat-id', name: 'Hızlı', color: '#dc2626' });
    assert.equal(firstCat.id, dupCat.id);
    assert.equal(db.getCategories().length, 1);

    const firstTodo = db.createTodo({ id: 'same-todo-id', title: 'Çift tıklama testi' });
    const dupTodo = db.createTodo({ id: 'same-todo-id', title: 'Çift tıklama testi' });
    assert.equal(firstTodo.id, dupTodo.id);
    assert.equal(db.getTodos().length, 1);
  } finally {
    db.close();
  }
});

test('QA: Pinning floats categories and todos to the top and persists across settings/reloads', () => {
  const db = new TodoDatabase(':memory:');
  try {
    const c1 = db.createCategory({ name: 'İlk', color: '#dc2626' });
    const c2 = db.createCategory({ name: 'İkinci', color: '#2563eb' });
    const c3 = db.createCategory({ name: 'Üçüncü', color: '#16a34a' });

    // Pin c3 -> jumps to the very top
    const pinnedC3 = db.updateCategory(c3.id, { pinned: true });
    assert.equal(pinnedC3?.pinned, true);
    assert.deepEqual(
      db.getCategories().map((c) => c.id),
      [c3.id, c1.id, c2.id],
    );
    assert.deepEqual(
      sortCategoriesWithPin([c1, c2, { ...c3, pinned: true }]).map((c) => c.id),
      [c3.id, c1.id, c2.id],
    );

    const t1 = db.createTodo({ title: 'Yüksek öncelikli', priority: 'high' });
    const t2 = db.createTodo({ title: 'Düşük ama sabitli', priority: 'low' });
    db.updateTodo(t2.id, { pinned: true });

    const allTodos = db.getTodos();
    assert.equal(allTodos[0]?.id, t2.id);
    assert.equal(allTodos[0]?.pinned, true);

    // Even when sorted by priority, pinned active tasks stay above unpinned active tasks
    const sortedByPriority = filterAndSortTodos({
      todos: allTodos,
      activeView: { type: 'smart', id: 'all' },
      statusFilter: 'all',
      searchQuery: '',
      sortBy: 'priority',
      todayStr: '2026-11-19',
    });
    assert.equal(sortedByPriority[0]?.id, t2.id);
    assert.equal(sortedByPriority[1]?.id, t1.id);

    // Sidebar minimal mode and theme preference persistence
    assert.equal(db.getSettings().themeCustomized, false);
    const updatedSettings = db.updateSettings({
      themeMode: 'dark',
      themeId: 'navy',
      sidebarCollapsed: true,
    });
    assert.equal(updatedSettings.themeMode, 'dark');
    assert.equal(updatedSettings.themeId, 'navy');
    assert.equal(updatedSettings.sidebarCollapsed, true);
    assert.equal(updatedSettings.themeCustomized, true);
  } finally {
    db.close();
  }
});
