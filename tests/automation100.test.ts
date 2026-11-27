import assert from 'node:assert/strict';
import { execFile, execFileSync, spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import { createRequire } from 'node:module';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { TodoDatabase } from '../src/db/database';

const require = createRequire(import.meta.url);
const textNormalize = require('../shared/textNormalize.cjs');
const cliParser = require('../shared/cliParser.cjs');
const cliViewState = require('../shared/cliViewState.cjs');
const cliInstaller = require('../shared/cliInstaller.cjs');
const mcpClients = require('../shared/mcpClients.cjs');
const webhookEngine = require('../shared/webhookEngine.cjs');

const ROOT_DIR = process.cwd();
const CLI_SCRIPT = path.join(ROOT_DIR, 'cli', 'agendamea.cjs');
const MCP_SCRIPT = path.join(ROOT_DIR, 'mcp', 'server.cjs');
const NATIVE_AG_EXE = path.join(ROOT_DIR, 'cli', 'bin', 'ag.exe');

function runCmd(
  file: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  stdinText?: string,
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = execFile(
      file,
      args,
      { env, encoding: 'utf8', windowsHide: true },
      (err, stdout, stderr) => {
        const code =
          err && typeof (err as NodeJS.ErrnoException & { code?: number }).code === 'number'
            ? Number((err as NodeJS.ErrnoException & { code?: number }).code)
            : err
              ? 1
              : 0;
        resolve({ code, stdout: stdout || '', stderr: stderr || '' });
      },
    );
    if (stdinText !== undefined && child.stdin) {
      child.stdin.write(stdinText);
      child.stdin.end();
    }
  });
}

// =========================================================================
// FAZ 0 - T-0.1, T-0.2, T-0.3: Native ag.exe, Unified Installer, Normalizer
// =========================================================================

test('T-0.1 & T-0.2: Native ag.exe console shim deploys cleanly, passes UTF-8/exit-code, and replaces locked binaries', async () => {
  assert.ok(fs.existsSync(NATIVE_AG_EXE), 'cli/bin/ag.exe must be compiled');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-shim-test-'));
  const binDir = path.join(tmpDir, 'bin');
  const dataDir = path.join(tmpDir, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  try {
    const res = await cliInstaller.installCliShims({
      runtimeRoot: ROOT_DIR,
      execPath: process.execPath,
      binDir,
      skipPathUpdate: true,
    });
    assert.equal(res.ok, true);
    assert.equal(res.nativeShim, true);
    assert.ok(fs.existsSync(path.join(binDir, 'ag.exe')));
    assert.ok(fs.existsSync(path.join(binDir, 'agenda.exe')));
    assert.ok(fs.existsSync(path.join(binDir, 'agendamea.exe')));
    assert.ok(fs.existsSync(path.join(binDir, 'ag.target.json')));
    assert.equal(
      fs.existsSync(path.join(binDir, 'ag.cmd')),
      false,
      'Legacy .cmd must be removed when ag.exe is deployed',
    );

    const env = {
      ...process.env,
      AGENDAMEA_DATA_DIR: dataDir,
      AGENDAMEA_FORCE_OFFLINE: '1',
      NO_COLOR: '1',
    };
    const agExe = path.join(binDir, 'ag.exe');

    // UTF-8 roundtrip through native ag.exe without shell
    const addRes = await runCmd(
      agExe,
      ['+', 'Şirket ışığı ölçümü', '+finans', 'p:yuksek', '-j'],
      env,
    );
    assert.equal(addRes.code, 0, addRes.stderr);
    const added = JSON.parse(addRes.stdout);
    assert.equal(added.title, 'Şirket ışığı ölçümü');
    assert.equal(added.priority, 'high');
    assert.deepEqual(added.tags, ['finans']);

    // Unknown command returns deterministic exit code 2
    const badRes = await runCmd(agExe, ['bilinmeyen-komut-xyz'], env);
    assert.equal(badRes.code, 2);

    // Zero-chain MCP launch via ag.exe mcp with shell: false
    const probe = await mcpClients.probeMcpServer({
      runtimeRoot: ROOT_DIR,
      cliExePath: agExe,
      env,
    });
    assert.equal(probe.ok, true, `ag.exe mcp probe failed: ${probe.error}`);
    assert.equal(probe.protocolVersion, '2025-11-25');
    assert.equal(probe.toolCount, 23);
    assert.equal(probe.resourceCount, 5);
    assert.equal(probe.promptCount, 4);
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 80 });
    } catch {
      // Ignore transient Windows executable handle release delay in OS temp dir
    }
  }
});

test('T-0.3: Dual-layer locale-safe search normalizer fixes API/IT Turkish dotless-I collisions', () => {
  assert.equal(textNormalize.matchesNormalized('API Entegrasyonu', 'api'), true);
  assert.equal(textNormalize.matchesNormalized('api entegrasyonu', 'API'), true);
  assert.equal(textNormalize.matchesNormalized('IT Destek', 'it'), true);
  assert.equal(textNormalize.matchesNormalized('it destek', 'IT'), true);
  assert.equal(textNormalize.matchesNormalized('İstanbul Raporu', 'istanbul'), true);
  assert.equal(textNormalize.matchesNormalized('İstanbul Raporu', 'ISTANBUL'), true);
  assert.equal(textNormalize.matchesNormalized('Işık Sensörü', 'isik'), true);
  assert.equal(textNormalize.equalsNormalized('IT', 'it'), true);
  assert.equal(textNormalize.equalsNormalized('API', 'api'), true);

  const db = new TodoDatabase(':memory:');
  try {
    db.createTodo({ title: 'API Entegrasyonu' });
    db.createTodo({ title: 'IT Destek' });
    db.createTodo({ title: 'İstanbul Raporu' });
    assert.ok(db.findTodoBySelector('api'));
    assert.ok(db.findTodoBySelector('it'));
    assert.ok(db.findTodoBySelector('istanbul'));
  } finally {
    db.close();
  }
});

// =========================================================================
// FAZ 1 - T-1.1..T-1.5: MCP 2025-11-25, Resources, Prompts, Auto-Installer
// =========================================================================

test('T-1.2 & T-1.3: MCP protocol negotiation (2025-11-25 vs 2024-11-05), annotations, structuredContent, resources, prompts, and -32700 parse error', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-mcp-spec-'));
  const env = { ...process.env, AGENDAMEA_DATA_DIR: tmpDir, AGENDAMEA_FORCE_OFFLINE: '1' };
  try {
    // 1. Seed a task via CLI
    await runCmd(
      process.execPath,
      [CLI_SCRIPT, '+', 'API Güvenlik Denetimi', '@bugun', 'p:yuksek', '-j'],
      env,
    );

    // 2. Modern 2025-11-25 session including malformed JSON frame recovery
    const modernFrames = `${[
      JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-11-25',
          capabilities: {},
          clientInfo: { name: 't', version: '1' },
        },
      }),
      '{malformed-json-frame',
      JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }),
      JSON.stringify({
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: { name: 'agendamea_list_tasks', arguments: { filter: 'active' } },
      }),
      JSON.stringify({ jsonrpc: '2.0', id: 4, method: 'resources/list', params: {} }),
      JSON.stringify({ jsonrpc: '2.0', id: 5, method: 'resources/templates/list', params: {} }),
      JSON.stringify({
        jsonrpc: '2.0',
        id: 6,
        method: 'resources/read',
        params: { uri: 'agendamea://tasks/today' },
      }),
      JSON.stringify({
        jsonrpc: '2.0',
        id: 7,
        method: 'resources/read',
        params: { uri: 'agendamea://invalid/uri' },
      }),
      JSON.stringify({ jsonrpc: '2.0', id: 8, method: 'prompts/list', params: {} }),
      JSON.stringify({
        jsonrpc: '2.0',
        id: 9,
        method: 'prompts/get',
        params: { name: 'daily_plan', arguments: { focusHours: '4' } },
      }),
    ].join('\n')}\n`;

    const rawOut = execFileSync(process.execPath, [MCP_SCRIPT], {
      env,
      input: modernFrames,
      encoding: 'utf8',
    });
    const msgs = rawOut
      .trim()
      .split(/\r?\n/)
      .map((line) => JSON.parse(line));

    const initMsg = msgs.find((m) => m.id === 1);
    assert.equal(initMsg.result.protocolVersion, '2025-11-25');
    assert.ok(initMsg.result.capabilities.resources);
    assert.ok(initMsg.result.capabilities.prompts);

    const parseErr = msgs.find((m) => m.error && m.error.code === -32700);
    assert.ok(parseErr, 'Malformed JSON frame must emit JSON-RPC -32700 Parse Error');

    const toolsMsg = msgs.find((m) => m.id === 2);
    assert.equal(toolsMsg.result.tools.length, 23);
    assert.ok(
      toolsMsg.result.tools.every(
        (t: { annotations?: { readOnlyHint?: boolean }; outputSchema?: unknown }) =>
          t.annotations &&
          typeof t.annotations.readOnlyHint === 'boolean' &&
          Boolean(t.outputSchema),
      ),
      'All 23 tools must expose ToolAnnotations and outputSchema in 2025-11-25',
    );

    const callMsg = msgs.find((m) => m.id === 3);
    assert.ok(callMsg.result.structuredContent);
    assert.equal(callMsg.result.structuredContent.count, 1);

    const resList = msgs.find((m) => m.id === 4);
    assert.equal(resList.result.resources.length, 5);
    const tplList = msgs.find((m) => m.id === 5);
    assert.equal(tplList.result.resourceTemplates.length, 2);
    const todayRes = msgs.find((m) => m.id === 6);
    assert.equal(JSON.parse(todayRes.result.contents[0].text).returnedCount, 1);
    const badRes = msgs.find((m) => m.id === 7);
    assert.equal(badRes.error.code, -32002);

    const promptList = msgs.find((m) => m.id === 8);
    assert.equal(promptList.result.prompts.length, 4);
    const dailyPrompt = msgs.find((m) => m.id === 9);
    assert.ok(dailyPrompt.result.messages[0].content.text.includes('API Güvenlik Denetimi'));

    // 3. Legacy 2024-11-05 negotiation hides outputSchema & structuredContent
    const legacyFrames = `${[
      JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'old', version: '1' },
        },
      }),
      JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }),
      JSON.stringify({
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: { name: 'agendamea_status', arguments: {} },
      }),
    ].join('\n')}\n`;
    const legacyOut = execFileSync(process.execPath, [MCP_SCRIPT], {
      env,
      input: legacyFrames,
      encoding: 'utf8',
    });
    const legacyMsgs = legacyOut
      .trim()
      .split(/\r?\n/)
      .map((line) => JSON.parse(line));
    assert.equal(legacyMsgs[0].result.protocolVersion, '2024-11-05');
    assert.equal(legacyMsgs[1].result.tools[0].outputSchema, undefined);
    assert.equal(legacyMsgs[2].result.structuredContent, undefined);
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 80 });
    } catch {
      // Ignore transient Windows executable handle release delay in OS temp dir
    }
  }
});

test('T-1.4: MCP client auto-installer preserves existing servers, parses JSONC, writes VS Code servers/stdio, and refuses broken JSON', () => {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-mcp-home-'));
  const fakeAppData = path.join(tmpHome, 'AppData', 'Roaming');
  const fakeEnv = {
    USERPROFILE: tmpHome,
    APPDATA: fakeAppData,
    LOCALAPPDATA: path.join(tmpHome, 'AppData', 'Local'),
  };

  try {
    // Seed existing Claude Desktop config with another server
    const claudeFile = path.join(fakeAppData, 'Claude', 'claude_desktop_config.json');
    fs.mkdirSync(path.dirname(claudeFile), { recursive: true });
    fs.writeFileSync(
      claudeFile,
      JSON.stringify({ mcpServers: { existing: { command: 'echo' } } }, null, 2),
    );

    // Seed VS Code config with JSONC comment + trailing comma
    const vscodeFile = path.join(fakeAppData, 'Code', 'User', 'mcp.json');
    fs.mkdirSync(path.dirname(vscodeFile), { recursive: true });
    fs.writeFileSync(
      vscodeFile,
      `{\n  // existing user comment\n  "servers": {\n    "other": { "type": "stdio", "command": "node", "args": ["a.js"], },\n  },\n}\n`,
    );

    // Seed Antigravity config with broken JSON (must refuse to overwrite!)
    const agyFile = path.join(tmpHome, '.gemini', 'config', 'mcp_config.json');
    fs.mkdirSync(path.dirname(agyFile), { recursive: true });
    const brokenContent = '{ "mcpServers": { broken ] }';
    fs.writeFileSync(agyFile, brokenContent);

    const rClaude = mcpClients.installMcpClient('claude-desktop', {
      env: fakeEnv,
      cliExePath: NATIVE_AG_EXE,
    });
    assert.equal(rClaude.ok, true);
    assert.ok(rClaude.backupPath && fs.existsSync(rClaude.backupPath));
    const claudeSaved = JSON.parse(fs.readFileSync(claudeFile, 'utf8'));
    assert.ok(claudeSaved.mcpServers.existing, 'Existing MCP server must be preserved');
    assert.equal(claudeSaved.mcpServers.agendamea.command, NATIVE_AG_EXE);
    assert.deepEqual(claudeSaved.mcpServers.agendamea.args, ['mcp']);

    const rVsCode = mcpClients.installMcpClient('vscode', {
      env: fakeEnv,
      cliExePath: NATIVE_AG_EXE,
    });
    assert.equal(rVsCode.ok, true);
    const vsSaved = JSON.parse(fs.readFileSync(vscodeFile, 'utf8'));
    assert.ok(vsSaved.servers.other);
    assert.equal(vsSaved.servers.agendamea.type, 'stdio');
    assert.equal(vsSaved.servers.agendamea.command, NATIVE_AG_EXE);

    assert.throws(
      () => mcpClients.installMcpClient('antigravity', { env: fakeEnv, cliExePath: NATIVE_AG_EXE }),
      /malformed config/i,
    );
    assert.equal(
      fs.readFileSync(agyFile, 'utf8'),
      brokenContent,
      'Broken config must remain untouched',
    );
  } finally {
    fs.rmSync(tmpHome, { recursive: true, force: true });
  }
});

// =========================================================================
// FAZ 2 & 3 - T-2.1..T-3.4: Lazy AI, View Snapshot, Shell-Safe Parser, Safe Edit, Completion, Doctor
// =========================================================================

test('T-2.1: Lazy loading keeps heavy AI modules out of require.cache for normal CLI queries', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-lazy-'));
  const probeScript = `
    const store = require(${JSON.stringify(path.join(ROOT_DIR, 'shared', 'localStore.cjs'))});
    store.getStatus().then(() => {
      const loaded = Object.keys(require.cache).map((k) => k.toLowerCase());
      console.log(JSON.stringify({
        hasHardware: loaded.some((k) => k.includes('hardwareprofiler')),
        hasModelManager: loaded.some((k) => k.includes('modelmanager')),
        hasVoiceOrch: loaded.some((k) => k.includes('voiceorchestrator')),
      }));
    });
  `;
  try {
    const out = execFileSync(process.execPath, ['-e', probeScript], {
      env: { ...process.env, AGENDAMEA_DATA_DIR: tmpDir, AGENDAMEA_FORCE_OFFLINE: '1' },
      encoding: 'utf8',
    });
    const parsed = JSON.parse(out.trim());
    assert.equal(parsed.hasHardware, false);
    assert.equal(parsed.hasModelManager, false);
    assert.equal(parsed.hasVoiceOrch, false);
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 80 });
    } catch {
      // Ignore transient Windows executable handle release delay in OS temp dir
    }
  }
});

test('T-2.2 & T-3.2: View-aware snapshot prevents ag bugun -> ag ok 1 / ag rm 1 footgun & multi-word ag edit preserves title', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-view-edit-'));
  const env = {
    ...process.env,
    AGENDAMEA_DATA_DIR: tmpDir,
    AGENDAMEA_FORCE_OFFLINE: '1',
    AGENDAMEA_CLI_SESSION: 'test-session-1',
    NO_COLOR: '1',
  };
  try {
    // Task #1 is tomorrow, Task #2 is today
    await runCmd(process.execPath, [CLI_SCRIPT, '+', 'Yarinki Toplanti', '@yarin', '-j'], env);
    const todayRes = await runCmd(
      process.execPath,
      [CLI_SCRIPT, '+', 'Bugunku Musteri Toplantisi', '@bugun', '-j'],
      env,
    );
    const todayTask = JSON.parse(todayRes.stdout);

    // Display `ag bugun` -> item #1 on screen is "Bugunku Musteri Toplantisi"
    const bugunList = await runCmd(process.execPath, [CLI_SCRIPT, 'bugun'], env);
    assert.equal(bugunList.code, 0);
    assert.ok(bugunList.stdout.includes('Bugunku Musteri Toplantisi'));

    // Multi-word edit WITHOUT --title MUST NOT overwrite title!
    const editRes = await runCmd(
      process.execPath,
      [
        CLI_SCRIPT,
        'edit',
        'Bugunku',
        'Musteri',
        'Toplantisi',
        '--time',
        '18.30',
        '--priority',
        'high',
        '-j',
      ],
      env,
    );
    assert.equal(editRes.code, 0, editRes.stderr);
    const edited = JSON.parse(editRes.stdout);
    assert.equal(edited.title, 'Bugunku Musteri Toplantisi');
    assert.equal(edited.dueTime, '18:30');
    assert.equal(edited.priority, 'high');

    // `ag ok 1` MUST complete "Bugunku Musteri Toplantisi" (NOT "Yarinki Toplanti"!)
    const okRes = await runCmd(process.execPath, [CLI_SCRIPT, 'ok', '1', '-j'], env);
    assert.equal(okRes.code, 0, okRes.stderr);
    const completed = JSON.parse(okRes.stdout);
    assert.equal(completed.id, todayTask.id);
    assert.equal(completed.completed, true);

    // Expire snapshot manually -> `ag rm 1` MUST refuse with exit code 2!
    const snapPath = cliViewState.getViewStatePath(tmpDir);
    const snapData = JSON.parse(fs.readFileSync(snapPath, 'utf8'));
    snapData.sessions['test-session-1'].savedAt = Date.now() - 35 * 60 * 1000;
    fs.writeFileSync(snapPath, JSON.stringify(snapData));
    const staleRm = await runCmd(process.execPath, [CLI_SCRIPT, 'rm', '1'], env);
    assert.equal(staleRm.code, 2, 'Expired snapshot must block blind numeric delete');
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 80 });
    } catch {
      // Ignore transient Windows executable handle release delay in OS temp dir
    }
  }
});

test('T-3.1, T-2.4 & T-3.4: Shell-safe parser handles PowerShell-safe tokens, relative dates, URL/C++ raw escape, completion, config --list, and doctor', async () => {
  // Base date: Monday 2026-11-23
  const baseDate = new Date(2026, 10, 23);
  const parsed = cliParser.parseQuickTaskTokens(
    [
      'Raporu',
      'hazirla',
      '+finans',
      't:q4',
      'p:yuksek',
      'i:',
      'pin:',
      'c:"Kisisel Isler"',
      '@cuma',
      '14.30',
    ],
    { baseDate },
  );
  assert.equal(parsed.title, 'Raporu hazirla');
  assert.deepEqual(parsed.tags, ['finans', 'q4']);
  assert.equal(parsed.priority, 'high');
  assert.equal(parsed.important, true);
  assert.equal(parsed.pinned, true);
  assert.equal(parsed.category, 'Kisisel Isler');
  assert.equal(parsed.dueDate, '2026-11-27');
  assert.equal(parsed.dueTime, '14:30');

  const relParsed = cliParser.parseQuickTaskTokens(['Sunum', '+3g'], { baseDate });
  assert.equal(relParsed.dueDate, '2026-11-26');
  assert.deepEqual(relParsed.tags, []);

  const rawEsc = cliParser.parseQuickTaskTokens(
    ['--', 'https://example.com/a+b', 'C++', '+notatag'],
    { baseDate },
  );
  assert.equal(rawEsc.title, 'https://example.com/a+b C++ +notatag');
  assert.deepEqual(rawEsc.tags, []);

  // Verify completion script, config --list, human sync status, NO_COLOR, and doctor
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-cli-ux-'));
  const env = {
    ...process.env,
    AGENDAMEA_DATA_DIR: tmpDir,
    AGENDAMEA_FORCE_OFFLINE: '1',
    NO_COLOR: '1',
  };
  try {
    const comp = await runCmd(process.execPath, [CLI_SCRIPT, 'completion', 'powershell'], env);
    assert.equal(comp.code, 0);
    assert.ok(comp.stdout.includes('Register-ArgumentCompleter -Native'));

    const profileFile = path.join(tmpDir, 'ps_profile.ps1');
    const inst1 = await runCmd(
      process.execPath,
      [CLI_SCRIPT, 'completion', 'powershell', '--install', '--profile', profileFile],
      env,
    );
    const inst2 = await runCmd(
      process.execPath,
      [CLI_SCRIPT, 'completion', 'powershell', '--install', '--profile', profileFile],
      env,
    );
    assert.equal(inst1.code, 0);
    assert.equal(inst2.code, 0);
    const profileText = fs.readFileSync(profileFile, 'utf8');
    assert.equal(
      profileText.match(/# >>> agendamea completion >>>/g)?.length,
      1,
      'Completion install must be idempotent',
    );

    const cfgList = await runCmd(process.execPath, [CLI_SCRIPT, 'config', '--list'], env);
    assert.equal(cfgList.code, 0);
    assert.ok(cfgList.stdout.includes('webhookFormat'));
    assert.equal(cfgList.stdout.includes('\x1b['), false, 'NO_COLOR=1 must emit zero ANSI escapes');

    const syncHuman = await runCmd(process.execPath, [CLI_SCRIPT, 'sync', 'status'], env);
    assert.equal(syncHuman.code, 0);
    assert.equal(
      syncHuman.stdout.trim().startsWith('{'),
      false,
      'Default sync status must be human-readable',
    );

    const doc = await runCmd(process.execPath, [CLI_SCRIPT, 'doctor', '-j'], env);
    assert.equal(doc.code, 0);
    const docJson = JSON.parse(doc.stdout);
    assert.equal(docJson.ok, true);
    assert.ok(docJson.cliShim && docJson.database && docJson.mcp && docJson.webhookOutbox);
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 80 });
    } catch {
      // Ignore transient Windows executable handle release delay in OS temp dir
    }
  }
});

// =========================================================================
// FAZ 4 - T-4.1..T-4.4: Standard Webhooks, Discord/Slack Limits, SSRF, Outbox, Replay & Incoming Auth
// =========================================================================

test('T-4.1 & T-4.2: Schema v5, Standard Webhooks v1 HMAC signing, Discord/Slack limit enforcement, and SSRF defense', () => {
  // 1. Standard Webhooks v1 signature verification with whsec_ key
  const rawKey = crypto.randomBytes(24).toString('base64');
  const whsec = `whsec_${rawKey}`;
  const eventId = 'msg_test123456';
  const tsSec = Math.floor(Date.now() / 1000);
  const rawBody = JSON.stringify({ event: 'todo.created', data: { title: 'Test' } });
  const headers = webhookEngine.buildWebhookHeaders({
    event: 'todo.created',
    eventId,
    timestampSec: tsSec,
    rawBody,
    secret: whsec,
  });
  assert.equal(headers['webhook-id'], eventId);
  assert.equal(headers['webhook-timestamp'], String(tsSec));
  assert.ok(headers['webhook-signature'].startsWith('v1,'));
  assert.ok(headers['X-Agendamea-Signature'].startsWith('sha256='));

  const lowerHeaders: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) lowerHeaders[k.toLowerCase()] = String(v);
  const verified = webhookEngine.verifyIncomingWebhookAuth({
    headers: lowerHeaders,
    rawBody,
    configuredSecret: whsec,
  });
  assert.equal(verified.ok, true);

  // Stale timestamp (> 5 min old) MUST be rejected
  const stale = webhookEngine.verifyIncomingWebhookAuth({
    headers: { ...lowerHeaders, 'webhook-timestamp': String(tsSec - 400) },
    rawBody,
    configuredSecret: whsec,
  });
  assert.equal(stale.ok, false);
  assert.equal(stale.reason, 'stale_timestamp');

  // 2. Discord Embed & Slack Block Kit limits
  const hugeNotes = 'A'.repeat(8000);
  const hugeTitle = 'T'.repeat(500);
  const discordPayload = webhookEngine.buildWebhookPayload({
    event: 'todo.created',
    data: {
      title: hugeTitle,
      notes: hugeNotes,
      priority: 'high',
      dueDate: '2026-12-01',
      tags: ['a', 'b'],
    },
    targetUrl: 'https://discord.com/api/webhooks/123/abc',
    format: 'auto',
  });
  assert.equal(discordPayload.format, 'discord');
  const embed = discordPayload.body.embeds[0];
  assert.ok(embed.title.length <= 256);
  assert.ok(embed.description.length <= 4000);
  const totalDiscordChars =
    embed.title.length +
    embed.description.length +
    embed.footer.text.length +
    embed.fields.reduce(
      (a: number, f: { name: string; value: string }) => a + f.name.length + f.value.length,
      0,
    );
  assert.ok(totalDiscordChars <= 6000);

  const slackPayload = webhookEngine.buildWebhookPayload({
    event: 'todo.due',
    data: { title: hugeTitle, notes: hugeNotes, priority: 'high' },
    targetUrl: 'https://hooks.slack.com/services/T0/B0/XX',
    format: 'auto',
  });
  assert.equal(slackPayload.format, 'slack');
  assert.ok(slackPayload.body.blocks.length <= 50);
  assert.ok(slackPayload.body.blocks[0].text.text.length <= 150);
  assert.ok(slackPayload.body.blocks[1].text.text.length <= 3000);

  // 3. SSRF rules
  assert.equal(
    webhookEngine.validateWebhookUrlSyntax('http://169.254.169.254/latest/meta-data').ok,
    false,
  );
  assert.equal(
    webhookEngine.validateWebhookUrlSyntax('http://127.0.0.1:9999/hook', {
      allowLocalNetwork: false,
    }).ok,
    false,
  );
  assert.equal(
    webhookEngine.validateWebhookUrlSyntax('http://127.0.0.1:9999/hook', {
      allowLocalNetwork: true,
    }).ok,
    true,
  );
  assert.equal(
    webhookEngine.validateWebhookUrlSyntax('http://127.0.0.1:38721/api/webhook/incoming', {
      allowLocalNetwork: true,
      activeListenPort: 38721,
    }).ok,
    false,
  );

  // 4. Schema v6 tables & idempotent reminder dedup
  const db = new TodoDatabase(':memory:');
  try {
    const version = Number(db.getRawDb().pragma('user_version', { simple: true }));
    assert.equal(version, 6);
    assert.equal(db.claimReminderDispatch('t1', 'due', '2026-11-23T12:00'), true);
    assert.equal(
      db.claimReminderDispatch('t1', 'due', '2026-11-23T12:00'),
      false,
      'Second claim must dedup',
    );
  } finally {
    db.close();
  }
});

test('T-4.3: Offline outbox persistence, dead-letter vs retry, and replay succeed end-to-end', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-outbox-'));
  let mode: 'fail400' | 'ok200' = 'fail400';
  const receivedHeaders: Array<http.IncomingHttpHeaders> = [];

  const srv = http.createServer((req, res) => {
    req.resume();
    req.on('end', () => {
      receivedHeaders.push(req.headers);
      if (mode === 'fail400') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end('{"error":"bad request"}');
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{"ok":true}');
      }
    });
  });
  await new Promise<void>((resolve) => srv.listen(0, '127.0.0.1', () => resolve()));
  const port = (srv.address() as net.AddressInfo).port;
  const env = { ...process.env, AGENDAMEA_DATA_DIR: tmpDir, AGENDAMEA_FORCE_OFFLINE: '1' };

  try {
    await runCmd(
      process.execPath,
      [
        CLI_SCRIPT,
        'hook',
        'set',
        `http://127.0.0.1:${port}/wh`,
        'whsec_dGVzdGtleTEyMzQ1Njc4OTAxMjM0NTY=',
        '-j',
      ],
      env,
    );
    await runCmd(process.execPath, [CLI_SCRIPT, '+', 'Outbox Test Task', '-j'], env);

    // 400 non-retriable must move directly to dead_letter in SQLite outbox
    const outboxRes1 = await runCmd(process.execPath, [CLI_SCRIPT, 'hook', 'outbox', '-j'], env);
    const outbox1 = JSON.parse(outboxRes1.stdout);
    assert.equal(outbox1.length, 1);
    assert.equal(outbox1[0].status, 'dead_letter');
    assert.equal(outbox1[0].lastStatusCode, 400);
    assert.ok(receivedHeaders[0]?.['webhook-id']);
    assert.ok(String(receivedHeaders[0]?.['webhook-signature'] || '').startsWith('v1,'));

    // Receiver recovers -> replay outbox entry succeeds with SAME webhook-id!
    mode = 'ok200';
    const replayRes = await runCmd(
      process.execPath,
      [CLI_SCRIPT, 'hook', 'replay', outbox1[0].id, '-j'],
      env,
    );
    assert.equal(replayRes.code, 0, replayRes.stderr);
    assert.equal(JSON.parse(replayRes.stdout).ok, true);
    assert.equal(
      receivedHeaders[1]?.['webhook-id'],
      receivedHeaders[0]?.['webhook-id'],
      'Replay must preserve webhook-id for consumer idempotency',
    );

    const outbox2 = JSON.parse(
      (await runCmd(process.execPath, [CLI_SCRIPT, 'hook', 'outbox', '-j'], env)).stdout,
    );
    assert.equal(outbox2[0].status, 'delivered');
    assert.ok(
      String(outbox1[0].lastError || '').includes('bad request'),
      'HTTP 400 response body must be captured for debugging',
    );
  } finally {
    srv.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// =========================================================================
// FAZ 5 - T-5.1..T-5.5: 95+ Polish Verification (ag.exe mcp subcmds, Antigravity path,
// MCP pagination/confirm/subscribe/HTTP, Parser anti-traps, Views snapshot, Per-URL Webhooks)
// =========================================================================

test('T-5.1 & T-5.2: ag.exe mcp subcommands never hang & Antigravity defaults to .gemini/antigravity/mcp_config.json', async () => {
  assert.ok(fs.existsSync(NATIVE_AG_EXE), 'cli/bin/ag.exe must be compiled');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-subcmd-'));
  const binDir = path.join(tmpDir, 'bin');
  const dataDir = path.join(tmpDir, 'data');
  const fakeHome = path.join(tmpDir, 'home');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(path.join(fakeHome, '.gemini', 'antigravity'), { recursive: true });

  try {
    await cliInstaller.installCliShims({
      runtimeRoot: ROOT_DIR,
      execPath: process.execPath,
      binDir,
      skipPathUpdate: true,
    });
    const agExe = path.join(binDir, 'ag.exe');
    const env = {
      ...process.env,
      USERPROFILE: fakeHome,
      APPDATA: path.join(fakeHome, 'AppData', 'Roaming'),
      LOCALAPPDATA: path.join(fakeHome, 'AppData', 'Local'),
      AGENDAMEA_DATA_DIR: dataDir,
      AGENDAMEA_FORCE_OFFLINE: '1',
      NO_COLOR: '1',
    };

    // Must NOT hang in stdio MCP mode!
    const listRes = await runCmd(agExe, ['mcp', 'list', '-j'], env);
    assert.equal(listRes.code, 0, listRes.stderr);
    const clients = JSON.parse(listRes.stdout) as Array<{ id: string; configPath: string }>;
    const agy = clients.find((c) => c.id === 'antigravity');
    assert.ok(agy, 'Antigravity client must be listed');
    assert.ok(
      agy.configPath
        .toLowerCase()
        .endsWith(path.join('.gemini', 'antigravity', 'mcp_config.json').toLowerCase()),
      `Expected .gemini/antigravity/mcp_config.json, got ${agy.configPath}`,
    );

    const helpRes = await runCmd(agExe, ['mcp', '--help'], env);
    assert.equal(helpRes.code, 0, helpRes.stderr);
    assert.ok(helpRes.stdout.includes('ag mcp doctor'));
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 80 });
    } catch {
      // Ignore transient Windows handle release
    }
  }
});

test('T-5.3: MCP pagination, destructive confirm guard, resource subscriptions, and Streamable HTTP /api/mcp', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-mcp-v2-'));
  const env = { ...process.env, AGENDAMEA_DATA_DIR: tmpDir, AGENDAMEA_FORCE_OFFLINE: '1' };
  try {
    await runCmd(process.execPath, [CLI_SCRIPT, '+', 'Task Alpha', '-j'], env);
    await runCmd(process.execPath, [CLI_SCRIPT, '+', 'Task Beta', '-j'], env);
    await runCmd(process.execPath, [CLI_SCRIPT, '+', 'Task Gamma', '-j'], env);

    const frames = `${[
      JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-11-25',
          capabilities: {},
          clientInfo: { name: 't', version: '1' },
        },
      }),
      JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: 'agendamea_list_tasks', arguments: { limit: 2, offset: 0 } },
      }),
      JSON.stringify({
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: { name: 'agendamea_backup_and_sync', arguments: { action: 'reset' } },
      }),
      JSON.stringify({
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: { name: 'agendamea_manage_trash', arguments: { action: 'empty' } },
      }),
      JSON.stringify({
        jsonrpc: '2.0',
        id: 5,
        method: 'resources/subscribe',
        params: { uri: 'agendamea://tasks/today' },
      }),
      JSON.stringify({
        jsonrpc: '2.0',
        id: 6,
        method: 'tools/call',
        params: { name: 'agendamea_add_task', arguments: { title: 'Sub Notify Task' } },
      }),
    ].join('\n')}\n`;

    const rawOut = execFileSync(process.execPath, [MCP_SCRIPT], {
      env,
      input: frames,
      encoding: 'utf8',
    });
    const msgs = rawOut
      .trim()
      .split(/\r?\n/)
      .map((line) => JSON.parse(line));

    const initMsg = msgs.find((m) => m.id === 1);
    assert.equal(initMsg.result.capabilities.resources.subscribe, true);

    const page1 = msgs.find((m) => m.id === 2).result.structuredContent;
    assert.equal(page1.count, 2);
    assert.equal(page1.totalCount, 3);
    assert.equal(page1.hasMore, true);
    assert.equal(page1.nextOffset, 2);

    const resetBlocked = msgs.find((m) => m.id === 3).result.structuredContent;
    assert.equal(
      resetBlocked.requiresConfirmation,
      true,
      'reset without confirm:true must be blocked',
    );

    const emptyBlocked = msgs.find((m) => m.id === 4).result.structuredContent;
    assert.equal(
      emptyBlocked.requiresConfirmation,
      true,
      'empty trash without confirm:true must be blocked',
    );

    const updateNotif = msgs.find((m) => m.method === 'notifications/resources/updated');
    assert.ok(updateNotif, 'Mutating tool call must notify subscribed resources');
    assert.equal(updateNotif.params.uri, 'agendamea://tasks/today');
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 80 });
    } catch {
      // Ignore
    }
  }
});

test('T-5.4: Parser anti-traps (--note, +100, /api/v2, 10.30 TL, +1ay, @sabah, stdin quotes), per-command --help, typo suggestions & Kanban/Matrix snapshot', async () => {
  const baseDate = new Date(2026, 10, 23); // 2026-11-23

  // Anti-traps: prices, phone/numbers, multi-segment paths stay in title!
  const priceTask = cliParser.parseQuickTaskTokens(
    [
      '10.30',
      'TL',
      'kahve',
      've',
      '+100',
      'TL',
      'odeme',
      '+905551234567',
      '/api/v2',
      '--note',
      'Fisi sakla',
      '+1ay',
      '@sabah',
    ],
    { baseDate },
  );
  assert.equal(priceTask.title, '10.30 TL kahve ve +100 TL odeme +905551234567 /api/v2');
  assert.deepEqual(priceTask.tags, []);
  assert.equal(priceTask.category, null);
  assert.equal(priceTask.notes, 'Fisi sakla');
  assert.equal(priceTask.dueDate, '2026-12-23');
  assert.equal(priceTask.dueTime, '09:00');

  // Bare ISO date works without @
  const isoTask = cliParser.parseQuickTaskTokens(['Yillik', 'rapor', '2026-05-01'], { baseDate });
  assert.equal(isoTask.title, 'Yillik rapor');
  assert.equal(isoTask.dueDate, '2026-05-01');

  // Quote-aware shell line splitting for `ag + -`
  const tokens = cliParser.splitShellLine(
    'Rapor hazirla c:"Kisisel Isler" --note "iki kelime not" +finans',
  );
  const parsedLine = cliParser.parseQuickTaskTokens(tokens, { baseDate });
  assert.equal(parsedLine.title, 'Rapor hazirla');
  assert.equal(parsedLine.category, 'Kisisel Isler');
  assert.equal(parsedLine.notes, 'iki kelime not');
  assert.deepEqual(parsedLine.tags, ['finans']);

  // CLI per-command --help, typo suggestion, stdin quoted batch add, and Kanban sequential numbering snapshot
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-cli-v2-'));
  const env = {
    ...process.env,
    AGENDAMEA_DATA_DIR: tmpDir,
    AGENDAMEA_FORCE_OFFLINE: '1',
    AGENDAMEA_CLI_SESSION: 'test-session-v2',
    NO_COLOR: '1',
  };
  try {
    const editHelp = await runCmd(process.execPath, [CLI_SCRIPT, 'edit', '--help'], env);
    assert.equal(editHelp.code, 0);
    assert.ok(editHelp.stdout.includes('--title'));

    const typoRes = await runCmd(process.execPath, [CLI_SCRIPT, 'tdoay'], env);
    assert.equal(typoRes.code, 2);
    assert.ok(
      typoRes.stderr.includes('today'),
      `Expected typo suggestion "today", got: ${typoRes.stderr}`,
    );

    const batchRes = await runCmd(
      process.execPath,
      [CLI_SCRIPT, '+', '-', '-j'],
      env,
      'Low Task p:low --note "detay not"\nHigh Task p:high\n',
    );
    assert.equal(batchRes.code, 0, batchRes.stderr);
    const createdBatch = JSON.parse(batchRes.stdout) as Array<{
      id: string;
      title: string;
      notes: string;
      priority: string;
    }>;
    assert.equal(createdBatch.length, 2);
    assert.equal(createdBatch[0]?.notes, 'detay not');

    // Kanban orders High first (#1), Low second (#2) continuously and saves snapshot!
    const kb = await runCmd(process.execPath, [CLI_SCRIPT, 'kanban'], env);
    assert.equal(kb.code, 0);
    assert.ok(
      kb.stdout.includes('1.') && kb.stdout.includes('2.'),
      'Kanban must number continuously 1..N',
    );

    // Completing #2 from Kanban snapshot must target Low Task!
    const ok2 = await runCmd(process.execPath, [CLI_SCRIPT, 'ok', '2', '-j'], env);
    assert.equal(ok2.code, 0, ok2.stderr);
    assert.equal(JSON.parse(ok2.stdout).title, 'Low Task');
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 80 });
    } catch {
      // Ignore
    }
  }
});

test('T-5.5: Live HTTP Server supports Streamable HTTP /api/mcp, Incoming ping test, and per-URL webhook endpoint overrides', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-live-v2-'));
  const receivedA: Array<{ headers: http.IncomingHttpHeaders; body: string }> = [];
  const receivedB: Array<{ headers: http.IncomingHttpHeaders; body: string }> = [];

  const mockA = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => {
      body += c.toString('utf8');
    });
    req.on('end', () => {
      receivedA.push({ headers: req.headers, body });
      res.writeHead(200);
      res.end('ok');
    });
  });
  const mockB = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => {
      body += c.toString('utf8');
    });
    req.on('end', () => {
      receivedB.push({ headers: req.headers, body });
      res.writeHead(200);
      res.end('ok');
    });
  });

  await Promise.all([
    new Promise<void>((r) => mockA.listen(0, '127.0.0.1', () => r())),
    new Promise<void>((r) => mockB.listen(0, '127.0.0.1', () => r())),
  ]);
  const portA = (mockA.address() as net.AddressInfo).port;
  const portB = (mockB.address() as net.AddressInfo).port;

  // Pick a free ephemeral port and start isolated server.ts instance
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
    assert.equal(ready, true, 'Isolated test server failed to start');

    // 1. Streamable HTTP MCP endpoint
    const mcpInit = await fetch(`${baseUrl}/api/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-11-25',
          capabilities: {},
          clientInfo: { name: 'http-test', version: '1' },
        },
      }),
    });
    assert.equal(mcpInit.status, 200);
    const sid = mcpInit.headers.get('mcp-session-id');
    assert.ok(sid);
    assert.equal(mcpInit.headers.get('mcp-protocol-version'), '2025-11-25');
    const mcpInitJson = (await mcpInit.json()) as { result?: { serverInfo?: { name?: string } } };
    assert.equal(mcpInitJson.result?.serverInfo?.name, 'agendamea');

    // 2. Incoming webhook ping test + per-URL overrides
    const urlA = `http://127.0.0.1:${portA}/a`;
    const urlB = `http://127.0.0.1:${portB}/b`;
    await fetch(`${baseUrl}/api/settings`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        webhookEnabled: true,
        webhookUrl: `${urlA},${urlB}`,
        webhookSecret: 'global-secret',
        webhookEvents: 'todo.created',
        webhookIncomingEnabled: true,
        webhookIncomingSecret: 'inc-secret-123',
        webhookAllowLocalNetwork: true,
        webhookEndpointOverrides: {
          [urlA]: { secret: 'secret-for-A', events: 'todo.created' },
          [urlB]: { secret: 'secret-for-B', events: 'todo.deleted' },
        },
      }),
    });

    const pingBad = await fetch(`${baseUrl}/api/webhook/incoming`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'ping' }),
    });
    assert.equal(pingBad.status, 401);

    const pingOk = await fetch(`${baseUrl}/api/webhook/incoming`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Agendamea-Secret': 'inc-secret-123' },
      body: JSON.stringify({ action: 'ping' }),
    });
    assert.equal(pingOk.status, 200);
    const pingJson = (await pingOk.json()) as { ok: boolean; action: string; listening: boolean };
    assert.equal(pingJson.ok, true);
    assert.equal(pingJson.action, 'ping');
    assert.equal(pingJson.listening, true);

    // Create a todo -> ONLY urlA (listening for todo.created) should receive it, signed with secret-for-A!
    await fetch(`${baseUrl}/api/todos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Per-URL Routing Test' }),
    });
    await new Promise((r) => setTimeout(r, 400));

    assert.equal(receivedA.length, 1, 'Endpoint A listening to todo.created must receive delivery');
    assert.equal(
      receivedB.length,
      0,
      'Endpoint B filtered to todo.deleted must NOT receive todo.created',
    );
    const firstA = receivedA[0];
    assert.ok(firstA, 'Endpoint A must have received a payload');
    const expectedSigA = `sha256=${crypto.createHmac('sha256', 'secret-for-A').update(firstA.body).digest('hex')}`;
    assert.equal(
      firstA.headers['x-agendamea-signature'],
      expectedSigA,
      'Endpoint A must be signed with its dedicated per-URL secret',
    );
  } finally {
    try {
      serverProc.kill();
    } catch {
      // Ignore
    }
    await new Promise((r) => setTimeout(r, 250));
    mockA.close();
    mockB.close();
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 80 });
    } catch {
      // Ignore
    }
  }
});
