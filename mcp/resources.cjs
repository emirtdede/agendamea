'use strict';

const store = require('../shared/localStore.cjs');

const MAX_RESOURCE_ITEMS = 200;
const MAX_RESOURCE_BYTES = 128 * 1024;
const MAX_NOTE_PREVIEW = 400;

function compactTaskForResource(task, minimal = false) {
  if (minimal) {
    return {
      id: task.id,
      title: task.title,
      priority: task.priority,
      dueDate: task.dueDate || null,
      dueTime: task.dueTime || null,
      categoryId: task.categoryId || null,
      completed: Boolean(task.completed),
    };
  }
  const notes =
    typeof task.notes === 'string' && task.notes.length > MAX_NOTE_PREVIEW
      ? `${task.notes.slice(0, MAX_NOTE_PREVIEW)}...`
      : task.notes || '';
  return {
    id: task.id,
    title: task.title,
    notes,
    completed: Boolean(task.completed),
    important: Boolean(task.important),
    pinned: Boolean(task.pinned),
    priority: task.priority,
    startDate: task.startDate || null,
    dueDate: task.dueDate || null,
    dueTime: task.dueTime || null,
    tags: Array.isArray(task.tags) ? task.tags : [],
    categoryId: task.categoryId || null,
    subtaskCount: Array.isArray(task.subtasks) ? task.subtasks.length : 0,
  };
}

function capResourceTasks(tasks, extra = {}) {
  const totalCount = tasks.length;
  const sliced = tasks.slice(0, MAX_RESOURCE_ITEMS);
  /** @type {Record<string, any>} */
  let payload = {
    ...extra,
    totalCount,
    returnedCount: sliced.length,
    truncated: totalCount > sliced.length,
    tasks: sliced.map((t) => compactTaskForResource(t, false)),
  };
  let serialized = JSON.stringify(payload, null, 2);
  if (Buffer.byteLength(serialized, 'utf8') > MAX_RESOURCE_BYTES) {
    payload = {
      ...extra,
      totalCount,
      returnedCount: sliced.length,
      truncated: true,
      compactFallback: true,
      hint: 'Read individual full task details via agendamea://task/{id}',
      tasks: sliced.map((t) => compactTaskForResource(t, true)),
    };
    serialized = JSON.stringify(payload, null, 2);
  }
  return serialized;
}

async function readResource(uri, activeStore = store) {
  const cleanUri = String(uri || '').trim();
  if (cleanUri === 'agendamea://status') {
    const data = await activeStore.getStatus();
    return { uri: cleanUri, mimeType: 'application/json', text: JSON.stringify(data, null, 2) };
  }
  if (cleanUri === 'agendamea://tasks/today') {
    const tasks = await activeStore.listTasks({ filter: 'today' });
    return {
      uri: cleanUri,
      mimeType: 'application/json',
      text: capResourceTasks(tasks, { view: 'today' }),
    };
  }
  if (cleanUri === 'agendamea://tasks/overdue') {
    const today = activeStore.getTodayStr();
    const active = await activeStore.listTasks({ filter: 'active' });
    const overdue = active.filter((t) => t.dueDate && t.dueDate < today);
    return {
      uri: cleanUri,
      mimeType: 'application/json',
      text: capResourceTasks(overdue, { view: 'overdue', today }),
    };
  }
  if (cleanUri === 'agendamea://matrix') {
    const matrix = await activeStore.getMatrix();
    const capQ = (arr) =>
      Array.isArray(arr) ? arr.slice(0, 50).map((t) => compactTaskForResource(t, true)) : [];
    const payload = {
      q1: capQ(matrix.q1),
      q2: capQ(matrix.q2),
      q3: capQ(matrix.q3),
      q4: capQ(matrix.q4),
      totals: {
        q1: (matrix.q1 || []).length,
        q2: (matrix.q2 || []).length,
        q3: (matrix.q3 || []).length,
        q4: (matrix.q4 || []).length,
      },
    };
    return { uri: cleanUri, mimeType: 'application/json', text: JSON.stringify(payload, null, 2) };
  }
  if (cleanUri === 'agendamea://categories') {
    const cats = await activeStore.listCategories();
    return {
      uri: cleanUri,
      mimeType: 'application/json',
      text: JSON.stringify(
        { count: cats.length, categories: cats.slice(0, MAX_RESOURCE_ITEMS) },
        null,
        2,
      ),
    };
  }

  const taskMatch = /^agendamea:\/\/task\/(.+)$/i.exec(cleanUri);
  if (taskMatch) {
    const id = decodeURIComponent(taskMatch[1]);
    const task = await activeStore.getTask(id);
    return { uri: cleanUri, mimeType: 'application/json', text: JSON.stringify(task, null, 2) };
  }

  const catMatch = /^agendamea:\/\/category\/([^/]+)\/tasks$/i.exec(cleanUri);
  if (catMatch) {
    const name = decodeURIComponent(catMatch[1]);
    const tasks = await activeStore.listTasks({ filter: 'active', category: name });
    return {
      uri: cleanUri,
      mimeType: 'application/json',
      text: capResourceTasks(tasks, { category: name }),
    };
  }

  const err = /** @type {Error & { rpcCode?: number }} */ (
    new Error(`Resource not found: ${cleanUri}`)
  );
  err.rpcCode = -32002;
  throw err;
}

async function getPrompt(name, args, activeStore = store) {
  const input = args && typeof args === 'object' ? args : {};
  const today = activeStore.getTodayStr();

  if (name === 'daily_plan') {
    const todayTasks = await activeStore.listTasks({ filter: 'today', sortBy: 'priority' });
    const hours = input.focusHours ? `Available focus hours: ${input.focusHours}.` : '';
    const text = [
      `Create an actionable time-blocked plan for ${today}. ${hours}`.trim(),
      'Prioritize urgent/high-priority items first, group small tasks, and flag overload.',
      `Current today/overdue tasks (${todayTasks.length}):`,
      capResourceTasks(todayTasks, { today }),
    ].join('\n\n');
    return {
      description: 'Daily focus plan generated from live Agendamea today tasks.',
      messages: [{ role: 'user', content: { type: 'text', text } }],
    };
  }

  if (name === 'triage_overdue') {
    const active = await activeStore.listTasks({ filter: 'active' });
    const overdue = active.filter((t) => t.dueDate && t.dueDate < today);
    const text = [
      `Review these ${overdue.length} overdue tasks as of ${today}.`,
      'For each item recommend one action: Do Today, Reschedule (suggest date), Lower Priority, or Move to Trash.',
      capResourceTasks(overdue, { today }),
    ].join('\n\n');
    return {
      description: 'Overdue backlog triage workflow.',
      messages: [{ role: 'user', content: { type: 'text', text } }],
    };
  }

  if (name === 'eisenhower_review') {
    const res = await readResource('agendamea://matrix', activeStore);
    const text = [
      'Analyze this Eisenhower Matrix snapshot and recommend the top 3 Q1 actions, top 2 Q2 strategic blocks, and Q3/Q4 items to defer or drop:',
      res.text,
    ].join('\n\n');
    return {
      description: 'Eisenhower Matrix prioritization review.',
      messages: [{ role: 'user', content: { type: 'text', text } }],
    };
  }

  if (name === 'weekly_summary') {
    const [status, active, completed] = await Promise.all([
      activeStore.getStatus(),
      activeStore.listTasks({ filter: 'active', sortBy: 'dueDate' }),
      activeStore.listTasks({ filter: 'completed', sortBy: 'newest' }),
    ]);
    const text = [
      `Prepare a concise weekly progress and upcoming workload summary as of ${today}.`,
      `Status: ${JSON.stringify(status)}`,
      `Upcoming active tasks (${active.length}): ${capResourceTasks(active.slice(0, 60))}`,
      `Recently completed tasks (${completed.length}): ${capResourceTasks(completed.slice(0, 40))}`,
    ].join('\n\n');
    return {
      description: 'Weekly executive task summary.',
      messages: [{ role: 'user', content: { type: 'text', text } }],
    };
  }

  const err = /** @type {Error & { rpcCode?: number }} */ (new Error(`Prompt not found: ${name}`));
  err.rpcCode = -32602;
  throw err;
}

module.exports = {
  compactTaskForResource,
  capResourceTasks,
  readResource,
  getPrompt,
};
