#!/usr/bin/env node
'use strict';

/**
 * Agendamea MCP Server (JSON-RPC 2.0 over stdio - 18 Complete Headless Tools)
 * Supports Content-Length framed messages and NDJSON lines.
 * Connects to live 127.0.0.1 API when running, or falls back directly to local SQLite (WAL)
 * with cold-start auto-schema creation when the desktop GUI is closed.
 */

const store = require('../shared/localStore.cjs');

const SERVER_NAME = 'agendamea';
const SERVER_VERSION = store.APP_VERSION;
const PROTOCOL_VERSION = '2024-11-05';

let useContentLengthFraming = false;
let pendingRequests = 0;
let stdinEnded = false;

const TOOLS = [
  {
    name: 'agendamea_status',
    description: 'Return Agendamea counts (active, today, important, pinned, completed, categories, trash) and connection mode.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'agendamea_list_tasks',
    description: 'List tasks with full details (including subtasks, dueTime, startDate, tags, pinned) and optional filters & sorting.',
    inputSchema: {
      type: 'object',
      properties: {
        filter: {
          type: 'string',
          enum: ['active', 'completed', 'all', 'today', 'important', 'pinned'],
          description: 'Task subset to return (default: active).',
        },
        category: { type: 'string', description: 'Optional category name or ID to filter by.' },
        priority: { type: 'string', enum: ['low', 'normal', 'high'], description: 'Optional priority filter.' },
        tag: { type: 'string', description: 'Optional tag filter (with or without #).' },
        query: { type: 'string', description: 'Optional search text matching title, notes, subtasks, or #tags.' },
        dateFrom: { type: 'string', description: 'Optional start date bound (YYYY-MM-DD).' },
        dateTo: { type: 'string', description: 'Optional end date bound (YYYY-MM-DD).' },
        sortBy: { type: 'string', enum: ['manual', 'priority', 'dueDate', 'newest'], description: 'Optional sort order.' },
      },
    },
  },
  {
    name: 'agendamea_get_task',
    description: 'Retrieve full details of a single task (notes, subtasks, tags, schedule, category) by number, keyword, or ID.',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'string', description: 'Task ID, unique prefix, 1-based number, or title keyword.' },
      },
    },
  },
  {
    name: 'agendamea_add_task',
    description: 'Create a new task with optional schedule, time, priority, tags, category, notes, pinning, and subtasks.',
    inputSchema: {
      type: 'object',
      required: ['title'],
      properties: {
        title: { type: 'string', description: 'Task title.' },
        notes: { type: 'string', description: 'Optional detailed notes.' },
        startDate: { type: 'string', description: 'Optional start date (YYYY-MM-DD).' },
        dueDate: { type: 'string', description: 'Optional due date (YYYY-MM-DD).' },
        dueTime: { type: 'string', description: 'Optional 24-hour time (HH:mm).' },
        priority: { type: 'string', enum: ['low', 'normal', 'high'] },
        important: { type: 'boolean' },
        pinned: { type: 'boolean' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Optional tags without #.' },
        categoryId: { type: 'string', description: 'Optional category ID.' },
        category: { type: 'string', description: 'Optional category name (resolved automatically).' },
        subtasks: { type: 'array', items: { type: 'string' }, description: 'Optional initial subtask titles.' },
      },
    },
  },
  {
    name: 'agendamea_update_task',
    description: 'Update any field of an existing task (title, notes, dates, dueTime, priority, important, pinned, tags, category, or list position).',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'string', description: 'Task ID, prefix, number, or keyword.' },
        title: { type: 'string' },
        notes: { type: 'string' },
        startDate: { type: ['string', 'null'] },
        dueDate: { type: ['string', 'null'] },
        dueTime: { type: ['string', 'null'] },
        priority: { type: 'string', enum: ['low', 'normal', 'high'] },
        important: { type: 'boolean' },
        pinned: { type: 'boolean' },
        completed: { type: 'boolean' },
        tags: { type: 'array', items: { type: 'string' } },
        categoryId: { type: ['string', 'null'] },
        category: { type: 'string', description: 'Category name (empty string clears category).' },
        position: { type: 'integer', description: 'Optional 1-based custom order position to move this task to.' },
      },
    },
  },
  {
    name: 'agendamea_complete_task',
    description: 'Mark a task as completed or active by ID, prefix, number, or keyword.',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'string' },
        completed: { type: 'boolean', description: 'Desired state (default: true).' },
      },
    },
  },
  {
    name: 'agendamea_pin_task',
    description: 'Pin or unpin a task so it stays at the top of its list.',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'string' },
        pinned: { type: 'boolean', description: 'Desired pin state (omit to toggle).' },
      },
    },
  },
  {
    name: 'agendamea_delete_task',
    description: 'Move a task to Trash by ID, prefix, number, or keyword.',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'string' },
      },
    },
  },
  {
    name: 'agendamea_clear_completed',
    description: 'Move all completed tasks (optionally within one category) to Trash.',
    inputSchema: {
      type: 'object',
      properties: {
        category: { type: 'string', description: 'Optional category name or ID.' },
      },
    },
  },
  {
    name: 'agendamea_manage_subtask',
    description: 'Add, rename/update, toggle completion, or delete a subtask belonging to a task.',
    inputSchema: {
      type: 'object',
      required: ['action', 'taskId'],
      properties: {
        action: { type: 'string', enum: ['add', 'update', 'toggle', 'delete'] },
        taskId: { type: 'string', description: 'Parent task ID, number, or keyword.' },
        title: { type: 'string', description: 'Subtask title (for add or update).' },
        subtaskId: { type: 'string', description: 'Subtask ID, 1-based index, or keyword (required for update/toggle/delete).' },
        completed: { type: 'boolean', description: 'Optional explicit completion state when action=toggle or update.' },
      },
    },
  },
  {
    name: 'agendamea_list_categories',
    description: 'List all active categories along with their color, pin state, and active task counts.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'agendamea_manage_category',
    description: 'Create, update (name/color/pinned/position), or soft-delete a category.',
    inputSchema: {
      type: 'object',
      required: ['action'],
      properties: {
        action: { type: 'string', enum: ['create', 'update', 'delete'] },
        id: { type: 'string', description: 'Target category ID, name, or number (for update/delete).' },
        name: { type: 'string', description: 'Category name (for create, or renamed title for update).' },
        color: { type: 'string', description: 'HEX color code (e.g. #2563eb).' },
        pinned: { type: 'boolean' },
        position: { type: 'integer', description: 'Optional 1-based order position for update.' },
      },
    },
  },
  {
    name: 'agendamea_list_trash',
    description: 'Inspect deleted tasks and categories currently in Trash with optional search, type, sort, and date-range filters.',
    inputSchema: {
      type: 'object',
      properties: {
        typeFilter: { type: 'string', enum: ['all', 'todos', 'categories'] },
        sortBy: { type: 'string', enum: ['newest', 'oldest', 'az', 'za'] },
        query: { type: 'string' },
        dateFrom: { type: 'string' },
        dateTo: { type: 'string' },
      },
    },
  },
  {
    name: 'agendamea_manage_trash',
    description: 'Restore a trashed task/category, permanently delete one item, or empty the entire Trash.',
    inputSchema: {
      type: 'object',
      required: ['action'],
      properties: {
        action: { type: 'string', enum: ['restore', 'permanent_delete', 'empty'] },
        target: { type: 'string', description: 'Item ID, number, or keyword (optional for restore -> restores latest).' },
        itemType: { type: 'string', enum: ['auto', 'todo', 'category'] },
      },
    },
  },
  {
    name: 'agendamea_eisenhower_matrix',
    description: 'Return active tasks grouped into the 4 Eisenhower Matrix quadrants (q1..q4).',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'agendamea_get_settings',
    description: 'Read all Agendamea application preferences, cloud sync path, and webhook settings.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'agendamea_update_settings',
    description: 'Update any Agendamea preference (themeMode, themeId, language, zoomPercent, closeBehavior, webhookUrl, webhookEnabled, etc.).',
    inputSchema: {
      type: 'object',
      properties: {
        patch: { type: 'object', description: 'Partial AppSettings key-value object.' },
      },
      required: ['patch'],
    },
  },
  {
    name: 'agendamea_backup_and_sync',
    description: 'Export/import JSON backups, inspect/connect/push/pull/disconnect cloud folder sync, test webhooks, or perform a clean reset.',
    inputSchema: {
      type: 'object',
      required: ['action'],
      properties: {
        action: {
          type: 'string',
          enum: ['export', 'import', 'cloud_status', 'connect_cloud', 'disconnect_cloud', 'sync_cloud', 'pull_cloud', 'test_webhook', 'reset'],
        },
        filePath: { type: 'string', description: 'Optional file path for export/import.' },
        folderPath: { type: 'string', description: 'Cloud sync folder path for connect_cloud (omit to auto-detect installed cloud provider).' },
        autoSync: { type: 'boolean', description: 'Enable auto-sync on connect_cloud (default: true).' },
        payload: { type: 'object', description: 'Inline JSON backup object for import.' },
        webhookUrl: { type: 'string', description: 'Optional URL override for test_webhook.' },
        resetSettings: { type: 'boolean', description: 'When action=reset, also reset preferences to defaults.' },
      },
    },
  },
  {
    name: 'agendamea_views',
    description: 'Return structured Kanban board (by priority or status), Calendar chronological agenda (grouped by date + undated), or Eisenhower Matrix.',
    inputSchema: {
      type: 'object',
      required: ['view'],
      properties: {
        view: { type: 'string', enum: ['calendar', 'kanban', 'matrix'] },
        groupBy: { type: 'string', enum: ['priority', 'status'], description: 'For view=kanban (default: priority).' },
        dateFrom: { type: 'string', description: 'Optional start bound YYYY-MM-DD for view=calendar.' },
        dateTo: { type: 'string', description: 'Optional end bound YYYY-MM-DD for view=calendar.' },
      },
    },
  },
  {
    name: 'agendamea_webhook_and_server',
    description: 'Manage headless API/Webhook daemon (start/stop/status without GUI), inspect or clear webhook delivery logs, test webhooks, or check app updates.',
    inputSchema: {
      type: 'object',
      required: ['action'],
      properties: {
        action: {
          type: 'string',
          enum: ['server_status', 'server_start', 'server_stop', 'webhook_logs', 'clear_webhook_logs', 'test_webhook', 'check_updates'],
        },
        port: { type: 'integer', description: 'Optional port for server_start (default: auto preferred port).' },
        limit: { type: 'integer', description: 'Maximum log entries for webhook_logs (default: 30).' },
        webhookUrl: { type: 'string', description: 'Optional URL override for test_webhook.' },
      },
    },
  },
];

async function executeTool(name, args) {
  const input = args && typeof args === 'object' ? args : {};

  switch (name) {
    case 'agendamea_status':
      return store.getStatus();
    case 'agendamea_list_tasks':
      return store.listTasks({
        filter: input.filter || 'active',
        category: input.category,
        priority: input.priority,
        tag: input.tag,
        query: input.query,
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
        sortBy: input.sortBy,
      });
    case 'agendamea_get_task':
      return store.getTask(input.id);
    case 'agendamea_add_task':
      return store.addTask(input);
    case 'agendamea_update_task':
      return store.updateTask(input.id, input);
    case 'agendamea_complete_task':
      return store.completeTask(input.id, input.completed === undefined ? true : Boolean(input.completed));
    case 'agendamea_pin_task':
      return store.pinTask(input.id, input.pinned);
    case 'agendamea_delete_task':
      return store.deleteTask(input.id);
    case 'agendamea_clear_completed':
      return store.clearCompleted(input.category);
    case 'agendamea_manage_subtask':
      if (input.action === 'add') return store.addSubtask(input.taskId, input.title);
      if (input.action === 'update') {
        return store.updateSubtask(input.taskId, input.subtaskId, {
          title: input.title,
          completed: input.completed,
        });
      }
      if (input.action === 'toggle') return store.toggleSubtask(input.taskId, input.subtaskId, input.completed);
      if (input.action === 'delete') return store.deleteSubtask(input.taskId, input.subtaskId);
      throw new Error(`Unsupported subtask action: ${input.action}`);
    case 'agendamea_list_categories':
      return store.listCategories();
    case 'agendamea_manage_category':
      if (input.action === 'create') return store.createCategory({ name: input.name, color: input.color, pinned: input.pinned });
      if (input.action === 'update') {
        return store.updateCategory(input.id || input.name, {
          name: input.name,
          color: input.color,
          pinned: input.pinned,
          position: input.position,
        });
      }
      if (input.action === 'delete') return store.deleteCategory(input.id || input.name);
      throw new Error(`Unsupported category action: ${input.action}`);
    case 'agendamea_list_trash':
      return store.listTrash({
        typeFilter: input.typeFilter,
        sortBy: input.sortBy,
        query: input.query,
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
      });
    case 'agendamea_manage_trash':
      if (input.action === 'restore') return store.restoreItem(input.target, input.itemType || 'auto');
      if (input.action === 'permanent_delete') return store.permanentDeleteItem(input.target, input.itemType || 'auto');
      if (input.action === 'empty') return store.emptyTrash();
      throw new Error(`Unsupported trash action: ${input.action}`);
    case 'agendamea_eisenhower_matrix':
      return store.getMatrix();
    case 'agendamea_get_settings':
      return store.getSettings();
    case 'agendamea_update_settings':
      return store.updateSettings(input.patch);
    case 'agendamea_backup_and_sync':
      if (input.action === 'export') return store.exportBackup(input.filePath);
      if (input.action === 'import') return store.importBackup(input.payload || input.filePath);
      if (input.action === 'cloud_status') return store.getCloudStatus();
      if (input.action === 'connect_cloud') {
        return store.connectCloud(input.folderPath, input.autoSync === undefined ? true : Boolean(input.autoSync));
      }
      if (input.action === 'disconnect_cloud') return store.disconnectCloud();
      if (input.action === 'sync_cloud') return store.syncCloud();
      if (input.action === 'pull_cloud') return store.pullCloud();
      if (input.action === 'test_webhook') return store.testWebhook(input.webhookUrl);
      if (input.action === 'reset') return store.resetAllData({ resetSettings: Boolean(input.resetSettings) });
      throw new Error(`Unsupported backup/sync action: ${input.action}`);
    case 'agendamea_views':
      if (input.view === 'calendar') return store.getCalendarAgenda({ dateFrom: input.dateFrom, dateTo: input.dateTo });
      if (input.view === 'kanban') return store.getKanbanBoard(input.groupBy || 'priority');
      if (input.view === 'matrix') return store.getMatrix();
      throw new Error(`Unsupported view: ${input.view}`);
    case 'agendamea_webhook_and_server':
      if (input.action === 'server_status') return store.getHeadlessServerStatus();
      if (input.action === 'server_start') return store.startHeadlessServer({ port: input.port });
      if (input.action === 'server_stop') return store.stopHeadlessServer();
      if (input.action === 'webhook_logs') return store.getWebhookLogs(input.limit || 30);
      if (input.action === 'clear_webhook_logs') return store.clearWebhookLogs();
      if (input.action === 'test_webhook') return store.testWebhook(input.webhookUrl);
      if (input.action === 'check_updates') return store.checkForUpdates();
      throw new Error(`Unsupported webhook/server action: ${input.action}`);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
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

function maybeExit() {
  if (stdinEnded && pendingRequests === 0) {
    process.exit(0);
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

function dispatchMessage(parsed) {
  pendingRequests += 1;
  Promise.resolve(handleRequest(parsed)).finally(() => {
    pendingRequests -= 1;
    maybeExit();
  });
}

let incomingBuffer = Buffer.alloc(0);

function processBuffer() {
  while (incomingBuffer.length > 0) {
    while (incomingBuffer.length > 0 && (incomingBuffer[0] === 0x0d || incomingBuffer[0] === 0x0a)) {
      incomingBuffer = incomingBuffer.slice(1);
    }
    if (incomingBuffer.length === 0) return;

    const headText = incomingBuffer.slice(0, Math.min(incomingBuffer.length, 64)).toString('utf8');
    if (/^content-length:/i.test(headText)) {
      useContentLengthFraming = true;
      const headerEnd = incomingBuffer.indexOf('\r\n\r\n');
      if (headerEnd === -1) return;
      const header = incomingBuffer.slice(0, headerEnd).toString('utf8');
      const match = /content-length:\s*(\d+)/i.exec(header);
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
        dispatchMessage(JSON.parse(bodyStr));
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
      dispatchMessage(JSON.parse(line));
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
  if (incomingBuffer.length > 0) {
    const tail = incomingBuffer.toString('utf8').trim();
    incomingBuffer = Buffer.alloc(0);
    if (tail && !/^content-length:/i.test(tail)) {
      try {
        dispatchMessage(JSON.parse(tail));
      } catch {
        // Ignore incomplete tail
      }
    }
  }
  stdinEnded = true;
  maybeExit();
});
