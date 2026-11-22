#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const APP_VERSION = '1.0.0';

function getCandidateBaseUrls() {
  const urls = [];
  if (process.env.AGENDAMEA_URL) {
    urls.push(String(process.env.AGENDAMEA_URL).replace(/\/+$/, ''));
  }
  if (process.env.AGENDAMEA_PORT) {
    urls.push(`http://127.0.0.1:${process.env.AGENDAMEA_PORT}`);
  }

  const dataDirs = [
    process.env.AGENDAMEA_DATA_DIR,
    process.env.APPDATA ? path.join(process.env.APPDATA, 'Agendamea') : null,
    path.join(os.homedir(), 'AppData', 'Roaming', 'Agendamea'),
  ].filter(Boolean);

  for (const dir of dataDirs) {
    try {
      const portFile = path.join(dir, 'runtime-port.json');
      if (fs.existsSync(portFile)) {
        const parsed = JSON.parse(fs.readFileSync(portFile, 'utf8'));
        const port = Number(parsed?.port);
        if (Number.isInteger(port) && port > 0 && port < 65536) {
          urls.push(`http://127.0.0.1:${port}`);
        }
      }
    } catch {
      // Ignore unreadable port hint file
    }
  }

  for (const fallbackPort of [38721, 47821, 39721, 41721, 3000]) {
    urls.push(`http://127.0.0.1:${fallbackPort}`);
  }

  return [...new Set(urls)];
}

async function resolveApiBaseUrl() {
  const candidates = getCandidateBaseUrls();
  for (const base of candidates) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 900);
      const res = await fetch(`${base}/api/health`, { signal: controller.signal });
      clearTimeout(timer);
      if (res.ok) {
        return base;
      }
    } catch {
      // Try next candidate
    }
  }
  return null;
}

async function apiRequest(baseUrl, method, endpoint, body) {
  const res = await fetch(`${baseUrl}${endpoint}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!res.ok) {
    throw new Error(json?.error || `HTTP ${res.status}`);
  }
  return json;
}

function getTodayStr() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function printHelp() {
  console.log(`Agendamea CLI v${APP_VERSION}

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

function findTodoByPrefix(todos, prefix) {
  const clean = String(prefix || '').trim().toLowerCase();
  if (!clean) return null;
  const exact = todos.find((item) => item.id.toLowerCase() === clean);
  if (exact) return exact;
  const matches = todos.filter((item) => item.id.toLowerCase().startsWith(clean));
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) {
    throw new Error(`Ambiguous ID prefix "${prefix}" (${matches.length} matches). Provide more characters.`);
  }
  return null;
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
    console.log(`agendamea ${APP_VERSION}`);
    return;
  }

  if (cmd === 'mcp') {
    const mcpScript = path.resolve(__dirname, '..', 'mcp', 'server.cjs');
    const child = spawn(process.execPath, [mcpScript], { stdio: 'inherit' });
    child.on('exit', (code) => process.exit(code ?? 0));
    return;
  }

  const baseUrl = await resolveApiBaseUrl();
  if (!baseUrl) {
    console.error('Agendamea is not running. Start the Agendamea desktop app and retry.');
    process.exit(1);
  }

  if (cmd === 'status') {
    const boot = await apiRequest(baseUrl, 'GET', '/api/bootstrap');
    const today = getTodayStr();
    const active = boot.todos.filter((t) => !t.completed);
    const completed = boot.todos.filter((t) => t.completed);
    const dueToday = active.filter((t) => t.dueDate === today);
    const important = active.filter((t) => t.important);
    const summary = {
      ok: true,
      version: APP_VERSION,
      endpoint: baseUrl,
      activeTasks: active.length,
      dueToday: dueToday.length,
      important: important.length,
      completedTasks: completed.length,
      categories: boot.categories.length,
      trashCount: boot.trashedTodos.length + boot.trashedCategories.length,
    };
    if (asJson) {
      console.log(JSON.stringify(summary, null, 2));
    } else {
      console.log(`Agendamea v${APP_VERSION} (${baseUrl})`);
      console.log(`Active: ${summary.activeTasks} | Today: ${summary.dueToday} | Important: ${summary.important} | Completed: ${summary.completedTasks} | Categories: ${summary.categories}`);
    }
    return;
  }

  if (cmd === 'cats' || cmd === 'categories') {
    const boot = await apiRequest(baseUrl, 'GET', '/api/bootstrap');
    if (asJson) {
      console.log(JSON.stringify(boot.categories, null, 2));
      return;
    }
    if (boot.categories.length === 0) {
      console.log('No categories found.');
      return;
    }
    for (const cat of boot.categories) {
      console.log(`${cat.id.slice(0, 8)}  ${cat.name} (${cat.color})`);
    }
    return;
  }

  if (cmd === 'list' || cmd === 'ls') {
    const boot = await apiRequest(baseUrl, 'GET', '/api/bootstrap');
    const today = getTodayStr();
    let list = boot.todos;
    if (flags.has('--done')) {
      list = list.filter((t) => t.completed);
    } else if (!flags.has('--all')) {
      list = list.filter((t) => !t.completed);
    }
    if (flags.has('--today')) {
      list = list.filter((t) => t.dueDate === today);
    }
    if (flags.has('--important')) {
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
    const titleParts = [];
    for (let i = 0; i < rest.length; i += 1) {
      const token = rest[i];
      if (token === '--due' && rest[i + 1]) {
        dueDate = rest[i + 1];
        i += 1;
      } else if (token.startsWith('--')) {
        // Flag handled below
      } else {
        titleParts.push(token);
      }
    }
    const title = titleParts.join(' ').trim();
    if (!title) {
      console.error('Task title is required. Example: agendamea add "Buy groceries" --today');
      process.exit(1);
    }
    if (flags.has('--today') && !dueDate) {
      dueDate = getTodayStr();
    }
    const priority = flags.has('--high') ? 'high' : flags.has('--low') ? 'low' : 'normal';
    const created = await apiRequest(baseUrl, 'POST', '/api/todos', {
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
    const boot = await apiRequest(baseUrl, 'GET', '/api/bootstrap');
    const target = findTodoByPrefix(boot.todos, idPrefix);
    if (!target) {
      console.error(`Task not found for "${idPrefix}".`);
      process.exit(1);
    }
    const updated = await apiRequest(baseUrl, 'PATCH', `/api/todos/${encodeURIComponent(target.id)}`, {
      completed: !target.completed,
    });
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
    const boot = await apiRequest(baseUrl, 'GET', '/api/bootstrap');
    const target = findTodoByPrefix(boot.todos, idPrefix);
    if (!target) {
      console.error(`Task not found for "${idPrefix}".`);
      process.exit(1);
    }
    await apiRequest(baseUrl, 'DELETE', `/api/todos/${encodeURIComponent(target.id)}`);
    if (asJson) {
      console.log(JSON.stringify({ ok: true, id: target.id, trashed: true }, null, 2));
    } else {
      console.log(`Moved to Trash: ${target.id.slice(0, 8)} (${target.title})`);
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
