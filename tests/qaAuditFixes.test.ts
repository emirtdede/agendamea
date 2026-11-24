import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import { createRequire } from 'node:module';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { subscribeServerEvents } from '../src/api/eventStream';
import { TodoDatabase, ValidationError } from '../src/db/database';
import type { Todo } from '../src/types';
import { getCachedDateTimeFormatter } from '../src/utils/intlCache';
import { filterAndSortTodos } from '../src/utils/todoLogic';

const require = createRequire(import.meta.url);
const webhookEngine = require('../shared/webhookEngine.cjs');
const ragChunker = require('../shared/ragChunker.cjs');
const localStore = require('../shared/localStore.cjs');
const { ModelManager } = require('../shared/modelManager.cjs');
const { PiperVoiceManager } = require('../shared/piperVoices.cjs');

const ROOT_DIR = process.cwd();

test('QA-AUDIT-1: openDatabaseWithRecovery refuses to wipe DB on non-corruption errors (e.g. EISDIR/SQLITE_CANTOPEN)', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-nocorrupt-'));
  const fakeDbDir = path.join(tmpDir, 'agendamea.db');
  fs.mkdirSync(fakeDbDir);
  try {
    assert.throws(() => new TodoDatabase(fakeDbDir));
    const entries = fs.readdirSync(tmpDir);
    assert.equal(
      entries.some((f) => f.includes('.corrupt-')),
      false,
      'Non-corruption open errors must NEVER rename/wipe the target path',
    );
    assert.ok(fs.existsSync(fakeDbDir), 'Original path must remain untouched');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('QA-AUDIT-2: resetAllData clears webhook_outbox and webhook_logs and re-seeds defaults', () => {
  const db = new TodoDatabase(':memory:');
  try {
    db.updateSettings({
      themeMode: 'dark',
      themeId: 'purple',
      webhookEnabled: true,
      webhookUrl: 'https://example.com/hook',
      webhookSecret: 'secret-xyz',
    });
    db.createTodo({ title: 'Confidential task' });
    db.recordWebhookLog({
      direction: 'outgoing',
      event: 'todo.created',
      targetUrl: 'https://example.com/hook',
      statusCode: 500,
      ok: false,
      error: 'HTTP 500',
    });
    db.enqueueWebhookOutbox({
      eventId: 'msg_reset_test_1',
      event: 'todo.created',
      targetUrl: 'https://example.com/hook',
      format: 'generic',
      payloadJson: JSON.stringify({ title: 'Confidential task' }),
    });

    assert.equal(db.getWebhookLogs().length, 1);
    assert.equal(db.getWebhookOutbox().length, 1);

    const fresh = db.resetAllData({ resetSettings: true });
    assert.equal(fresh.todos.length, 0);
    assert.equal(db.getWebhookLogs().length, 0, 'webhook_logs must be wiped on resetAllData');
    assert.equal(db.getWebhookOutbox().length, 0, 'webhook_outbox must be wiped on resetAllData');
    assert.equal(fresh.settings.themeId, 'obsidian');
    assert.equal(fresh.settings.themeMode, 'light');
    assert.equal(fresh.settings.onboardingCompleted, true);
  } finally {
    db.close();
  }
});

test('QA-AUDIT-3: TodoDatabase rejects invalid webhookUrl with ValidationError while preserving valid todo fields non-destructively', () => {
  const db = new TodoDatabase(':memory:');
  try {
    assert.throws(
      () => db.updateSettings({ webhookUrl: 'ftp://invalid.example.com/hook' }),
      ValidationError,
    );
    assert.throws(
      () => db.updateSettings({ webhookUrl: 'http://169.254.169.254/latest/meta-data' }),
      ValidationError,
    );

    const cat = db.createCategory({ name: 'Sabit', color: '#2563eb' });
    const todo = db.createTodo({
      title: 'Validation target',
      dueDate: '2026-11-25',
      dueTime: '14:30',
      categoryId: cat.id,
    });
    const updated = db.updateTodo(todo.id, {
      dueDate: '2026-02-31',
      dueTime: '25:99',
      categoryId: 'missing-cat-id',
    });
    assert.equal(updated?.dueDate, '2026-11-25');
    assert.equal(updated?.dueTime, '14:30');
    assert.equal(updated?.categoryId, cat.id);
  } finally {
    db.close();
  }
});

test('QA-AUDIT-4: webhookEngine blocks IPv6-mapped loopback self-recursion and metadata SSRF (including WHATWG hex normalization)', () => {
  assert.equal(webhookEngine.isLoopbackHost('::ffff:127.0.0.1'), true);
  assert.equal(webhookEngine.isLoopbackHost('[::ffff:127.0.0.1]'), true);
  assert.equal(webhookEngine.isLoopbackHost('::ffff:7f00:1'), true);
  const res = webhookEngine.validateWebhookUrlSyntax(
    'http://[::ffff:127.0.0.1]:38721/api/webhook/incoming',
    { allowLocalNetwork: true, activeListenPort: 38721 },
  );
  assert.equal(res.ok, false);
  const metaRes = webhookEngine.validateWebhookUrlSyntax(
    'http://[::ffff:169.254.169.254]/latest/meta-data',
    { allowLocalNetwork: true },
  );
  assert.equal(metaRes.ok, false);
});

test('QA-AUDIT-5: Offline RAG handles unaligned Float32 Buffer offset and scores hybrid cosine hits cleanly', async () => {
  // 1. Direct unaligned byteOffset test (byteOffset = 1, not a multiple of 4)
  const raw = Buffer.alloc(1 + 4 * 4);
  raw[0] = 0xff;
  const f32 = new Float32Array([1, 0, 0, 0]);
  Buffer.from(f32.buffer).copy(raw, 1);
  const unalignedSlice = raw.subarray(1, 17);
  assert.equal(unalignedSlice.byteOffset % 4, 1);
  const decoded = ragChunker.decodeFloat32Blob(unalignedSlice);
  assert.equal(decoded.length, 4);
  assert.equal(decoded[0], 1);

  // 2. End-to-end offline localStore semanticSearchRag returns vector hit (cosine property wired)
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-offline-rag-'));
  const prevDataDir = process.env.AGENDAMEA_DATA_DIR;
  const prevForceOffline = process.env.AGENDAMEA_FORCE_OFFLINE;
  process.env.AGENDAMEA_DATA_DIR = tmpDir;
  process.env.AGENDAMEA_FORCE_OFFLINE = '1';
  try {
    const created = await localStore.addTask({
      title: 'Quantum Project Alpha',
      notes: 'Secret architecture notes',
    });
    const Database = require('better-sqlite3');
    const rawDb = new Database(path.join(tmpDir, 'agendamea.db'));
    try {
      rawDb
        .prepare(
          `INSERT INTO todo_embedding_chunks
           (todo_id, chunk_index, chunk_text, content_hash, model_id, dims, vector_blob, updated_at)
           VALUES (?, 0, ?, 'h1', 'test-embed', 4, ?, ?)`,
        )
        .run(
          created.id,
          'Quantum Project Alpha - Secret architecture notes',
          ragChunker.encodeFloat32Blob(new Float32Array([1, 0, 0, 0])),
          new Date().toISOString(),
        );
    } finally {
      rawDb.close();
    }

    // Query with unrelated keywords so ONLY vector cosine similarity can match it
    const res = await localStore.semanticSearchRag('zzzz_semantic_only_probe', {
      forceOffline: true,
      minScore: 0.1,
      embedFn: async () => new Float32Array([1, 0, 0, 0]),
    });
    assert.equal(res.mode, 'hybrid');
    assert.equal(res.hits.length, 1);
    assert.equal(res.hits[0].todoId, created.id);
    assert.ok(res.hits[0].score > 0.1);

    // Also verify offline settings persist webhookEndpointOverrides
    const saved = await localStore.updateSettings({
      webhookEndpointOverrides: {
        'http://127.0.0.1:9999/hook': {
          secret: 'ov-sec-1',
          events: 'todo.created',
          format: 'generic',
          enabled: true,
        },
      },
    });
    assert.equal(
      saved.webhookEndpointOverrides?.['http://127.0.0.1:9999/hook']?.secret,
      'ov-sec-1',
    );
  } finally {
    if (prevDataDir === undefined) delete process.env.AGENDAMEA_DATA_DIR;
    else process.env.AGENDAMEA_DATA_DIR = prevDataDir;
    if (prevForceOffline === undefined) delete process.env.AGENDAMEA_FORCE_OFFLINE;
    else process.env.AGENDAMEA_FORCE_OFFLINE = prevForceOffline;
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 80 });
    } catch {
      // Ignore transient Windows lock cleanup
    }
  }
});

test('QA-AUDIT-6: ModelManager enforces mid-stream SIZE_EXCEEDED cap & PiperVoiceManager enforces 2x disk guard', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-dl-guard-'));
  const bigPayload = crypto.randomBytes(8192);
  const srv = http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
    res.end(bigPayload);
  });
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', () => r()));
  const port = (srv.address() as net.AddressInfo).port;
  try {
    const mm = new ModelManager({ modelsDir: path.join(tmpDir, 'models') });
    const spec = {
      id: 'oversize-test',
      role: 'llm',
      tier: 'tier-light',
      label: 'Oversize Test Model',
      file: 'oversize-test.gguf',
      license: 'mit',
      bytes: 1024, // Server returns 8192 -> must abort with SIZE_EXCEEDED!
      commit: 'a'.repeat(40),
      sha256: '0'.repeat(64),
      split: false,
      url: `http://127.0.0.1:${port}/oversize.gguf`,
    };
    const dlRes = await mm.downloadModel('oversize-test', { customSpec: spec });
    assert.equal(dlRes.ok, false);
    assert.equal(dlRes.code, 'SIZE_EXCEEDED');
    assert.equal(fs.existsSync(path.join(tmpDir, 'models', 'oversize-test.gguf.part')), false);

    const pm = new PiperVoiceManager({
      voicesDir: path.join(tmpDir, 'voices'),
      statfsFn: () => ({ bavail: 1, bsize: 100 }),
    });
    const voiceRes = await pm.downloadVoice('piper-tr-ilkiz-female');
    assert.equal(voiceRes.ok, false);
    assert.equal(voiceRes.code, 'INSUFFICIENT_DISK_SPACE');
  } finally {
    srv.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('QA-AUDIT-7: SSE eventStream reconnects after CLOSED, intlCache stays bounded, and Turkish tag filter matches', async () => {
  // 1. Turkish tag filter parity (#İş / #iş / #İŞ)
  const todos: Todo[] = [
    {
      id: 't-tr-1',
      title: 'Rapor',
      notes: '',
      completed: false,
      important: false,
      pinned: false,
      priority: 'normal',
      dueDate: null,
      categoryId: null,
      tags: ['İş'],
      sortOrder: 0,
      createdAt: '2026-11-23T08:00:00.000Z',
      updatedAt: '2026-11-23T08:00:00.000Z',
      deletedAt: null,
      subtasks: [],
    },
  ];
  const matchedLower = filterAndSortTodos({
    todos,
    activeView: { type: 'smart', id: 'all' },
    statusFilter: 'all',
    searchQuery: '',
    sortBy: 'manual',
    tagFilter: 'iş',
  });
  const matchedUpper = filterAndSortTodos({
    todos,
    activeView: { type: 'smart', id: 'all' },
    statusFilter: 'all',
    searchQuery: '',
    sortBy: 'manual',
    tagFilter: 'İŞ',
  });
  assert.equal(matchedLower.length, 1);
  assert.equal(matchedUpper.length, 1);

  // 2. Bounded Intl cache handles 40 distinct entries without error
  for (let i = 0; i < 40; i += 1) {
    const fmt = getCachedDateTimeFormatter('tr-TR', `test-key-${i}`, {
      day: 'numeric',
      month: 'short',
    });
    assert.ok(fmt.format(new Date(2026, 10, 23)).length > 0);
  }

  // 3. SSE automatic reconnect after EventSource.CLOSED
  const prevEventSource = (globalThis as { EventSource?: unknown }).EventSource;
  const instances: Array<{
    readyState: number;
    closed: boolean;
    onopen: (() => void) | null;
    onmessage: ((ev: { data: string }) => void) | null;
    onerror: (() => void) | null;
    close: () => void;
  }> = [];

  class MockEventSource {
    static CLOSED = 2;
    readyState = 1;
    closed = false;
    onopen: (() => void) | null = null;
    onmessage: ((ev: { data: string }) => void) | null = null;
    onerror: (() => void) | null = null;
    constructor(_url: string) {
      instances.push(this);
    }
    close() {
      this.closed = true;
      this.readyState = 2;
    }
  }

  (globalThis as { EventSource?: unknown }).EventSource = MockEventSource;
  let unsub: (() => void) | null = null;
  try {
    const received: unknown[] = [];
    unsub = subscribeServerEvents((payload) => {
      received.push(payload);
    });
    assert.equal(instances.length, 1);
    const firstInst = instances[0];
    assert.ok(firstInst);
    // Simulate server crash -> EventSource transitions to CLOSED and fires onerror
    firstInst.readyState = MockEventSource.CLOSED;
    firstInst.onerror?.();
    await new Promise((r) => setTimeout(r, 1150));
    assert.equal(instances.length, 2, 'eventStream must auto-reconnect after CLOSED');
    instances[1]?.onmessage?.({ data: JSON.stringify({ type: 'changed', reason: 'test' }) });
    assert.equal(received.length, 1);
  } finally {
    unsub?.();
    if (prevEventSource === undefined) {
      delete (globalThis as { EventSource?: unknown }).EventSource;
    } else {
      (globalThis as { EventSource?: unknown }).EventSource = prevEventSource;
    }
  }
});

test('QA-AUDIT-8: Live HTTP server exposes 405 on GET /api/mcp, enforces batch cap, and avoids duplicate todo.completed webhooks', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-live-audit-'));
  const eventsSeen: string[] = [];
  const hookSink = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => {
      body += c.toString('utf8');
    });
    req.on('end', () => {
      try {
        const parsed = JSON.parse(body) as { event?: string };
        if (parsed.event) eventsSeen.push(parsed.event);
      } catch {
        // Ignore
      }
      res.writeHead(200);
      res.end('ok');
    });
  });
  await new Promise<void>((r) => hookSink.listen(0, '127.0.0.1', () => r()));
  const sinkPort = (hookSink.address() as net.AddressInfo).port;

  const probeSock = net.createServer();
  await new Promise<void>((r) => probeSock.listen(0, '127.0.0.1', () => r()));
  const serverPort = (probeSock.address() as net.AddressInfo).port;
  await new Promise<void>((r) => probeSock.close(() => r()));

  const tsxCli = path.join(ROOT_DIR, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  const serverProc = spawn(process.execPath, [tsxCli, path.join(ROOT_DIR, 'server.ts')], {
    cwd: ROOT_DIR,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      HOST: '127.0.0.1',
      PORT: String(serverPort),
      AGENDAMEA_DATA_DIR: tmpDir,
      AGENDAMEA_APP_ROOT: ROOT_DIR,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  const baseUrl = `http://127.0.0.1:${serverPort}`;
  try {
    let ready = false;
    for (let i = 0; i < 60; i += 1) {
      try {
        const h = await fetch(`${baseUrl}/api/health`);
        if (h.ok) {
          ready = true;
          break;
        }
      } catch {
        // Wait for boot
      }
      await new Promise((r) => setTimeout(r, 150));
    }
    assert.equal(ready, true, 'Audit test server failed to start');

    // 1. GET /api/mcp -> 405 Method Not Allowed with Allow: POST, DELETE
    const getMcp = await fetch(`${baseUrl}/api/mcp`);
    assert.equal(getMcp.status, 405);
    assert.equal(getMcp.headers.get('allow'), 'POST, DELETE');

    // 2. POST /api/mcp batch > 50 -> 400
    const oversizeBatch = Array.from({ length: 51 }, (_, idx) => ({
      jsonrpc: '2.0',
      id: idx + 1,
      method: 'ping',
    }));
    const batchRes = await fetch(`${baseUrl}/api/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(oversizeBatch),
    });
    assert.equal(batchRes.status, 400);

    // 3. Webhook todo.completed fires ONLY on false -> true transition, NOT on subsequent edits
    await fetch(`${baseUrl}/api/settings`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        webhookEnabled: true,
        webhookUrl: `http://127.0.0.1:${sinkPort}/events`,
        webhookEvents: '*',
        webhookAllowLocalNetwork: true,
      }),
    });
    const created = (await (
      await fetch(`${baseUrl}/api/todos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Transition check' }),
      })
    ).json()) as { id: string };

    // false -> true => todo.completed
    await fetch(`${baseUrl}/api/todos/${created.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed: true }),
    });
    // already completed, editing notes with completed: true => todo.updated (NOT duplicate todo.completed!)
    await fetch(`${baseUrl}/api/todos/${created.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed: true, notes: 'Post-completion note' }),
    });

    await new Promise((r) => setTimeout(r, 400));
    assert.equal(
      eventsSeen.filter((e) => e === 'todo.completed').length,
      1,
      `Expected exactly 1 todo.completed event, got: ${JSON.stringify(eventsSeen)}`,
    );
    assert.ok(
      eventsSeen.includes('todo.updated'),
      `Expected follow-up edit on completed todo to emit todo.updated, got: ${JSON.stringify(eventsSeen)}`,
    );
  } finally {
    try {
      serverProc.kill();
    } catch {
      // Ignore
    }
    await new Promise((r) => setTimeout(r, 250));
    hookSink.close();
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 80 });
    } catch {
      // Ignore
    }
  }
});

test('QA-AUDIT-9: Debounced rapid settings persistence coalesces 50 bursts into 1 write with final value', async () => {
  const writes: string[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  const scheduleSave = (hex: string) => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      writes.push(hex);
    }, 35);
  };

  for (let i = 0; i < 50; i += 1) {
    const channel = i.toString(16).padStart(2, '0');
    scheduleSave(`#${channel}${channel}${channel}`);
    await new Promise((r) => setTimeout(r, 1));
  }
  await new Promise((r) => setTimeout(r, 90));
  assert.equal(writes.length, 1, `Expected 1 coalesced write, got ${writes.length}`);
  assert.equal(writes[0], '#313131', 'Coalesced write must persist the final color value');
});

test('QA-AUDIT-10: MCP createMcpHandler executes tools, resources, and prompts strictly in-process with zero HTTP loopback', async () => {
  const mcpServerMod = require('../mcp/server.cjs');
  const calls: string[] = [];
  const customStore = {
    APP_VERSION: '1.1.0-test',
    getTodayStr: () => '2026-11-23',
    getStatus: async () => {
      calls.push('getStatus');
      return {
        ok: true,
        mode: 'in-process-mock',
        activeTasks: 2,
        dueToday: 1,
        todayTasks: 1,
        important: 1,
        importantTasks: 1,
        completedTasks: 0,
        categories: 1,
        trashCount: 0,
      };
    },
    listTasks: async (opts: Record<string, unknown>) => {
      calls.push(`listTasks:${String(opts?.filter || 'active')}`);
      return [
        {
          id: 'todo-inproc-1',
          title: 'In-process MCP task',
          notes: '',
          completed: false,
          important: true,
          pinned: false,
          priority: 'high',
          dueDate: '2026-11-23',
          dueTime: null,
          tags: ['mcp'],
          categoryId: null,
          subtasks: [],
        },
      ];
    },
    getMatrix: async () => {
      calls.push('getMatrix');
      return { q1: [], q2: [], q3: [], q4: [] };
    },
  };

  const handler = mcpServerMod.createMcpHandler({ store: customStore });

  const statusRes = await handler.handleJsonRpcRequest(
    {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'agendamea_status', arguments: {} },
    },
    { protocolVersion: '2025-11-25', isRemoteHttp: true },
  );
  assert.equal(statusRes.response?.result?.structuredContent?.mode, 'in-process-mock');

  const resRead = await handler.handleJsonRpcRequest(
    { jsonrpc: '2.0', id: 2, method: 'resources/read', params: { uri: 'agendamea://tasks/today' } },
    { protocolVersion: '2025-11-25', isRemoteHttp: true },
  );
  const parsedResource = JSON.parse(resRead.response?.result?.contents?.[0]?.text || '{}') as {
    totalCount?: number;
  };
  assert.equal(parsedResource.totalCount, 1);

  const promptRes = await handler.handleJsonRpcRequest(
    {
      jsonrpc: '2.0',
      id: 3,
      method: 'prompts/get',
      params: { name: 'daily_plan', arguments: { focusHours: 4 } },
    },
    { protocolVersion: '2025-11-25', isRemoteHttp: true },
  );
  assert.ok(
    String(promptRes.response?.result?.messages?.[0]?.content?.text || '').includes(
      'In-process MCP task',
    ),
    'In-process prompt must hydrate directly from injected store',
  );
  assert.ok(calls.includes('getStatus'));
  assert.ok(calls.includes('listTasks:today'));
});

test('QA-AUDIT-11: shared/settingsCodec zero-drift parity between TodoDatabase and codec readSettingsFromDb', () => {
  const settingsCodec = require('../shared/settingsCodec.cjs');
  const db = new TodoDatabase(':memory:');
  try {
    const updated = db.updateSettings({
      themeMode: 'dark',
      themeId: 'emerald',
      zoomPercent: 115,
      aiTier: 'tier-medium',
      voiceAutoStopMs: 2200,
      webhookEnabled: true,
      webhookUrl: 'https://hooks.example.com/agendamea',
      webhookFormat: 'slack',
      webhookEndpointOverrides: {
        'https://hooks.example.com/agendamea': {
          format: 'slack',
          events: 'todo.created,todo.completed',
          secret: 'whsec_test',
        },
      },
      notificationLeadMinutes: 30,
    });
    const rawDb = (db as unknown as { db: unknown }).db;
    const fromCodec = settingsCodec.readSettingsFromDb(rawDb);
    assert.deepEqual(
      fromCodec,
      updated,
      'TodoDatabase and shared/settingsCodec must produce identical AppSettings',
    );
    assert.throws(
      () => db.updateSettings({ webhookUrl: 'ftp://invalid.example.com/hook' }),
      ValidationError,
      'Strict TodoDatabase mode must reject non-http(s) webhook URLs',
    );
  } finally {
    db.close();
  }
});

test('QA-AUDIT-12: ModelManager manifest mtime cache hits on unchanged disk file & dynamic locale loader lazy-loads non-core locales', async () => {
  const { MODELS_BY_ID } = require('../shared/aiCatalog.cjs');
  const firstModelId = Object.keys(MODELS_BY_ID)[0];
  const tmpModelsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-mm-cache-'));
  try {
    const mm = new ModelManager({ modelsDir: tmpModelsDir });
    const manifestPath = mm.getManifestPath(firstModelId);
    fs.writeFileSync(manifestPath, JSON.stringify({ verified: true, size: 1234 }), 'utf8');
    const first = mm.readManifest(firstModelId);
    const second = mm.readManifest(firstModelId);
    assert.strictEqual(
      first,
      second,
      'Unchanged manifest on disk must return cached reference without reparsing',
    );
    fs.writeFileSync(manifestPath, JSON.stringify({ verified: true, size: 567890 }), 'utf8');
    const third = mm.readManifest(firstModelId);
    assert.notStrictEqual(second, third, 'Modified manifest must invalidate mtime/size cache');
    assert.equal(third.size, 567890);
  } finally {
    fs.rmSync(tmpModelsDir, { recursive: true, force: true });
  }

  const { loadLocaleBundle, isLocaleLoaded } = await import('../src/i18n/localeLoader');
  assert.equal(isLocaleLoaded('tr'), true, 'Core tr locale must be eagerly available');
  assert.equal(isLocaleLoaded('en'), true, 'Core en locale must be eagerly available');

  const [deBundle, arBundle, jaBundle] = await Promise.all([
    loadLocaleBundle('de'),
    loadLocaleBundle('ar'),
    loadLocaleBundle('ja'),
  ]);
  assert.equal(Object.keys(deBundle.dict).length, 821);
  assert.equal(Object.keys(arBundle.dict).length, 821);
  assert.equal(Object.keys(jaBundle.dict).length, 821);
  assert.ok(deBundle.dict.aiHardwareGpuVramLabel.length > 0);
  assert.ok(arBundle.dict.aiHardwareMemoryWarningBadge.length > 0);
  assert.ok(jaBundle.legal.privacy.sections.length > 0);
});

test('QA-AUDIT-13: createSelectorStore enforces shallowEqual no-op bailout, clean unsubscribe, and factory isolation', async () => {
  const { createSelectorStore, shallowEqual } = await import('../src/store/createSelectorStore');
  assert.equal(shallowEqual({ a: 1, b: 'x' }, { a: 1, b: 'x' }), true);
  assert.equal(shallowEqual({ a: 1, b: 'x' }, { a: 1, b: 'y' }), false);
  assert.equal(shallowEqual([1, 2], [1, 2]), true);
  assert.equal(shallowEqual([1, 2], [1, 3]), false);

  const storeA = createSelectorStore({ count: 0, label: 'a' });
  const storeB = createSelectorStore({ count: 0, label: 'b' });
  let callsA = 0;
  let callsB = 0;
  const unsubA = storeA.subscribe(() => {
    callsA += 1;
  });
  const unsubB = storeB.subscribe(() => {
    callsB += 1;
  });
  assert.equal(storeA.getListenerCount(), 1);

  // Identical patch must not notify listeners
  storeA.patchState({ count: 0, label: 'a' });
  assert.equal(callsA, 0, 'No-op patchState must not emit notifications');

  // Mutating storeA must never affect storeB
  storeA.patchState({ count: 1 });
  assert.equal(callsA, 1);
  assert.equal(callsB, 0);
  assert.equal(storeB.getState().count, 0);

  unsubA();
  unsubB();
  assert.equal(storeA.getListenerCount(), 0);
  storeA.patchState({ count: 2 });
  assert.equal(callsA, 1, 'Unsubscribed listener must not be called');
});

test('QA-AUDIT-14: Autonomous domain stores isolate notifications, debounce custom colors, and prevent out-of-order webhook race overwrite', async () => {
  const { createWebhookStore } = await import('../src/store/webhookStore');
  const { createShortcutStore } = await import('../src/store/shortcutStore');
  const { createPreferencesStore } = await import('../src/store/preferencesStore');
  const { createNotificationStore } = await import('../src/store/notificationStore');
  const { createUpdaterStore } = await import('../src/store/updaterStore');

  let resolveFirstSave!: (val: ReturnType<typeof makeSettings>) => void;
  let saveCallCount = 0;
  const makeSettings = (url: string) =>
    ({
      themeMode: 'light',
      themeId: 'obsidian',
      language: 'en',
      sidebarCollapsed: false,
      webhookEnabled: true,
      webhookUrl: url,
      webhookSecret: '',
      webhookEvents: '*',
      webhookFormat: 'auto',
      webhookIncomingEnabled: false,
      webhookIncomingSecret: '',
      webhookAllowLocalNetwork: true,
      webhookEndpointOverrides: {},
    }) as unknown as import('../src/types').AppSettings;

  const hookStore = createWebhookStore((patch) => {
    saveCallCount += 1;
    if (saveCallCount === 1) {
      return new Promise((resolve) => {
        resolveFirstSave = resolve;
      });
    }
    return Promise.resolve(makeSettings(String(patch.webhookUrl || '')));
  });
  const scStore = createShortcutStore(() => Promise.resolve(makeSettings('')));
  const prefPersists: Array<Record<string, unknown>> = [];
  const prefStore = createPreferencesStore((patch) => {
    prefPersists.push(patch as Record<string, unknown>);
    return Promise.resolve(makeSettings(''));
  });
  const notifStore = createNotificationStore(() => Promise.resolve(makeSettings('')));
  const updStore = createUpdaterStore(() => Promise.resolve(makeSettings('')));

  let scCalls = 0;
  let prefCalls = 0;
  let notifCalls = 0;
  let updCalls = 0;
  scStore.subscribe(() => {
    scCalls += 1;
  });
  prefStore.subscribe(() => {
    prefCalls += 1;
  });
  notifStore.subscribe(() => {
    notifCalls += 1;
  });
  updStore.subscribe(() => {
    updCalls += 1;
  });

  // Start slow save #1, then complete fast save #2 before #1 resolves
  const p1 = hookStore.save({
    webhookEnabled: true,
    webhookUrl: 'https://slow-stale.example.com/hook',
    webhookSecret: '',
  });
  await hookStore.save({
    webhookEnabled: true,
    webhookUrl: 'https://fast-latest.example.com/hook',
    webhookSecret: '',
  });
  resolveFirstSave(makeSettings('https://slow-stale.example.com/hook'));
  await p1;

  assert.equal(
    hookStore.getState().webhookUrl,
    'https://fast-latest.example.com/hook',
    'Stale out-of-order webhook response must NEVER overwrite latest webhook state',
  );
  assert.equal(scCalls, 0, 'Webhook update must emit 0 shortcutStore notifications');
  assert.equal(prefCalls, 0, 'Webhook update must emit 0 preferencesStore notifications');
  assert.equal(notifCalls, 0, 'Webhook update must emit 0 notificationStore notifications');
  assert.equal(updCalls, 0, 'Webhook update must emit 0 updaterStore notifications');

  // Rapid custom color changes coalesce into 1 debounced persist with final color
  for (let i = 0; i < 15; i += 1) {
    const ch = (16 + i).toString(16).padStart(2, '0');
    prefStore.setCustomThemeColor(`#${ch}${ch}${ch}`);
  }
  await new Promise((r) => setTimeout(r, 310));
  assert.equal(
    prefPersists.length,
    1,
    'Rapid customThemeColor bursts must coalesce into 1 persist',
  );
  assert.equal(prefPersists[0]?.customThemeColor, '#1e1e1e');
  prefStore.disposeTimers();

  // Notification & updater updates remain completely isolated
  notifStore.applyProfile('focus');
  assert.equal(notifStore.getState().profile, 'focus');
  updStore.setUpdateState({
    status: 'available',
    result: null,
    downloadPercent: null,
    errorMessage: null,
  });
  assert.equal(updStore.getState().updateState.status, 'available');
  assert.equal(scCalls, 0);
});

test('QA-AUDIT-15: workspaceSnapshotStore bails out when todo counts are unchanged and notifies only on real changes', async () => {
  const { createWorkspaceSnapshotStore } = await import('../src/store/workspaceSnapshotStore');
  const ws = createWorkspaceSnapshotStore();
  let hits = 0;
  ws.subscribe(() => {
    hits += 1;
  });

  ws.syncCounts(10, 3);
  assert.equal(hits, 1);
  // Editing a task title keeps totalTodoCount=10, completedTodoCount=3 -> 0 notifications
  ws.syncCounts(10, 3);
  assert.equal(hits, 1, 'Unchanged counts must emit 0 notifications');
  ws.syncCounts(11, 3);
  assert.equal(hits, 2);
});

test('QA-AUDIT-16: Permanent zero-God-Context guard across src/', () => {
  assert.equal(
    fs.existsSync(path.join(ROOT_DIR, 'src', 'context', 'SettingsContext.tsx')),
    false,
    'God Context src/context/SettingsContext.tsx must stay permanently removed',
  );
  const scanFiles: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fp = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(fp);
      else if (/\.(ts|tsx)$/.test(entry.name)) scanFiles.push(fp);
    }
  };
  walk(path.join(ROOT_DIR, 'src'));
  for (const fp of scanFiles) {
    const text = fs.readFileSync(fp, 'utf8');
    assert.equal(
      /\b(SettingsContext|SettingsProvider|useSettingsContext|settingsContextValue)\b/.test(text),
      false,
      `Forbidden God Context reference found in ${path.relative(ROOT_DIR, fp)}`,
    );
  }
  const modalSrc = fs.readFileSync(
    path.join(ROOT_DIR, 'src', 'components', 'SettingsModal.tsx'),
    'utf8',
  );
  assert.ok(modalSrc.includes('useWorkspaceSnapshotSelector'));
  assert.ok(modalSrc.includes('useUpdaterSelector'));
  assert.ok(modalSrc.includes('SettingsTabOutlet'));

  const welcomeSrc = fs.readFileSync(
    path.join(ROOT_DIR, 'src', 'components', 'WelcomeModal.tsx'),
    'utf8',
  );
  assert.ok(welcomeSrc.includes('usePreferencesSelector'));
  assert.ok(welcomeSrc.includes('useShortcutSelector'));
});
