#!/usr/bin/env node
'use strict';

/**
 * Agendamea MCP Server (JSON-RPC 2.0 over stdio)
 * Supports both Content-Length framed messages and NDJSON lines.
 * Zero external dependencies - connects securely to Agendamea's local 127.0.0.1 API.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const SERVER_NAME = 'agendamea';
const SERVER_VERSION = '1.0.0';
const PROTOCOL_VERSION = '2024-11-05';

let useContentLengthFraming = false;

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
      // Ignore unreadable port file
    }
  }

  for (const fallbackPort of [38721, 47821, 39721, 41721, 3000]) {
    urls.push(`http://127.0.0.1:${fallbackPort}`);
  }

  return [...new Set(urls)];
}

async function resolveApiBaseUrl() {
  for (const base of getCandidateBaseUrls()) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 900);
      const res = await fetch(`${base}/api/health`, { signal: controller.signal });
      clearTimeout(timer);
      if (res.ok) return base;
    } catch {
      // Try next port
    }
  }
  return null;
}

async function apiRequest(method, endpoint, body) {
  const baseUrl = await resolveApiBaseUrl();
  if (!baseUrl) {
    throw new Error('Agendamea desktop app is not running. Launch Agendamea and retry.');
  }
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
    throw new Error(json?.error || `Agendamea API error (HTTP ${res.status})`);
  }
  return { baseUrl, data: json };
}

function getTodayStr() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const TOOLS = [
  {
    name: 'agendamea_status',
    description: 'Return Agendamea task counts (active, due today, important, completed, categories, trash).',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'agendamea_list_tasks',
    description: 'List tasks from Agendamea with optional status, today, important, or query filter.',
    inputSchema: {
      type: 'object',
      properties: {
        filter: {
          type: 'string',
          enum: ['active', 'completed', 'all', 'today', 'important'],
          description: 'Task subset to return (default: active).',
        },
        query: {
          type: 'string',
          description: 'Optional case-insensitive title/notes search substring.',
        },
      },
    },
  },
  {
    name: 'agendamea_add_task',
    description: 'Create a new task in Agendamea.',
    inputSchema: {
      type: 'object',
      required: ['title'],
      properties: {
        title: { type: 'string', description: 'Task title.' },
        notes: { type: 'string', description: 'Optional detailed notes.' },
        dueDate: { type: 'string', description: 'Optional due date (YYYY-MM-DD).' },
        priority: { type: 'string', enum: ['low', 'normal', 'high'], description: 'Priority level.' },
        important: { type: 'boolean', description: 'Mark task as important.' },
        categoryId: { type: 'string', description: 'Optional category ID.' },
      },
    },
  },
  {
    name: 'agendamea_complete_task',
    description: 'Mark an Agendamea task as completed or active by ID (or ID prefix).',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'string', description: 'Task ID or unique ID prefix.' },
        completed: { type: 'boolean', description: 'Desired completion state (default: true).' },
      },
    },
  },
  {
    name: 'agendamea_delete_task',
    description: 'Move an Agendamea task to Trash by ID (or ID prefix).',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'string', description: 'Task ID or unique ID prefix.' },
      },
    },
  },
  {
    name: 'agendamea_list_categories',
    description: 'List all active categories in Agendamea.',
    inputSchema: { type: 'object', properties: {} },
  },
];

function resolveTodoPrefix(todos, idOrPrefix) {
  const clean = String(idOrPrefix || '').trim().toLowerCase();
  if (!clean) throw new Error('Task ID is required.');
  const exact = todos.find((t) => t.id.toLowerCase() === clean);
  if (exact) return exact;
  const matches = todos.filter((t) => t.id.toLowerCase().startsWith(clean));
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) {
    throw new Error(`Ambiguous task ID prefix "${idOrPrefix}" (${matches.length} matches).`);
  }
  throw new Error(`Task not found: "${idOrPrefix}".`);
}

async function executeTool(name, args) {
  const input = args && typeof args === 'object' ? args : {};

  if (name === 'agendamea_status') {
    const { baseUrl, data } = await apiRequest('GET', '/api/bootstrap');
    const today = getTodayStr();
    const active = data.todos.filter((t) => !t.completed);
    return {
      endpoint: baseUrl,
      version: SERVER_VERSION,
      activeTasks: active.length,
      dueToday: active.filter((t) => t.dueDate === today).length,
      important: active.filter((t) => t.important).length,
      completedTasks: data.todos.filter((t) => t.completed).length,
      categories: data.categories.length,
      trashCount: data.trashedTodos.length + data.trashedCategories.length,
    };
  }

  if (name === 'agendamea_list_tasks') {
    const { data } = await apiRequest('GET', '/api/bootstrap');
    const filter = input.filter || 'active';
    const today = getTodayStr();
    let list = data.todos;
    if (filter === 'active') list = list.filter((t) => !t.completed);
    else if (filter === 'completed') list = list.filter((t) => t.completed);
    else if (filter === 'today') list = list.filter((t) => !t.completed && t.dueDate === today);
    else if (filter === 'important') list = list.filter((t) => !t.completed && t.important);

    if (typeof input.query === 'string' && input.query.trim()) {
      const q = input.query.trim().toLowerCase();
      list = list.filter(
        (t) =>
          String(t.title || '').toLowerCase().includes(q) ||
          String(t.notes || '').toLowerCase().includes(q),
      );
    }

    return list.map((t) => ({
      id: t.id,
      title: t.title,
      completed: t.completed,
      important: t.important,
      priority: t.priority,
      dueDate: t.dueDate,
      categoryId: t.categoryId,
      notes: t.notes,
    }));
  }

  if (name === 'agendamea_add_task') {
    if (typeof input.title !== 'string' || !input.title.trim()) {
      throw new Error('title must be a non-empty string.');
    }
    const { data } = await apiRequest('POST', '/api/todos', {
      title: input.title.trim(),
      notes: typeof input.notes === 'string' ? input.notes : '',
      dueDate: typeof input.dueDate === 'string' ? input.dueDate : null,
      priority:
        input.priority === 'high' || input.priority === 'low' || input.priority === 'normal'
          ? input.priority
          : 'normal',
      important: Boolean(input.important),
      categoryId: typeof input.categoryId === 'string' ? input.categoryId : null,
    });
    return data;
  }

  if (name === 'agendamea_complete_task') {
    const { data: boot } = await apiRequest('GET', '/api/bootstrap');
    const target = resolveTodoPrefix(boot.todos, input.id);
    const completed = input.completed === undefined ? true : Boolean(input.completed);
    const { data } = await apiRequest('PATCH', `/api/todos/${encodeURIComponent(target.id)}`, {
      completed,
    });
    return data;
  }

  if (name === 'agendamea_delete_task') {
    const { data: boot } = await apiRequest('GET', '/api/bootstrap');
    const target = resolveTodoPrefix(boot.todos, input.id);
    await apiRequest('DELETE', `/api/todos/${encodeURIComponent(target.id)}`);
    return { ok: true, id: target.id, movedToTrash: true };
  }

  if (name === 'agendamea_list_categories') {
    const { data } = await apiRequest('GET', '/api/bootstrap');
    return data.categories;
  }

  throw new Error(`Unknown tool: ${name}`);
}

function sendMessage(payload) {
  const json = JSON.stringify(payload);
  if (useContentLengthFraming) {
    const byteLen = Buffer.byteLength(json, 'utf8');
    process.stdout.write(`Content-Length: ${byteLen}\r\n\r\n${json}`);
  } else {
    process.stdout.write(`${json}\n`);
  }
}

async function handleRequest(msg) {
  if (!msg || typeof msg !== 'object') return;
  const { id, method, params } = msg;

  // Notifications have no id
  if (method === 'notifications/initialized' || method === 'notifications/cancelled') {
    return;
  }

  try {
    if (method === 'initialize') {
      sendMessage({
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
        },
      });
      return;
    }

    if (method === 'ping') {
      sendMessage({ jsonrpc: '2.0', id, result: {} });
      return;
    }

    if (method === 'tools/list') {
      sendMessage({
        jsonrpc: '2.0',
        id,
        result: { tools: TOOLS },
      });
      return;
    }

    if (method === 'tools/call') {
      const toolName = params?.name;
      const toolArgs = params?.arguments;
      try {
        const result = await executeTool(toolName, toolArgs);
        sendMessage({
          jsonrpc: '2.0',
          id,
          result: {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          },
        });
      } catch (err) {
        sendMessage({
          jsonrpc: '2.0',
          id,
          result: {
            isError: true,
            content: [{ type: 'text', text: err instanceof Error ? err.message : String(err) }],
          },
        });
      }
      return;
    }

    if (id !== undefined) {
      sendMessage({
        jsonrpc: '2.0',
        id,
        error: { code: -32601, message: `Method not found: ${method}` },
      });
    }
  } catch (err) {
    if (id !== undefined) {
      sendMessage({
        jsonrpc: '2.0',
        id,
        error: { code: -32603, message: err instanceof Error ? err.message : 'Internal error' },
      });
    }
  }
}

let incomingBuffer = Buffer.alloc(0);

function processBuffer() {
  while (incomingBuffer.length > 0) {
    const asText = incomingBuffer.toString('utf8');
    if (asText.startsWith('Content-Length:')) {
      useContentLengthFraming = true;
      const headerEnd = incomingBuffer.indexOf('\r\n\r\n');
      if (headerEnd === -1) return;
      const header = incomingBuffer.slice(0, headerEnd).toString('utf8');
      const match = /Content-Length:\s*(\d+)/i.exec(header);
      if (!match) {
        incomingBuffer = incomingBuffer.slice(headerEnd + 4);
        continue;
      }
      const length = Number.parseInt(match[1], 10);
      const totalLen = headerEnd + 4 + length;
      if (incomingBuffer.length < totalLen) return;
      const bodyStr = incomingBuffer.slice(headerEnd + 4, totalLen).toString('utf8');
      incomingBuffer = incomingBuffer.slice(totalLen);
      try {
        void handleRequest(JSON.parse(bodyStr));
      } catch {
        // Ignore malformed frame
      }
      continue;
    }

    const newlineIdx = incomingBuffer.indexOf(0x0a);
    if (newlineIdx === -1) return;
    const line = incomingBuffer.slice(0, newlineIdx).toString('utf8').trim();
    incomingBuffer = incomingBuffer.slice(newlineIdx + 1);
    if (!line) continue;
    try {
      void handleRequest(JSON.parse(line));
    } catch {
      // Ignore malformed line
    }
  }
}

process.stdin.on('data', (chunk) => {
  incomingBuffer = Buffer.concat([incomingBuffer, chunk]);
  processBuffer();
});

process.stdin.on('end', () => {
  process.exit(0);
});
