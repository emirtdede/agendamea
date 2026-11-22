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
  filterAndSortTrash,
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
  getNextZoomPreset,
  getPrevZoomPreset,
  isValidAppIconId,
  isValidThemeId,
  normalizeHexColor,
  resolveAppIconColors,
  resolveEffectiveThemeMode,
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
    assert.equal(version, 4);
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
  assert.equal(pkg.version, '1.1.0');
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
    'launchAtStartupTitle',
    'launchAtStartupDesc',
    'globalQuickAddTitle',
    'globalQuickAddDesc',
    'cloudPickFolderButton',
    'cloudCustomFolderHint',
    'copyDiagnosticsButton',
    'diagnosticsCopiedToast',
    'updateReadyToInstallLabel',
    'restartAndUpdateButton',
    'settingsTabAppearance',
    'settingsTabGeneral',
    'settingsTabAbout',
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

  // 7. Recursive static source scan of all React components (including subdirectories) & App.tsx for zero hardcoded Turkish characters
  const componentDir = path.join(process.cwd(), 'src', 'components');
  const componentFiles: string[] = [];
  const collectTsxFiles = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        collectTsxFiles(fullPath);
      } else if (entry.name.endsWith('.tsx')) {
        componentFiles.push(fullPath);
      }
    }
  };
  collectTsxFiles(componentDir);
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
      themeMode: 'system',
      launchAtStartup: true,
      globalQuickAddShortcut: false,
    });
    assert.equal(updated.themeId, 'custom');
    assert.equal(updated.customThemeColor, '#0ea5e9');
    assert.equal(updated.appIconId, 'custom');
    assert.equal(updated.customIconColor, '#ec4899');
    assert.equal(updated.zoomPercent, 125);
    assert.equal(updated.highContrast, true);
    assert.equal(updated.reducedMotion, true);
    assert.equal(updated.closeBehavior, 'tray');
    assert.equal(updated.themeMode, 'system');
    assert.equal(updated.launchAtStartup, true);
    assert.equal(updated.globalQuickAddShortcut, false);
    assert.ok(['light', 'dark'].includes(resolveEffectiveThemeMode('system')));
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

  // 6. Winget manifest files exist and contain valid Vellium.Agendamea 1.0.0 schema metadata
  const wingetDir = path.join(process.cwd(), 'winget', 'manifests', 'v', 'Vellium', 'Agendamea', '1.0.0');
  for (const manifestFile of [
    'Vellium.Agendamea.yaml',
    'Vellium.Agendamea.installer.yaml',
    'Vellium.Agendamea.locale.en-US.yaml',
    'Vellium.Agendamea.locale.tr-TR.yaml',
  ]) {
    const manifestText = fs.readFileSync(path.join(wingetDir, manifestFile), 'utf8');
    assert.ok(manifestText.includes('PackageIdentifier: Vellium.Agendamea'), `${manifestFile} must specify PackageIdentifier`);
    assert.ok(manifestText.includes('PackageVersion: 1.0.0'), `${manifestFile} must specify PackageVersion 1.0.0`);
  }

  // 7. Zero-cost silent/delta auto-updater (electron-updater) wiring & Microsoft Store Policy 10.2.7 isolation
  const mainCjs = fs.readFileSync(path.join(process.cwd(), 'electron', 'main.cjs'), 'utf8');
  const releaseYml = fs.readFileSync(path.join(process.cwd(), '.github', 'workflows', 'release.yml'), 'utf8');
  assert.ok(ebYml.includes('provider: github'), 'electron-builder.yml must configure GitHub publish provider for latest.yml & app-update.yml');
  assert.ok(ebYml.includes('node_modules/electron-updater/**'), 'electron-builder.yml must bundle electron-updater in files');
  assert.ok(releaseYml.includes('release/latest.yml'), 'GitHub Release workflow must publish latest.yml for delta auto-updates');
  assert.ok(mainCjs.includes("require('electron-updater')"), 'Electron main process must integrate electron-updater');
  assert.ok(mainCjs.includes('quitAndInstall(true, true)'), 'Electron main process must support silent quitAndInstall');
  assert.ok(mainCjs.includes('!process.windowsStore'), 'Native auto-updater must stay disabled inside Microsoft Store builds');
});

test('QA: Trash search/sort/date-range, CLI & MCP server protocol, zero icon/auto-saved leakage & Store legal compliance', async () => {
  // 1. Trash search, type filter, sorting & deleted date-range filtering
  const trashedCats: Category[] = [
    {
      id: 'c-old',
      name: 'Arşiv',
      color: '#2563eb',
      pinned: false,
      sortOrder: 0,
      createdAt: '2026-11-01T10:00:00.000Z',
      deletedAt: '2026-11-10T10:00:00.000Z',
    },
    {
      id: 'c-new',
      name: 'Zamanlama',
      color: '#16a34a',
      pinned: false,
      sortOrder: 1,
      createdAt: '2026-11-02T10:00:00.000Z',
      deletedAt: '2026-11-20T10:00:00.000Z',
    },
  ];
  const trashedItems: Todo[] = [
    {
      id: 't-1',
      title: 'Bütçe raporu',
      notes: 'Q4 özet',
      completed: false,
      important: false,
      pinned: false,
      priority: 'normal',
      dueDate: null,
      categoryId: null,
      sortOrder: 0,
      createdAt: '2026-11-01T08:00:00.000Z',
      updatedAt: '2026-11-01T08:00:00.000Z',
      deletedAt: '2026-11-12T09:00:00.000Z',
      subtasks: [],
    },
    {
      id: 't-2',
      title: 'Aylık değerlendirme',
      notes: '',
      completed: true,
      important: false,
      pinned: false,
      priority: 'high',
      dueDate: null,
      categoryId: null,
      sortOrder: 1,
      createdAt: '2026-11-05T08:00:00.000Z',
      updatedAt: '2026-11-05T08:00:00.000Z',
      deletedAt: '2026-11-21T15:00:00.000Z',
      subtasks: [],
    },
  ];

  const byNewest = filterAndSortTrash(trashedCats, trashedItems, {
    query: '',
    typeFilter: 'all',
    sortBy: 'newest',
    dateFrom: '',
    dateTo: '',
    locale: 'tr-TR',
  });
  assert.deepEqual(byNewest.todos.map((x) => x.id), ['t-2', 't-1']);
  assert.deepEqual(byNewest.categories.map((x) => x.id), ['c-new', 'c-old']);

  const byAZ = filterAndSortTrash(trashedCats, trashedItems, {
    query: '',
    typeFilter: 'todos',
    sortBy: 'az',
    dateFrom: '',
    dateTo: '',
    locale: 'tr-TR',
  });
  assert.equal(byAZ.categories.length, 0);
  assert.deepEqual(byAZ.todos.map((x) => x.id), ['t-2', 't-1']);

  const byDateRange = filterAndSortTrash(trashedCats, trashedItems, {
    query: '',
    typeFilter: 'all',
    sortBy: 'oldest',
    dateFrom: '2026-11-15',
    dateTo: '2026-11-22',
    locale: 'tr-TR',
  });
  assert.deepEqual(byDateRange.categories.map((x) => x.id), ['c-new']);
  assert.deepEqual(byDateRange.todos.map((x) => x.id), ['t-2']);

  const byNoteSearch = filterAndSortTrash(trashedCats, trashedItems, {
    query: 'q4',
    typeFilter: 'all',
    sortBy: 'newest',
    dateFrom: '',
    dateTo: '',
    locale: 'tr-TR',
  });
  assert.equal(byNoteSearch.categories.length, 0);
  assert.deepEqual(byNoteSearch.todos.map((x) => x.id), ['t-1']);

  // 2. CLI script responds cleanly to --help & --version
  const { execFileSync, spawn } = await import('node:child_process');
  const cliPath = path.join(process.cwd(), 'cli', 'agendamea.cjs');
  const helpOut = execFileSync(process.execPath, [cliPath, '--help'], { encoding: 'utf8' });
  assert.ok(helpOut.includes('ag +'), 'CLI help must list short simple commands');
  assert.ok(helpOut.includes('ag mcp'), 'CLI help must document MCP command');
  assert.ok(helpOut.includes('ag hook'), 'CLI help must document webhook command');

  // 3. MCP JSON-RPC 2.0 stdio server responds cleanly to initialize & tools/list
  const mcpPath = path.join(process.cwd(), 'mcp', 'server.cjs');
  const mcpResponses = await new Promise<Array<Record<string, unknown>>>((resolve, reject) => {
    const child = spawn(process.execPath, [mcpPath], { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('MCP server timed out'));
    }, 5000);
    child.stdout.on('data', (chunk) => {
      out += chunk.toString('utf8');
      const lines = out.split(/\r?\n/).filter((l) => l.trim().length > 0);
      if (lines.length >= 2) {
        clearTimeout(timer);
        child.kill();
        resolve(lines.map((l) => JSON.parse(l) as Record<string, unknown>));
      }
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.stdin.write(
      `${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} })}\n`,
    );
    child.stdin.write(
      `${JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} })}\n`,
    );
  });
  assert.equal(mcpResponses[0].id, 1);
  assert.equal(
    (mcpResponses[0].result as { serverInfo?: { name?: string } })?.serverInfo?.name,
    'agendamea',
  );
  const tools = (mcpResponses[1].result as { tools?: Array<{ name: string }> })?.tools ?? [];
  assert.ok(tools.length >= 6, 'MCP server must register all core task tools');
  assert.ok(tools.some((tool) => tool.name === 'agendamea_list_tasks'));
  assert.ok(tools.some((tool) => tool.name === 'agendamea_add_task'));

  // 4. Zero icon leakage in Electron fallback HTML & Jump List + zero native <input type="color"> + zero autoSavedBadge clutter in SettingsModal
  const mainCjs = fs.readFileSync(path.join(process.cwd(), 'electron', 'main.cjs'), 'utf8');
  assert.ok(
    !mainCjs.includes('M18 33L27.5 42.5L46 22'),
    'Electron fallback HTML must use official Agendamea A-check monogram (zero generic checkmark leakage)',
  );
  assert.ok(mainCjs.includes('M 144 378 L 252 128 L 294 224'));
  assert.ok(mainCjs.includes('runtime-port.json'), 'Electron main process must publish runtime-port.json for CLI/MCP');

  const catColorPicker = fs.readFileSync(
    path.join(process.cwd(), 'src', 'components', 'CategoryColorPicker.tsx'),
    'utf8',
  );
  assert.ok(
    !catColorPicker.includes('type="color"'),
    'CategoryColorPicker must use custom ColorSpectrumPicker instead of misaligned Chromium native color popup',
  );

  const settingsModalSrc = fs.readFileSync(
    path.join(process.cwd(), 'src', 'components', 'SettingsModal.tsx'),
    'utf8',
  );
  assert.ok(
    !settingsModalSrc.includes('t.autoSavedBadge'),
    'SettingsModal must not display autoSavedBadge clutter',
  );

  // 5. Microsoft Store Policy 10.2.7 & multi-cloud accuracy in Legal Documents (TR & EN)
  const trLegal = getLegalDocuments('tr', TR_DICTIONARY);
  const enLegal = getLegalDocuments('en', EN_DICTIONARY);
  assert.ok(trLegal.privacy.sections[2].paragraphs[0].includes('10.2.7'));
  assert.ok(enLegal.privacy.sections[2].paragraphs[0].includes('10.2.7'));
  assert.ok(!enLegal.terms.sections[1].paragraphs[0].includes('without cloud synchronization'));
  assert.ok(trLegal.opensource.sections[1].paragraphs[0].includes('Electron Updater'));
  assert.ok(enLegal.opensource.sections[1].paragraphs[0].includes('Electron Updater'));
  assert.ok(trLegal.accessibility.sections[2].paragraphs[0].includes('9MT5X1NGZJXZ'));
  assert.ok(enLegal.accessibility.sections[2].paragraphs[0].includes('9MT5X1NGZJXZ'));

  // 6. Shared releaseUtils.cjs (single source of truth for Electron + Express), offline SQLite CLI/MCP localStore.cjs & CI workflow
  const { createRequire } = await import('node:module');
  const req = createRequire(import.meta.url);
  const releaseUtils = req(path.join(process.cwd(), 'shared', 'releaseUtils.cjs'));
  assert.equal(releaseUtils.compareSemver('1.2.0', '1.0.9'), 1);
  assert.equal(releaseUtils.compareSemver('v1.0.0', '1.0.0'), 0);
  const parsedRel = releaseUtils.parseGitHubRelease(
    {
      tag_name: 'v1.1.0',
      name: 'Agendamea v1.1.0',
      html_url: 'https://github.com/emirtdede/agendamea/releases/tag/v1.1.0',
      assets: [
        { name: 'Agendamea-Setup-1.1.0-win-x64.exe', browser_download_url: 'https://example.com/setup.exe' },
        { name: 'Agendamea-Store-1.1.0-win-x64.appx', browser_download_url: 'https://example.com/store.appx' },
      ],
    },
    '1.0.0',
    'https://github.com/emirtdede/agendamea/releases/latest',
    '2026-11-22T00:00:00.000Z',
  );
  assert.equal(parsedRel.updateAvailable, true);
  assert.equal(parsedRel.latestVersion, '1.1.0');
  assert.equal(parsedRel.setupUrl, 'https://example.com/setup.exe');
  assert.equal(parsedRel.msixUrl, 'https://example.com/store.appx');

  // Offline direct SQLite fallback for CLI & MCP when desktop app is closed
  const tmpOfflineDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agendamea-offline-store-'));
  const offlineDbPath = path.join(tmpOfflineDir, 'agendamea.db');
  const seedDb = new TodoDatabase(offlineDbPath);
  seedDb.createCategory({ name: 'CLI Test', color: '#2563eb' });
  seedDb.close();

  const prevForceOffline = process.env.AGENDAMEA_FORCE_OFFLINE;
  const prevDbPath = process.env.AGENDAMEA_DB_PATH;
  process.env.AGENDAMEA_FORCE_OFFLINE = '1';
  process.env.AGENDAMEA_DB_PATH = offlineDbPath;
  try {
    const localStore = req(path.join(process.cwd(), 'shared', 'localStore.cjs'));
    const added = await localStore.addTask({ title: 'Offline CLI task', priority: 'high', important: true });
    assert.ok(added.id.startsWith('todo-'));
    const listed = await localStore.listTasks({ filter: 'important' });
    assert.equal(listed.length, 1);
    assert.equal(listed[0].title, 'Offline CLI task');
    const done = await localStore.completeTask(added.id.slice(0, 12), true);
    assert.equal(done.completed, true);
    const status = await localStore.getStatus();
    assert.equal(status.mode, 'offline-sqlite');
    assert.equal(status.completedTasks, 1);
    assert.equal(status.categories, 1);
    await localStore.deleteTask(added.id.slice(0, 12));
    const afterDelete = await localStore.getStatus();
    assert.equal(afterDelete.trashCount, 1);
  } finally {
    if (prevForceOffline === undefined) delete process.env.AGENDAMEA_FORCE_OFFLINE;
    else process.env.AGENDAMEA_FORCE_OFFLINE = prevForceOffline;
    if (prevDbPath === undefined) delete process.env.AGENDAMEA_DB_PATH;
    else process.env.AGENDAMEA_DB_PATH = prevDbPath;
    fs.rmSync(tmpOfflineDir, { recursive: true, force: true });
  }

  // CI workflow presence & required quality gates
  const ciYml = fs.readFileSync(path.join(process.cwd(), '.github', 'workflows', 'ci.yml'), 'utf8');
  assert.ok(ciYml.includes('npm run lint'));
  assert.ok(ciYml.includes('npm test'));
  assert.ok(ciYml.includes('npm run build'));
});

test('QA: Task search date range, short ag CLI, race-free MCP update tool, live bi-directional webhooks & UI refinements', async () => {
  const { execFileSync, spawn } = await import('node:child_process');
  const cryptoMod = await import('node:crypto');
  const httpMod = await import('node:http');
  const netMod = await import('node:net');

  const buildSampleTodo = (overrides: Partial<Todo>): Todo => ({
    id: overrides.id ?? 't-sample',
    title: overrides.title ?? 'Sample',
    notes: overrides.notes ?? '',
    completed: overrides.completed ?? false,
    important: overrides.important ?? false,
    pinned: overrides.pinned ?? false,
    priority: overrides.priority ?? 'normal',
    startDate: overrides.startDate ?? null,
    dueDate: overrides.dueDate ?? null,
    dueTime: overrides.dueTime ?? null,
    tags: overrides.tags ?? [],
    categoryId: overrides.categoryId ?? null,
    sortOrder: overrides.sortOrder ?? 0,
    createdAt: overrides.createdAt ?? '2026-03-01T08:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-03-01T08:00:00.000Z',
    deletedAt: overrides.deletedAt ?? null,
    subtasks: overrides.subtasks ?? [],
  });

  // 1. filterAndSortTodos date-range filtering (single date, span overlap, inverted range, undated exclusion)
  const sampleTodos: Todo[] = [
    buildSampleTodo({ id: 'd1', title: 'Mart gorevi', dueDate: '2026-03-10' }),
    buildSampleTodo({ id: 'd2', title: 'Aralik span gorevi', startDate: '2026-03-15', dueDate: '2026-03-25' }),
    buildSampleTodo({ id: 'd3', title: 'Nisan gorevi', dueDate: '2026-04-05' }),
    buildSampleTodo({ id: 'd4', title: 'Tarihsiz gorev', dueDate: null, startDate: null }),
  ];

  const inRange = filterAndSortTodos({
    todos: sampleTodos,
    activeView: { type: 'smart', id: 'all' },
    statusFilter: 'all',
    searchQuery: '',
    sortBy: 'manual',
    dateFrom: '2026-03-12',
    dateTo: '2026-03-20',
  });
  assert.deepEqual(
    inRange.map((x) => x.id),
    ['d2'],
  );

  // Inverted bounds still normalize safely
  const invertedRange = filterAndSortTodos({
    todos: sampleTodos,
    activeView: { type: 'smart', id: 'all' },
    statusFilter: 'all',
    searchQuery: '',
    sortBy: 'manual',
    dateFrom: '2026-03-16',
    dateTo: '2026-03-09',
  });
  assert.deepEqual(
    invertedRange.map((x) => x.id),
    ['d1', 'd2'],
  );

  // 2. Short CLI commands (ag, ag +, ag ok, ag rm, ag stat) + MCP update tool over piped stdio (strictly isolated DB)
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agendamea-ux-e2e-'));
  const dbPath = path.join(tmpDir, 'agendamea.db');
  const seed = new TodoDatabase(dbPath);
  seed.close();

  const cliScript = path.join(process.cwd(), 'cli', 'agendamea.cjs');
  const mcpScript = path.join(process.cwd(), 'mcp', 'server.cjs');
  const isolatedEnv = {
    ...process.env,
    AGENDAMEA_DATA_DIR: tmpDir,
    AGENDAMEA_FORCE_OFFLINE: '1',
  };

  try {
    const addedRaw = execFileSync(process.execPath, [cliScript, '+', 'Kisa CLI Gorevi', '-h', '-d', '2026-05-10', '-j'], {
      env: isolatedEnv,
      encoding: 'utf8',
    });
    const addedTask = JSON.parse(addedRaw);
    assert.equal(addedTask.title, 'Kisa CLI Gorevi');
    assert.equal(addedTask.priority, 'high');
    assert.equal(addedTask.dueDate, '2026-05-10');

    // Bare "ag -j" lists active tasks directly
    const bareList = JSON.parse(
      execFileSync(process.execPath, [cliScript, '-j'], {
        env: isolatedEnv,
        encoding: 'utf8',
      }),
    );
    assert.equal(bareList.length, 1);

    // MCP piped stdio: initialize + tools/list + update_task + list_tasks with dateFrom/dateTo
    const mcpPayload = [
      JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }),
      JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }),
      JSON.stringify({
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'agendamea_update_task',
          arguments: { id: addedTask.id.slice(0, 12), title: 'MCP Guncellendi', important: true },
        },
      }),
      JSON.stringify({
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: {
          name: 'agendamea_list_tasks',
          arguments: { filter: 'active', dateFrom: '2026-05-01', dateTo: '2026-05-31' },
        },
      }),
    ].join('\n') + '\n';

    const mcpOut = execFileSync(process.execPath, [mcpScript], {
      env: isolatedEnv,
      input: mcpPayload,
      encoding: 'utf8',
    });
    const mcpLines = mcpOut.trim().split(/\r?\n/).map((line) => JSON.parse(line));
    assert.equal(mcpLines.length, 4, 'Piped MCP stdio must flush every async response before exiting');
    const toolNames = mcpLines[1].result.tools.map((tool: { name: string }) => tool.name);
    assert.ok(toolNames.includes('agendamea_update_task'));
    const updatedFromMcp = JSON.parse(mcpLines[2].result.content[0].text);
    assert.equal(updatedFromMcp.title, 'MCP Guncellendi');
    assert.equal(updatedFromMcp.important, true);
    const listedFromMcp = JSON.parse(mcpLines[3].result.content[0].text);
    assert.equal(listedFromMcp.length, 1);

    // Natural quote-free add with @yarin, !, *, #tag + numbered list + ag ara + ag ok 1 + ag rm 1 + ag geri + Turkish output!
    const naturalRaw = execFileSync(
      process.execPath,
      [cliScript, '+', 'Raporu', 'gonder', '@yarin', '!', '*', '#finans', '-j'],
      { env: isolatedEnv, encoding: 'utf8' },
    );
    const naturalTask = JSON.parse(naturalRaw);
    assert.equal(naturalTask.title, 'Raporu gonder');
    assert.equal(naturalTask.priority, 'high');
    assert.equal(naturalTask.important, true);
    assert.deepEqual(naturalTask.tags, ['finans']);
    assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(naturalTask.dueDate));

    // Turkish interactive output renders numbered list ("1.") and Turkish localized messages
    const trListText = execFileSync(process.execPath, [cliScript], {
      env: { ...isolatedEnv, AGENDAMEA_CLI_LANG: 'tr' },
      encoding: 'utf8',
    });
    assert.ok(trListText.includes('1.'), 'CLI list must use human-friendly 1, 2, 3 numbering');
    assert.ok(trListText.includes('#finans'), 'CLI list must render #tags');

    // ag ara searches titles & tags
    const searchJson = JSON.parse(
      execFileSync(process.execPath, [cliScript, 'ara', '#finans', '-j'], {
        env: isolatedEnv,
        encoding: 'utf8',
      }),
    );
    assert.equal(searchJson.length, 1);
    assert.equal(searchJson[0].id, naturalTask.id);

    // Complete & trash by 1-based number ("ag ok 1" / "ag rm 1"), then restore via "ag geri"!
    const okByNum = JSON.parse(
      execFileSync(process.execPath, [cliScript, 'ok', '1', '-j'], {
        env: isolatedEnv,
        encoding: 'utf8',
      }),
    );
    assert.equal(okByNum.completed, true);

    const rmByKeyword = JSON.parse(
      execFileSync(process.execPath, [cliScript, 'rm', 'Raporu', '-j'], {
        env: isolatedEnv,
        encoding: 'utf8',
      }),
    );
    assert.equal(rmByKeyword.movedToTrash, true);

    const undoText = execFileSync(process.execPath, [cliScript, 'geri'], {
      env: { ...isolatedEnv, AGENDAMEA_CLI_LANG: 'tr' },
      encoding: 'utf8',
    });
    assert.ok(undoText.includes('geri yüklendi'), 'ag geri must restore last trashed task in Turkish');

    // Short ok & rm commands by ID prefix still work cleanly
    const okOut = JSON.parse(
      execFileSync(process.execPath, [cliScript, 'ok', addedTask.id.slice(0, 12), '-j'], {
        env: isolatedEnv,
        encoding: 'utf8',
      }),
    );
    assert.equal(okOut.completed, true);

    const rmOut = JSON.parse(
      execFileSync(process.execPath, [cliScript, 'rm', addedTask.id.slice(0, 12), '-j'], {
        env: isolatedEnv,
        encoding: 'utf8',
      }),
    );
    assert.equal(rmOut.movedToTrash, true);

    // 3. Real Bi-Directional Webhooks (Outgoing HMAC-SHA256 + Test Endpoint + Incoming Trigger)
    const receivedHooks: Array<{
      event: string;
      sig: string;
      rawBody: string;
      parsed: Record<string, unknown>;
    }> = [];
    const hookReceiver = httpMod.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', () => {
        const rawBody = Buffer.concat(chunks).toString('utf8');
        receivedHooks.push({
          event: String(req.headers['x-agendamea-event'] ?? ''),
          sig: String(req.headers['x-agendamea-signature'] ?? ''),
          rawBody,
          parsed: JSON.parse(rawBody),
        });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ received: true }));
      });
    });

    await new Promise<void>((resolve) => hookReceiver.listen(0, '127.0.0.1', () => resolve()));
    const hookPort = (hookReceiver.address() as { port: number }).port;
    const hookUrl = `http://127.0.0.1:${hookPort}/hook`;
    const hookSecret = 'top-secret-ag-key';

    const appPort = await new Promise<number>((resolve, reject) => {
      const probe = netMod.createServer();
      probe.listen(0, '127.0.0.1', () => {
        const addr = probe.address() as { port: number };
        probe.close(() => resolve(addr.port));
      });
      probe.on('error', reject);
    });
    const appBase = `http://127.0.0.1:${appPort}`;
    const webhookDataDir = path.join(tmpDir, 'webhook-srv');
    fs.mkdirSync(webhookDataDir, { recursive: true });
    const tsxCli = path.join(process.cwd(), 'node_modules', 'tsx', 'dist', 'cli.mjs');
    const srvChild = spawn(process.execPath, [tsxCli, path.join(process.cwd(), 'server.ts')], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NODE_ENV: 'production',
        HOST: '127.0.0.1',
        PORT: String(appPort),
        AGENDAMEA_DATA_DIR: webhookDataDir,
      },
      stdio: 'ignore',
      windowsHide: true,
    });

    let serverReady = false;
    for (let i = 0; i < 40; i += 1) {
      try {
        const health = await fetch(`${appBase}/api/health`);
        if (health.ok) {
          serverReady = true;
          break;
        }
      } catch {
        // Wait for startup
      }
      await new Promise((r) => setTimeout(r, 120));
    }
    assert.equal(serverReady, true, 'Isolated Express server must start cleanly');

    try {
      // Save webhook config
      const setRes = await fetch(`${appBase}/api/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          webhookEnabled: true,
          webhookUrl: hookUrl,
          webhookSecret: hookSecret,
        }),
      });
      assert.equal(setRes.status, 200);
      const savedSettings = await setRes.json();
      assert.equal(savedSettings.webhookEnabled, true);
      assert.equal(savedSettings.webhookUrl, hookUrl);

      // Test outgoing webhook endpoint
      const testRes = await fetch(`${appBase}/api/webhooks/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const testJson = await testRes.json();
      assert.equal(testJson.ok, true);
      assert.equal(testJson.statusCode, 200);
      assert.equal(receivedHooks.length, 1);
      assert.equal(receivedHooks[0].event, 'webhook.test');
      const expectedSig = `sha256=${cryptoMod.createHmac('sha256', hookSecret).update(receivedHooks[0].rawBody).digest('hex')}`;
      assert.equal(receivedHooks[0].sig, expectedSig);
      assert.ok(String(receivedHooks[0].parsed.content).includes('Agendamea'));

      // Incoming webhook without secret must reject 401
      const badIncoming = await fetch(`${appBase}/api/webhook/incoming`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Yetkisiz' }),
      });
      assert.equal(badIncoming.status, 401);

      // Incoming webhook with valid secret creates task & fires outgoing todo.created webhook
      const goodIncoming = await fetch(`${appBase}/api/webhook/incoming`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Agendamea-Secret': hookSecret,
        },
        body: JSON.stringify({ action: 'add', title: 'Webhook Gorevi', priority: 'high' }),
      });
      assert.equal(goodIncoming.status, 201);
      const createdHookResp = await goodIncoming.json();
      assert.equal(createdHookResp.ok, true);
      assert.equal(createdHookResp.todo.title, 'Webhook Gorevi');

      // Wait briefly for fire-and-forget outgoing todo.created delivery
      for (let i = 0; i < 20 && receivedHooks.length < 2; i += 1) {
        await new Promise((r) => setTimeout(r, 30));
      }
      assert.ok(receivedHooks.some((h) => h.event === 'todo.created'));
    } finally {
      srvChild.kill();
      await new Promise<void>((resolve) => {
        if (srvChild.exitCode !== null) resolve();
        else {
          srvChild.once('exit', () => resolve());
          setTimeout(resolve, 600);
        }
      });
      hookReceiver.close();
    }

    // 4. UI Refinement Regression Checks
    const appearanceSrc = fs.readFileSync(
      path.join(process.cwd(), 'src', 'components', 'settings', 'AppearanceSettingsTab.tsx'),
      'utf8',
    );
    assert.ok(appearanceSrc.includes('useState(true)'), 'App icons panel must open expanded by default');
    assert.ok(!appearanceSrc.includes('t.themesCountUnit'), '15 tema label must be removed');
    assert.ok(appearanceSrc.includes('copy-theme-hex-btn'), 'Theme HEX copy button must exist');
    assert.ok(appearanceSrc.includes('copy-icon-hex-btn'), 'Icon HEX copy button must exist');

    const welcomeSrc = fs.readFileSync(
      path.join(process.cwd(), 'src', 'components', 'WelcomeModal.tsx'),
      'utf8',
    );
    assert.ok(welcomeSrc.includes('welcome-selected-language'), 'Welcome Step 1 selected-language display must exist');
    assert.ok(!welcomeSrc.includes('welcome-language-select'), 'Welcome Step 1 right-side dropdown button must be removed');

    // 5. Clean Start / Reset All Data (preserves theme by default; optional full settings reset)
    const resetDb = new TodoDatabase(path.join(tmpDir, 'reset-test.db'));
    try {
      resetDb.updateSettings({ themeMode: 'dark', themeId: 'purple', webhookUrl: 'https://example.com/hook', webhookEnabled: true });
      const rCat = resetDb.createCategory({ name: 'Silinecek', color: '#2563eb' });
      const rTodo = resetDb.createTodo({ title: 'Silinecek gorev', categoryId: rCat.id });
      resetDb.createSubtask(rTodo.id, 'Alt gorev');
      const rTrash = resetDb.createTodo({ title: 'Copteki gorev' });
      resetDb.softDeleteTodo(rTrash.id);

      const wipedDataOnly = resetDb.resetAllData({ resetSettings: false });
      assert.equal(wipedDataOnly.todos.length, 0);
      assert.equal(wipedDataOnly.categories.length, 0);
      assert.equal(wipedDataOnly.trashedTodos.length, 0);
      assert.equal(wipedDataOnly.settings.themeId, 'purple');
      assert.equal(wipedDataOnly.settings.themeMode, 'dark');

      const wipedAll = resetDb.resetAllData({ resetSettings: true });
      assert.equal(wipedAll.settings.themeId, 'obsidian');
      assert.equal(wipedAll.settings.themeMode, 'light');
      assert.equal(wipedAll.settings.webhookEnabled ?? false, false);
      assert.equal(wipedAll.settings.webhookUrl ?? '', '');
    } finally {
      resetDb.close();
    }
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 8, retryDelay: 80 });
    } catch {
      // Ignore transient Windows WAL handle release delay in OS temp dir
    }
  }
});

test('QA: 100/100 True Headless Control - Cold-Start Zero-GUI CLI, All 18 MCP Tools (Offline & Live), Reorder, Cloud Push/Pull & Offline Signed Webhooks', async () => {
  const { execFile, execFileSync, spawn } = await import('node:child_process');
  const cryptoMod = await import('node:crypto');
  const httpMod = await import('node:http');
  const netMod = await import('node:net');

  const cliScript = path.join(process.cwd(), 'cli', 'agendamea.cjs');
  const mcpScript = path.join(process.cwd(), 'mcp', 'server.cjs');

  // 1. Cold-Start Zero-GUI Directory: agendamea.db does NOT exist yet!
  const coldDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agendamea-headless-cold-'));
  const cloudDir = path.join(coldDir, 'cloud-sync');
  const exportFile = path.join(coldDir, 'exports', 'full-backup.json');
  const coldEnv = {
    ...process.env,
    AGENDAMEA_DATA_DIR: coldDir,
    AGENDAMEA_FORCE_OFFLINE: '1',
    AGENDAMEA_CLI_LANG: 'tr',
  };

  // Async runner keeps in-process hookServer event loop responsive during offline webhook delivery
  const runCli = (args: string[], envOverride: NodeJS.ProcessEnv = coldEnv) =>
    new Promise<string>((resolve, reject) => {
      execFile(
        process.execPath,
        [cliScript, ...args],
        { env: envOverride, encoding: 'utf8', windowsHide: true },
        (err, stdout, stderr) => {
          if (err) {
            reject(new Error(`CLI failed (${args.join(' ')}): ${stderr || err.message}`));
            return;
          }
          resolve(stdout);
        },
      );
    });

  // Local webhook receiver to verify offline HMAC-SHA256 webhook delivery
  const offlineHooks: Array<{ event: string; sig: string; rawBody: string }> = [];
  const hookServer = httpMod.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      offlineHooks.push({
        event: String(req.headers['x-agendamea-event'] ?? ''),
        sig: String(req.headers['x-agendamea-signature'] ?? ''),
        rawBody: Buffer.concat(chunks).toString('utf8'),
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"ok":true}');
    });
  });
  await new Promise<void>((resolve) => hookServer.listen(0, '127.0.0.1', () => resolve()));
  const hookPort = (hookServer.address() as { port: number }).port;
  const hookUrl = `http://127.0.0.1:${hookPort}/offline-hook`;
  const hookSecret = 'headless-offline-secret';

  try {
    // 1A. Cold-start creates schema automatically on first command without GUI!
    const initStat = JSON.parse(await runCli(['stat', '-j']));
    assert.equal(initStat.ok, true);
    assert.equal(initStat.mode, 'offline-sqlite');
    assert.equal(initStat.activeTasks, 0);
    assert.ok(fs.existsSync(path.join(coldDir, 'agendamea.db')), 'Cold-start CLI must initialize SQLite DB automatically');

    // 1B. Full Help documents all headless sections
    const fullHelp = await runCli(['help', 'all']);
    for (const token of ['ag bak', 'ag edit', 'ag sub', 'ag cat', 'ag cop', 'ag matris', 'ag sync', 'ag config', 'ag reset', 'ag move']) {
      assert.ok(fullHelp.includes(token), `ag help all must include "${token}"`);
    }

    // 1C. Offline Webhook Configuration & Live Test + Event Dispatch
    await runCli(['hook', 'set', hookUrl, hookSecret]);
    const hookTestRes = JSON.parse(await runCli(['hook', 'test', '-j']));
    assert.equal(hookTestRes.ok, true);
    assert.equal(hookTestRes.statusCode, 200);
    assert.equal(offlineHooks.length, 1);
    assert.equal(offlineHooks[0].event, 'webhook.test');
    const expectedTestSig = `sha256=${cryptoMod.createHmac('sha256', hookSecret).update(offlineHooks[0].rawBody).digest('hex')}`;
    assert.equal(offlineHooks[0].sig, expectedTestSig);

    // 1D. Categories CRUD & Reorder
    const catWork = JSON.parse(await runCli(['cat', '+', 'Proje', '#7c3aed', '-j']));
    const catHome = JSON.parse(await runCli(['cat', '+', 'Kisisel', '--color', '#16a34a', '-j']));
    assert.equal(catWork.name, 'Proje');
    assert.equal(catWork.color, '#7c3aed');
    const catRenamed = JSON.parse(await runCli(['cat', 'edit', 'Proje', '--name', 'Urun', '--color', '#2563eb', '-j']));
    assert.equal(catRenamed.name, 'Urun');
    assert.equal(catRenamed.color, '#2563eb');
    const catMoved = JSON.parse(await runCli(['cat', 'move', 'Kisisel', '1', '-j']));
    assert.equal(catMoved.position, 1);
    const catsListed = JSON.parse(await runCli(['cat', '-j']));
    assert.equal(catsListed[0].id, catHome.id);

    // 1E. Rich Natural Task Creation (@start..due, HH:mm, !, *, ^, #tag, /Category, --note, --sub) + Offline Webhook Fired
    const richTask = JSON.parse(
      await runCli([
        '+', 'Lansman', 'plani',
        '@2026-11-20..2026-11-25', '14:30', '!', '*', '^', '#store', '/Urun',
        '--note', 'Tum paketler hazirlanacak',
        '--sub', 'MSIX dogrula',
        '--sub', 'SHA256 kontrol',
        '-j',
      ]),
    );
    assert.equal(richTask.title, 'Lansman plani');
    assert.equal(richTask.startDate, '2026-11-20');
    assert.equal(richTask.dueDate, '2026-11-25');
    assert.equal(richTask.dueTime, '14:30');
    assert.equal(richTask.priority, 'high');
    assert.equal(richTask.important, true);
    assert.equal(richTask.pinned, true);
    assert.deepEqual(richTask.tags, ['store']);
    assert.equal(richTask.categoryId, catWork.id);
    assert.equal(richTask.notes, 'Tum paketler hazirlanacak');
    assert.equal(richTask.subtasks.length, 2);
    assert.ok(offlineHooks.some((h) => h.event === 'todo.created'), 'Offline CLI add must dispatch configured webhook');

    // Second task for reorder, sort, search with --from/--to, and matrix
    const secondTask = JSON.parse(await runCli(['+', 'Fatura', 'odeme', '@bugun', '#finans', '/Kisisel', '-j']));
    assert.equal(secondTask.categoryId, catHome.id);

    // 1F. Task Detail (ag bak), Edit (ag edit), Pin (ag pin), Reorder (ag move)
    const detail = JSON.parse(await runCli(['bak', 'Lansman', '-j']));
    assert.equal(detail.categoryName, 'Urun');
    assert.equal(detail.subtasks.length, 2);

    const edited = JSON.parse(await runCli(['edit', 'Lansman', '--time', '16:45', '--note', 'Guncel not', '-j']));
    assert.equal(edited.dueTime, '16:45');
    assert.equal(edited.notes, 'Guncel not');

    const unpinned = JSON.parse(await runCli(['pin', 'Lansman', '-j']));
    assert.equal(unpinned.pinned, false);

    // Move Fatura to #1
    const movedTask = JSON.parse(await runCli(['move', 'Fatura', '1', '-j']));
    assert.equal(movedTask.position, 1);
    const activeAfterMove = JSON.parse(await runCli(['-j']));
    assert.equal(activeAfterMove[0].id, secondTask.id);

    // Search with --from & --to must NOT treat dates as query words!
    const rangedSearch = JSON.parse(await runCli(['ara', 'MSIX', '--from', '2026-11-18', '--to', '2026-11-22', '-j']));
    assert.equal(rangedSearch.length, 1);
    assert.equal(rangedSearch[0].id, richTask.id);

    // 1G. Subtasks CRUD (add, toggle, edit/rename, delete)
    const subAdded = JSON.parse(await runCli(['sub', 'Lansman', '+', 'Son kontrol', '-j']));
    assert.equal(subAdded.title, 'Son kontrol');
    const subToggled = JSON.parse(await runCli(['sub', 'Lansman', 'ok', '1', '-j']));
    assert.equal(subToggled.completed, true);
    const subRenamed = JSON.parse(await runCli(['sub', 'Lansman', 'edit', '3', 'Final kontrol', '-j']));
    assert.equal(subRenamed.title, 'Final kontrol');
    const subDeleted = JSON.parse(await runCli(['sub', 'Lansman', 'rm', 'Final', '-j']));
    assert.equal(subDeleted.ok, true);

    // 1H. Eisenhower Matrix
    const matrix = JSON.parse(await runCli(['matris', '-j']));
    assert.ok(matrix.q2.some((t: { id: string }) => t.id === richTask.id) || matrix.q1.some((t: { id: string }) => t.id === richTask.id));
    assert.ok(matrix.q3.some((t: { id: string }) => t.id === secondTask.id));

    // 1I. Cloud Sync Connect, Push, Reset, Pull Restore (Zero-GUI Recovery!)
    const cloudConnected = JSON.parse(await runCli(['sync', 'set', cloudDir, '-j']));
    assert.equal(cloudConnected.connected, true);
    const cloudPushed = JSON.parse(await runCli(['sync', '-j']));
    assert.equal(cloudPushed.ok, true);
    assert.ok(fs.existsSync(path.join(cloudDir, 'agendamea-onedrive-sync.json')));

    // Export JSON Backup
    const exportInfo = JSON.parse(await runCli(['export', exportFile, '-j']));
    assert.equal(exportInfo.ok, true);
    assert.equal(exportInfo.todos, 2);

    // Complete & Clear Completed + Trash Management (list, restore, permanent delete, empty)
    await runCli(['ok', 'Fatura', '-j']);
    const cleared = JSON.parse(await runCli(['temizle', '-j']));
    assert.equal(cleared.clearedCount, 1);
    const trashView = JSON.parse(await runCli(['cop', '-q', 'Fatura', '-j']));
    assert.equal(trashView.todos.length, 1);
    await runCli(['geri', 'Fatura']);
    const trashAfterRestore = JSON.parse(await runCli(['cop', '-j']));
    assert.equal(trashAfterRestore.todos.length, 0);
    await runCli(['rm', 'Fatura', '-j']);
    const permDel = JSON.parse(await runCli(['cop', 'sil', 'Fatura', '-j']));
    assert.equal(permDel.ok, true);
    await runCli(['cat', 'rm', 'Kisisel', '-j']);
    const emptied = JSON.parse(await runCli(['cop', 'bosalt', '--yes', '-j']));
    assert.equal(emptied.ok, true);
    assert.equal(emptied.deletedCategories, 1);

    // Config inspect & update + Clean Reset + Cloud Pull Restore + JSON Import
    const cfgDark = JSON.parse(await runCli(['config', 'themeMode', 'dark', '-j']));
    assert.equal(cfgDark.themeMode, 'dark');
    assert.equal((await runCli(['config', 'themeMode'])).trim(), 'dark');

    // Disable webhook before reset/import noise
    await runCli(['hook', 'off']);
    const resetRes = JSON.parse(await runCli(['reset', '--yes', '-j']));
    assert.equal(resetRes.todos.length, 0);
    assert.equal(resetRes.categories.length, 0);

    // Pull full state back from Cloud Folder offline!
    const pulled = JSON.parse(await runCli(['sync', 'pull', '-j']));
    assert.equal(pulled.ok, true);
    assert.ok(pulled.bootstrap.todos.length >= 1, 'Cloud pull must restore tasks offline');

    // Import exported backup file and verify full restoration (2 tasks, 2 categories)
    const imported = JSON.parse(await runCli(['import', exportFile, '-j']));
    assert.equal(imported.todos.length, 2);
    assert.equal(imported.categories.length, 2);

    // 2. ALL 18 MCP Tools Over Piped Stdio (Cold-Start Offline SQLite!)
    const mcpOfflineDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agendamea-mcp18-offline-'));
    const mcpCloudDir = path.join(mcpOfflineDir, 'cloud');
    const mcpExportPath = path.join(mcpOfflineDir, 'mcp-backup.json');
    const mcpEnv = {
      ...process.env,
      AGENDAMEA_DATA_DIR: mcpOfflineDir,
      AGENDAMEA_FORCE_OFFLINE: '1',
    };
    try {
      const requests = [
        { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
        { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
        { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'agendamea_status', arguments: {} } },
        { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'agendamea_manage_category', arguments: { action: 'create', name: 'AI Proje', color: '#7c3aed', pinned: true } } },
        { jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'agendamea_list_categories', arguments: {} } },
        { jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'agendamea_add_task', arguments: { title: 'MCP Tam Gorev', category: 'AI Proje', priority: 'high', important: true, dueDate: '2026-12-01', dueTime: '10:00', tags: ['mcp'], notes: 'Not', subtasks: ['Alt 1'] } } },
        { jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'agendamea_get_task', arguments: { id: '1' } } },
        { jsonrpc: '2.0', id: 8, method: 'tools/call', params: { name: 'agendamea_update_task', arguments: { id: '1', title: 'MCP Guncel Gorev', position: 1 } } },
        { jsonrpc: '2.0', id: 9, method: 'tools/call', params: { name: 'agendamea_pin_task', arguments: { id: '1', pinned: true } } },
        { jsonrpc: '2.0', id: 10, method: 'tools/call', params: { name: 'agendamea_manage_subtask', arguments: { action: 'add', taskId: '1', title: 'Alt 2' } } },
        { jsonrpc: '2.0', id: 11, method: 'tools/call', params: { name: 'agendamea_manage_subtask', arguments: { action: 'update', taskId: '1', subtaskId: '2', title: 'Alt 2 Rename', completed: true } } },
        { jsonrpc: '2.0', id: 12, method: 'tools/call', params: { name: 'agendamea_list_tasks', arguments: { filter: 'active', tag: 'mcp', sortBy: 'priority' } } },
        { jsonrpc: '2.0', id: 13, method: 'tools/call', params: { name: 'agendamea_eisenhower_matrix', arguments: {} } },
        { jsonrpc: '2.0', id: 14, method: 'tools/call', params: { name: 'agendamea_update_settings', arguments: { patch: { themeMode: 'dark', zoomPercent: 110 } } } },
        { jsonrpc: '2.0', id: 15, method: 'tools/call', params: { name: 'agendamea_get_settings', arguments: {} } },
        { jsonrpc: '2.0', id: 16, method: 'tools/call', params: { name: 'agendamea_backup_and_sync', arguments: { action: 'export', filePath: mcpExportPath } } },
        { jsonrpc: '2.0', id: 17, method: 'tools/call', params: { name: 'agendamea_backup_and_sync', arguments: { action: 'connect_cloud', folderPath: mcpCloudDir } } },
        { jsonrpc: '2.0', id: 18, method: 'tools/call', params: { name: 'agendamea_backup_and_sync', arguments: { action: 'cloud_status' } } },
        { jsonrpc: '2.0', id: 19, method: 'tools/call', params: { name: 'agendamea_complete_task', arguments: { id: '1', completed: true } } },
        { jsonrpc: '2.0', id: 20, method: 'tools/call', params: { name: 'agendamea_clear_completed', arguments: {} } },
        { jsonrpc: '2.0', id: 21, method: 'tools/call', params: { name: 'agendamea_list_trash', arguments: { sortBy: 'newest' } } },
        { jsonrpc: '2.0', id: 22, method: 'tools/call', params: { name: 'agendamea_manage_trash', arguments: { action: 'restore' } } },
        { jsonrpc: '2.0', id: 23, method: 'tools/call', params: { name: 'agendamea_delete_task', arguments: { id: 'MCP Guncel' } } },
        { jsonrpc: '2.0', id: 24, method: 'tools/call', params: { name: 'agendamea_manage_trash', arguments: { action: 'empty' } } },
        { jsonrpc: '2.0', id: 25, method: 'tools/call', params: { name: 'agendamea_backup_and_sync', arguments: { action: 'import', filePath: mcpExportPath } } },
      ];
      // Send requests sequentially in batches so dependent mutations execute strictly in order!
      const runMcpStep = (reqObj: Record<string, unknown>) => {
        const out = execFileSync(process.execPath, [mcpScript], {
          env: mcpEnv,
          input: `${JSON.stringify(reqObj)}\n`,
          encoding: 'utf8',
        });
        return JSON.parse(out.trim().split(/\r?\n/)[0]) as {
          id: number;
          result?: { isError?: boolean; tools?: Array<{ name: string }>; content?: Array<{ text: string }> };
        };
      };

      const initRes = runMcpStep(requests[0]);
      assert.equal(initRes.id, 1);
      const listToolsRes = runMcpStep(requests[1]);
      assert.equal(listToolsRes.result?.tools?.length, 22, 'MCP server must expose all 22 headless + AI/RAG tools');

      for (let i = 2; i < requests.length; i += 1) {
        const resp = runMcpStep(requests[i]);
        assert.notEqual(
          resp.result?.isError,
          true,
          `MCP step #${requests[i].id} (${(requests[i].params as { name?: string })?.name}) failed: ${resp.result?.content?.[0]?.text}`,
        );
      }

      // Verify restored task from final import step
      const finalCheck = runMcpStep({
        jsonrpc: '2.0',
        id: 99,
        method: 'tools/call',
        params: { name: 'agendamea_list_tasks', arguments: { filter: 'all' } },
      });
      const restoredTasks = JSON.parse(finalCheck.result?.content?.[0]?.text || '[]');
      assert.equal(restoredTasks.length, 1);
      assert.equal(restoredTasks[0].title, 'MCP Guncel Gorev');
      assert.equal(restoredTasks[0].subtasks.length, 2);
      assert.equal(restoredTasks[0].subtasks[1].title, 'Alt 2 Rename');
    } finally {
      fs.rmSync(mcpOfflineDir, { recursive: true, force: true });
    }

    // 3. Live-API Parity Check via Ephemeral Express Server (CLI + MCP against 127.0.0.1!)
    const livePort = await new Promise<number>((resolve, reject) => {
      const probe = netMod.createServer();
      probe.listen(0, '127.0.0.1', () => {
        const addr = probe.address() as { port: number };
        probe.close(() => resolve(addr.port));
      });
      probe.on('error', reject);
    });
    const liveDataDir = path.join(coldDir, 'live-api-dir');
    fs.mkdirSync(liveDataDir, { recursive: true });
    const tsxCli = path.join(process.cwd(), 'node_modules', 'tsx', 'dist', 'cli.mjs');
    const liveSrv = spawn(process.execPath, [tsxCli, path.join(process.cwd(), 'server.ts')], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NODE_ENV: 'production',
        HOST: '127.0.0.1',
        PORT: String(livePort),
        AGENDAMEA_DATA_DIR: liveDataDir,
      },
      stdio: 'ignore',
      windowsHide: true,
    });

    let liveReady = false;
    for (let i = 0; i < 40; i += 1) {
      try {
        const h = await fetch(`http://127.0.0.1:${livePort}/api/health`);
        if (h.ok) {
          liveReady = true;
          break;
        }
      } catch {
        // Wait
      }
      await new Promise((r) => setTimeout(r, 120));
    }
    assert.equal(liveReady, true, 'Live Express API must boot for live CLI/MCP parity test');
    try {
      const liveEnv = {
        ...process.env,
        AGENDAMEA_DATA_DIR: liveDataDir,
        AGENDAMEA_URL: `http://127.0.0.1:${livePort}`,
      };
      delete (liveEnv as Record<string, string | undefined>).AGENDAMEA_FORCE_OFFLINE;

      const liveStat = JSON.parse(
        execFileSync(process.execPath, [cliScript, 'stat', '-j'], { env: liveEnv, encoding: 'utf8' }),
      );
      assert.equal(liveStat.mode, 'live-api');

      execFileSync(process.execPath, [cliScript, 'cat', '+', 'Canli', '#2563eb', '-j'], { env: liveEnv, encoding: 'utf8' });
      const liveAdded = JSON.parse(
        execFileSync(process.execPath, [cliScript, '+', 'Canli', 'Gorev', '/Canli', '--sub', 'Alt A', '-j'], {
          env: liveEnv,
          encoding: 'utf8',
        }),
      );
      assert.equal(liveAdded.title, 'Canli Gorev');
      assert.equal(liveAdded.subtasks.length, 1);

      const liveMcpResp = JSON.parse(
        execFileSync(process.execPath, [mcpScript], {
          env: liveEnv,
          input: `${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'agendamea_status', arguments: {} } })}\n`,
          encoding: 'utf8',
        }).trim(),
      );
      const parsedLiveStatus = JSON.parse(liveMcpResp.result.content[0].text);
      assert.equal(parsedLiveStatus.mode, 'live-api');
      assert.equal(parsedLiveStatus.activeTasks, 1);
      assert.equal(parsedLiveStatus.categories, 1);
    } finally {
      liveSrv.kill();
      await new Promise<void>((resolve) => {
        if (liveSrv.exitCode !== null) resolve();
        else {
          liveSrv.once('exit', () => resolve());
          setTimeout(resolve, 600);
        }
      });
    }

    // 4. DocsSettingsSection exposes all 20 MCP tools + collapsible all-commands drawer
    const docsSrc = fs.readFileSync(path.join(process.cwd(), 'src', 'components', 'DocsSettingsSection.tsx'), 'utf8');
    assert.ok(docsSrc.includes('agendamea_backup_and_sync'), 'Docs must list backup/sync MCP tool');
    assert.ok(docsSrc.includes('agendamea_webhook_and_server'), 'Docs must list webhook/server MCP tool');
    assert.ok(docsSrc.includes('agendamea_views'), 'Docs must list views MCP tool');
    assert.ok(docsSrc.includes('docs-all-commands-toggle'), 'Docs must include collapsible all-commands drawer');
  } finally {
    hookServer.close();
    try {
      fs.rmSync(coldDir, { recursive: true, force: true, maxRetries: 8, retryDelay: 80 });
    } catch {
      // Ignore transient Windows WAL handle release delay in OS temp dir
    }
  }
});

test('QA: True 100/100 Headless Automation - Headless Webhook Daemon (ag serve), Multi-URL Retry & Logs, Full HMAC Incoming Webhooks, /reset SSE, Batch/Pipe CLI, Views, Zero-GUI Install & OS Bridge', async () => {
  const { execFile, execFileSync } = await import('node:child_process');
  const cryptoMod = await import('node:crypto');
  const httpMod = await import('node:http');
  const netMod = await import('node:net');

  const cliScript = path.join(process.cwd(), 'cli', 'agendamea.cjs');
  const mcpScript = path.join(process.cwd(), 'mcp', 'server.cjs');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agendamea-full100-'));
  const tmpBinDir = path.join(tmpDir, 'cli-bin');

  const runCliAsync = (args: string[], env: NodeJS.ProcessEnv, stdinText?: string) =>
    new Promise<string>((resolve, reject) => {
      const child = execFile(
        process.execPath,
        [cliScript, ...args],
        { env, encoding: 'utf8', windowsHide: true },
        (err, stdout, stderr) => {
          if (err) {
            reject(new Error(`CLI failed (${args.join(' ')}): ${stderr || err.message}`));
            return;
          }
          resolve(stdout);
        },
      );
      if (stdinText !== undefined && child.stdin) {
        child.stdin.write(stdinText);
        child.stdin.end();
      }
    });

  // 2 Webhook receivers: receiver A fails once with 503 then succeeds (tests automatic retry!), receiver B succeeds immediately (tests multi-URL!)
  let receiverAFailsRemaining = 1;
  const hooksA: Array<{ event: string; sig: string }> = [];
  const hooksB: Array<{ event: string; sig: string }> = [];

  const srvA = httpMod.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      if (receiverAFailsRemaining > 0) {
        receiverAFailsRemaining -= 1;
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end('{"error":"transient"}');
        return;
      }
      hooksA.push({
        event: String(req.headers['x-agendamea-event'] ?? ''),
        sig: String(req.headers['x-agendamea-signature'] ?? ''),
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"ok":true}');
    });
  });

  const srvB = httpMod.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      hooksB.push({
        event: String(req.headers['x-agendamea-event'] ?? ''),
        sig: String(req.headers['x-agendamea-signature'] ?? ''),
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"ok":true}');
    });
  });

  await new Promise<void>((resolve) => srvA.listen(0, '127.0.0.1', () => resolve()));
  await new Promise<void>((resolve) => srvB.listen(0, '127.0.0.1', () => resolve()));
  const urlA = `http://127.0.0.1:${(srvA.address() as { port: number }).port}/a`;
  const urlB = `http://127.0.0.1:${(srvB.address() as { port: number }).port}/b`;
  const secret = 'super-hmac-secret-100';

  const daemonPort = await new Promise<number>((resolve, reject) => {
    const p = netMod.createServer();
    p.listen(0, '127.0.0.1', () => {
      const addr = p.address() as { port: number };
      p.close(() => resolve(addr.port));
    });
    p.on('error', reject);
  });

  const baseEnv: NodeJS.ProcessEnv = {
    ...process.env,
    AGENDAMEA_DATA_DIR: tmpDir,
    AGENDAMEA_CLI_LANG: 'tr',
  };
  delete baseEnv.AGENDAMEA_FORCE_OFFLINE;
  const offlineEnv: NodeJS.ProcessEnv = { ...baseEnv, AGENDAMEA_FORCE_OFFLINE: '1' };

  try {
    // 1. Zero-GUI CLI Install & Uninstall (isolated bin dir, no HKCU PATH mutation)
    const installed = JSON.parse(await runCliAsync(['install', '--dir', tmpBinDir, '--no-path', '-j'], offlineEnv));
    assert.equal(installed.ok, true);
    assert.ok(fs.existsSync(path.join(tmpBinDir, 'ag.cmd')));
    assert.ok(fs.existsSync(path.join(tmpBinDir, 'run-cli.ps1')));
    const uninstalled = JSON.parse(await runCliAsync(['uninstall', '--dir', tmpBinDir, '--no-path', '-j'], offlineEnv));
    assert.equal(uninstalled.ok, true);
    assert.equal(fs.existsSync(path.join(tmpBinDir, 'ag.cmd')), false);

    // 2. OS-Level Settings Bridge (window-prefs.json + dynamic .ico generated completely offline!)
    await runCliAsync(['config', 'closeBehavior', 'tray', '-j'], offlineEnv);
    await runCliAsync(['config', 'appIconId', 'purple', '-j'], offlineEnv);
    const prefsFile = path.join(tmpDir, 'window-prefs.json');
    assert.ok(fs.existsSync(prefsFile), 'Offline CLI config must sync window-prefs.json');
    const savedPrefs = JSON.parse(fs.readFileSync(prefsFile, 'utf8'));
    assert.equal(savedPrefs.closeBehavior, 'tray');
    const activeIconMetaPath = path.join(tmpDir, 'active-icon.json');
    assert.ok(fs.existsSync(activeIconMetaPath), 'Offline CLI appIconId change must write active-icon.json');
    const activeIconMeta = JSON.parse(fs.readFileSync(activeIconMetaPath, 'utf8'));
    assert.equal(activeIconMeta.bg, '#7c3aed');
    assert.ok(fs.existsSync(activeIconMeta.icoPath), 'Offline CLI appIconId change must regenerate dynamic .ico');

    // 3. Offline Cloud Provider Auto-Detection
    const cloudSt = JSON.parse(await runCliAsync(['sync', 'status'], offlineEnv));
    assert.ok(Array.isArray(cloudSt.detectedProviders) && cloudSt.detectedProviders.length === 4);

    // 4. Stdin Pipe Batch Add (`ag + -`), Batch Complete (`ag ok 1 2`), Batch Delete (`ag rm 1,2`), Calendar & Kanban Views, Stdin Import (`ag import -`)
    const pipedAdded = JSON.parse(
      await runCliAsync(
        ['+', '-', '-j'],
        offlineEnv,
        'Gorev Bir @2026-12-01 09:00 !\nGorev Iki @2026-12-02\nGorev Uc\n',
      ),
    );
    assert.equal(pipedAdded.length, 3);

    const calAgenda = JSON.parse(await runCliAsync(['cal', '-j'], offlineEnv));
    assert.ok(Array.isArray(calAgenda.grouped['2026-12-01']));
    assert.equal(calAgenda.undated.length, 1);

    const kanbanBoard = JSON.parse(await runCliAsync(['kanban', 'priority', '-j'], offlineEnv));
    assert.equal(kanbanBoard.columns.high.length, 1);
    assert.equal(kanbanBoard.columns.normal.length, 2);

    const exportedJson = await runCliAsync(['export'], offlineEnv);
    const batchDone = JSON.parse(await runCliAsync(['ok', '1', '2', '-j'], offlineEnv));
    assert.equal(batchDone.length, 2);
    assert.ok(batchDone.every((t: { completed: boolean }) => t.completed === true));

    // Restore from stdin pipe (`ag import -`) then test comma batch delete (`ag rm 1,2`)
    const importedFromPipe = JSON.parse(await runCliAsync(['import', '-', '-j'], offlineEnv, exportedJson));
    assert.equal(importedFromPipe.todos.length, 3);
    const batchDel = JSON.parse(await runCliAsync(['rm', '1,2', '-j'], offlineEnv));
    assert.equal(batchDel.length, 2);
    assert.ok(batchDel.every((r: { movedToTrash: boolean }) => r.movedToTrash === true));

    // 5. Multi-URL Outgoing Webhook + Auto-Retry (503 -> 200) + Event Filtering + Persistent Logs
    await runCliAsync(['hook', 'set', `${urlA},${urlB}`, secret, '-j'], offlineEnv);
    await runCliAsync(['hook', 'events', 'todo.created,category.created', '-j'], offlineEnv);

    const multiTest = JSON.parse(await runCliAsync(['hook', 'test', '-j'], offlineEnv));
    assert.equal(multiTest.ok, true, 'Multi-URL webhook test must retry transient 503 on receiver A and succeed on both');
    assert.equal(multiTest.results.length, 2);
    assert.equal(hooksA.length, 1);
    assert.equal(hooksB.length, 1);

    // Filtered-out event (todo.deleted) must NOT fire outgoing webhook, while todo.created MUST fire!
    const createdForFilter = JSON.parse(await runCliAsync(['+', 'Filter', 'Test', '-j'], offlineEnv));
    assert.equal(hooksA.length, 2);
    assert.equal(hooksB.length, 2);
    await runCliAsync(['rm', createdForFilter.id, '-j'], offlineEnv);
    assert.equal(hooksA.length, 2, 'Filtered-out todo.deleted event must not be dispatched');

    const logsBeforeClear = JSON.parse(await runCliAsync(['hook', 'logs', '-j'], offlineEnv));
    assert.ok(logsBeforeClear.length >= 4);
    assert.ok(logsBeforeClear.some((l: { attempts: number; ok: boolean }) => l.attempts === 2 && l.ok === true));

    // 6. Start Headless API & Incoming Webhook Daemon (`ag serve start`) WITHOUT GUI!
    const started = JSON.parse(
      await runCliAsync(['serve', 'start', '--port', String(daemonPort), '-j'], baseEnv),
    );
    assert.equal(started.ok, true);
    assert.equal(started.running, true);
    assert.equal(started.headless, true);
    assert.equal(started.port, daemonPort);

    const daemonStatus = JSON.parse(await runCliAsync(['serve', 'status', '-j'], baseEnv));
    assert.equal(daemonStatus.running, true);
    assert.equal(daemonStatus.headless, true);

    const sendSignedIncoming = async (payload: Record<string, unknown>) => {
      const raw = JSON.stringify(payload);
      const sig = `sha256=${cryptoMod.createHmac('sha256', secret).update(raw).digest('hex')}`;
      const r = await fetch(started.incomingWebhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Agendamea-Signature': sig,
        },
        body: raw,
      });
      return { status: r.status, body: await r.json() };
    };

    // 6A. Full Incoming Webhook Actions Authenticated via HMAC-SHA256 Signature!
    const incCat = await sendSignedIncoming({ action: 'category.create', name: 'Otomasyon', color: '#7c3aed' });
    assert.equal(incCat.status, 201);
    const incAdd = await sendSignedIncoming({
      action: 'add',
      title: 'n8n Gorevi',
      category: 'Otomasyon',
      startDate: '2026-12-10',
      dueDate: '2026-12-12',
      dueTime: '11:30',
      pinned: true,
      subtasks: ['Adim A'],
    });
    assert.equal(incAdd.status, 201);
    assert.equal(incAdd.body.todo.pinned, true);
    assert.equal(incAdd.body.todo.subtasks.length, 1);

    const incUpd = await sendSignedIncoming({ action: 'update', id: 'n8n Gorevi', notes: 'HMAC guncel' });
    assert.equal(incUpd.status, 200);
    assert.equal(incUpd.body.todo.notes, 'HMAC guncel');

    const incSubAdd = await sendSignedIncoming({ action: 'subtask.add', taskId: 'n8n Gorevi', title: 'Adim B' });
    assert.equal(incSubAdd.status, 201);
    const incSubToggle = await sendSignedIncoming({ action: 'subtask.toggle', taskId: 'n8n Gorevi', subtaskId: 'Adim B' });
    assert.equal(incSubToggle.status, 200);
    assert.equal(incSubToggle.body.subtask.completed, true);
    const incSubDel = await sendSignedIncoming({ action: 'subtask.delete', taskId: 'n8n Gorevi', subtaskId: 'Adim B' });
    assert.equal(incSubDel.status, 200);

    const incDel = await sendSignedIncoming({ action: 'delete', id: 'n8n Gorevi' });
    assert.equal(incDel.status, 200);
    const incRestore = await sendSignedIncoming({ action: 'restore', id: 'n8n Gorevi' });
    assert.equal(incRestore.status, 200);
    assert.equal(incRestore.body.kind, 'todo');

    // 6B. Verify SSE Stream Receives Live Change Event on POST /api/reset!
    let sseReceivedReset = false;
    const sseReq = httpMod.get(`${started.url}/api/events`, (sseRes) => {
      sseRes.on('data', (chunk: Buffer) => {
        if (chunk.toString('utf8').includes('/reset')) {
          sseReceivedReset = true;
        }
      });
    });
    await new Promise((r) => setTimeout(r, 150));
    await fetch(`${started.url}/api/reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resetSettings: false }),
    });
    for (let i = 0; i < 20 && !sseReceivedReset; i += 1) {
      await new Promise((r) => setTimeout(r, 40));
    }
    sseReq.destroy();
    assert.equal(sseReceivedReset, true, 'POST /api/reset must broadcast SSE refresh event to open UI');

    // 6C. Verify MCP Tools #19 (agendamea_views) & #20 (agendamea_webhook_and_server) Against Live Headless Daemon!
    const callMcp = (name: string, args: Record<string, unknown>) => {
      const out = execFileSync(process.execPath, [mcpScript], {
        env: baseEnv,
        input: `${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } })}\n`,
        encoding: 'utf8',
      });
      const parsed = JSON.parse(out.trim().split(/\r?\n/)[0]);
      assert.notEqual(parsed.result?.isError, true, `MCP ${name} failed: ${parsed.result?.content?.[0]?.text}`);
      return JSON.parse(parsed.result.content[0].text);
    };

    const mcpLogs = callMcp('agendamea_webhook_and_server', { action: 'webhook_logs', limit: 30 });
    assert.ok(mcpLogs.some((l: { direction: string }) => l.direction === 'incoming'), 'Incoming webhook calls must be logged');
    const mcpSrvStatus = callMcp('agendamea_webhook_and_server', { action: 'server_status' });
    assert.equal(mcpSrvStatus.running, true);
    const mcpCal = callMcp('agendamea_views', { view: 'calendar' });
    assert.ok(mcpCal && typeof mcpCal.grouped === 'object');
    const mcpKanban = callMcp('agendamea_views', { view: 'kanban', groupBy: 'status' });
    assert.equal(mcpKanban.groupBy, 'status');

    // 6D. Stop Headless Daemon Cleanly via `ag serve stop`!
    const stopped = JSON.parse(await runCliAsync(['serve', 'stop', '-j'], baseEnv));
    assert.equal(stopped.ok, true);
    assert.equal(stopped.stopped, true);
    const afterStop = JSON.parse(await runCliAsync(['serve', 'status', '-j'], baseEnv));
    assert.equal(afterStop.running, false);

    // 6E. Third-Pass Audit Regressions: Zoom preset helpers, pre-release semver & Eisenhower Q1->Q2 startDate clear
    assert.equal(getNextZoomPreset(115), 125);
    assert.equal(getPrevZoomPreset(115), 110);
    assert.equal(getNextZoomPreset(135), 150);
    assert.equal(getPrevZoomPreset(135), 125);
    assert.equal(getNextZoomPreset(150), 150);
    assert.equal(getPrevZoomPreset(80), 80);

    assert.equal(compareSemver('1.1.0', '1.1.0-beta.1'), 1);
    assert.equal(compareSemver('1.1.0-alpha.1', '1.1.0'), -1);
    assert.ok(compareSemver('1.1.0-beta.2', '1.1.0-beta.1') > 0);

    const todaySample = '2026-11-22';
    const tomorrowSample = addDaysToDateString(todaySample, 1);
    assert.equal(
      classifyEisenhowerQuadrant(
        { important: true, priority: 'high', startDate: null, dueDate: tomorrowSample },
        todaySample,
      ),
      'q2',
    );
  } finally {
    try {
      await runCliAsync(['serve', 'stop', '-j'], baseEnv);
    } catch {
      // Ignore if already stopped
    }
    srvA.close();
    srvB.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});




