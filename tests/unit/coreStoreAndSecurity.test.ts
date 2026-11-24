import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import express from 'express';
import mcpServer from '../../mcp/server.cjs';
import {
  assertSafeLocalSyncFolder,
  createMemoryRateLimiter,
  isLoopbackAddress,
  isLoopbackHostname,
  isPlainObject,
  parseHostHeaderHostname,
  registerSecurityMiddleware,
  sendRouteError,
  timingSafeCompareStrings,
} from '../../server/middleware/security.ts';
import localStore from '../../shared/localStore.cjs';
import releaseUtils from '../../shared/releaseUtils.cjs';
import webhookEngine from '../../shared/webhookEngine.cjs';
import { TodoDatabase, ValidationError } from '../../src/db/database.ts';

test('CORE-1: releaseUtils compares semver and normalizes GitHub release payloads', () => {
  assert.equal(releaseUtils.compareSemver('1.2.0', '1.1.9'), 1);
  assert.equal(releaseUtils.compareSemver('1.1.0', '1.2.0'), -1);
  assert.equal(releaseUtils.compareSemver('v1.1.0', '1.1.0'), 0);
  assert.equal(releaseUtils.compareSemver('1.2.0', '1.2.0-beta.1'), 1);
  assert.equal(releaseUtils.compareSemver('1.2.0-beta.1', '1.2.0'), -1);
  assert.ok(releaseUtils.compareSemver('1.2.0-beta.2', '1.2.0-beta.1') > 0);

  const parsed = releaseUtils.parseGitHubRelease(
    {
      tag_name: 'v1.3.0',
      name: 'Agendamea v1.3.0',
      body: 'Release notes body',
      published_at: '2026-11-20T12:00:00Z',
      html_url: 'https://github.com/emirtdede/agendamea/releases/tag/v1.3.0',
      assets: [
        { name: 'Agendamea-Setup-1.3.0-win-x64.exe', browser_download_url: 'https://ex/setup.exe' },
        {
          name: 'Agendamea-Portable-1.3.0-win-x64.exe',
          browser_download_url: 'https://ex/portable.exe',
        },
        {
          name: 'Agendamea-Store-1.3.0-win-x64.msix',
          browser_download_url: 'https://ex/store.msix',
        },
      ],
    },
    '1.1.0',
    'https://github.com/emirtdede/agendamea/releases',
    '2026-11-24T00:00:00Z',
    { nativeLatestVersion: '1.4.0', nativeAutoUpdateReady: true, downloaded: false },
  );
  assert.equal(parsed.ok, true);
  assert.equal(parsed.updateAvailable, true);
  assert.equal(parsed.latestVersion, '1.4.0');
  assert.equal(parsed.setupUrl, 'https://ex/setup.exe');
  assert.equal(parsed.portableUrl, 'https://ex/portable.exe');
  assert.equal(parsed.msixUrl, 'https://ex/store.msix');
  assert.equal(parsed.nativeAutoUpdateReady, true);
  assert.equal(parsed.downloaded, false);
});

test('CORE-2: security middleware guards sync paths, loopback hosts, rate limits, and error translation', async () => {
  const safeTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'agendamea-sec-sync-'));
  try {
    assert.equal(assertSafeLocalSyncFolder(safeTmp), path.resolve(safeTmp));
    assert.throws(() => assertSafeLocalSyncFolder(''), ValidationError);
    assert.throws(() => assertSafeLocalSyncFolder('\\\\server\\share'), ValidationError);
    assert.throws(() => assertSafeLocalSyncFolder(path.parse(safeTmp).root), ValidationError);
    if (process.platform === 'win32') {
      assert.throws(
        () => assertSafeLocalSyncFolder(process.env.SystemRoot || 'C:\\Windows'),
        ValidationError,
      );
    }

    assert.equal(isPlainObject({ a: 1 }), true);
    assert.equal(isPlainObject([]), false);
    assert.equal(isPlainObject(null), false);
    assert.equal(isLoopbackAddress('127.0.0.1'), true);
    assert.equal(isLoopbackAddress('::ffff:127.0.0.1'), true);
    assert.equal(isLoopbackAddress('192.168.1.5'), false);
    assert.equal(isLoopbackAddress(undefined), false);
    assert.equal(isLoopbackHostname('localhost'), true);
    assert.equal(isLoopbackHostname('example.com'), false);
    assert.equal(timingSafeCompareStrings('secret123', 'secret123'), true);
    assert.equal(timingSafeCompareStrings('secret123', 'secret124'), false);
    assert.equal(timingSafeCompareStrings('', ''), false);
    assert.equal(parseHostHeaderHostname('127.0.0.1:3842'), '127.0.0.1');
    assert.equal(parseHostHeaderHostname(undefined), null);

    const limiter = createMemoryRateLimiter({ windowMs: 1000, maxRequests: 2, maxKeys: 2 });
    assert.equal(limiter('k1'), true);
    assert.equal(limiter('k1'), true);
    assert.equal(limiter('k1'), false);
    assert.equal(limiter('k2'), true);
    assert.equal(limiter('k3'), true);

    const db = new TodoDatabase(':memory:');
    const app = express();
    registerSecurityMiddleware({
      app,
      db,
      host: '127.0.0.1',
      triggerOneDriveAutoSync: () => {
        /* noop */
      },
      scheduleBackgroundRagSync: () => {
        /* noop */
      },
      broadcastExternalChange: () => {
        /* noop */
      },
    });
    app.post('/api/val-err', (_req, res) => {
      sendRouteError(
        res,
        'val-err',
        new ValidationError('Geçersiz bulut eşitleme klasör yolu.'),
        'fallback',
      );
    });
    app.get('/api/server-err', (_req, res) => {
      sendRouteError(res, 'server-err', new Error('unexpected'), 'Fallback message');
    });
    app.get('/api/ok', (_req, res) => {
      res.json({ ok: true });
    });

    const srv = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    const addr = srv.address();
    const port = typeof addr === 'object' && addr ? addr.port : 0;
    try {
      const rOk = await fetch(`http://127.0.0.1:${port}/api/ok`, {
        headers: { Origin: `http://127.0.0.1:${port}` },
      });
      assert.equal(rOk.status, 200);

      const rVal = await fetch(`http://127.0.0.1:${port}/api/val-err`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Agendamea-Lang': 'en' },
        body: JSON.stringify({}),
      });
      assert.equal(rVal.status, 400);

      const rSrv = await fetch(`http://127.0.0.1:${port}/api/server-err`);
      assert.equal(rSrv.status, 500);
      const errJson = (await rSrv.json()) as { error: string };
      assert.equal(errJson.error, 'Fallback message');

      const rCorsBad = await fetch(`http://127.0.0.1:${port}/api/val-err`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'https://evil.example.com',
        },
        body: JSON.stringify({}),
      });
      assert.equal(rCorsBad.status, 403);
    } finally {
      await new Promise<void>((resolve) => srv.close(() => resolve()));
      db.close();
    }
  } finally {
    fs.rmSync(safeTmp, { recursive: true, force: true, maxRetries: 4, retryDelay: 50 });
  }
});

test('CORE-3: webhookEngine formats platforms, verifies Standard Webhooks v1 HMAC, and delivers over HTTP', async () => {
  assert.equal(webhookEngine.isLoopbackHost('localhost'), true);
  assert.equal(webhookEngine.isMetadataOrLinkLocalIp('169.254.169.254'), true);
  assert.equal(webhookEngine.isPrivateOrLoopbackIp('10.0.0.1'), true);
  assert.equal(webhookEngine.isPrivateOrLoopbackIp('8.8.8.8'), false);
  assert.equal(
    webhookEngine.validateWebhookUrlSyntax('https://hooks.slack.com/services/A/B/C').ok,
    true,
  );
  assert.equal(webhookEngine.validateWebhookUrlSyntax('ftp://invalid').ok, false);
  assert.equal(
    webhookEngine.parseWebhookUrls('https://a.example/hook\nhttps://b.example/hook').length,
    2,
  );
  assert.equal(
    webhookEngine.isWebhookEventAllowed('todo.created,todo.updated', 'todo.created'),
    true,
  );
  assert.equal(webhookEngine.isWebhookEventAllowed('todo.created', 'todo.deleted'), false);
  assert.equal(
    webhookEngine.detectPlatformFormat('https://hooks.slack.com/services/1/2/3'),
    'slack',
  );
  assert.equal(
    webhookEngine.detectPlatformFormat('https://discord.com/api/webhooks/1/2'),
    'discord',
  );
  assert.equal(webhookEngine.detectPlatformFormat('https://example.com/hook'), 'generic');

  const sampleData = { title: 'Release v1.1', priority: 'high', dueDate: '2026-12-01' };
  for (const fmt of ['generic', 'slack', 'discord'] as const) {
    const built = webhookEngine.buildWebhookPayload({
      event: 'todo.created',
      data: sampleData,
      targetUrl: 'https://example.com/hook',
      format: fmt,
      appVersion: '1.1.0',
      eventId: 'evt_test_1',
    });
    assert.ok(JSON.stringify(built.body).length > 10);
  }

  const secret = 'whsec_test_signing_key_12345';
  const rawBody = JSON.stringify({ event: 'todo.created', title: 'Signed' });
  const headers = webhookEngine.buildWebhookHeaders({
    event: 'todo.created',
    eventId: 'evt_sig_1',
    timestampSec: Math.floor(Date.now() / 1000),
    secret,
    rawBody,
    appVersion: '1.1.0',
  }) as Record<string, string>;
  assert.ok(headers['webhook-signature']);
  assert.equal(
    webhookEngine.verifyIncomingWebhookAuth({
      headers,
      rawBody,
      configuredSecret: secret,
    }).ok,
    true,
  );
  assert.equal(
    webhookEngine.verifyIncomingWebhookAuth({
      headers: { 'x-agendamea-secret': secret },
      rawBody,
      configuredSecret: secret,
    }).ok,
    true,
  );
  assert.equal(
    webhookEngine.verifyIncomingWebhookAuth({
      headers: {
        'webhook-id': 'evt_old',
        'webhook-timestamp': String(Math.floor(Date.now() / 1000) - 9999),
        'webhook-signature': `v1,${crypto.createHmac('sha256', secret).update('bad').digest('base64')}`,
      },
      rawBody,
      configuredSecret: secret,
    }).ok,
    false,
  );

  assert.equal(webhookEngine.isRetriableHttpStatus(503), true);
  assert.equal(webhookEngine.isRetriableHttpStatus(429), true);
  assert.equal(webhookEngine.isRetriableHttpStatus(400), false);
  assert.equal(webhookEngine.parseRetryAfterMs('5'), 5000);
  assert.ok(webhookEngine.computeFullJitterBackoffMs(2) >= 0);

  let mode: 'ok' | 'err' = 'ok';
  const receiver = http.createServer((_req, res) => {
    if (mode === 'ok') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ received: true }));
    } else {
      res.writeHead(503, { 'Retry-After': '2' });
      res.end('Temporarily unavailable');
    }
  });
  await new Promise<void>((resolve) => receiver.listen(0, '127.0.0.1', () => resolve()));
  const addr = receiver.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  try {
    const okDelivery = await webhookEngine.deliverWebhookOnce({
      targetUrl: `http://127.0.0.1:${port}/hook`,
      secret,
      event: 'webhook.test',
      data: sampleData,
      format: 'generic',
      appVersion: '1.1.0',
      allowLocalNetwork: true,
      timeoutMs: 3000,
    });
    assert.equal(okDelivery.ok, true);
    assert.equal(okDelivery.statusCode, 200);

    mode = 'err';
    const failDelivery = await webhookEngine.deliverWebhookOnce({
      targetUrl: `http://127.0.0.1:${port}/hook`,
      secret,
      event: 'webhook.test',
      data: sampleData,
      format: 'generic',
      appVersion: '1.1.0',
      allowLocalNetwork: true,
      timeoutMs: 3000,
    });
    assert.equal(failDelivery.ok, false);
    assert.equal(failDelivery.retriable, true);
    assert.equal(failDelivery.retryAfterMs, 2000);
  } finally {
    await new Promise<void>((resolve) => receiver.close(() => resolve()));
  }
});

test('CORE-4: Offline localStore submodules and MCP router/executor/resources work in-process', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agendamea-offline-core-'));
  const cloudDir = path.join(tmpDir, 'cloud');
  fs.mkdirSync(cloudDir, { recursive: true });
  const dbPath = path.join(tmpDir, 'agendamea.db');

  const prevForce = process.env.AGENDAMEA_FORCE_OFFLINE;
  const prevDb = process.env.AGENDAMEA_DB_PATH;
  const prevData = process.env.AGENDAMEA_DATA_DIR;
  process.env.AGENDAMEA_FORCE_OFFLINE = '1';
  process.env.AGENDAMEA_DB_PATH = dbPath;
  process.env.AGENDAMEA_DATA_DIR = tmpDir;

  try {
    // Categories CRUD + move
    const c1 = await localStore.createCategory({ name: 'Backend', color: '#2563eb' });
    const c2 = await localStore.createCategory({ name: 'Frontend', color: '#16a34a' });
    await localStore.updateCategory(c2.id, { name: 'UI', pinned: true });
    await localStore.moveCategory(c1.id, 1);
    const cats = await localStore.listCategories();
    assert.equal(cats.length, 2);

    // Tasks + subtasks + batch ops + views
    const today = localStore.getTodayStr();
    const t1 = await localStore.addTask({
      title: 'Harden SQLite WAL',
      category: 'Backend',
      priority: 'high',
      important: true,
      dueDate: today,
      tags: ['db', 'perf'],
      subtasks: ['Check pragma'],
    });
    const t2 = await localStore.addTask({
      title: 'Review UI accessibility',
      category: 'UI',
      priority: 'low',
      dueDate: localStore.getTomorrowStr(),
    });
    await localStore.updateTask(t1.id, { notes: 'Verified WAL mode' });
    await localStore.moveTask(t2.id, 1);
    const sub = await localStore.addSubtask(t1.id, 'Benchmark 1000 rows');
    await localStore.updateSubtask(t1.id, sub.id, { title: 'Benchmark 1k rows' });
    await localStore.toggleSubtask(t1.id, '1');
    await localStore.deleteSubtask(t1.id, sub.id);
    await localStore.batchPinTasks([t1.id], true);
    await localStore.batchCompleteTasks([t2.id], true);

    assert.ok((await localStore.listTasks({ filter: 'all', sortBy: 'priority' })).length >= 2);
    assert.ok((await localStore.getTask(t1.id)).title.includes('SQLite'));
    assert.ok(await localStore.getMatrix());
    assert.ok(
      await localStore.getCalendarAgenda({ dateFrom: today, dateTo: localStore.getTomorrowStr() }),
    );
    assert.ok(await localStore.getKanbanBoard('priority'));

    // Clear completed, trash, restore, permanent delete, empty trash
    await localStore.clearCompleted();
    const trash1 = await localStore.listTrash({ typeFilter: 'todos', sortBy: 'oldest' });
    assert.equal(trash1.todos.length, 1);
    await localStore.restoreLastTrashed();
    await localStore.batchDeleteTasks([t2.id]);
    await localStore.permanentDeleteItem(t2.id, 'todo');
    await localStore.deleteCategory(c2.id);
    await localStore.emptyTrash();

    // Settings + Backup export/import + Cloud sync offline
    await localStore.updateSettings({ themeMode: 'dark', language: 'en' });
    assert.equal((await localStore.getSettings()).themeMode, 'dark');
    const bkp = path.join(tmpDir, 'export.json');
    await localStore.exportBackup(bkp);
    await localStore.importBackup(bkp);

    await localStore.connectCloud(cloudDir, true);
    await localStore.syncCloud();
    assert.equal((await localStore.getCloudStatus()).connected, true);
    await localStore.pullCloud();
    await localStore.disconnectCloud();

    // Webhook offline helpers
    assert.equal((await localStore.getWebhookLogs(10)).length, 0);
    await localStore.clearWebhookLogs();
    assert.equal((await localStore.getWebhookOutbox(10)).length, 0);

    // MCP full JSON-RPC router + toolExecutor + resources + prompts in-process
    const handler = mcpServer.createMcpHandler(localStore);
    const sessionState = { protocolVersion: '2025-11-25', subscribedUris: new Set<string>() };
    const initRes = await handler.handleJsonRpcRequest(
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2025-11-25' },
      },
      sessionState,
    );
    const initPayload = initRes.response?.result as Record<string, unknown> | undefined;
    assert.equal(initPayload?.protocolVersion, '2025-11-25');

    const toolsRes = await handler.handleJsonRpcRequest(
      { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
      sessionState,
    );
    const toolsPayload = toolsRes.response?.result as Record<string, unknown> | undefined;
    assert.ok(Array.isArray(toolsPayload?.tools) && toolsPayload.tools.length >= 20);

    const callStatus = await handler.handleJsonRpcRequest(
      {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: { name: 'agendamea_status', arguments: {} },
      },
      sessionState,
    );
    const statusPayload = callStatus.response?.result as Record<string, unknown> | undefined;
    assert.equal(statusPayload?.isError, undefined);

    const callList = await handler.handleJsonRpcRequest(
      {
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: {
          name: 'agendamea_list_tasks',
          arguments: { filter: 'all', limit: 10, offset: 0 },
        },
      },
      sessionState,
    );
    const listPayload = callList.response?.result as Record<string, unknown> | undefined;
    assert.ok(listPayload?.structuredContent);

    await mcpServer.executeTool('agendamea_list_categories', {}, localStore);
    await mcpServer.executeTool('agendamea_views', { view: 'matrix' }, localStore);
    await mcpServer.executeTool('agendamea_views', { view: 'kanban' }, localStore);
    await mcpServer.executeTool('agendamea_views', { view: 'calendar' }, localStore);
    await mcpServer.executeTool('agendamea_list_trash', {}, localStore);
    await mcpServer.executeTool('agendamea_get_settings', {}, localStore);
    await mcpServer.executeTool(
      'agendamea_backup_and_sync',
      { action: 'cloud_status' },
      localStore,
    );
    await mcpServer.executeTool(
      'agendamea_webhook_and_server',
      { action: 'webhook_logs' },
      localStore,
    );

    for (const uri of [
      'agendamea://status',
      'agendamea://tasks/today',
      'agendamea://tasks/overdue',
      'agendamea://matrix',
      'agendamea://categories',
      `agendamea://task/${t1.id}`,
    ]) {
      const r = await mcpServer.readResource(uri, localStore);
      assert.ok(r.text.length > 0);
    }

    const promptsList = await handler.handleJsonRpcRequest(
      {
        jsonrpc: '2.0',
        id: 5,
        method: 'prompts/list',
        params: {},
      },
      sessionState,
    );
    const promptsPayload = promptsList.response?.result as { prompts?: unknown[] } | undefined;
    assert.ok((promptsPayload?.prompts?.length ?? 0) >= 1);
    const p1 = await mcpServer.getPrompt('eisenhower_review', {}, localStore);
    assert.ok(p1.messages.length >= 1);
    const p2 = await mcpServer.getPrompt('triage_overdue', {}, localStore);
    assert.ok(p2.messages.length >= 1);
    const p3 = await mcpServer.getPrompt('weekly_summary', {}, localStore);
    assert.ok(p3.messages.length >= 1);

    await handler.handleJsonRpcRequest(
      { jsonrpc: '2.0', id: 6, method: 'ping', params: {} },
      sessionState,
    );
    await handler.handleJsonRpcRequest(
      {
        jsonrpc: '2.0',
        id: 7,
        method: 'resources/subscribe',
        params: { uri: 'agendamea://status' },
      },
      sessionState,
    );
    await handler.handleJsonRpcRequest(
      {
        jsonrpc: '2.0',
        id: 8,
        method: 'resources/unsubscribe',
        params: { uri: 'agendamea://status' },
      },
      sessionState,
    );

    await localStore.resetAllData({ resetSettings: false });
  } finally {
    if (prevForce === undefined) delete process.env.AGENDAMEA_FORCE_OFFLINE;
    else process.env.AGENDAMEA_FORCE_OFFLINE = prevForce;
    if (prevDb === undefined) delete process.env.AGENDAMEA_DB_PATH;
    else process.env.AGENDAMEA_DB_PATH = prevDb;
    if (prevData === undefined) delete process.env.AGENDAMEA_DATA_DIR;
    else process.env.AGENDAMEA_DATA_DIR = prevData;
    fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 4, retryDelay: 50 });
  }
});
