import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import {
  addDaysToDateString,
  classifyEisenhowerQuadrant,
  compareSemver,
  computeViewCounts,
  filterAndSortTodos,
  formatDueDateLabel,
  formatTodoDateSchedule,
  getVerticalDropPosition,
  isTodoOnCalendarDate,
  isTodoScheduledForToday,
  isValidIsoDateString,
  isValidTimeString,
  moveIdRelative,
  normalizeDateRange,
  sanitizeDueTime,
  sanitizeTags,
  sortCategoriesWithPin,
} from './todoLogic';
import { isValidLanguageCode, SUPPORTED_LANGUAGES } from '../i18n/languages';
import { getDictionary, getLegalDocuments } from '../i18n/localesWorld';
import {
  EN_DICTIONARY,
  localizeErrorMessage,
  resolveCategoryColorName,
  resolveThemeColorName,
  TR_DICTIONARY,
  type UiDictionary,
} from '../i18n/translations';
import {
  buildCustomThemeTokens,
  CATEGORY_COLORS,
  clampZoomPercent,
  COLOR_THEMES,
  getContrastingForeground,
  isValidAppIconId,
  isValidThemeId,
  normalizeHexColor,
  resolveAppIconColors,
} from './themes';
import { TodoDatabase, ValidationError } from '../db/database';
import type { Category, Todo } from '../types';

const sampleCategories: Category[] = [
  {
    id: 'c1',
    name: 'İş',
    color: '#059669',
    pinned: false,
    sortOrder: 0,
    createdAt: '2026-11-19T08:00:00.000Z',
    deletedAt: null,
  },
  {
    id: 'c2',
    name: 'Kişisel',
    color: '#2563eb',
    pinned: false,
    sortOrder: 1,
    createdAt: '2026-11-19T08:00:00.000Z',
    deletedAt: null,
  },
];

const sampleTodos: Todo[] = [
  {
    id: 't1',
    title: 'İstanbul sunumunu hazırla',
    notes: 'Grafikleri ekle',
    completed: false,
    important: true,
    pinned: false,
    priority: 'high',
    dueDate: '2026-11-19',
    categoryId: 'c1',
    sortOrder: 1,
    createdAt: '2026-11-19T08:00:00.000Z',
    updatedAt: '2026-11-19T08:00:00.000Z',
    deletedAt: null,
    subtasks: [{ id: 's1', todoId: 't1', title: 'Kapak sayfası', completed: false, sortOrder: 0 }],
  },
  {
    id: 't2',
    title: 'Spor çantasını hazırla',
    notes: '',
    completed: false,
    important: false,
    pinned: false,
    priority: 'low',
    dueDate: '2026-11-20',
    categoryId: 'c2',
    sortOrder: 0,
    createdAt: '2026-11-19T09:00:00.000Z',
    updatedAt: '2026-11-19T09:00:00.000Z',
    deletedAt: null,
    subtasks: [],
  },
  {
    id: 't3',
    title: 'Fatura öde',
    notes: 'Elektrik',
    completed: true,
    important: false,
    pinned: false,
    priority: 'normal',
    dueDate: '2026-11-18',
    categoryId: 'c2',
    sortOrder: 2,
    createdAt: '2026-11-18T10:00:00.000Z',
    updatedAt: '2026-11-18T10:00:00.000Z',
    deletedAt: null,
    subtasks: [],
  },
];

test('filterAndSortTodos handles Turkish case-insensitive search and subtasks', () => {
  const res = filterAndSortTodos({
    todos: sampleTodos,
    activeView: { type: 'smart', id: 'all' },
    statusFilter: 'all',
    searchQuery: 'istanbul',
    sortBy: 'manual',
    todayStr: '2026-11-19',
  });
  assert.equal(res.length, 1);
  assert.equal(res[0].id, 't1');

  const subRes = filterAndSortTodos({
    todos: sampleTodos,
    activeView: { type: 'smart', id: 'all' },
    statusFilter: 'all',
    searchQuery: 'kapak',
    sortBy: 'manual',
    todayStr: '2026-11-19',
  });
  assert.equal(subRes.length, 1);
  assert.equal(subRes[0].id, 't1');
});

test('filterAndSortTodos sorts by priority while keeping completed at the bottom', () => {
  const res = filterAndSortTodos({
    todos: sampleTodos,
    activeView: { type: 'smart', id: 'all' },
    statusFilter: 'all',
    searchQuery: '',
    sortBy: 'priority',
    todayStr: '2026-11-19',
  });
  assert.deepEqual(
    res.map((t) => t.id),
    ['t1', 't2', 't3'],
  );
});

test('computeViewCounts tallies smart views and categories accurately', () => {
  const counts = computeViewCounts(sampleTodos, sampleCategories, '2026-11-19');
  assert.equal(counts.smart.all, 2);
  assert.equal(counts.smart.today, 1);
  assert.equal(counts.smart.important, 1);
  assert.equal(counts.smart.completed, 1);
  assert.equal(counts.categories.c1, 1);
  assert.equal(counts.categories.c2, 1);
});

test('formatDueDateLabel identifies Bugün, Yarın, Dün, and overdue state', () => {
  assert.deepEqual(formatDueDateLabel('2026-11-19', '2026-11-19'), {
    label: 'Bugün',
    isOverdue: false,
    isToday: true,
  });
  assert.deepEqual(formatDueDateLabel(addDaysToDateString('2026-11-19', 1), '2026-11-19'), {
    label: 'Yarın',
    isOverdue: false,
    isToday: false,
  });
  assert.deepEqual(formatDueDateLabel('2026-11-18', '2026-11-19'), {
    label: 'Dün',
    isOverdue: true,
    isToday: false,
  });
});

test('formatDueDateLabel handles invalid dates safely without throwing RangeError', () => {
  assert.equal(isValidIsoDateString('2026-11-19'), true);
  assert.equal(isValidIsoDateString('2026-02-31'), false);
  assert.equal(isValidIsoDateString('not-a-date'), false);
  assert.equal(formatDueDateLabel('2026-99-99', '2026-11-19'), null);
  assert.equal(formatDueDateLabel('invalid', '2026-11-19'), null);
});

test('COLOR_THEMES covers all requested colors with complete Light and Dark tokens', () => {
  const required = [
    'obsidian',
    'slate',
    'navy',
    'blue',
    'cyan',
    'purple',
    'red',
    'yellow',
    'emerald',
    'grass',
    'lime',
    'pink',
  ];
  for (const id of required) {
    assert.equal(isValidThemeId(id), true, `Missing required theme: ${id}`);
  }
  assert.ok(COLOR_THEMES.length >= 14);
  for (const theme of COLOR_THEMES) {
    assert.ok(theme.light.canvas && theme.light.accent && theme.light.accentFg);
    assert.ok(theme.dark.canvas && theme.dark.accent && theme.dark.accentFg);
  }
});

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
    assert.equal(db.getTrashedTodos()[0].subtasks.length, 1);

    // 2. Restore todo -> returns to active list with subtasks intact
    const restoredTodo = db.restoreTodo(todo.id);
    assert.ok(restoredTodo && restoredTodo.deletedAt === null);
    assert.equal(db.getTodos().length, 1);
    assert.equal(db.getTrashedTodos().length, 0);
    assert.equal(db.getTodos()[0].subtasks[0].title, 'Grafikleri ekle');

    // 3. Soft delete category -> leaves active list, enters trash, todo link preserved in DB
    const trashedCat = db.softDeleteCategory(cat.id);
    assert.ok(trashedCat && trashedCat.deletedAt !== null);
    assert.equal(db.getCategories().length, 0);
    assert.equal(db.getTrashedCategories().length, 1);

    // 4. Restore category -> re-links automatically with existing todo
    const restoredCat = db.restoreCategory(cat.id);
    assert.ok(restoredCat && restoredCat.deletedAt === null);
    assert.equal(db.getCategories().length, 1);
    assert.equal(db.getTodos()[0].categoryId, cat.id);

    // 5. Soft delete category then permanent delete -> todo preserved as uncategorized (categoryId = null)
    db.softDeleteCategory(cat.id);
    assert.equal(db.permanentDeleteCategory(cat.id), true);
    assert.equal(db.getTrashedCategories().length, 0);
    assert.equal(db.getTodos().length, 1);
    assert.equal(db.getTodos()[0].categoryId, null);

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
    assert.equal(db.getTodos()[0].id, activeTodo.id);
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
      assert.equal(boot.categories[0].name, 'Eski Kategori');
      assert.equal(boot.todos.length, 1);
      assert.equal(boot.todos[0].title, 'Eski Görev');
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

    const tSoftDeleteStart = performance.now();
    db.softDeleteTodo(todoIds[0]);
    db.restoreTodo(todoIds[0]);
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

test('CATEGORY_COLORS has 8 primary/secondary colors including white, and normalizeHexColor validates HEX codes', () => {
  assert.equal(CATEGORY_COLORS.length, 8);
  const hexes = CATEGORY_COLORS.map((c) => c.hex.toLowerCase());
  assert.equal(new Set(hexes).size, 8);
  assert.ok(hexes.includes('#ffffff'), 'White must be included in CATEGORY_COLORS');
  assert.ok(hexes.includes('#dc2626'), 'Red primary must be included');
  assert.ok(hexes.includes('#2563eb'), 'Blue primary must be included');
  assert.ok(hexes.includes('#eab308'), 'Yellow primary must be included');

  assert.equal(normalizeHexColor('#ABC'), '#aabbcc');
  assert.equal(normalizeHexColor('ff00aa'), '#ff00aa');
  assert.equal(normalizeHexColor('#00C2A8'), '#00c2a8');
  assert.equal(normalizeHexColor('zzz'), null);
  assert.equal(normalizeHexColor('#12'), null);
  assert.equal(normalizeHexColor(''), null);
});

test('QA: Agendamea Windows, Microsoft Store, and PWA icons & logos exist with valid headers', () => {
  const requiredFiles = [
    'public/favicon.ico',
    'public/icon.svg',
    'public/icon-maskable.svg',
    'public/pwa-192x192.png',
    'public/pwa-512x512.png',
    'public/pwa-maskable-192x192.png',
    'public/pwa-maskable-512x512.png',
    'public/apple-touch-icon.png',
    'public/browserconfig.xml',
    'public/og-image.png',
    'public/icons/agendamea.ico',
    'public/icons/favicon-16x16.png',
    'public/icons/favicon-32x32.png',
    'public/icons/icon-1024x1024.png',
    'public/icons/icon-512x512.webp',
    'public/icons/mstile-144x144.png',
    'public/icons/mstile-310x150.png',
    'public/icons/windows/SmallTile.scale-100.png',
    'public/icons/windows/Square44x44Logo.targetsize-256.png',
    'public/icons/windows/Square150x150Logo.scale-200.png',
    'public/icons/windows/Wide310x150Logo.scale-200.png',
    'public/icons/windows/LargeTile.scale-200.png',
    'public/icons/windows/StoreLogo.scale-200.png',
    'public/icons/windows/SplashScreen.scale-200.png',
    'public/logos/agendamea-logo-light.svg',
    'public/logos/agendamea-logo-dark.svg',
    'public/logos/agendamea-logo-light.png',
    'public/logos/agendamea-logo-dark.png',
  ];

  for (const rel of requiredFiles) {
    const full = path.join(process.cwd(), rel);
    assert.ok(fs.existsSync(full), `Missing asset: ${rel}`);
    const stat = fs.statSync(full);
    assert.ok(stat.size > 100, `Asset unexpectedly empty: ${rel}`);
  }

  // Verify Windows ICO header (00 00 01 00 + 7 embedded resolutions: 16..256)
  const ico = fs.readFileSync(path.join(process.cwd(), 'public/favicon.ico'));
  assert.equal(ico.readUInt16LE(0), 0);
  assert.equal(ico.readUInt16LE(2), 1);
  assert.equal(ico.readUInt16LE(4), 7);
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
    assert.equal(allTodos[0].id, t2.id);
    assert.equal(allTodos[0].pinned, true);

    // Even when sorted by priority, pinned active tasks stay above unpinned active tasks
    const sortedByPriority = filterAndSortTodos({
      todos: allTodos,
      activeView: { type: 'smart', id: 'all' },
      statusFilter: 'all',
      searchQuery: '',
      sortBy: 'priority',
      todayStr: '2026-11-19',
    });
    assert.equal(sortedByPriority[0].id, t2.id);
    assert.equal(sortedByPriority[1].id, t1.id);

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
      assert.equal(restored.todos[0].title, 'Tarih testi');
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
          subtasks: [{ id: 's1', todoId: 'dup-id', title: 'Korunan alt görev', completed: false, sortOrder: 0.7 }],
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
    assert.equal(first?.subtasks[0].sortOrder, 0);
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

  // 5. Schema v3 upgrades cleanly and creates composite partial indexes
  const raw = new Database(dbPath);
  try {
    const version = raw.pragma('user_version', { simple: true });
    assert.equal(version, 3);
    const indexes = raw
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index'")
      .all() as Array<{ name: string }>;
    const names = new Set(indexes.map((i) => i.name));
    assert.ok(names.has('idx_todos_active_order'));
    assert.ok(names.has('idx_categories_active_order'));
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
    assert.equal(db.getCategories()[0].sortOrder, 0);

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

test('QA: Windows 11 Electron installer/uninstaller assets, BMP headers, UTF-8 BOM nsh & Vellium metadata are valid', () => {
  const root = process.cwd();
  const resDir = path.join(root, 'electron-resources');

  // 1. Validate 24-bit uncompressed Windows DIB BMP headers & exact NSIS dimensions
  const expectedBmps: Array<[string, number, number]> = [
    ['installerSidebar.bmp', 164, 314],
    ['uninstallerSidebar.bmp', 164, 314],
    ['installerHeader.bmp', 150, 57],
  ];
  for (const [file, width, height] of expectedBmps) {
    const buf = fs.readFileSync(path.join(resDir, file));
    assert.equal(buf.subarray(0, 2).toString('ascii'), 'BM', `${file} must have BM magic`);
    assert.equal(buf.readInt32LE(18), width, `${file} width mismatch`);
    assert.equal(buf.readInt32LE(22), height, `${file} height mismatch`);
    assert.equal(buf.readUInt16LE(28), 24, `${file} must be 24-bit BMP for NSIS MUI2`);
    assert.equal(buf.readUInt32LE(30), 0, `${file} must be uncompressed BI_RGB`);
  }

  // 2. Validate Windows multi-resolution ICO headers & full alignment across app/setup/uninstaller/runtime icons
  const appIcoBuf = fs.readFileSync(path.join(resDir, 'icon.ico'));
  for (const icoFile of ['icon.ico', 'installer.ico', 'uninstaller.ico']) {
    const buf = fs.readFileSync(path.join(resDir, icoFile));
    assert.equal(buf.readUInt16LE(0), 0);
    assert.equal(buf.readUInt16LE(2), 1);
    assert.ok(buf.readUInt16LE(4) >= 7, `${icoFile} should have at least 7 resolutions`);
    assert.ok(buf.equals(appIcoBuf), `${icoFile} must match icon.ico with clean centered pure-white monogram`);
  }
  assert.ok(
    !fs.existsSync(path.join(root, 'public', 'assets', 'aistudio')),
    'Unused public/assets/aistudio directory must stay removed',
  );

  // 3. Validate UTF-8 BOM NSIS script, DisplayIcon override, shell cache refresh & Vellium publisher info
  const nshBuf = fs.readFileSync(path.join(resDir, 'installer.nsh'));
  assert.equal(nshBuf[0], 0xef);
  assert.equal(nshBuf[1], 0xbb);
  assert.equal(nshBuf[2], 0xbf);
  const nshText = nshBuf.toString('utf8');
  assert.ok(nshText.includes('Vellium'));
  assert.ok(nshText.includes('https://vellium.dev'));
  assert.ok(nshText.includes('support@vellium.dev'));
  assert.ok(nshText.includes('"DisplayIcon" "$INSTDIR\\${APP_EXECUTABLE_FILENAME},0"'));
  assert.ok(nshText.includes('Shell32::SHChangeNotify'));

  // 4. Validate electron-builder.yml, Microsoft Store appx assets (zero SampleAppx Electron icon leakage) & package.json alignment
  const appxDir = path.join(resDir, 'appx');
  const requiredAppxAssets = [
    'StoreLogo.png',
    'StoreLogo.scale-100.png',
    'StoreLogo.scale-200.png',
    'Square150x150Logo.png',
    'Square150x150Logo.scale-100.png',
    'Square150x150Logo.scale-200.png',
    'Square44x44Logo.png',
    'Square44x44Logo.scale-100.png',
    'Square44x44Logo.targetsize-256.png',
    'Square44x44Logo.altform-unplated_targetsize-256.png',
    'Wide310x150Logo.png',
    'Wide310x150Logo.scale-100.png',
    'LargeTile.png',
    'LargeTile.scale-100.png',
    'SmallTile.png',
    'SmallTile.scale-100.png',
    'SplashScreen.png',
    'SplashScreen.scale-100.png',
    'BadgeLogo.png',
    'BadgeLogo.scale-100.png',
  ];
  for (const assetName of requiredAppxAssets) {
    const assetPath = path.join(appxDir, assetName);
    assert.ok(fs.existsSync(assetPath), `Missing Microsoft Store AppX asset: electron-resources/appx/${assetName}`);
    assert.ok(fs.statSync(assetPath).size > 100, `Empty AppX asset: ${assetName}`);
  }

  const builderYml = fs.readFileSync(path.join(root, 'electron-builder.yml'), 'utf8');
  assert.ok(builderYml.includes('appId: dev.vellium.agendamea'));
  assert.ok(builderYml.includes('Vellium (vellium.dev)'));
  assert.ok(builderYml.includes('identityName: Vellium.Agendamea'));
  assert.ok(builderYml.includes('publisherDisplayName: Vellium'));
  assert.ok(builderYml.includes('electron-resources/icon.ico'));
  assert.ok(builderYml.includes('installerSidebar: electron-resources/installerSidebar.bmp'));
  assert.ok(builderYml.includes('uninstallerSidebar: electron-resources/uninstallerSidebar.bmp'));
  assert.ok(builderYml.includes('installerHeader: electron-resources/installerHeader.bmp'));

  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.main, 'electron/main.cjs');
  assert.equal(pkg.version, '1.0.0');
  assert.equal(pkg.author.name, 'Vellium');
  assert.equal(pkg.author.email, 'support@vellium.dev');
  assert.equal(pkg.homepage, 'https://vellium.dev');
  assert.equal(pkg.repository.url, 'https://github.com/emirtdede/agendamea.git');
  assert.equal(pkg.bugs.url, 'https://github.com/emirtdede/agendamea/issues');
  assert.equal(pkg.dependencies['@google/genai'], undefined);
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
      assert.equal(restored.todos[0].subtasks.length, 200);
    } finally {
      targetDb.close();
    }
  } finally {
    db.close();
  }
});

test('QA: Optional start-end dates, 73-language i18n, legal documents & semver update checker work cleanly', () => {
  // 1. Exactly 73 supported languages, all valid with complete dictionaries and legal documents
  assert.equal(SUPPORTED_LANGUAGES.length, 73);
  for (const langMeta of SUPPORTED_LANGUAGES) {
    assert.ok(isValidLanguageCode(langMeta.code));
    const dict = getDictionary(langMeta.code);
    assert.ok(dict.allTasks.length > 0);
    assert.ok(dict.instantSaveBadge.length > 0);
    assert.ok(!dict.instantSaveBadge.toLowerCase().includes('sqlite'));
    const docs = getLegalDocuments(langMeta.code, dict);
    assert.ok(docs.privacy.sections.length >= 3);
    assert.ok(docs.terms.sections.length >= 3);
    assert.ok(docs.gdpr.sections.length >= 3);
    assert.ok(docs.opensource.sections.length >= 2);
    assert.ok(docs.accessibility.sections.length >= 3);
  }

  // 2. Date range normalization & schedule formatting (no date, single date, start-end range, swapped range)
  assert.deepEqual(normalizeDateRange(null, null), { startDate: null, dueDate: null });
  assert.deepEqual(normalizeDateRange('2026-11-25', '2026-11-20'), {
    startDate: '2026-11-20',
    dueDate: '2026-11-25',
  });
  assert.equal(formatTodoDateSchedule(null, null, '2026-11-20'), null);
  const singleDue = formatTodoDateSchedule(null, '2026-11-20', '2026-11-20');
  assert.equal(singleDue?.label, 'Bugün');
  assert.equal(singleDue?.isRange, false);
  const rangeSchedule = formatTodoDateSchedule('2026-11-20', '2026-11-21', '2026-11-20');
  assert.equal(rangeSchedule?.label, 'Bugün - Yarın');
  assert.equal(rangeSchedule?.isRange, true);
  assert.equal(rangeSchedule?.isToday, true);
  assert.ok(
    isTodoScheduledForToday({ startDate: '2026-11-18', dueDate: '2026-11-22' }, '2026-11-20'),
  );

  // 3. SQLite persistence for optional startDate, dueDate, language & autoUpdateCheck
  const db = new TodoDatabase(':memory:');
  try {
    const undated = db.createTodo({ title: 'Tarihsiz hızlı görev' });
    assert.equal(undated.startDate, null);
    assert.equal(undated.dueDate, null);

    const ranged = db.createTodo({
      title: 'Aralıklı görev',
      startDate: '2026-11-25',
      dueDate: '2026-11-20',
    });
    // Swapped automatically so startDate <= dueDate
    assert.equal(ranged.startDate, '2026-11-20');
    assert.equal(ranged.dueDate, '2026-11-25');

    const clearedStart = db.updateTodo(ranged.id, { startDate: null });
    assert.equal(clearedStart?.startDate, null);
    assert.equal(clearedStart?.dueDate, '2026-11-25');

    const settings = db.updateSettings({ language: 'en', autoUpdateCheck: false });
    assert.equal(settings.language, 'en');
    assert.equal(settings.autoUpdateCheck, false);
  } finally {
    db.close();
  }

  // 4. Semver comparison for manual & automatic update checker
  assert.equal(compareSemver('1.0.0', '1.0.0'), 0);
  assert.equal(compareSemver('v1.0.1', '1.0.0'), 1);
  assert.equal(compareSemver('1.1.0', '1.0.9'), 1);
  assert.equal(compareSemver('1.0.0', '1.0.2'), -1);
});

test('QA: Zero language leakage across all 73 languages, UI components, color names, legal docs & international search', () => {
  const requiredKeys = Object.keys(TR_DICTIONARY) as Array<keyof UiDictionary>;
  assert.ok(requiredKeys.length >= 170, 'UiDictionary must contain all 171 localized UI keys');

  // Sentence/phrase keys that must NEVER fall back to English in non-English languages
  // or to Turkish in non-Turkish languages
  const sentenceCheckKeys: Array<keyof UiDictionary> = [
    'allTasks',
    'emptySearchTitle',
    'emptySearchDesc',
    'emptyCompletedTitle',
    'emptyCompletedDesc',
    'emptyListTitle',
    'emptyListDesc',
    'settingsSubtitle',
    'backupRestoreDesc',
    'trashIntroDesc',
    'trashEmptyTitle',
    'trashEmptyDesc',
    'upToDateLabel',
    'autoUpdateToggleDesc',
    'offlineBannerText',
    'todoMovedToTrashToast',
    'categoryMovedToTrashToast',
    'backupRestoredToast',
    'windowClose',
    'operationFailedToast',
    'loadFailedError',
    'onedriveSectionDesc',
    'onedriveBackupDetectedTitle',
    'onedriveBackupDetectedDesc',
    'onedriveStartFreshButton',
    'onedriveOpenFolderButton',
    'addTagPlaceholder',
    'welcomeStep1Title',
    'welcomeStep2Desc',
    'welcomeStep4Desc',
    'welcomeStartButton',
    'welcomePrivacyLocalTitle',
    'customThemeHexTitle',
    'appIconSectionDesc',
    'zoomLevelDesc',
    'closeModalTitle',
    'closeActionTrayDesc',
    'closeActionQuitDesc',
  ];

  for (const langMeta of SUPPORTED_LANGUAGES) {
    const dict = getDictionary(langMeta.code);

    // 1. Every single key in UiDictionary must be non-empty string
    for (const key of requiredKeys) {
      assert.equal(typeof dict[key], 'string', `Missing string key ${String(key)} in ${langMeta.code}`);
      assert.ok(dict[key].trim().length > 0, `Empty key ${String(key)} in ${langMeta.code}`);
    }

    // 2. Zero English sentence leakage in non-English languages & zero Turkish leakage in non-Turkish languages
    if (langMeta.code !== 'en') {
      for (const sKey of sentenceCheckKeys) {
        assert.notEqual(
          dict[sKey],
          EN_DICTIONARY[sKey],
          `English leakage detected in [${langMeta.code}] for key "${String(sKey)}": "${dict[sKey]}"`,
        );
      }
    }
    if (langMeta.code !== 'tr') {
      for (const sKey of sentenceCheckKeys) {
        assert.notEqual(
          dict[sKey],
          TR_DICTIONARY[sKey],
          `Turkish leakage detected in [${langMeta.code}] for key "${String(sKey)}": "${dict[sKey]}"`,
        );
      }
    }

    // 3. All 14 theme colors & 8 category colors resolve to non-empty localized names
    for (const theme of COLOR_THEMES) {
      const localizedThemeName = resolveThemeColorName(theme.id, theme.name, dict);
      assert.ok(localizedThemeName.trim().length > 0);
      if (langMeta.code !== 'tr') {
        // Ensure non-TR languages don't leak Turkish-only color names like "Kırmızı" or "Kehribar"
        assert.notEqual(localizedThemeName, 'Kırmızı');
        assert.notEqual(localizedThemeName, 'Kehribar');
      }
    }
    for (const catColor of CATEGORY_COLORS) {
      const localizedCatColor = resolveCategoryColorName(catColor.hex, catColor.name, dict);
      assert.ok(localizedCatColor.trim().length > 0);
      if (langMeta.code !== 'tr') {
        assert.notEqual(localizedCatColor, 'Kırmızı');
        assert.notEqual(localizedCatColor, 'Beyaz');
      }
    }

    // 4. Legal documents must be localized in the target language (zero English leakage in non-English)
    const docs = getLegalDocuments(langMeta.code, dict);
    if (langMeta.code !== 'en') {
      assert.notEqual(
        docs.privacy.sections[0].paragraphs[0],
        'Agendamea is built by Vellium (vellium.dev) with a strict local-first privacy architecture. All tasks, optional start and due dates, subtasks, notes, categories, and theme settings you create are stored exclusively on your own device (%APPDATA%\\Agendamea).',
        `English legal paragraph leaked in [${langMeta.code}] privacy policy`,
      );
    }

    // 5. localizeErrorMessage never leaks raw Turkish server errors into non-Turkish locales
    if (langMeta.code !== 'tr') {
      const errMsg = localizeErrorMessage(
        new Error('Sunucu ile bağlantı kurulamadı.'),
        dict.operationFailedToast,
        langMeta.code,
        dict,
      );
      assert.equal(errMsg, dict.operationFailedToast);
    }
  }

  // 6. Multilingual search matches both Turkish İ/ı and international I/i (e.g. "Install" <-> "install")
  const intlTodos: Todo[] = [
    {
      id: 'intl-1',
      title: 'Install Windows Update',
      notes: 'Important deployment note',
      completed: false,
      important: true,
      pinned: false,
      priority: 'high',
      startDate: null,
      dueDate: null,
      categoryId: null,
      sortOrder: 0,
      createdAt: '2026-11-20T10:00:00.000Z',
      updatedAt: '2026-11-20T10:00:00.000Z',
      deletedAt: null,
      subtasks: [],
    },
  ];
  const matchedLower = filterAndSortTodos({
    todos: intlTodos,
    activeView: { type: 'smart', id: 'all' },
    statusFilter: 'all',
    searchQuery: 'install',
    sortBy: 'manual',
  });
  assert.equal(matchedLower.length, 1, 'Lowercase "install" must match uppercase "Install"');
  const matchedUpper = filterAndSortTodos({
    todos: intlTodos,
    activeView: { type: 'smart', id: 'all' },
    statusFilter: 'all',
    searchQuery: 'IMPORTANT',
    sortBy: 'manual',
  });
  assert.equal(matchedUpper.length, 1, 'Uppercase "IMPORTANT" must match "Important"');

  // 7. Static source scan of all React components & App.tsx for zero hardcoded Turkish characters
  const componentDir = path.join(process.cwd(), 'src', 'components');
  const componentFiles = fs
    .readdirSync(componentDir)
    .filter((f) => f.endsWith('.tsx'))
    .map((f) => path.join(componentDir, f));
  componentFiles.push(path.join(process.cwd(), 'src', 'App.tsx'));

  const trCharRegex = /[ğüşıöçĞÜŞİÖÇ]/;
  for (const filePath of componentFiles) {
    const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
    lines.forEach((line, idx) => {
      const trimmed = line.trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return;
      assert.ok(
        !trCharRegex.test(line),
        `Hardcoded Turkish character found in ${path.basename(filePath)}:${idx + 1} -> ${trimmed}`,
      );
    });
  }

  // 8. Zero runtime .replace() hacks in i18n locale seed files and strict Unicode script purity across all 73 languages
  for (const relFile of [
    'src/i18n/localesEurope.ts',
    'src/i18n/localesAsiaAfrica.ts',
    'src/i18n/localeExtensions.ts',
  ]) {
    const srcText = fs.readFileSync(path.join(process.cwd(), relFile), 'utf8');
    assert.ok(!srcText.includes('.replace('), `Unexpected .replace() hack in ${relFile}`);
  }

  const expectedScripts: Record<string, RegExp[]> = {
    ru: [/[\u0400-\u04FF]/],
    uk: [/[\u0400-\u04FF]/],
    bg: [/[\u0400-\u04FF]/],
    sr: [/[\u0400-\u04FF]/],
    mk: [/[\u0400-\u04FF]/],
    kk: [/[\u0400-\u04FF]/],
    ky: [/[\u0400-\u04FF]/],
    el: [/[\u0370-\u03FF]/],
    ka: [/[\u10A0-\u10FF]/],
    hy: [/[\u0530-\u058F]/],
    ar: [/[\u0600-\u06FF]/],
    fa: [/[\u0600-\u06FF]/],
    ur: [/[\u0600-\u06FF]/],
    he: [/[\u0590-\u05FF]/],
    hi: [/[\u0900-\u097F]/],
    mr: [/[\u0900-\u097F]/],
    ne: [/[\u0900-\u097F]/],
    bn: [/[\u0980-\u09FF\u0964]/],
    pa: [/[\u0A00-\u0A7F\u0964]/],
    gu: [/[\u0A80-\u0AFF]/],
    ta: [/[\u0B80-\u0BFF]/],
    te: [/[\u0C00-\u0C7F]/],
    kn: [/[\u0C80-\u0CFF]/],
    ml: [/[\u0D00-\u0D7F]/],
    si: [/[\u0D80-\u0DFF]/],
    th: [/[\u0E00-\u0E7F]/],
    lo: [/[\u0E80-\u0EFF]/],
    my: [/[\u1000-\u109F]/],
    km: [/[\u1780-\u17FF]/],
    am: [/[\u1200-\u137F]/],
    ja: [/[\u3040-\u30FF\u4E00-\u9FFF]/],
    ko: [/[\uAC00-\uD7AF\u1100-\u11FF]/],
    'zh-CN': [/[\u4E00-\u9FFF]/],
    'zh-TW': [/[\u4E00-\u9FFF]/],
  };

  const nonLatinBlocks: Array<[string, RegExp]> = [
    ['Cyrillic', /[\u0400-\u04FF]/],
    ['Greek', /[\u0370-\u03FF]/],
    ['Georgian', /[\u10A0-\u10FF]/],
    ['Armenian', /[\u0530-\u058F]/],
    ['Arabic', /[\u0600-\u06FF]/],
    ['Hebrew', /[\u0590-\u05FF]/],
    ['Devanagari', /[\u0900-\u0963\u0966-\u097F]/],
    ['Bengali', /[\u0980-\u09FF]/],
    ['Gurmukhi', /[\u0A00-\u0A7F]/],
    ['Gujarati', /[\u0A80-\u0AFF]/],
    ['Tamil', /[\u0B80-\u0BFF]/],
    ['Telugu', /[\u0C00-\u0C7F]/],
    ['Kannada', /[\u0C80-\u0CFF]/],
    ['Malayalam', /[\u0D00-\u0D7F]/],
    ['Sinhala', /[\u0D80-\u0DFF]/],
    ['Thai', /[\u0E00-\u0E7F]/],
    ['Lao', /[\u0E80-\u0EFF]/],
    ['Myanmar', /[\u1000-\u109F]/],
    ['Khmer', /[\u1780-\u17FF]/],
    ['Ethiopic', /[\u1200-\u137F]/],
    ['Hiragana/Katakana', /[\u3040-\u30FF]/],
    ['Hangul', /[\uAC00-\uD7AF]/],
    ['CJK', /[\u4E00-\u9FFF]/],
  ];

  for (const langMeta of SUPPORTED_LANGUAGES) {
    const dict = getDictionary(langMeta.code);
    const allowed = expectedScripts[langMeta.code] || [];
    for (const [k, val] of Object.entries(dict)) {
      for (const [blockName, rx] of nonLatinBlocks) {
        if (rx.test(val)) {
          const isAllowed = allowed.some((a) => a.test(val));
          assert.ok(
            isAllowed,
            `Foreign script (${blockName}) leaked into [${langMeta.code}] key "${k}": "${val}"`,
          );
        }
      }
    }
  }
});

test('QA: Optional dueTime, post-creation #tags, Kanban/Calendar/Matrix helpers & OneDrive settings persist cleanly', () => {
  assert.equal(isValidTimeString('09:30'), true);
  assert.equal(isValidTimeString('23:59'), true);
  assert.equal(isValidTimeString('24:00'), false);
  assert.equal(sanitizeDueTime(' 14:45 '), '14:45');
  assert.equal(sanitizeDueTime('invalid'), null);

  assert.deepEqual(sanitizeTags(['#iş', 'acil', '#İŞ', '  fatura öde  ']), [
    'iş',
    'acil',
    'fatura-öde',
  ]);

  const timedLabel = formatTodoDateSchedule(
    null,
    '2026-11-21',
    '2026-11-21',
    'tr-TR',
    undefined,
    '14:30',
  );
  assert.equal(timedLabel?.label, 'Bugün · 14:30');

  assert.equal(
    classifyEisenhowerQuadrant(
      { important: true, priority: 'high', startDate: null, dueDate: '2026-11-21' },
      '2026-11-21',
    ),
    'q1',
  );
  assert.equal(
    classifyEisenhowerQuadrant(
      { important: true, priority: 'normal', startDate: null, dueDate: '2026-11-25' },
      '2026-11-21',
    ),
    'q2',
  );
  assert.equal(
    classifyEisenhowerQuadrant(
      { important: false, priority: 'normal', startDate: null, dueDate: '2026-11-21' },
      '2026-11-21',
    ),
    'q3',
  );
  assert.equal(
    classifyEisenhowerQuadrant(
      { important: false, priority: 'low', startDate: null, dueDate: null },
      '2026-11-21',
    ),
    'q4',
  );

  assert.equal(
    isTodoOnCalendarDate({ startDate: '2026-11-20', dueDate: '2026-11-22' }, '2026-11-21'),
    true,
  );
  assert.equal(
    isTodoOnCalendarDate({ startDate: null, dueDate: null }, '2026-11-21'),
    false,
  );

  const db = new TodoDatabase(':memory:');
  try {
    const created = db.createTodo({
      title: 'Sunucu faturasını öde',
      dueDate: '2026-11-21',
      dueTime: '15:30',
      tags: ['#finans', 'bulut'],
    });
    assert.equal(created.dueTime, '15:30');
    assert.deepEqual(created.tags, ['finans', 'bulut']);

    const updated = db.updateTodo(created.id, {
      dueTime: '16:45',
      tags: ['finans', 'bulut', '#onedrive'],
    });
    assert.equal(updated?.dueTime, '16:45');
    assert.deepEqual(updated?.tags, ['finans', 'bulut', 'onedrive']);

    const byTag = filterAndSortTodos({
      todos: db.getTodos(),
      activeView: { type: 'smart', id: 'all' },
      statusFilter: 'all',
      searchQuery: '#onedrive',
      sortBy: 'dueDate',
      todayStr: '2026-11-21',
      tagFilter: 'finans',
    });
    assert.equal(byTag.length, 1);

    const snap = db.getBootstrap();
    const afterOnboarding = db.updateSettings({ onboardingCompleted: true });
    assert.equal(afterOnboarding.onboardingCompleted, true);
    assert.equal(db.getSettings().onboardingCompleted, true);
    const db2 = new TodoDatabase(':memory:');
    try {
      const restored = db2.importBackup(snap);
      assert.equal(restored.todos[0].dueTime, '16:45');
      assert.deepEqual(restored.todos[0].tags, ['finans', 'bulut', 'onedrive']);
    } finally {
      db2.close();
    }
  } finally {
    db.close();
  }

  // Self-healing SQLite corruption recovery test: corrupted DB file is backed up as .corrupt-*.bak and reinitialized cleanly
  const corruptDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agendamea-corrupt-'));
  const corruptDbPath = path.join(corruptDir, 'agendamea.db');
  fs.writeFileSync(corruptDbPath, 'NOT_A_VALID_SQLITE_HEADER_CORRUPTED_BYTES', 'utf8');
  const recoveredDb = new TodoDatabase(corruptDbPath);
  try {
    assert.equal(recoveredDb.getTodos().length, 0);
    const createdAfterRecovery = recoveredDb.createTodo({ title: 'Kurtarılan veritabanı görevi' });
    assert.equal(createdAfterRecovery.title, 'Kurtarılan veritabanı görevi');
    const dirFiles = fs.readdirSync(corruptDir);
    assert.ok(
      dirFiles.some((f) => f.startsWith('agendamea.db.corrupt-') && f.endsWith('.bak')),
      'Corrupted SQLite file must be preserved as .corrupt-*.bak',
    );
  } finally {
    recoveredDb.close();
    fs.rmSync(corruptDir, { recursive: true, force: true });
  }
});

test('QA: Permanent ban on em-dash and en-dash characters across all 73 locales, legal docs, and source files', () => {
  const forbiddenDashRegex = /[\u2013\u2014]/;

  // 1. Verify all 73 dictionaries and legal documents contain zero em-dash or en-dash characters
  for (const langMeta of SUPPORTED_LANGUAGES) {
    const dict = getDictionary(langMeta.code);
    for (const [k, val] of Object.entries(dict)) {
      assert.equal(
        forbiddenDashRegex.test(val),
        false,
        `Forbidden long dash (em-dash/en-dash) found in [${langMeta.code}] dictionary key "${k}": "${val}"`,
      );
    }
    const docs = getLegalDocuments(langMeta.code);
    for (const docId of ['privacy', 'terms', 'gdpr', 'opensource', 'accessibility'] as const) {
      const doc = docs[docId];
      assert.equal(forbiddenDashRegex.test(doc.title), false);
      assert.equal(forbiddenDashRegex.test(doc.subtitle), false);
      for (const sec of doc.sections) {
        assert.equal(
          forbiddenDashRegex.test(sec.heading),
          false,
          `Forbidden long dash in [${langMeta.code}] legal heading: "${sec.heading}"`,
        );
        for (const p of sec.paragraphs) {
          assert.equal(
            forbiddenDashRegex.test(p),
            false,
            `Forbidden long dash in [${langMeta.code}] legal paragraph: "${p}"`,
          );
        }
      }
    }
  }

  // 2. Verify all source, HTML, Electron, and server files in the repository contain zero em-dash or en-dash characters
  const projectRoot = path.resolve(import.meta.dirname, '..', '..');
  const skipDirs = new Set([
    'node_modules',
    '.git',
    'dist',
    'dist-server',
    'release',
    'release-build',
    'release-verify',
    'testsprite_tests',
  ]);
  const inspectFile = (filePath: string) => {
    const content = fs.readFileSync(filePath, 'utf8');
    assert.equal(
      forbiddenDashRegex.test(content),
      false,
      `Forbidden long dash (\\u2013 or \\u2014) found in file: ${path.relative(projectRoot, filePath)}`,
    );
  };
  const walkDir = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (skipDirs.has(entry.name)) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walkDir(fullPath);
      } else if (
        /\.(ts|tsx|js|cjs|mjs|html|css|json|md|bat|ps1|yml|yaml|nsh|txt)$/i.test(entry.name) &&
        entry.name !== 'package-lock.json'
      ) {
        inspectFile(fullPath);
      }
    }
  };
  walkDir(projectRoot);
});

test('QA: Custom HEX theme tokens, dynamic App Icon generator (.ico), accessibility & closeBehavior persist cleanly', async () => {
  // 1. Custom HEX theme generator produces WCAG-contrasting tokens in both light and dark modes
  assert.equal(isValidThemeId('custom'), true);
  assert.equal(isValidAppIconId('match-theme'), true);
  assert.equal(isValidAppIconId('obsidian-light'), true);
  assert.equal(isValidAppIconId('custom'), true);
  assert.equal(getContrastingForeground('#ffffff'), '#09090b');
  assert.equal(getContrastingForeground('#18181b'), '#ffffff');

  const lightCustom = buildCustomThemeTokens('#14b8a6', 'light');
  const darkCustom = buildCustomThemeTokens('#14b8a6', 'dark');
  assert.equal(lightCustom.accent, '#14b8a6');
  assert.ok(darkCustom.canvas.startsWith('#') && darkCustom.accentFg.startsWith('#'));

  const iconMatch = resolveAppIconColors('match-theme', 'custom', 'dark', '#ff4d8d');
  assert.equal(iconMatch.bg, '#ff4d8d');
  const iconCustom = resolveAppIconColors('custom', 'obsidian', 'light', '#2563eb', '#f59e0b');
  assert.equal(iconCustom.bg, '#f59e0b');
  assert.equal(iconCustom.fg, '#09090b');

  // 2. Accessibility zoom clamping
  assert.equal(clampZoomPercent(50), 80);
  assert.equal(clampZoomPercent(124), 125);
  assert.equal(clampZoomPercent(220), 150);

  // 3. Pure-Node dynamic .ico generator produces valid multi-resolution Windows ICO with 7 PNG frames
  const { createRequire } = await import('node:module');
  const req = createRequire(import.meta.url);
  const iconGen = req(path.join(process.cwd(), 'electron', 'iconGenerator.cjs'));
  const { icoBuffer, trayPngBuffer } = iconGen.buildMultiSizeIcoBuffer('#7c3aed', '#ffffff');
  assert.equal(icoBuffer.readUInt16LE(0), 0);
  assert.equal(icoBuffer.readUInt16LE(2), 1);
  assert.equal(icoBuffer.readUInt16LE(4), 7);
  assert.deepEqual(
    Array.from(trayPngBuffer.subarray(0, 8)),
    [137, 80, 78, 71, 13, 10, 26, 10],
    'Tray icon buffer must be a valid PNG image',
  );

  // 4. SQLite persistence for customThemeColor, appIconId, customIconColor, zoomPercent, highContrast, reducedMotion, closeBehavior
  const db = new TodoDatabase(':memory:');
  try {
    const updated = db.updateSettings({
      themeId: 'custom',
      customThemeColor: '#0EA5E9',
      appIconId: 'custom',
      customIconColor: '#EC4899',
      zoomPercent: 125,
      highContrast: true,
      reducedMotion: true,
      closeBehavior: 'tray',
    });
    assert.equal(updated.themeId, 'custom');
    assert.equal(updated.customThemeColor, '#0ea5e9');
    assert.equal(updated.appIconId, 'custom');
    assert.equal(updated.customIconColor, '#ec4899');
    assert.equal(updated.zoomPercent, 125);
    assert.equal(updated.highContrast, true);
    assert.equal(updated.reducedMotion, true);
    assert.equal(updated.closeBehavior, 'tray');
  } finally {
    db.close();
  }

  // 5. NSIS installer.nsh & electron-builder.yml enable native .onInit language switching for Setup & Uninstaller
  const nshText = fs.readFileSync(path.join(process.cwd(), 'electron-resources', 'installer.nsh'), 'utf8');
  const ebYml = fs.readFileSync(path.join(process.cwd(), 'electron-builder.yml'), 'utf8');
  assert.ok(ebYml.includes('displayLanguageSelector: true'), 'Setup must show native language selector before wizard opens');
  assert.ok(nshText.includes('GetUserDefaultUILanguage'), 'Setup must auto-detect Windows display language');
  assert.ok(nshText.includes('StrCpy $LANGUAGE 1033'), 'Setup must fall back to English (1033) for unsupported OS languages');
  assert.ok(nshText.includes('!macro preInit'), 'Windows language detection must run in preInit before MUI_LANGDLL_DISPLAY');
  assert.ok(nshText.includes('!macro customUnInit'), 'Uninstaller must restore Setup language in customUnInit before UI opens');
  assert.ok(nshText.includes('MUI_LANGDLL_ALLLANGUAGES'), 'Unicode language selector must show all bundled languages');
  assert.ok(nshText.includes('InstallerLanguage'), 'Setup and Uninstaller must share chosen language via registry');
  assert.ok(nshText.includes('installer-language.txt'), 'Setup must pass chosen language to Agendamea on first launch');
  assert.ok(nshText.includes('LangString UN_DATA_TITLE 1055'), 'Uninstaller custom page must be localized via LangString');
  assert.ok(nshText.includes('LangString UN_DATA_TITLE 1031'), 'Uninstaller custom page must include non-TR/EN LangStrings');
});




