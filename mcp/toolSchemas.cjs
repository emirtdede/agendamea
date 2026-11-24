'use strict';

const GENERIC_OBJECT_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: true,
};

const LIST_WRAPPER_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    items: { type: 'array' },
    count: { type: 'integer' },
  },
  required: ['items', 'count'],
  additionalProperties: true,
};

const TOOLS = [
  {
    name: 'agendamea_status',
    description:
      'Return Agendamea counts (active, today, important, pinned, completed, categories, trash) and connection mode.',
    inputSchema: { type: 'object', properties: {} },
    outputSchema: {
      type: 'object',
      properties: {
        mode: { type: 'string' },
        activeTasks: { type: 'integer' },
        todayTasks: { type: 'integer' },
        importantTasks: { type: 'integer' },
        completedTasks: { type: 'integer' },
        categories: { type: 'integer' },
      },
      additionalProperties: true,
    },
    annotations: {
      title: 'Workspace Status',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: 'agendamea_list_tasks',
    description:
      'List tasks with full details (including subtasks, dueTime, startDate, tags, pinned) and optional filters & sorting.',
    inputSchema: {
      type: 'object',
      properties: {
        filter: {
          type: 'string',
          enum: ['active', 'completed', 'all', 'today', 'important', 'pinned'],
          description: 'Task subset to return (default: active).',
        },
        category: { type: 'string', description: 'Optional category name or ID to filter by.' },
        priority: {
          type: 'string',
          enum: ['low', 'normal', 'high'],
          description: 'Optional priority filter.',
        },
        tag: { type: 'string', description: 'Optional tag filter (with or without #).' },
        query: {
          type: 'string',
          description: 'Optional search text matching title, notes, subtasks, or tags.',
        },
        dateFrom: { type: 'string', description: 'Optional start date bound (YYYY-MM-DD).' },
        dateTo: { type: 'string', description: 'Optional end date bound (YYYY-MM-DD).' },
        sortBy: {
          type: 'string',
          enum: ['manual', 'priority', 'dueDate', 'newest'],
          description: 'Optional sort order.',
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 500,
          description: 'Optional page size limit (1-500) for pagination.',
        },
        offset: {
          type: 'integer',
          minimum: 0,
          description: 'Optional 0-based start offset for pagination.',
        },
      },
    },
    outputSchema: LIST_WRAPPER_OUTPUT_SCHEMA,
    annotations: {
      title: 'List Tasks',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: 'agendamea_get_task',
    description:
      'Retrieve full details of a single task (notes, subtasks, tags, schedule, category) by number, keyword, or ID.',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: {
        id: {
          type: 'string',
          description: 'Task ID, unique prefix, 1-based number, or title keyword.',
        },
      },
    },
    outputSchema: GENERIC_OBJECT_OUTPUT_SCHEMA,
    annotations: {
      title: 'Get Task Details',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: 'agendamea_add_task',
    description:
      'Create a new task with optional schedule, time, priority, tags, category, notes, pinning, and subtasks.',
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
        category: {
          type: 'string',
          description: 'Optional category name (resolved automatically).',
        },
        subtasks: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional initial subtask titles.',
        },
      },
    },
    outputSchema: GENERIC_OBJECT_OUTPUT_SCHEMA,
    annotations: {
      title: 'Add Task',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  {
    name: 'agendamea_update_task',
    description:
      'Update any field of an existing task (title, notes, dates, dueTime, priority, important, pinned, tags, category, or list position).',
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
        position: {
          type: 'integer',
          description: 'Optional 1-based custom order position to move this task to.',
        },
      },
    },
    outputSchema: GENERIC_OBJECT_OUTPUT_SCHEMA,
    annotations: {
      title: 'Update Task',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
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
    outputSchema: GENERIC_OBJECT_OUTPUT_SCHEMA,
    annotations: {
      title: 'Complete Task',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
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
    outputSchema: GENERIC_OBJECT_OUTPUT_SCHEMA,
    annotations: {
      title: 'Pin Task',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
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
    outputSchema: GENERIC_OBJECT_OUTPUT_SCHEMA,
    annotations: {
      title: 'Move Task to Trash',
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false,
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
    outputSchema: GENERIC_OBJECT_OUTPUT_SCHEMA,
    annotations: {
      title: 'Clear Completed Tasks',
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
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
        subtaskId: {
          type: 'string',
          description: 'Subtask ID, 1-based index, or keyword (required for update/toggle/delete).',
        },
        completed: {
          type: 'boolean',
          description: 'Optional explicit completion state when action=toggle or update.',
        },
      },
    },
    outputSchema: GENERIC_OBJECT_OUTPUT_SCHEMA,
    annotations: {
      title: 'Manage Subtask',
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  {
    name: 'agendamea_list_categories',
    description:
      'List all active categories along with their color, pin state, and active task counts.',
    inputSchema: { type: 'object', properties: {} },
    outputSchema: LIST_WRAPPER_OUTPUT_SCHEMA,
    annotations: {
      title: 'List Categories',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: 'agendamea_manage_category',
    description: 'Create, update (name/color/pinned/position), or soft-delete a category.',
    inputSchema: {
      type: 'object',
      required: ['action'],
      properties: {
        action: { type: 'string', enum: ['create', 'update', 'delete'] },
        id: {
          type: 'string',
          description: 'Target category ID, name, or number (for update/delete).',
        },
        name: {
          type: 'string',
          description: 'Category name (for create, or renamed title for update).',
        },
        color: { type: 'string', description: 'HEX color code (e.g. #2563eb).' },
        pinned: { type: 'boolean' },
        position: { type: 'integer', description: 'Optional 1-based order position for update.' },
      },
    },
    outputSchema: GENERIC_OBJECT_OUTPUT_SCHEMA,
    annotations: {
      title: 'Manage Category',
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  {
    name: 'agendamea_list_trash',
    description:
      'Inspect deleted tasks and categories currently in Trash with optional search, type, sort, and date-range filters.',
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
    outputSchema: GENERIC_OBJECT_OUTPUT_SCHEMA,
    annotations: {
      title: 'List Trash',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: 'agendamea_manage_trash',
    description:
      'Restore a trashed task/category, permanently delete one item, or empty the entire Trash. Irreversible actions (permanent_delete, empty) require confirm=true.',
    inputSchema: {
      type: 'object',
      required: ['action'],
      properties: {
        action: { type: 'string', enum: ['restore', 'permanent_delete', 'empty'] },
        target: {
          type: 'string',
          description: 'Item ID, number, or keyword (optional for restore -> restores latest).',
        },
        itemType: { type: 'string', enum: ['auto', 'todo', 'category'] },
        confirm: {
          type: 'boolean',
          description:
            'Must be set to true to execute irreversible permanent_delete or empty actions.',
        },
      },
    },
    outputSchema: GENERIC_OBJECT_OUTPUT_SCHEMA,
    annotations: {
      title: 'Manage Trash',
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  {
    name: 'agendamea_eisenhower_matrix',
    description: 'Return active tasks grouped into the 4 Eisenhower Matrix quadrants (q1..q4).',
    inputSchema: { type: 'object', properties: {} },
    outputSchema: GENERIC_OBJECT_OUTPUT_SCHEMA,
    annotations: {
      title: 'Eisenhower Matrix',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: 'agendamea_get_settings',
    description:
      'Read all Agendamea application preferences, cloud sync path, and webhook settings.',
    inputSchema: { type: 'object', properties: {} },
    outputSchema: GENERIC_OBJECT_OUTPUT_SCHEMA,
    annotations: {
      title: 'Get Settings',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: 'agendamea_update_settings',
    description:
      'Update any Agendamea preference (themeMode, themeId, language, zoomPercent, closeBehavior, webhookUrl, webhookEnabled, etc.).',
    inputSchema: {
      type: 'object',
      properties: {
        patch: { type: 'object', description: 'Partial AppSettings key-value object.' },
      },
      required: ['patch'],
    },
    outputSchema: GENERIC_OBJECT_OUTPUT_SCHEMA,
    annotations: {
      title: 'Update Settings',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: 'agendamea_backup_and_sync',
    description:
      'Export/import JSON backups, inspect/connect/push/pull/disconnect cloud folder sync, test webhooks, or perform a clean reset.',
    inputSchema: {
      type: 'object',
      required: ['action'],
      properties: {
        action: {
          type: 'string',
          enum: [
            'export',
            'import',
            'cloud_status',
            'connect_cloud',
            'disconnect_cloud',
            'sync_cloud',
            'pull_cloud',
            'test_webhook',
            'reset',
          ],
        },
        filePath: { type: 'string', description: 'Optional file path for export/import.' },
        folderPath: {
          type: 'string',
          description:
            'Cloud sync folder path for connect_cloud (omit to auto-detect installed cloud provider).',
        },
        autoSync: {
          type: 'boolean',
          description: 'Enable auto-sync on connect_cloud (default: true).',
        },
        payload: { type: 'object', description: 'Inline JSON backup object for import.' },
        webhookUrl: { type: 'string', description: 'Optional URL override for test_webhook.' },
        resetSettings: {
          type: 'boolean',
          description: 'When action=reset, also reset preferences to defaults.',
        },
        confirm: {
          type: 'boolean',
          description: 'Must be set to true to execute irreversible reset action.',
        },
      },
    },
    outputSchema: GENERIC_OBJECT_OUTPUT_SCHEMA,
    annotations: {
      title: 'Backup and Cloud Sync',
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  {
    name: 'agendamea_views',
    description:
      'Return structured Kanban board (by priority or status), Calendar chronological agenda (grouped by date + undated), or Eisenhower Matrix.',
    inputSchema: {
      type: 'object',
      required: ['view'],
      properties: {
        view: { type: 'string', enum: ['calendar', 'kanban', 'matrix'] },
        groupBy: {
          type: 'string',
          enum: ['priority', 'status'],
          description: 'For view=kanban (default: priority).',
        },
        dateFrom: {
          type: 'string',
          description: 'Optional start bound YYYY-MM-DD for view=calendar.',
        },
        dateTo: { type: 'string', description: 'Optional end bound YYYY-MM-DD for view=calendar.' },
      },
    },
    outputSchema: GENERIC_OBJECT_OUTPUT_SCHEMA,
    annotations: {
      title: 'Structured Views',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: 'agendamea_webhook_and_server',
    description:
      'Manage headless API/Webhook daemon (start/stop/status without GUI), inspect/clear/replay webhook logs & outbox queue, test webhooks, or check app updates.',
    inputSchema: {
      type: 'object',
      required: ['action'],
      properties: {
        action: {
          type: 'string',
          enum: [
            'server_status',
            'server_start',
            'server_stop',
            'webhook_logs',
            'clear_webhook_logs',
            'webhook_outbox',
            'replay_webhook',
            'test_webhook',
            'check_updates',
          ],
        },
        port: {
          type: 'integer',
          description: 'Optional port for server_start (default: auto preferred port).',
        },
        limit: { type: 'integer', description: 'Maximum log/outbox entries (default: 30).' },
        outboxId: { type: 'string', description: 'Outbox entry ID for replay_webhook.' },
        webhookUrl: { type: 'string', description: 'Optional URL override for test_webhook.' },
      },
    },
    outputSchema: GENERIC_OBJECT_OUTPUT_SCHEMA,
    annotations: {
      title: 'Webhook and Headless Server',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  {
    name: 'agendamea_semantic_search',
    description:
      'Run Chunked Hybrid RAG search (SQLite FTS5 BM25 + Vector RRF) across all active tasks and long notes with transparent search mode metadata.',
    inputSchema: {
      type: 'object',
      required: ['query'],
      properties: {
        query: { type: 'string', description: 'Natural language search query or keyword.' },
        topK: { type: 'integer', description: 'Maximum ranked matches to return (default: 5).' },
        minScore: {
          type: 'number',
          description: 'Minimum normalized relevance score threshold (default: 0.35).',
        },
      },
    },
    outputSchema: GENERIC_OBJECT_OUTPUT_SCHEMA,
    annotations: {
      title: 'Semantic Hybrid RAG Search',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: 'agendamea_ai_status',
    description:
      'Inspect local hardware profile (64-bit VRAM, RAM, CPU, disk), recommended AI tier, detected Ollama/LM Studio backends, and installed Apache 2.0 / MIT model status.',
    inputSchema: {
      type: 'object',
      properties: {
        force: { type: 'boolean', description: 'Force fresh hardware rescan (default: false).' },
      },
    },
    outputSchema: GENERIC_OBJECT_OUTPUT_SCHEMA,
    annotations: {
      title: 'Local AI Hardware Status',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  {
    name: 'agendamea_ask',
    description:
      'Run natural-language task assistant query or command (defaults to readOnly=true; destructive commands return a confirmToken for two-step confirmation).',
    inputSchema: {
      type: 'object',
      required: ['text'],
      properties: {
        text: { type: 'string', description: 'Natural-language request or command.' },
        language: { type: 'string', description: 'Optional language code (e.g. tr, en).' },
        readOnly: {
          type: 'boolean',
          description: 'Prevent state mutation (default: true for safety).',
        },
        confirmToken: {
          type: 'string',
          description: 'Confirmation token returned by a previous destructive request.',
        },
        selectedTodoId: {
          type: 'string',
          description: 'Disambiguated task ID when multiple matches were returned.',
        },
      },
    },
    outputSchema: GENERIC_OBJECT_OUTPUT_SCHEMA,
    annotations: {
      title: 'Natural Language Assistant',
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
];

const STATIC_RESOURCES = [
  {
    uri: 'agendamea://status',
    name: 'Workspace Status',
    description: 'Live Agendamea task counts, category count, trash count, and storage mode.',
    mimeType: 'application/json',
  },
  {
    uri: 'agendamea://tasks/today',
    name: 'Today Tasks',
    description: 'Active tasks scheduled for today or overdue.',
    mimeType: 'application/json',
  },
  {
    uri: 'agendamea://tasks/overdue',
    name: 'Overdue Tasks',
    description: 'Incomplete tasks whose dueDate is strictly before today.',
    mimeType: 'application/json',
  },
  {
    uri: 'agendamea://matrix',
    name: 'Eisenhower Matrix',
    description: 'Active tasks grouped across Eisenhower quadrants q1..q4.',
    mimeType: 'application/json',
  },
  {
    uri: 'agendamea://categories',
    name: 'Categories',
    description: 'Active categories with colors, pin states, and active task counts.',
    mimeType: 'application/json',
  },
];

const RESOURCE_TEMPLATES = [
  {
    uriTemplate: 'agendamea://task/{id}',
    name: 'Task Detail',
    description: 'Full detail of a single Agendamea task by ID, prefix, or title keyword.',
    mimeType: 'application/json',
  },
  {
    uriTemplate: 'agendamea://category/{name}/tasks',
    name: 'Category Tasks',
    description: 'Active tasks belonging to a specific category name or ID.',
    mimeType: 'application/json',
  },
];

const PROMPTS = [
  {
    name: 'daily_plan',
    description: 'Build a focused daily execution plan from today and overdue tasks.',
    arguments: [
      {
        name: 'focusHours',
        description: 'Optional available deep-work hours today (e.g. 4).',
        required: false,
      },
    ],
  },
  {
    name: 'triage_overdue',
    description: 'Triage overdue tasks: reschedule, delegate/deprioritize, or close stale items.',
    arguments: [],
  },
  {
    name: 'eisenhower_review',
    description: 'Review all 4 Eisenhower Matrix quadrants and recommend top Q1/Q2 actions.',
    arguments: [],
  },
  {
    name: 'weekly_summary',
    description: 'Summarize active workload, recently completed work, and next week priorities.',
    arguments: [],
  },
];

module.exports = {
  TOOLS,
  STATIC_RESOURCES,
  RESOURCE_TEMPLATES,
  PROMPTS,
};
