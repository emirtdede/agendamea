#!/usr/bin/env node
'use strict';

const path = require('node:path');
const { spawn } = require('node:child_process');
const store = require('../shared/localStore.cjs');

function printHelp() {
  console.log(`Agendamea CLI v${store.APP_VERSION}

Usage:
  agendamea list [--today | --important | --done | --all] [--json]
  agendamea add "<title>" [--today] [--due YYYY-MM-DD] [--high | --low] [--important]
  agendamea done <id-prefix>
  agendamea del <id-prefix>
  agendamea cats [--json]
  agendamea status [--json]
  agendamea mcp
  agendamea help

Examples:
  agendamea list --today
  agendamea add "Prepare release notes" --today --high
  agendamea done a1b2c3
  agendamea status`);
}

async function main() {
  const args = process.argv.slice(2);
  const cmd = (args[0] || 'help').toLowerCase();
  const flags = new Set(args.slice(1).filter((a) => a.startsWith('--')));
  const asJson = flags.has('--json');

  if (cmd === 'help' || cmd === '-h' || cmd === '--help') {
    printHelp();
    return;
  }

  if (cmd === 'version' || cmd === '-v' || cmd === '--version') {
    console.log(`agendamea ${store.APP_VERSION}`);
    return;
  }

  if (cmd === 'mcp') {
    const mcpScript = path.resolve(__dirname, '..', 'mcp', 'server.cjs');
    const child = spawn(process.execPath, [mcpScript], { stdio: 'inherit' });
    child.on('exit', (code) => process.exit(code ?? 0));
    return;
  }

  if (cmd === 'status') {
    const summary = await store.getStatus();
    if (asJson) {
      console.log(JSON.stringify(summary, null, 2));
    } else {
      console.log(`Agendamea v${summary.version} [${summary.mode}] (${summary.endpoint})`);
      console.log(
        `Active: ${summary.activeTasks} | Today: ${summary.dueToday} | Important: ${summary.important} | Completed: ${summary.completedTasks} | Categories: ${summary.categories}`,
      );
    }
    return;
  }

  if (cmd === 'cats' || cmd === 'categories') {
    const categories = await store.listCategories();
    if (asJson) {
      console.log(JSON.stringify(categories, null, 2));
      return;
    }
    if (categories.length === 0) {
      console.log('No categories found.');
      return;
    }
    for (const cat of categories) {
      console.log(`${cat.id.slice(0, 8)}  ${cat.name} (${cat.color})`);
    }
    return;
  }

  if (cmd === 'list' || cmd === 'ls') {
    const filter = flags.has('--done')
      ? 'completed'
      : flags.has('--all')
        ? 'all'
        : flags.has('--today')
          ? 'today'
          : flags.has('--important')
            ? 'important'
            : 'active';
    let list = await store.listTasks({ filter });
    if (flags.has('--today') && flags.has('--important')) {
      list = list.filter((t) => t.important);
    }
    if (asJson) {
      console.log(JSON.stringify(list, null, 2));
      return;
    }
    if (list.length === 0) {
      console.log('No tasks matched.');
      return;
    }
    for (const todo of list) {
      const mark = todo.completed ? '[x]' : '[ ]';
      const star = todo.important ? '*' : ' ';
      const pri = todo.priority === 'high' ? '!' : todo.priority === 'low' ? '-' : ' ';
      const due = todo.dueDate ? ` (${todo.dueDate})` : '';
      console.log(`${todo.id.slice(0, 8)} ${mark} ${star}${pri} ${todo.title}${due}`);
    }
    return;
  }

  if (cmd === 'add') {
    const rest = args.slice(1);
    let dueDate = null;
    let explicitPriority = null;
    const titleParts = [];
    for (let i = 0; i < rest.length; i += 1) {
      const token = rest[i];
      if (token === '--due' && rest[i + 1]) {
        dueDate = rest[i + 1];
        i += 1;
      } else if (token === '--priority' && rest[i + 1]) {
        explicitPriority = rest[i + 1].toLowerCase();
        i += 1;
      } else if (token.startsWith('--priority=')) {
        explicitPriority = token.slice('--priority='.length).toLowerCase();
      } else if (!token.startsWith('--')) {
        titleParts.push(token);
      }
    }
    const title = titleParts.join(' ').trim();
    if (!title) {
      console.error('Task title is required. Example: agendamea add "Buy groceries" --today');
      process.exit(1);
    }
    if (flags.has('--today') && !dueDate) {
      dueDate = store.getTodayStr();
    }
    const priority =
      explicitPriority === 'high' || explicitPriority === 'low' || explicitPriority === 'normal'
        ? explicitPriority
        : flags.has('--high')
          ? 'high'
          : flags.has('--low')
            ? 'low'
            : 'normal';
    const created = await store.addTask({
      title,
      dueDate,
      priority,
      important: flags.has('--important'),
    });
    if (asJson) {
      console.log(JSON.stringify(created, null, 2));
    } else {
      console.log(`Added ${created.id.slice(0, 8)}: ${created.title}`);
    }
    return;
  }

  if (cmd === 'done' || cmd === 'complete') {
    const idPrefix = args[1];
    if (!idPrefix) {
      console.error('Task ID prefix is required. Example: agendamea done a1b2c3');
      process.exit(1);
    }
    const updated = await store.completeTask(idPrefix);
    if (asJson) {
      console.log(JSON.stringify(updated, null, 2));
    } else {
      console.log(`${updated.completed ? 'Completed' : 'Reopened'} ${updated.id.slice(0, 8)}: ${updated.title}`);
    }
    return;
  }

  if (cmd === 'del' || cmd === 'rm' || cmd === 'delete') {
    const idPrefix = args[1];
    if (!idPrefix) {
      console.error('Task ID prefix is required. Example: agendamea del a1b2c3');
      process.exit(1);
    }
    const removed = await store.deleteTask(idPrefix);
    if (asJson) {
      console.log(JSON.stringify(removed, null, 2));
    } else {
      console.log(`Moved to Trash: ${removed.id.slice(0, 8)} (${removed.title})`);
    }
    return;
  }

  console.error(`Unknown command: "${cmd}". Run "agendamea help" for usage.`);
  process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
