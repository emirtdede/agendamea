'use strict';

const textNormalize = require('../textNormalize.cjs');
const {
  APP_VERSION,
  getTodayStr,
  isValidIsoDate,
  normalizeDateRange,
} = require('./httpTransport.cjs');
const { getBootstrap } = require('./offlineDb.cjs');

function orderActiveFirst(todos) {
  return [...todos].sort((a, b) => {
    if (Boolean(a.completed) !== Boolean(b.completed)) return a.completed ? 1 : -1;
    if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
    if ((a.sortOrder ?? 0) !== (b.sortOrder ?? 0)) return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
    return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
  });
}

function resolveTaskSelector(todos, selector) {
  const raw = String(selector || '').trim();
  if (!raw) throw new Error('Task number, title keyword, or ID is required.');

  const ordered = orderActiveFirst(todos);
  const activeOnly = ordered.filter((t) => !t.completed);

  if (/^\d+$/.test(raw)) {
    const idx = Number.parseInt(raw, 10);
    const pool = activeOnly.length > 0 ? activeOnly : ordered;
    if (idx >= 1 && idx <= pool.length) return pool[idx - 1];
    throw new Error(`Task #${idx} not found (1-${pool.length}).`);
  }

  const lower = raw.toLowerCase();
  const exact = ordered.find((t) => t.id.toLowerCase() === lower);
  if (exact) return exact;

  const prefixMatches = ordered.filter((t) => {
    const idLow = t.id.toLowerCase();
    const shortLow = idLow.startsWith('todo-') ? idLow.slice(5) : idLow;
    return idLow.startsWith(lower) || shortLow.startsWith(lower);
  });
  if (prefixMatches.length === 1) return prefixMatches[0];
  if (prefixMatches.length > 1) {
    throw new Error(`Ambiguous ID prefix "${raw}" (${prefixMatches.length} matches).`);
  }

  const titleMatches = ordered.filter((t) => textNormalize.matchesNormalized(t.title, raw));
  if (titleMatches.length === 1) return titleMatches[0];
  if (titleMatches.length > 1) {
    const activeMatches = titleMatches.filter((t) => !t.completed);
    if (activeMatches.length === 1) return activeMatches[0];
    const preview = titleMatches
      .slice(0, 4)
      .map((t, i) => `${i + 1}. ${t.title}`)
      .join(' | ');
    throw new Error(`Multiple tasks matched "${raw}": ${preview}`);
  }

  throw new Error(`Task not found: "${raw}".`);
}

function resolveCategorySelector(categories, selector) {
  const raw = String(selector || '').trim();
  if (!raw) throw new Error('Category number, name, or ID is required.');
  if (/^\d+$/.test(raw)) {
    const idx = Number.parseInt(raw, 10);
    if (idx >= 1 && idx <= categories.length) return categories[idx - 1];
    throw new Error(`Category #${idx} not found (1-${categories.length}).`);
  }
  const lower = raw.toLowerCase();
  const exactId = categories.find((c) => c.id.toLowerCase() === lower);
  if (exactId) return exactId;
  const exactName = categories.find((c) => textNormalize.equalsNormalized(c.name, raw));
  if (exactName) return exactName;
  const partial = categories.filter(
    (c) => c.id.toLowerCase().startsWith(lower) || textNormalize.matchesNormalized(c.name, raw),
  );
  if (partial.length === 1) return partial[0];
  if (partial.length > 1) {
    throw new Error(`Multiple categories matched "${raw}".`);
  }
  throw new Error(`Category not found: "${raw}".`);
}

function resolveSubtaskSelector(subtasks, selector) {
  const list = Array.isArray(subtasks) ? subtasks : [];
  const raw = String(selector || '').trim();
  if (!raw) throw new Error('Subtask number, keyword, or ID is required.');
  if (/^\d+$/.test(raw)) {
    const idx = Number.parseInt(raw, 10);
    if (idx >= 1 && idx <= list.length) return list[idx - 1];
    throw new Error(`Subtask #${idx} not found (1-${list.length}).`);
  }
  const lower = raw.toLowerCase();
  const exact = list.find((s) => s.id.toLowerCase() === lower);
  if (exact) return exact;
  const matches = list.filter(
    (s) => s.id.toLowerCase().startsWith(lower) || textNormalize.matchesNormalized(s.title, raw),
  );
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) throw new Error(`Multiple subtasks matched "${raw}".`);
  throw new Error(`Subtask not found: "${raw}".`);
}

function matchesTaskDateRange(todo, dateFrom, dateTo) {
  const from = typeof dateFrom === 'string' && isValidIsoDate(dateFrom) ? dateFrom.trim() : '';
  const to = typeof dateTo === 'string' && isValidIsoDate(dateTo) ? dateTo.trim() : '';
  if (!from && !to) return true;
  const minBound = from && to && from > to ? to : from;
  const maxBound = from && to && from > to ? from : to;
  const start = todo.startDate || todo.dueDate || null;
  const end = todo.dueDate || todo.startDate || null;
  if (!start || !end) return false;
  if (minBound && end < minBound) return false;
  if (maxBound && start > maxBound) return false;
  return true;
}

function isScheduledToday(todo, today) {
  const { startDate, dueDate } = normalizeDateRange(todo.startDate, todo.dueDate);
  if (dueDate && dueDate <= today) return true;
  if (startDate && startDate <= today && (!dueDate || dueDate >= today)) return true;
  return false;
}

function applyTaskFilters(todos, categories, options = {}) {
  const filter = options.filter || 'active';
  const today = options.today || getTodayStr();
  let list = orderActiveFirst(todos);
  if (filter === 'active') list = list.filter((t) => !t.completed);
  else if (filter === 'completed') list = list.filter((t) => t.completed);
  else if (filter === 'today')
    list = list.filter((t) => !t.completed && isScheduledToday(t, today));
  else if (filter === 'important') list = list.filter((t) => !t.completed && t.important);
  else if (filter === 'pinned') list = list.filter((t) => !t.completed && t.pinned);

  if (typeof options.category === 'string' && options.category.trim()) {
    if (options.tolerateMissingCategory) {
      try {
        const matchedCat = resolveCategorySelector(categories || [], options.category.trim());
        list = list.filter((t) => t.categoryId === matchedCat.id);
      } catch {
        list = [];
      }
    } else {
      const matchedCat = resolveCategorySelector(categories || [], options.category.trim());
      list = list.filter((t) => t.categoryId === matchedCat.id);
    }
  }

  if (options.priority === 'high' || options.priority === 'normal' || options.priority === 'low') {
    list = list.filter((t) => t.priority === options.priority);
  }

  if (typeof options.tag === 'string' && options.tag.trim()) {
    const wantedTag = options.tag.trim().replace(/^#+/, '');
    list = list.filter(
      (t) =>
        Array.isArray(t.tags) && t.tags.some((tg) => textNormalize.equalsNormalized(tg, wantedTag)),
    );
  }

  if (options.dateFrom || options.dateTo) {
    list = list.filter((t) => matchesTaskDateRange(t, options.dateFrom, options.dateTo));
  }

  if (typeof options.query === 'string' && options.query.trim()) {
    const rawQ = options.query.trim();
    const rawTagQ = rawQ.replace(/^#+/, '');
    list = list.filter((t) => {
      const inTitle = textNormalize.matchesNormalized(t.title, rawQ);
      const inNotes = textNormalize.matchesNormalized(t.notes, rawQ);
      const inTags =
        Array.isArray(t.tags) && t.tags.some((tg) => textNormalize.matchesNormalized(tg, rawTagQ));
      const inSubtasks =
        Array.isArray(t.subtasks) &&
        t.subtasks.some((s) => textNormalize.matchesNormalized(s.title, rawQ));
      return inTitle || inNotes || inTags || inSubtasks;
    });
  }

  const sortBy = options.sortBy || 'manual';
  if (sortBy !== 'manual') {
    const priRank = { high: 0, normal: 1, low: 2 };
    list = [...list].sort((a, b) => {
      if (Boolean(a.completed) !== Boolean(b.completed)) return a.completed ? 1 : -1;
      if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
      if (sortBy === 'priority') {
        const diff = (priRank[a.priority] ?? 1) - (priRank[b.priority] ?? 1);
        if (diff !== 0) return diff;
      } else if (sortBy === 'dueDate') {
        const ad = a.dueDate || a.startDate || '9999-12-31';
        const bd = b.dueDate || b.startDate || '9999-12-31';
        if (ad !== bd) return ad.localeCompare(bd);
        const at = a.dueTime || '99:99';
        const bt = b.dueTime || '99:99';
        if (at !== bt) return at.localeCompare(bt);
      } else if (sortBy === 'newest') {
        return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
      }
      return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
    });
  }
  return list;
}

function buildEisenhowerMatrix(todos, today = getTodayStr()) {
  const active = orderActiveFirst(todos).filter((t) => !t.completed);
  const matrix = { q1: [], q2: [], q3: [], q4: [] };
  for (const todo of active) {
    const isImp = Boolean(todo.important || todo.priority === 'high');
    const isUrg = isScheduledToday(todo, today);
    if (isImp && isUrg) matrix.q1.push(todo);
    else if (isImp && !isUrg) matrix.q2.push(todo);
    else if (!isImp && isUrg) matrix.q3.push(todo);
    else matrix.q4.push(todo);
  }
  return matrix;
}

function buildCalendarAgenda(todos, categories, options = {}) {
  const list = applyTaskFilters(todos, categories, {
    filter: options.includeCompleted ? 'all' : 'active',
    dateFrom: options.dateFrom,
    dateTo: options.dateTo,
    sortBy: 'dueDate',
    today: options.today,
  });
  const grouped = {};
  const undated = [];
  for (const todo of list) {
    const key = todo.dueDate || todo.startDate || null;
    if (!key) {
      undated.push(todo);
    } else {
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(todo);
    }
  }
  const orderedGrouped = {};
  for (const key of Object.keys(grouped).sort()) {
    orderedGrouped[key] = grouped[key];
  }
  return { grouped: orderedGrouped, undated };
}

function buildKanbanBoard(todos, groupBy = 'priority') {
  const ordered = orderActiveFirst(todos);
  if (groupBy === 'status') {
    return {
      groupBy: 'status',
      columns: {
        active: ordered.filter((t) => !t.completed),
        completed: ordered.filter((t) => t.completed),
      },
    };
  }
  const active = ordered.filter((t) => !t.completed);
  return {
    groupBy: 'priority',
    columns: {
      high: active.filter((t) => t.priority === 'high'),
      normal: active.filter((t) => t.priority === 'normal'),
      low: active.filter((t) => t.priority === 'low'),
    },
  };
}

async function getStatus() {
  const { mode, endpoint, bootstrap } = await getBootstrap();
  const today = getTodayStr();
  const active = bootstrap.todos.filter((t) => !t.completed);
  return {
    ok: true,
    mode,
    endpoint,
    version: APP_VERSION,
    activeTasks: active.length,
    dueToday: active.filter((t) => isScheduledToday(t, today)).length,
    important: active.filter((t) => t.important).length,
    pinned: active.filter((t) => t.pinned).length,
    completedTasks: bootstrap.todos.filter((t) => t.completed).length,
    categories: bootstrap.categories.length,
    trashCount: bootstrap.trashedTodos.length + bootstrap.trashedCategories.length,
  };
}

async function listTasks(options = {}) {
  const { bootstrap } = await getBootstrap();
  return applyTaskFilters(bootstrap.todos, bootstrap.categories, options);
}

async function getTask(selector) {
  const { bootstrap } = await getBootstrap();
  const task = resolveTaskSelector(bootstrap.todos, selector);
  const category = task.categoryId
    ? bootstrap.categories.find((c) => c.id === task.categoryId) || null
    : null;
  return { ...task, categoryName: category ? category.name : null };
}

async function getMatrix() {
  const { bootstrap } = await getBootstrap();
  return buildEisenhowerMatrix(bootstrap.todos, getTodayStr());
}

async function getCalendarAgenda(options = {}) {
  const { bootstrap } = await getBootstrap();
  return buildCalendarAgenda(bootstrap.todos, bootstrap.categories, options);
}

async function getKanbanBoard(groupBy = 'priority') {
  const { bootstrap } = await getBootstrap();
  return buildKanbanBoard(bootstrap.todos, groupBy);
}

module.exports = {
  orderActiveFirst,
  resolveTaskSelector,
  resolveCategorySelector,
  resolveSubtaskSelector,
  matchesTaskDateRange,
  isScheduledToday,
  applyTaskFilters,
  buildEisenhowerMatrix,
  buildCalendarAgenda,
  buildKanbanBoard,
  getStatus,
  listTasks,
  getTask,
  getMatrix,
  getCalendarAgenda,
  getKanbanBoard,
};
