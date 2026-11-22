#!/usr/bin/env node
'use strict';

/**
 * Agendamea MCP Server (JSON-RPC 2.0 over stdio)
 * Supports Content-Length framed messages and NDJSON lines.
 * Connects to live 127.0.0.1 API when running, or falls back directly to local SQLite (WAL) when closed.
 */

const store = require('../shared/localStore.cjs');

const SERVER_NAME = 'agendamea';
const SERVER_VERSION = store.APP_VERSION;
const PROTOCOL_VERSION = '2024-11-05';

let useContentLengthFraming = false;

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

async function executeTool(name, args) {
  const input = args && typeof args === 'object' ? args : {};

  if (name === 'agendamea_status') {
    return store.getStatus();
  }

  if (name === 'agendamea_list_tasks') {
    const list = await store.listTasks({
      filter: input.filter || 'active',
      query: input.query,
    });
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
    return store.addTask(input);
  }

  if (name === 'agendamea_complete_task') {
    const completed = input.completed === undefined ? true : Boolean(input.completed);
    return store.completeTask(input.id, completed);
  }

  if (name === 'agendamea_delete_task') {
    return store.deleteTask(input.id);
  }

  if (name === 'agendamea_list_categories') {
    return store.listCategories();
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
      try {
        const result = await executeTool(params?.name, params?.arguments);
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
