import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import localStoreMod from '../../shared/localStore.cjs';
import modelManagerMod from '../../shared/modelManager.cjs';
import { TodoDatabase } from '../../src/db/database';

test('WBS-2.1: HTTP Range resume, 2x disk guard, corrupted SHA-256 rejection & clean delete', async () => {
  const payload = crypto.randomBytes(64 * 1024); // 64 KiB synthetic model
  const validSha = crypto.createHash('sha256').update(payload).digest('hex');
  const rangeHeadersSeen: string[] = [];
  let corruptMode = false;

  const modelServer = http.createServer((req, res) => {
    const buf = corruptMode
      ? Buffer.concat([Buffer.from([(payload[0] ?? 0) ^ 0xff]), payload.subarray(1)])
      : payload;
    const range = req.headers.range;
    if (typeof range === 'string') {
      rangeHeadersSeen.push(range);
      const match = range.match(/bytes=(\d+)-/);
      const start = match ? Number(match[1]) : 0;
      const slice = buf.subarray(start);
      res.writeHead(206, {
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(slice.length),
        'Content-Range': `bytes ${start}-${buf.length - 1}/${buf.length}`,
      });
      res.end(slice);
      return;
    }
    // Stream in chunks so AbortController can cancel mid-flight cleanly
    res.writeHead(200, {
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(buf.length),
    });
    let offset = 0;
    const step = () => {
      if (res.destroyed || offset >= buf.length) {
        if (!res.destroyed) res.end();
        return;
      }
      res.write(buf.subarray(offset, offset + 4096));
      offset += 4096;
      setTimeout(step, 10);
    };
    step();
  });

  await new Promise<void>((resolve) => modelServer.listen(0, '127.0.0.1', () => resolve()));
  const srvPort = (modelServer.address() as { port: number }).port;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agendamea-modelmgr-'));

  const customSpec = {
    id: 'test-model',
    role: 'llm',
    tier: 'tier-light',
    label: 'Test GGUF',
    file: 'test-model.gguf',
    license: 'apache-2.0',
    bytes: payload.length,
    commit: 'a'.repeat(40),
    sha256: validSha,
    split: false,
    url: `http://127.0.0.1:${srvPort}/model.gguf`,
  };

  try {
    // 1. Free disk < 2x bytes -> INSUFFICIENT_DISK_SPACE before download starts
    const lowDiskMgr = new modelManagerMod.ModelManager({
      modelsDir: tmpDir,
      statfsFn: () => ({ bavail: 10, bsize: 4096 }), // 40 KiB < 128 KiB (2x 64 KiB)
    });
    const diskFail = await lowDiskMgr.downloadModel('test-model', { customSpec });
    assert.equal(diskFail.ok, false);
    assert.equal(diskFail.code, 'INSUFFICIENT_DISK_SPACE');

    // 2. Abort mid-download (~30-60%) then resume with HTTP Range header
    const mgr = new modelManagerMod.ModelManager({
      modelsDir: tmpDir,
      statfsFn: () => ({ bavail: 100000, bsize: 4096 }),
    });
    const abortCtrl = new AbortController();
    const firstAttempt = await mgr.downloadModel('test-model', {
      customSpec,
      signal: abortCtrl.signal,
      onProgress: (p: { percent: number }) => {
        if (p.percent >= 25 && !abortCtrl.signal.aborted) {
          abortCtrl.abort();
        }
      },
    });
    assert.equal(firstAttempt.ok, false);
    assert.equal(firstAttempt.code, 'CANCELLED');
    assert.ok(
      fs.existsSync(path.join(tmpDir, 'test-model.gguf.part')),
      '.part file must stay for resume',
    );

    const resumedAttempt = await mgr.downloadModel('test-model', { customSpec });
    assert.equal(resumedAttempt.ok, true);
    assert.equal(resumedAttempt.resumed, true);
    assert.equal(resumedAttempt.sha256, validSha);
    assert.ok(
      rangeHeadersSeen.some((h) => h.startsWith('bytes=')),
      'Second request must send Range header',
    );

    // 3. Delete model clears directory completely
    const delRes = mgr.deleteModel('test-model', customSpec);
    assert.equal(delRes.ok, true);
    assert.equal(fs.readdirSync(tmpDir).length, 0);

    // 4. 1-byte corrupted file fails SHA-256 and deletes .part fail-closed
    corruptMode = true;
    const corruptRes = await mgr.downloadModel('test-model', { customSpec });
    assert.equal(corruptRes.ok, false);
    assert.equal(corruptRes.code, 'SHA256_MISMATCH');
    assert.equal(fs.existsSync(path.join(tmpDir, 'test-model.gguf.part')), false);
    assert.equal(fs.existsSync(path.join(tmpDir, 'test-model.gguf')), false);
  } finally {
    modelServer.close();
    fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 6, retryDelay: 50 });
  }
});

test('WBS-5.2 & WBS-5.4: CLI (ag ai, ag rag, ag ask) + 22-Tool MCP Server (Live API + Offline SQLite)', async () => {
  const cliScript = path.join(process.cwd(), 'cli', 'agendamea.cjs');
  const mcpScript = path.join(process.cwd(), 'mcp', 'server.cjs');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agendamea-ai-cli-'));

  const livePort = await new Promise<number>((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address() as { port: number };
      srv.close(() => resolve(addr.port));
    });
    srv.on('error', reject);
  });

  const tsxCli = path.join(process.cwd(), 'node_modules', 'tsx', 'dist', 'cli.mjs');
  const srvProc = spawn(process.execPath, [tsxCli, path.join(process.cwd(), 'server.ts')], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: 'production',
      HOST: '127.0.0.1',
      PORT: String(livePort),
      AGENDAMEA_DATA_DIR: tmpDir,
      AGENDAMEA_HEADLESS_DAEMON: '1',
    },
    stdio: 'ignore',
    windowsHide: true,
  });

  let ready = false;
  for (let i = 0; i < 45; i += 1) {
    try {
      const h = await fetch(`http://127.0.0.1:${livePort}/api/health`);
      if (h.ok) {
        ready = true;
        break;
      }
    } catch {
      // Wait
    }
    await new Promise((r) => setTimeout(r, 120));
  }
  assert.equal(ready, true, 'Live server with AI endpoints must boot');

  try {
    const liveEnv = {
      ...process.env,
      AGENDAMEA_DATA_DIR: tmpDir,
      AGENDAMEA_URL: `http://127.0.0.1:${livePort}`,
    };
    delete (liveEnv as Record<string, string | undefined>).AGENDAMEA_FORCE_OFFLINE;

    // Verify Permissions-Policy allows microphone=(self)
    const healthRes = await fetch(`http://127.0.0.1:${livePort}/api/health`);
    assert.ok(
      String(healthRes.headers.get('permissions-policy') || '').includes('microphone=(self)'),
    );

    // CLI: ag ask -> creates task via Fast Path
    const askAdd = JSON.parse(
      execFileSync(process.execPath, [cliScript, 'ask', 'yarin 10:00 demo hazirla ekle', '-j'], {
        env: liveEnv,
        encoding: 'utf8',
      }),
    );
    assert.equal(askAdd.ok, true);
    assert.equal(askAdd.status, 'executed');
    assert.equal(askAdd.todo.dueTime, '10:00');

    // CLI: ag rag -> finds task via FTS5 hybrid search
    const ragRes = JSON.parse(
      execFileSync(process.execPath, [cliScript, 'rag', 'demo', '-j'], {
        env: liveEnv,
        encoding: 'utf8',
      }),
    );
    assert.ok(ragRes.hits.length >= 1);

    // CLI: ag ai status & ag ai models
    const aiStatus = JSON.parse(
      execFileSync(process.execPath, [cliScript, 'ai', 'status', '-j'], {
        env: liveEnv,
        encoding: 'utf8',
      }),
    );
    assert.ok(aiStatus.hardware && aiStatus.recommendation);
    assert.equal(aiStatus.models.length, 9);

    // MCP: tools/list returns 22 tools, and #21 + #22 succeed cleanly
    const runMcp = (reqObj: Record<string, unknown>, envObj: NodeJS.ProcessEnv) =>
      JSON.parse(
        execFileSync(process.execPath, [mcpScript], {
          env: envObj,
          input: `${JSON.stringify(reqObj)}\n`,
          encoding: 'utf8',
        })
          .trim()
          .split(/\r?\n/)[0] ?? '{}',
      );

    const listTools = runMcp({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }, liveEnv);
    assert.equal(listTools.result.tools.length, 23);

    const semLive = runMcp(
      {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: 'agendamea_semantic_search', arguments: { query: 'demo' } },
      },
      liveEnv,
    );
    assert.notEqual(semLive.result.isError, true);
    const semParsed = JSON.parse(semLive.result.content[0].text);
    assert.ok(semParsed.hits.length >= 1);

    const aiStatusOffline = runMcp(
      {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: { name: 'agendamea_ai_status', arguments: {} },
      },
      { ...process.env, AGENDAMEA_DATA_DIR: tmpDir, AGENDAMEA_FORCE_OFFLINE: '1' },
    );
    assert.notEqual(aiStatusOffline.result.isError, true);
  } finally {
    srvProc.kill();
    await new Promise<void>((resolve) => {
      if (srvProc.exitCode !== null) resolve();
      else {
        srvProc.once('exit', () => resolve());
        setTimeout(resolve, 600);
      }
    });
    fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 8, retryDelay: 80 });
  }
});

test('WBS-3.1 PAYLOAD CAP: Live /api/ai/transcribe accepts max 30s 16kHz Float32 base64 (~2.56 MB) without HTTP 413', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agendamea-pcm30-'));
  const livePort = await new Promise<number>((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address() as { port: number };
      srv.close(() => resolve(addr.port));
    });
    srv.on('error', reject);
  });
  const tsxCli = path.join(process.cwd(), 'node_modules', 'tsx', 'dist', 'cli.mjs');
  const srvProc = spawn(process.execPath, [tsxCli, path.join(process.cwd(), 'server.ts')], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: 'production',
      HOST: '127.0.0.1',
      PORT: String(livePort),
      AGENDAMEA_DATA_DIR: tmpDir,
      AGENDAMEA_HEADLESS_DAEMON: '1',
    },
    stdio: 'ignore',
    windowsHide: true,
  });

  try {
    let ready = false;
    for (let i = 0; i < 120; i += 1) {
      try {
        const h = await fetch(`http://127.0.0.1:${livePort}/api/health`);
        if (h.ok) {
          ready = true;
          break;
        }
      } catch {
        // Wait
      }
      await new Promise((r) => setTimeout(r, 150));
    }
    assert.equal(ready, true);

    // 30 seconds * 16000 Hz = 480,000 Float32 samples = 1.92 MB binary = 2.56 MB base64
    const pcm30s = new Float32Array(480000);
    const pcmBase64 = Buffer.from(pcm30s.buffer).toString('base64');
    assert.ok(pcmBase64.length > 2_500_000);

    const res = await fetch(`http://127.0.0.1:${livePort}/api/ai/transcribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pcmBase64, language: 'tr' }),
    });
    assert.equal(res.status, 200, `Expected 200 for 30s PCM, got HTTP ${res.status}`);
    const body = (await res.json()) as { ok: boolean; code: string };
    assert.equal(body.ok, false);
    assert.equal(body.code, 'SILENCE');
  } finally {
    srvProc.kill();
    await new Promise<void>((resolve) => {
      if (srvProc.exitCode !== null) resolve();
      else {
        srvProc.once('exit', () => resolve());
        setTimeout(resolve, 600);
      }
    });
    fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 8, retryDelay: 80 });
  }
});

test('QA AUDIT SECURITY & PERF: Live server /api/settings, /api/health app tag, webhook loop/auth guards & OneDrive path guard', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agendamea-qa-sec-'));
  const livePort = await new Promise<number>((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address() as { port: number };
      srv.close(() => resolve(addr.port));
    });
    srv.on('error', reject);
  });
  const tsxCli = path.join(process.cwd(), 'node_modules', 'tsx', 'dist', 'cli.mjs');
  const srvProc = spawn(process.execPath, [tsxCli, path.join(process.cwd(), 'server.ts')], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: 'production',
      HOST: '127.0.0.1',
      PORT: String(livePort),
      AGENDAMEA_DATA_DIR: tmpDir,
      AGENDAMEA_HEADLESS_DAEMON: '1',
    },
    stdio: 'ignore',
    windowsHide: true,
  });

  try {
    let ready = false;
    for (let i = 0; i < 120; i += 1) {
      try {
        const h = await fetch(`http://127.0.0.1:${livePort}/api/health`);
        if (h.ok) {
          ready = true;
          break;
        }
      } catch {
        // Wait
      }
      await new Promise((r) => setTimeout(r, 150));
    }
    assert.equal(ready, true);

    // 1. /api/health returns app: 'Agendamea' & version: '1.1.0'
    const health = (await (await fetch(`http://127.0.0.1:${livePort}/api/health`)).json()) as {
      ok: boolean;
      app: string;
      version: string;
    };
    assert.equal(health.ok, true);
    assert.equal(health.app, 'Agendamea');
    assert.equal(health.version, '1.1.0');

    // 2. Lightweight GET /api/settings returns settings directly
    const settingsRes = await fetch(`http://127.0.0.1:${livePort}/api/settings`);
    assert.equal(settingsRes.status, 200);
    const settingsBody = (await settingsRes.json()) as { language: string };
    assert.ok(typeof settingsBody.language === 'string');

    // 3. POST /api/webhook/incoming rejects disabled+secretless requests (403)
    const disabledRes = await fetch(`http://127.0.0.1:${livePort}/api/webhook/incoming`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'add', title: 'Should be blocked' }),
    });
    assert.equal(disabledRes.status, 403);

    // 4. POST /api/webhook/incoming rejects self-loop X-Agendamea-Event header (400)
    const loopRes = await fetch(`http://127.0.0.1:${livePort}/api/webhook/incoming`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Agendamea-Event': 'todo.created',
      },
      body: JSON.stringify({ action: 'add', title: 'Loop test' }),
    });
    assert.equal(loopRes.status, 400);

    // 5. POST /api/onedrive/connect blocks Windows system folder & UNC paths (400)
    const winDirRes = await fetch(`http://127.0.0.1:${livePort}/api/onedrive/connect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folderPath: 'C:\\Windows\\System32' }),
    });
    assert.equal(winDirRes.status, 400);

    const uncRes = await fetch(`http://127.0.0.1:${livePort}/api/onedrive/connect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folderPath: '\\\\evil-server\\share' }),
    });
    assert.equal(uncRes.status, 400);

    // 6. Lightweight DB selector helpers (findTodoBySelector & resolveTodoByVoiceSelector)
    const selDb = new TodoDatabase(':memory:');
    try {
      const createdA = selDb.createTodo({
        title: 'Bütçe Raporu Hazırla',
        notes: 'Finans departmanı',
      });
      selDb.createTodo({ title: 'Sunum Dosyası', notes: 'Pazarlama' });
      assert.equal(selDb.findTodoBySelector(createdA.id)?.id, createdA.id);
      assert.equal(selDb.findTodoBySelector('bütçe raporu')?.id, createdA.id);
      assert.equal(selDb.resolveTodoByVoiceSelector('finans departmanı')?.id, createdA.id);
    } finally {
      selDb.close();
    }
  } finally {
    srvProc.kill();
    await new Promise<void>((resolve) => {
      if (srvProc.exitCode !== null) resolve();
      else {
        srvProc.once('exit', () => resolve());
        setTimeout(resolve, 600);
      }
    });
  }

  // 7. Offline localStore parity checks (after live server stops):
  //    - AI model role validation blocks invalid/cross-role model IDs
  //    - Webhook SSRF filter drops 169.254.169.254 metadata URLs
  //    - connectCloud blocks C:\Windows and \\UNC paths offline
  const prevDataDir = process.env.AGENDAMEA_DATA_DIR;
  process.env.AGENDAMEA_DATA_DIR = tmpDir;
  try {
    const patched = await localStoreMod.updateSettings({
      aiLlmModelId: 'non-existent-model-id',
      aiSttModelId: 'qwen2.5-1.5b-instruct-q4_k_m', // wrong role (llm instead of stt)
      webhookUrl: 'http://169.254.169.254/latest/meta-data, https://example.com/hook',
    });
    assert.notEqual(patched.aiLlmModelId, 'non-existent-model-id');
    assert.notEqual(patched.aiSttModelId, 'qwen2.5-1.5b-instruct-q4_k_m');
    assert.equal(patched.webhookUrl, 'https://example.com/hook');

    await assert.rejects(
      async () => localStoreMod.connectCloud('C:\\Windows\\System32'),
      /Sistem klasörleri/,
    );
    await assert.rejects(async () => localStoreMod.connectCloud('\\\\evil-server\\share'), /UNC/);
  } finally {
    if (prevDataDir === undefined) delete process.env.AGENDAMEA_DATA_DIR;
    else process.env.AGENDAMEA_DATA_DIR = prevDataDir;
    fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 8, retryDelay: 80 });
  }
});
