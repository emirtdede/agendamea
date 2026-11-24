import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { getNextZoomPreset, getPrevZoomPreset } from '../../src/utils/themes';
import {
  addDaysToDateString,
  classifyEisenhowerQuadrant,
  compareSemver,
} from '../../src/utils/todoLogic';

test('QA: True 100/100 Headless Automation - Headless Webhook Daemon (ag serve), Multi-URL Retry & Logs, Full HMAC Incoming Webhooks, /reset SSE, Batch/Pipe CLI, Views, Zero-GUI Install & OS Bridge', async () => {
  const { execFile, execFileSync } = await import('node:child_process');
  const cryptoMod = await import('node:crypto');
  const httpMod = await import('node:http');
  const netMod = await import('node:net');

  const cliScript = path.join(process.cwd(), 'cli', 'agendamea.cjs');
  const mcpScript = path.join(process.cwd(), 'mcp', 'server.cjs');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agendamea-full100-'));
  const tmpBinDir = path.join(tmpDir, 'cli-bin');

  const runCliAsync = (args: string[], env: NodeJS.ProcessEnv, stdinText?: string) =>
    new Promise<string>((resolve, reject) => {
      const child = execFile(
        process.execPath,
        [cliScript, ...args],
        { env, encoding: 'utf8', windowsHide: true },
        (err, stdout, stderr) => {
          if (err) {
            reject(new Error(`CLI failed (${args.join(' ')}): ${stderr || err.message}`));
            return;
          }
          resolve(stdout);
        },
      );
      if (stdinText !== undefined && child.stdin) {
        child.stdin.write(stdinText);
        child.stdin.end();
      }
    });

  // 2 Webhook receivers: receiver A fails once with 503 then succeeds (tests automatic retry!), receiver B succeeds immediately (tests multi-URL!)
  let receiverAFailsRemaining = 1;
  const hooksA: Array<{ event: string; sig: string }> = [];
  const hooksB: Array<{ event: string; sig: string }> = [];

  const srvA = httpMod.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      if (receiverAFailsRemaining > 0) {
        receiverAFailsRemaining -= 1;
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end('{"error":"transient"}');
        return;
      }
      hooksA.push({
        event: String(req.headers['x-agendamea-event'] ?? ''),
        sig: String(req.headers['x-agendamea-signature'] ?? ''),
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"ok":true}');
    });
  });

  const srvB = httpMod.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      hooksB.push({
        event: String(req.headers['x-agendamea-event'] ?? ''),
        sig: String(req.headers['x-agendamea-signature'] ?? ''),
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"ok":true}');
    });
  });

  await new Promise<void>((resolve) => srvA.listen(0, '127.0.0.1', () => resolve()));
  await new Promise<void>((resolve) => srvB.listen(0, '127.0.0.1', () => resolve()));
  const urlA = `http://127.0.0.1:${(srvA.address() as { port: number }).port}/a`;
  const urlB = `http://127.0.0.1:${(srvB.address() as { port: number }).port}/b`;
  const secret = 'super-hmac-secret-100';

  const daemonPort = await new Promise<number>((resolve, reject) => {
    const p = netMod.createServer();
    p.listen(0, '127.0.0.1', () => {
      const addr = p.address() as { port: number };
      p.close(() => resolve(addr.port));
    });
    p.on('error', reject);
  });

  const baseEnv: NodeJS.ProcessEnv = {
    ...process.env,
    AGENDAMEA_DATA_DIR: tmpDir,
    AGENDAMEA_CLI_LANG: 'tr',
  };
  delete baseEnv.AGENDAMEA_FORCE_OFFLINE;
  const offlineEnv: NodeJS.ProcessEnv = { ...baseEnv, AGENDAMEA_FORCE_OFFLINE: '1' };

  try {
    // 1. Zero-GUI CLI Install & Uninstall (isolated bin dir, no HKCU PATH mutation)
    const installed = JSON.parse(
      await runCliAsync(['install', '--dir', tmpBinDir, '--no-path', '-j'], offlineEnv),
    );
    assert.equal(installed.ok, true);
    const hasNative =
      fs.existsSync(path.join(tmpBinDir, 'ag.exe')) &&
      fs.existsSync(path.join(tmpBinDir, 'ag.target.json'));
    const hasLegacy =
      fs.existsSync(path.join(tmpBinDir, 'ag.cmd')) &&
      fs.existsSync(path.join(tmpBinDir, 'run-cli.ps1'));
    assert.ok(hasNative || hasLegacy, 'CLI install must deploy native ag.exe or fallback shims');
    const uninstalled = JSON.parse(
      await runCliAsync(['uninstall', '--dir', tmpBinDir, '--no-path', '-j'], offlineEnv),
    );
    assert.equal(uninstalled.ok, true);
    assert.equal(fs.existsSync(path.join(tmpBinDir, 'ag.exe')), false);
    assert.equal(fs.existsSync(path.join(tmpBinDir, 'ag.cmd')), false);

    // 2. OS-Level Settings Bridge (window-prefs.json + dynamic .ico generated completely offline!)
    await runCliAsync(['config', 'closeBehavior', 'tray', '-j'], offlineEnv);
    await runCliAsync(['config', 'appIconId', 'purple', '-j'], offlineEnv);
    const prefsFile = path.join(tmpDir, 'window-prefs.json');
    assert.ok(fs.existsSync(prefsFile), 'Offline CLI config must sync window-prefs.json');
    const savedPrefs = JSON.parse(fs.readFileSync(prefsFile, 'utf8'));
    assert.equal(savedPrefs.closeBehavior, 'tray');
    const activeIconMetaPath = path.join(tmpDir, 'active-icon.json');
    assert.ok(
      fs.existsSync(activeIconMetaPath),
      'Offline CLI appIconId change must write active-icon.json',
    );
    const activeIconMeta = JSON.parse(fs.readFileSync(activeIconMetaPath, 'utf8'));
    assert.equal(activeIconMeta.bg, '#7c3aed');
    assert.ok(
      fs.existsSync(activeIconMeta.icoPath),
      'Offline CLI appIconId change must regenerate dynamic .ico',
    );

    // 3. Offline Cloud Provider Auto-Detection
    const cloudSt = JSON.parse(await runCliAsync(['sync', 'status', '-j'], offlineEnv));
    assert.ok(Array.isArray(cloudSt.detectedProviders) && cloudSt.detectedProviders.length === 4);

    // 4. Stdin Pipe Batch Add (`ag + -`), Batch Complete (`ag ok 1 2`), Batch Delete (`ag rm 1,2`), Calendar & Kanban Views, Stdin Import (`ag import -`)
    const pipedAdded = JSON.parse(
      await runCliAsync(
        ['+', '-', '-j'],
        offlineEnv,
        'Gorev Bir @2026-12-01 09:00 !\nGorev Iki @2026-12-02\nGorev Uc\n',
      ),
    );
    assert.equal(pipedAdded.length, 3);

    const calAgenda = JSON.parse(await runCliAsync(['cal', '-j'], offlineEnv));
    assert.ok(Array.isArray(calAgenda.grouped['2026-12-01']));
    assert.equal(calAgenda.undated.length, 1);

    const kanbanBoard = JSON.parse(await runCliAsync(['kanban', 'priority', '-j'], offlineEnv));
    assert.equal(kanbanBoard.columns.high.length, 1);
    assert.equal(kanbanBoard.columns.normal.length, 2);

    const exportedJson = await runCliAsync(['export'], offlineEnv);
    const batchDone = JSON.parse(await runCliAsync(['ok', '1', '2', '-j'], offlineEnv));
    assert.equal(batchDone.length, 2);
    assert.ok(batchDone.every((t: { completed: boolean }) => t.completed === true));

    // Restore from stdin pipe (`ag import -`) then test comma batch delete (`ag rm 1,2`)
    const importedFromPipe = JSON.parse(
      await runCliAsync(['import', '-', '-j'], offlineEnv, exportedJson),
    );
    assert.equal(importedFromPipe.todos.length, 3);
    const batchDel = JSON.parse(await runCliAsync(['rm', '1,2', '-j'], offlineEnv));
    assert.equal(batchDel.length, 2);
    assert.ok(batchDel.every((r: { movedToTrash: boolean }) => r.movedToTrash === true));

    // 5. Multi-URL Outgoing Webhook + Auto-Retry (503 -> 200) + Event Filtering + Persistent Logs
    await runCliAsync(['hook', 'set', `${urlA},${urlB}`, secret, '-j'], offlineEnv);
    await runCliAsync(['hook', 'events', 'todo.created,category.created', '-j'], offlineEnv);

    const multiTest = JSON.parse(await runCliAsync(['hook', 'test', '-j'], offlineEnv));
    assert.equal(
      multiTest.ok,
      true,
      'Multi-URL webhook test must retry transient 503 on receiver A and succeed on both',
    );
    assert.equal(multiTest.results.length, 2);
    assert.equal(hooksA.length, 1);
    assert.equal(hooksB.length, 1);

    // Filtered-out event (todo.deleted) must NOT fire outgoing webhook, while todo.created MUST fire!
    const createdForFilter = JSON.parse(
      await runCliAsync(['+', 'Filter', 'Test', '-j'], offlineEnv),
    );
    assert.equal(hooksA.length, 2);
    assert.equal(hooksB.length, 2);
    await runCliAsync(['rm', createdForFilter.id, '-j'], offlineEnv);
    assert.equal(hooksA.length, 2, 'Filtered-out todo.deleted event must not be dispatched');

    const logsBeforeClear = JSON.parse(await runCliAsync(['hook', 'logs', '-j'], offlineEnv));
    assert.ok(logsBeforeClear.length >= 4);
    assert.ok(
      logsBeforeClear.some(
        (l: { attempts: number; ok: boolean }) => l.attempts === 2 && l.ok === true,
      ),
    );

    // 6. Start Headless API & Incoming Webhook Daemon (`ag serve start`) WITHOUT GUI!
    const started = JSON.parse(
      await runCliAsync(['serve', 'start', '--port', String(daemonPort), '-j'], baseEnv),
    );
    assert.equal(started.ok, true);
    assert.equal(started.running, true);
    assert.equal(started.headless, true);
    assert.equal(started.port, daemonPort);

    const daemonStatus = JSON.parse(await runCliAsync(['serve', 'status', '-j'], baseEnv));
    assert.equal(daemonStatus.running, true);
    assert.equal(daemonStatus.headless, true);

    const sendSignedIncoming = async (payload: Record<string, unknown>) => {
      const raw = JSON.stringify(payload);
      const sig = `sha256=${cryptoMod.createHmac('sha256', secret).update(raw).digest('hex')}`;
      const r = await fetch(started.incomingWebhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Agendamea-Signature': sig,
        },
        body: raw,
      });
      return { status: r.status, body: await r.json() };
    };

    // 6A. Full Incoming Webhook Actions Authenticated via HMAC-SHA256 Signature!
    const incCat = await sendSignedIncoming({
      action: 'category.create',
      name: 'Otomasyon',
      color: '#7c3aed',
    });
    assert.equal(incCat.status, 201);
    const incAdd = await sendSignedIncoming({
      action: 'add',
      title: 'n8n Gorevi',
      category: 'Otomasyon',
      startDate: '2026-12-10',
      dueDate: '2026-12-12',
      dueTime: '11:30',
      pinned: true,
      subtasks: ['Adim A'],
    });
    assert.equal(incAdd.status, 201);
    assert.equal(incAdd.body.todo.pinned, true);
    assert.equal(incAdd.body.todo.subtasks.length, 1);

    const incUpd = await sendSignedIncoming({
      action: 'update',
      id: 'n8n Gorevi',
      notes: 'HMAC guncel',
    });
    assert.equal(incUpd.status, 200);
    assert.equal(incUpd.body.todo.notes, 'HMAC guncel');

    const incSubAdd = await sendSignedIncoming({
      action: 'subtask.add',
      taskId: 'n8n Gorevi',
      title: 'Adim B',
    });
    assert.equal(incSubAdd.status, 201);
    const incSubToggle = await sendSignedIncoming({
      action: 'subtask.toggle',
      taskId: 'n8n Gorevi',
      subtaskId: 'Adim B',
    });
    assert.equal(incSubToggle.status, 200);
    assert.equal(incSubToggle.body.subtask.completed, true);
    const incSubDel = await sendSignedIncoming({
      action: 'subtask.delete',
      taskId: 'n8n Gorevi',
      subtaskId: 'Adim B',
    });
    assert.equal(incSubDel.status, 200);

    const incDel = await sendSignedIncoming({ action: 'delete', id: 'n8n Gorevi' });
    assert.equal(incDel.status, 200);
    const incRestore = await sendSignedIncoming({ action: 'restore', id: 'n8n Gorevi' });
    assert.equal(incRestore.status, 200);
    assert.equal(incRestore.body.kind, 'todo');

    // 6B. Verify SSE Stream Receives Live Change Event on POST /api/reset!
    let sseReceivedReset = false;
    const sseReq = httpMod.get(`${started.url}/api/events`, (sseRes) => {
      sseRes.on('data', (chunk: Buffer) => {
        if (chunk.toString('utf8').includes('/reset')) {
          sseReceivedReset = true;
        }
      });
    });
    await new Promise((r) => setTimeout(r, 150));
    await fetch(`${started.url}/api/reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resetSettings: false }),
    });
    for (let i = 0; i < 20 && !sseReceivedReset; i += 1) {
      await new Promise((r) => setTimeout(r, 40));
    }
    sseReq.destroy();
    assert.equal(
      sseReceivedReset,
      true,
      'POST /api/reset must broadcast SSE refresh event to open UI',
    );

    // 6C. Verify MCP Tools #19 (agendamea_views) & #20 (agendamea_webhook_and_server) Against Live Headless Daemon!
    const callMcp = (name: string, args: Record<string, unknown>) => {
      const out = execFileSync(process.execPath, [mcpScript], {
        env: baseEnv,
        input: `${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } })}\n`,
        encoding: 'utf8',
      });
      const parsed = JSON.parse(out.trim().split(/\r?\n/)[0] ?? '{}');
      assert.notEqual(
        parsed.result?.isError,
        true,
        `MCP ${name} failed: ${parsed.result?.content?.[0]?.text}`,
      );
      return JSON.parse(parsed.result.content[0].text);
    };

    const mcpLogs = callMcp('agendamea_webhook_and_server', { action: 'webhook_logs', limit: 30 });
    assert.ok(
      mcpLogs.some((l: { direction: string }) => l.direction === 'incoming'),
      'Incoming webhook calls must be logged',
    );
    const mcpSrvStatus = callMcp('agendamea_webhook_and_server', { action: 'server_status' });
    assert.equal(mcpSrvStatus.running, true);
    const mcpCal = callMcp('agendamea_views', { view: 'calendar' });
    assert.ok(mcpCal && typeof mcpCal.grouped === 'object');
    const mcpKanban = callMcp('agendamea_views', { view: 'kanban', groupBy: 'status' });
    assert.equal(mcpKanban.groupBy, 'status');

    // 6D. Stop Headless Daemon Cleanly via `ag serve stop`!
    const stopped = JSON.parse(await runCliAsync(['serve', 'stop', '-j'], baseEnv));
    assert.equal(stopped.ok, true);
    assert.equal(stopped.stopped, true);
    const afterStop = JSON.parse(await runCliAsync(['serve', 'status', '-j'], baseEnv));
    assert.equal(afterStop.running, false);

    // 6E. Third-Pass Audit Regressions: Zoom preset helpers, pre-release semver & Eisenhower Q1->Q2 startDate clear
    assert.equal(getNextZoomPreset(115), 125);
    assert.equal(getPrevZoomPreset(115), 110);
    assert.equal(getNextZoomPreset(135), 150);
    assert.equal(getPrevZoomPreset(135), 125);
    assert.equal(getNextZoomPreset(150), 150);
    assert.equal(getPrevZoomPreset(80), 80);

    assert.equal(compareSemver('1.1.0', '1.1.0-beta.1'), 1);
    assert.equal(compareSemver('1.1.0-alpha.1', '1.1.0'), -1);
    assert.ok(compareSemver('1.1.0-beta.2', '1.1.0-beta.1') > 0);

    const todaySample = '2026-11-22';
    const tomorrowSample = addDaysToDateString(todaySample, 1);
    assert.equal(
      classifyEisenhowerQuadrant(
        { important: true, priority: 'high', startDate: null, dueDate: tomorrowSample },
        todaySample,
      ),
      'q2',
    );
  } finally {
    try {
      await runCliAsync(['serve', 'stop', '-j'], baseEnv);
    } catch {
      // Ignore if already stopped
    }
    srvA.close();
    srvB.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
