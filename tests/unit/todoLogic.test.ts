import assert from 'node:assert/strict';
import test from 'node:test';
import type { Category, Todo } from '../../src/types';
import {
  CATEGORY_COLORS,
  COLOR_THEMES,
  isValidThemeId,
  normalizeHexColor,
} from '../../src/utils/themes';
import {
  addDaysToDateString,
  computeViewCounts,
  filterAndSortTodos,
  formatDueDateLabel,
  isValidIsoDateString,
} from '../../src/utils/todoLogic';

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
  assert.equal(res[0]?.id, 't1');

  const subRes = filterAndSortTodos({
    todos: sampleTodos,
    activeView: { type: 'smart', id: 'all' },
    statusFilter: 'all',
    searchQuery: 'kapak',
    sortBy: 'manual',
    todayStr: '2026-11-19',
  });
  assert.equal(subRes.length, 1);
  assert.equal(subRes[0]?.id, 't1');
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
