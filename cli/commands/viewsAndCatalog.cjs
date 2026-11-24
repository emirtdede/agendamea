'use strict';

const store = require('../../shared/localStore.cjs');
const cliViewState = require('../../shared/cliViewState.cjs');
const {
  c,
  hasAnyFlag,
  getOptionValue,
  stripOptions,
  printTaskList,
} = require('../lib/cliHelpers.cjs');

async function handleStatusCommand(asJson, msg) {
  const summary = await store.getStatus();
  if (asJson) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }
  const modeLabel = summary.mode === 'live-api' ? c.green(msg.modeLive) : c.yellow(msg.modeOffline);
  console.log(
    `${c.bold(`Agendamea v${summary.version}`)} [${modeLabel}] ${c.dim(summary.endpoint)}`,
  );
  console.log(
    `${msg.active}: ${c.bold(String(summary.activeTasks))} | ${msg.today}: ${c.cyan(String(summary.dueToday))} | ${msg.important}: ${c.yellow(String(summary.important))} | ${msg.done}: ${c.green(String(summary.completedTasks))} | ${msg.categories}: ${summary.categories} | ${msg.trash}: ${summary.trashCount}`,
  );
}

async function handleMatrixCommand(asJson, msg) {
  const [matrix, cats] = await Promise.all([store.getMatrix(), store.listCategories()]);
  const flatTasks = [...matrix.q1, ...matrix.q2, ...matrix.q3, ...matrix.q4];
  const dataDir = store.getCandidateDataDirs()[0];
  cliViewState.saveViewSnapshot('view:matrix', flatTasks, { dataDir });
  if (asJson) {
    console.log(JSON.stringify(matrix, null, 2));
    return;
  }
  const catMap = new Map(cats.map((x) => [x.id, x.name]));
  const padWidth = String(Math.max(1, flatTasks.length)).length;
  const sections = [
    [msg.q1, matrix.q1],
    [msg.q2, matrix.q2],
    [msg.q3, matrix.q3],
    [msg.q4, matrix.q4],
  ];
  let cursor = 1;
  for (const [heading, items] of sections) {
    console.log(`\n${c.bold(heading)} ${c.dim(`(${items.length})`)}`);
    printTaskList(items, msg, catMap, { startIndex: cursor, padWidth });
    cursor += items.length;
  }
}

async function handleCalendarCommand(rest, asJson, msg) {
  const dateFrom = getOptionValue(rest, ['--from']);
  const dateTo = getOptionValue(rest, ['--to']);
  const includeCompleted = hasAnyFlag(rest, ['-a', '--all']);
  const [agenda, cats] = await Promise.all([
    store.getCalendarAgenda({ dateFrom, dateTo, includeCompleted }),
    store.listCategories(),
  ]);
  const keys = Object.keys(agenda.grouped);
  const flatTasks = [...keys.flatMap((day) => agenda.grouped[day]), ...agenda.undated];
  const dataDir = store.getCandidateDataDirs()[0];
  cliViewState.saveViewSnapshot('view:calendar', flatTasks, { dataDir });
  if (asJson) {
    console.log(JSON.stringify(agenda, null, 2));
    return;
  }
  if (keys.length === 0 && agenda.undated.length === 0) {
    console.log(c.dim(msg.noTasks));
    return;
  }
  const catMap = new Map(cats.map((x) => [x.id, x.name]));
  const padWidth = String(Math.max(1, flatTasks.length)).length;
  let cursor = 1;
  for (const day of keys) {
    console.log(`\n${c.bold(day)} ${c.dim(`(${agenda.grouped[day].length})`)}`);
    printTaskList(agenda.grouped[day], msg, catMap, { startIndex: cursor, padWidth });
    cursor += agenda.grouped[day].length;
  }
  if (agenda.undated.length > 0) {
    console.log(`\n${c.dim(`${msg.undated} (${agenda.undated.length})`)}`);
    printTaskList(agenda.undated, msg, catMap, { startIndex: cursor, padWidth });
  }
}

async function handleKanbanCommand(rest, asJson, msg) {
  const positional = stripOptions(rest);
  const groupBy = positional[0] === 'status' || positional[0] === 'durum' ? 'status' : 'priority';
  const [board, cats] = await Promise.all([store.getKanbanBoard(groupBy), store.listCategories()]);
  const entries = Object.entries(board.columns);
  const flatTasks = entries.flatMap(([, items]) => items);
  const dataDir = store.getCandidateDataDirs()[0];
  cliViewState.saveViewSnapshot(`view:kanban:${groupBy}`, flatTasks, { dataDir });
  if (asJson) {
    console.log(JSON.stringify(board, null, 2));
    return;
  }
  const catMap = new Map(cats.map((x) => [x.id, x.name]));
  const padWidth = String(Math.max(1, flatTasks.length)).length;
  let cursor = 1;
  for (const [col, items] of entries) {
    console.log(`\n${c.bold(col.toUpperCase())} ${c.dim(`(${items.length})`)}`);
    printTaskList(items, msg, catMap, { startIndex: cursor, padWidth });
    cursor += items.length;
  }
}

async function handleSubtaskCommand(rest, asJson, msg) {
  const taskSel = rest[0];
  if (!taskSel) {
    console.error(msg.selectorRequired);
    process.exit(2);
  }
  const action = (rest[1] || 'list').toLowerCase();
  if (action === 'list' || action === '-j' || action === '--json') {
    const task = await store.getTask(taskSel);
    if (asJson) {
      console.log(JSON.stringify(task.subtasks || [], null, 2));
      return;
    }
    if (!task.subtasks || task.subtasks.length === 0) {
      console.log(c.dim(msg.noTasks));
      return;
    }
    task.subtasks.forEach((s, idx) => {
      console.log(`${c.dim(`${idx + 1}.`)} ${s.completed ? c.green('[x]') : '[ ]'} ${s.title}`);
    });
    return;
  }
  if (action === '+' || action === 'add' || action === 'ekle') {
    const subTitle = rest
      .slice(2)
      .filter((a) => a !== '-j' && a !== '--json')
      .join(' ')
      .trim();
    const created = await store.addSubtask(taskSel, subTitle);
    if (asJson) console.log(JSON.stringify(created, null, 2));
    else console.log(`${c.green(msg.subAdded)}: ${c.bold(created.title)}`);
    return;
  }
  if (action === 'ok' || action === 'done' || action === 'toggle') {
    const subSel = stripOptions(rest.slice(2)).join(' ').trim();
    const updated = await store.toggleSubtask(taskSel, subSel);
    if (asJson) console.log(JSON.stringify(updated, null, 2));
    else
      console.log(
        `${c.green(msg.subUpdated)}: ${updated.completed ? '[x]' : '[ ]'} ${c.bold(updated.title)}`,
      );
    return;
  }
  if (action === 'edit' || action === 'duzenle' || action === 'rename') {
    const subSel = rest[2];
    const newTitle = stripOptions(rest.slice(3)).join(' ').trim();
    const updated = await store.updateSubtask(taskSel, subSel, { title: newTitle });
    if (asJson) console.log(JSON.stringify(updated, null, 2));
    else console.log(`${c.green(msg.subUpdated)}: ${c.bold(updated.title)}`);
    return;
  }
  if (action === 'rm' || action === 'del' || action === 'sil') {
    const subSel = stripOptions(rest.slice(2)).join(' ').trim();
    const removed = await store.deleteSubtask(taskSel, subSel);
    if (asJson) console.log(JSON.stringify(removed, null, 2));
    else console.log(`${c.yellow(msg.subDeleted)}: ${c.bold(removed.title)}`);
    return;
  }
  console.error(`${msg.unknownCmd}: "sub ${action}". ${msg.helpHint}`);
  process.exit(1);
}

async function handleCategoryCommand(rest, asJson, msg) {
  const subCmd = (rest[0] || '').toLowerCase();
  if (!subCmd || subCmd.startsWith('-')) {
    const categories = await store.listCategories();
    if (asJson) {
      console.log(JSON.stringify(categories, null, 2));
      return;
    }
    if (categories.length === 0) {
      console.log(c.dim(msg.noCategories));
      return;
    }
    categories.forEach((cat, idx) => {
      const pin = cat.pinned ? c.magenta('^ ') : '';
      console.log(
        `${c.dim(`${idx + 1}.`)} ${pin}${c.bold(cat.name)} ${c.dim(`(${cat.color} · ${cat.activeTaskCount})`)}`,
      );
    });
    return;
  }
  if (subCmd === '+' || subCmd === 'add' || subCmd === 'ekle') {
    const tokens = rest.slice(1);
    const optColor = getOptionValue(tokens, ['--color']);
    const positional = stripOptions(tokens, ['--color']);
    const colorTok =
      optColor || positional.find((t) => /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(t));
    const pinned = hasAnyFlag(tokens, ['--pin', '^']);
    const name = positional
      .filter((t) => t !== colorTok && t !== '^')
      .join(' ')
      .trim();
    const created = await store.createCategory({ name, color: colorTok, pinned });
    if (asJson) console.log(JSON.stringify(created, null, 2));
    else
      console.log(
        `${c.green(msg.catAdded)}: ${c.bold(created.name)} ${c.dim(`(${created.color})`)}`,
      );
    return;
  }
  if (subCmd === 'edit' || subCmd === 'duzenle' || subCmd === 'set') {
    const sel = rest[1];
    const opts = rest.slice(2);
    const patch = {};
    const newName = getOptionValue(opts, ['--name']);
    const newColor =
      getOptionValue(opts, ['--color']) ||
      opts.find((t) => /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(t));
    if (newName) patch.name = newName;
    if (newColor) patch.color = newColor;
    if (hasAnyFlag(opts, ['--pin'])) patch.pinned = true;
    if (hasAnyFlag(opts, ['--unpin'])) patch.pinned = false;
    const updated = await store.updateCategory(sel, patch);
    if (asJson) console.log(JSON.stringify(updated, null, 2));
    else
      console.log(
        `${c.green(msg.catUpdated)}: ${c.bold(updated.name)} ${c.dim(`(${updated.color})`)}`,
      );
    return;
  }
  if (subCmd === 'move' || subCmd === 'tasi' || subCmd === 'taşı') {
    const positional = stripOptions(rest.slice(1));
    const moved = await store.moveCategory(positional[0], positional[1]);
    if (asJson) console.log(JSON.stringify(moved, null, 2));
    else console.log(`${c.green(msg.moved)}: ${c.bold(moved.name)} -> #${moved.position}`);
    return;
  }
  if (subCmd === 'rm' || subCmd === 'del' || subCmd === 'sil') {
    const sel = stripOptions(rest.slice(1)).join(' ').trim();
    const removed = await store.deleteCategory(sel);
    if (asJson) console.log(JSON.stringify(removed, null, 2));
    else console.log(`${c.yellow(msg.catTrashed)}: ${c.bold(removed.name)}`);
    return;
  }
  console.error(`${msg.unknownCmd}: "cat ${subCmd}". ${msg.helpHint}`);
  process.exit(1);
}

async function handleTrashCommand(rest, asJson, msg) {
  const subCmd = (rest[0] || '').toLowerCase();
  if (subCmd === 'bosalt' || subCmd === 'boşalt' || subCmd === 'empty') {
    if (!hasAnyFlag(rest, ['--yes', '-y'])) {
      console.error(msg.confirmYesRequired);
      process.exit(2);
    }
    const res = await store.emptyTrash();
    if (asJson) console.log(JSON.stringify(res, null, 2));
    else
      console.log(c.yellow(`${msg.trashEmptied} (${res.deletedTodos} / ${res.deletedCategories})`));
    return;
  }
  if (subCmd === 'sil' || subCmd === 'rm' || subCmd === 'delete') {
    const sel = stripOptions(rest.slice(1)).join(' ').trim();
    const res = await store.permanentDeleteItem(sel);
    if (asJson) console.log(JSON.stringify(res, null, 2));
    else console.log(`${c.red(msg.permDeleted)}: ${c.bold(res.label)}`);
    return;
  }
  const data = await store.listTrash({
    typeFilter: getOptionValue(rest, ['--type']) || 'all',
    sortBy: getOptionValue(rest, ['--sort']) || 'newest',
    query: getOptionValue(rest, ['-q', '--query']) || undefined,
    dateFrom: getOptionValue(rest, ['--from']) || undefined,
    dateTo: getOptionValue(rest, ['--to']) || undefined,
  });
  if (asJson) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }
  if (data.categories.length === 0 && data.todos.length === 0) {
    console.log(c.dim(msg.trashEmpty));
    return;
  }
  if (data.categories.length > 0) {
    console.log(c.dim(`${msg.categories}:`));
    data.categories.forEach((cat, i) => {
      console.log(`  ${c.dim(`${i + 1}.`)} ${cat.name}`);
    });
  }
  if (data.todos.length > 0) {
    console.log(c.dim(`${msg.tasks}:`));
    printTaskList(data.todos, msg);
  }
}

module.exports = {
  handleStatusCommand,
  handleMatrixCommand,
  handleCalendarCommand,
  handleKanbanCommand,
  handleSubtaskCommand,
  handleCategoryCommand,
  handleTrashCommand,
};
