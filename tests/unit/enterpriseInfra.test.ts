import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import express from 'express';
import { registerRequestLogger } from '../../server/middleware/requestLogger.ts';
import { validateBody } from '../../server/middleware/validate.ts';
import { createMcpInProcessStore } from '../../server/services/mcpInProcessStore.ts';
import type { ServerContext } from '../../server/types.ts';
import crashDiagnostics from '../../shared/crashDiagnostics.cjs';
import loggerMod from '../../shared/logger.cjs';
import schemas from '../../shared/schemas/index.cjs';
import { TodoDatabase } from '../../src/db/database.ts';
import { createWorkspaceUiStore } from '../../src/store/workspaceUiStore';

test('ENTERPRISE-1: Pino logger emits redacted NDJSON and rotates files safely on Windows', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agendamea-logger-test-'));
  try {
    const { logger, logFilePath, flushSync, close } = loggerMod.createAppLogger({
      dataDir: tmpDir,
      processName: 'server',
      level: 'info',
    });

    logger.info?.(
      {
        secret: 'whsec_superSecretValue12345',
        authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.secret',
        note: 'Failed reading C:\\Users\\emir\\Documents\\secret.json with whsec_inlineSecret99',
      },
      'Webhook failed for C:\\Users\\emir\\AppData\\Agendamea with Bearer tok_999999',
    );
    flushSync();
    close();

    const raw = fs.readFileSync(logFilePath, 'utf8').trim();
    assert.ok(raw.length > 0, 'Logger must write NDJSON line to server.log');
    const parsed = JSON.parse(raw.split(/\r?\n/)[0] ?? '{}') as Record<string, unknown>;
    assert.equal(parsed.secret, '[REDACTED]');
    assert.equal(parsed.authorization, '[REDACTED]');
    assert.ok(!raw.includes('whsec_superSecretValue12345'), 'Must redact whsec_ token');
    assert.ok(!raw.includes('eyJhbGciOiJIUzI1NiJ9'), 'Must redact Bearer token');
    assert.ok(!raw.includes('C:\\Users\\emir'), 'Must redact Windows user profile path');

    const sanitized = loggerMod.sanitizeTextForLog(
      'Path /Users/alice/private whsec_abc123456789 Bearer tok_secret_xyz',
    );
    assert.ok(!sanitized.includes('/Users/alice'));
    assert.ok(!sanitized.includes('whsec_abc123456789'));
    assert.ok(!sanitized.includes('tok_secret_xyz'));

    // Rotation test: pre-seed >5 MB log file and verify rotation rotates to server.1.log
    fs.writeFileSync(logFilePath, Buffer.alloc(5 * 1024 * 1024 + 128, 65));
    const rotated = loggerMod.createAppLogger({
      dataDir: tmpDir,
      processName: 'server',
      level: 'info',
    });
    rotated.logger.info?.('post-rotation-entry');
    rotated.flushSync();
    rotated.close();
    const expectedRotatedPath = path.join(path.dirname(logFilePath), 'server.1.log');
    assert.ok(
      fs.existsSync(expectedRotatedPath),
      'Rotation must move oversized log to server.1.log',
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 4, retryDelay: 50 });
  }
});

test('ENTERPRISE-2: Local crashDiagnostics writes redacted JSON reports and enforces 10-file cap', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agendamea-crash-test-'));
  try {
    let lastFilePath = '';
    for (let i = 0; i < 12; i += 1) {
      const err = new Error(
        `Crash #${i} at C:\\Users\\emir\\secret.db token Bearer secret_tok_${i} whsec_key_${i}`,
      );
      const written = crashDiagnostics.writeCrashReport({
        dataDir: tmpDir,
        source: 'unit-test',
        error: err,
        context: { webhookSecret: `whsec_ctx_${i}`, step: i },
      });
      if (written.filePath) lastFilePath = written.filePath;
    }

    const reports = crashDiagnostics.listCrashReports(tmpDir);
    assert.ok(
      reports.length <= 10,
      `Crash retention cap must keep <=10 files (got ${reports.length})`,
    );
    assert.ok(reports.length >= 1, 'At least one crash report must exist');

    const raw = fs.readFileSync(lastFilePath, 'utf8');
    assert.ok(!raw.includes('C:\\Users\\emir'), 'Crash report must redact Windows user path');
    assert.ok(!raw.includes('secret_tok_'), 'Crash report must redact Bearer token');
    assert.ok(!raw.includes('whsec_key_'), 'Crash report must redact whsec_ secret');
    assert.ok(!raw.includes('whsec_ctx_'), 'Crash report must redact context secret');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 4, retryDelay: 50 });
  }
});

test('ENTERPRISE-3: Shared Zod v4 schemas validate payloads and generate clean MCP JSON Schemas', () => {
  const okTodo = schemas.CreateTodoBodySchema.safeParse({
    title: 'Ship enterprise release',
    priority: 'high',
    dueDate: '2026-12-01',
    dueTime: '09:30',
    tags: ['release'],
  });
  assert.equal(okTodo.success, true);

  const badTodo = schemas.CreateTodoBodySchema.safeParse({ title: '   ' });
  assert.equal(badTodo.success, false);

  const badPatch = schemas.UpdateTodoBodySchema.safeParse({ completed: 'not-a-boolean' });
  assert.equal(badPatch.success, false);
  const badTitlePatch = schemas.UpdateTodoBodySchema.safeParse({ title: 12345 });
  assert.equal(badTitlePatch.success, false);

  const okCrash = schemas.CrashReportBodySchema.safeParse({
    source: 'renderer',
    message: 'Render failure',
  });
  assert.equal(okCrash.success, true);

  const jsonSchema = schemas.toMcpJsonSchema(schemas.McpAddTaskArgsSchema) as Record<
    string,
    unknown
  >;
  assert.equal(jsonSchema.type, 'object');
  assert.equal('$schema' in jsonSchema, false, 'MCP tool inputSchema should omit $schema meta');
  assert.ok(
    jsonSchema.properties &&
      typeof jsonSchema.properties === 'object' &&
      'title' in jsonSchema.properties,
    'Generated JSON schema must expose title property',
  );
});

test('ENTERPRISE-4: workspaceUiStore isolates instances and handles navigation/modal transitions', () => {
  const storeA = createWorkspaceUiStore();
  const storeB = createWorkspaceUiStore();
  let notifications = 0;
  const unsub = storeA.subscribe(() => {
    notifications += 1;
  });

  storeA.openSettings('webhooks');
  assert.equal(storeA.getState().isSettingsOpen, true);
  assert.equal(storeA.getState().settingsInitialTab, 'webhooks');
  assert.equal(storeB.getState().isSettingsOpen, false, 'Store instances must remain isolated');

  const prevCount = notifications;
  storeA.setLayoutMode('list');
  assert.equal(notifications, prevCount, 'Unchanged field patch must bail out without notifying');

  storeA.selectView({ type: 'smart', id: 'today' });
  assert.equal(storeA.getState().isSettingsOpen, false);
  assert.deepEqual(storeA.getState().activeView, { type: 'smart', id: 'today' });

  storeA.setSearchQuery('audit');
  storeA.setTagFilter('qa');
  storeA.resetNavigationForRestore();
  assert.equal(storeA.getState().searchQuery, '');
  assert.equal(storeA.getState().tagFilter, null);
  assert.deepEqual(storeA.getState().activeView, { type: 'smart', id: 'all' });

  unsub();
  assert.equal(storeA.getListenerCount(), 0);
});

test('ENTERPRISE-5: Express validateBody/requestLogger and in-process MCP store adapter work end-to-end', async () => {
  // 1. Validate middleware + requestLogger via ephemeral loopback Express app
  const app = express();
  app.use(express.json());
  registerRequestLogger(app);
  app.post(
    '/api/test-validate',
    validateBody(schemas.CreateTodoBodySchema, 'Invalid todo'),
    (req, res) => {
      res.status(201).json({ accepted: req.body });
    },
  );
  app.get('/api/test-error', (_req, res) => {
    res.status(500).json({ error: 'boom' });
  });
  app.get('/non-api', (_req, res) => {
    res.status(200).send('ok');
  });

  const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const srv = app.listen(0, '127.0.0.1', () => resolve(srv));
  });
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;

  try {
    const badRes = await fetch(`http://127.0.0.1:${port}/api/test-validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Request-Id': 'req-custom-42' },
      body: JSON.stringify({ title: '   ' }),
    });
    assert.equal(badRes.status, 400);
    assert.equal(badRes.headers.get('x-request-id'), 'req-custom-42');

    const okRes = await fetch(`http://127.0.0.1:${port}/api/test-validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Ship v2', priority: 'high' }),
    });
    assert.equal(okRes.status, 201);
    assert.ok(okRes.headers.get('x-request-id'), 'Middleware must auto-generate X-Request-Id');

    const errRes = await fetch(`http://127.0.0.1:${port}/api/test-error`);
    assert.equal(errRes.status, 500);

    const nonApiRes = await fetch(`http://127.0.0.1:${port}/non-api`);
    assert.equal(nonApiRes.status, 200);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  // 2. Full in-process MCP store adapter + admin ops against in-memory SQLite
  const db = new TodoDatabase(':memory:');
  const tmpBackupDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agendamea-mcp-inproc-'));
  const dispatchedEvents: string[] = [];
  const broadcasts: string[] = [];
  try {
    const stubCtx = {
      app,
      db,
      appVersion: '1.1.0-test',
      githubReleasesApi: 'http://127.0.0.1:1/unreachable',
      githubReleasesHtml: 'https://github.com/example/agendamea/releases',
      getActiveListenPort: () => port,
      sseClients: new Set(),
      maxSseClients: 32,
      broadcastSseEvent: () => {
        /* noop */
      },
      broadcastExternalChange: (reason: string) => broadcasts.push(reason),
      cloudSync: {
        resolveOneDriveStatus: () => ({
          connected: false,
          autoSync: false,
          folderPath: tmpBackupDir,
          hasBackup: false,
          lastSyncAt: null,
        }),
        detectDefaultOneDriveRoot: () => tmpBackupDir,
        writeOneDriveSyncSnapshot: () => ({
          connected: true,
          autoSync: true,
          folderPath: tmpBackupDir,
          hasBackup: true,
          lastSyncAt: new Date().toISOString(),
        }),
        readValidOneDriveBackup: () => null,
        triggerOneDriveAutoSync: () => {
          /* noop */
        },
      },
      webhooks: {
        dispatchConfiguredWebhook: (event: string) => dispatchedEvents.push(event),
        deliverWebhookRequest: async () => ({ ok: true, statusCode: 200, error: '' }),
      },
      aiRuntime: {
        scheduleBackgroundRagSync: () => {
          /* noop */
        },
        runHybridRagQuery: async (query: string) => ({ query, hits: [] }),
        getAiStatusSnapshot: async () => ({ ready: true, provider: 'stub' }),
        syncAiRuntimeFromSettings: () => ({ aiUseExternalOllama: false, aiOllamaModel: '' }),
        getExternalBackendsCached: async () => [],
        createVoiceStoreAdapter: () => ({}),
        llmService: {},
        voiceOrchestrator: {
          handleUtterance: async () => ({ ok: true, mutated: true, reply: 'Done' }),
        },
      },
    } as unknown as ServerContext;

    const mcpStore = createMcpInProcessStore(stubCtx);
    const cat = await mcpStore.createCategory({ name: 'Platform', color: '#2563eb' });
    assert.ok(cat.id);
    const cat2 = await mcpStore.createCategory({ name: 'Ops', color: '#16a34a' });
    await mcpStore.updateCategory('Ops', { name: 'Operations', position: 1, pinned: true });
    const cats = await mcpStore.listCategories();
    assert.equal(cats.length, 2);

    const today = mcpStore.getTodayStr();
    const task = await mcpStore.addTask({
      title: 'Harden CI gates',
      category: 'Platform',
      priority: 'high',
      important: true,
      dueDate: today,
      tags: ['ci'],
      subtasks: ['Add Biome', { title: 'Add Vitest', completed: false }],
    });
    const fetched = await mcpStore.getTask(task.id);
    assert.equal(fetched.categoryName, 'Platform');
    assert.equal(fetched.subtasks.length, 2);

    await mcpStore.updateTask(task.id, { notes: 'All green', position: 1 });
    await mcpStore.pinTask(task.id, true);
    const sub = await mcpStore.addSubtask(task.id, 'Verify E2E');
    await mcpStore.updateSubtask(task.id, sub.id, { title: 'Verify Electron E2E' });
    await mcpStore.toggleSubtask(task.id, '1');
    await mcpStore.deleteSubtask(task.id, sub.id);

    const listed = await mcpStore.listTasks({ filter: 'today', category: 'Platform' });
    assert.equal(listed.length, 1);
    const matrix = await mcpStore.getMatrix();
    assert.ok(matrix);
    const agenda = await mcpStore.getCalendarAgenda({ dateFrom: today, dateTo: today });
    assert.ok(agenda);
    const board = await mcpStore.getKanbanBoard('priority');
    assert.ok(board);

    await mcpStore.completeTask(task.id, true);
    const cleared = await mcpStore.clearCompleted('Platform');
    assert.equal(cleared.clearedCount, 1);

    const trash = await mcpStore.listTrash({ typeFilter: 'todos', sortBy: 'az', query: 'Harden' });
    assert.equal(trash.todos.length, 1);
    const restored = await mcpStore.restoreItem('1', 'todo');
    assert.equal(restored.kind, 'todo');

    await mcpStore.deleteTask(task.id);
    await mcpStore.deleteCategory(cat2.id);
    await mcpStore.permanentDeleteItem(task.id, 'todo');
    await mcpStore.emptyTrash();

    await mcpStore.updateSettings({ themeMode: 'dark' });
    assert.equal((await mcpStore.getSettings()).themeMode, 'dark');

    const backupFile = path.join(tmpBackupDir, 'backup.json');
    const exp = await mcpStore.exportBackup(backupFile);
    assert.equal('ok' in exp && exp.ok, true);
    await mcpStore.importBackup(backupFile);

    await mcpStore.connectCloud(tmpBackupDir, true);
    await mcpStore.syncCloud();
    await mcpStore.getCloudStatus();
    await mcpStore.disconnectCloud();

    assert.equal((await mcpStore.getWebhookLogs(10)).length, 0);
    await mcpStore.clearWebhookLogs();
    assert.equal((await mcpStore.getWebhookOutbox(10)).length, 0);
    const headless = await mcpStore.startHeadlessServer();
    assert.equal(headless.running, true);
    assert.equal((await mcpStore.stopHeadlessServer()).ok, false);

    const status = await mcpStore.getStatus();
    assert.equal(status.mode, 'in-process');
    await mcpStore.semanticSearchRag('ci');
    await mcpStore.getAiStatus({ force: true });
    const aiRes = await mcpStore.askAiAssistant('list tasks');
    assert.equal(aiRes.ok, true);
    await mcpStore.resetAllData({ resetSettings: false });

    assert.ok(dispatchedEvents.includes('todo.created'));
    assert.ok(broadcasts.length >= 10);
  } finally {
    db.close();
    fs.rmSync(tmpBackupDir, { recursive: true, force: true, maxRetries: 4, retryDelay: 50 });
  }
});
