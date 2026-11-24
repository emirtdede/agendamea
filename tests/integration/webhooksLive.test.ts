import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { TodoDatabase } from '../../src/db/database';
import type { Todo } from '../../src/types';
import { filterAndSortTodos } from '../../src/utils/todoLogic';

test('QA: Task search date range, short ag CLI, race-free MCP update tool, live bi-directional webhooks & UI refinements', async () => {
  const { execFileSync, spawn } = await import('node:child_process');
  const cryptoMod = await import('node:crypto');
  const httpMod = await import('node:http');
  const netMod = await import('node:net');

  const buildSampleTodo = (overrides: Partial<Todo>): Todo => ({
    id: overrides.id ?? 't-sample',
    title: overrides.title ?? 'Sample',
    notes: overrides.notes ?? '',
    completed: overrides.completed ?? false,
    important: overrides.important ?? false,
    pinned: overrides.pinned ?? false,
    priority: overrides.priority ?? 'normal',
    startDate: overrides.startDate ?? null,
    dueDate: overrides.dueDate ?? null,
    dueTime: overrides.dueTime ?? null,
    tags: overrides.tags ?? [],
    categoryId: overrides.categoryId ?? null,
    sortOrder: overrides.sortOrder ?? 0,
    createdAt: overrides.createdAt ?? '2026-03-01T08:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-03-01T08:00:00.000Z',
    deletedAt: overrides.deletedAt ?? null,
    subtasks: overrides.subtasks ?? [],
  });

  // 1. filterAndSortTodos date-range filtering (single date, span overlap, inverted range, undated exclusion)
  const sampleTodos: Todo[] = [
    buildSampleTodo({ id: 'd1', title: 'Mart gorevi', dueDate: '2026-03-10' }),
    buildSampleTodo({
      id: 'd2',
      title: 'Aralik span gorevi',
      startDate: '2026-03-15',
      dueDate: '2026-03-25',
    }),
    buildSampleTodo({ id: 'd3', title: 'Nisan gorevi', dueDate: '2026-04-05' }),
    buildSampleTodo({ id: 'd4', title: 'Tarihsiz gorev', dueDate: null, startDate: null }),
  ];

  const inRange = filterAndSortTodos({
    todos: sampleTodos,
    activeView: { type: 'smart', id: 'all' },
    statusFilter: 'all',
    searchQuery: '',
    sortBy: 'manual',
    dateFrom: '2026-03-12',
    dateTo: '2026-03-20',
  });
  assert.deepEqual(
    inRange.map((x) => x.id),
    ['d2'],
  );

  // Inverted bounds still normalize safely
  const invertedRange = filterAndSortTodos({
    todos: sampleTodos,
    activeView: { type: 'smart', id: 'all' },
    statusFilter: 'all',
    searchQuery: '',
    sortBy: 'manual',
    dateFrom: '2026-03-16',
    dateTo: '2026-03-09',
  });
  assert.deepEqual(
    invertedRange.map((x) => x.id),
    ['d1', 'd2'],
  );

  // 2. Short CLI commands (ag, ag +, ag ok, ag rm, ag stat) + MCP update tool over piped stdio (strictly isolated DB)
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agendamea-ux-e2e-'));
  const dbPath = path.join(tmpDir, 'agendamea.db');
  const seed = new TodoDatabase(dbPath);
  seed.close();

  const cliScript = path.join(process.cwd(), 'cli', 'agendamea.cjs');
  const mcpScript = path.join(process.cwd(), 'mcp', 'server.cjs');
  const isolatedEnv = {
    ...process.env,
    AGENDAMEA_DATA_DIR: tmpDir,
    AGENDAMEA_FORCE_OFFLINE: '1',
  };

  try {
    const addedRaw = execFileSync(
      process.execPath,
      [cliScript, '+', 'Kisa CLI Gorevi', '-h', '-d', '2026-05-10', '-j'],
      {
        env: isolatedEnv,
        encoding: 'utf8',
      },
    );
    const addedTask = JSON.parse(addedRaw);
    assert.equal(addedTask.title, 'Kisa CLI Gorevi');
    assert.equal(addedTask.priority, 'high');
    assert.equal(addedTask.dueDate, '2026-05-10');

    // Bare "ag -j" lists active tasks directly
    const bareList = JSON.parse(
      execFileSync(process.execPath, [cliScript, '-j'], {
        env: isolatedEnv,
        encoding: 'utf8',
      }),
    );
    assert.equal(bareList.length, 1);

    // MCP piped stdio: initialize + tools/list + update_task + list_tasks with dateFrom/dateTo
    const mcpPayload = `${[
      JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }),
      JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }),
      JSON.stringify({
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'agendamea_update_task',
          arguments: { id: addedTask.id.slice(0, 12), title: 'MCP Guncellendi', important: true },
        },
      }),
      JSON.stringify({
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: {
          name: 'agendamea_list_tasks',
          arguments: { filter: 'active', dateFrom: '2026-05-01', dateTo: '2026-05-31' },
        },
      }),
    ].join('\n')}\n`;

    const mcpOut = execFileSync(process.execPath, [mcpScript], {
      env: isolatedEnv,
      input: mcpPayload,
      encoding: 'utf8',
    });
    const mcpLines = mcpOut
      .trim()
      .split(/\r?\n/)
      .map((line) => JSON.parse(line));
    assert.equal(
      mcpLines.length,
      4,
      'Piped MCP stdio must flush every async response before exiting',
    );
    const toolNames = mcpLines[1].result.tools.map((tool: { name: string }) => tool.name);
    assert.ok(toolNames.includes('agendamea_update_task'));
    const updatedFromMcp = JSON.parse(mcpLines[2].result.content[0].text);
    assert.equal(updatedFromMcp.title, 'MCP Guncellendi');
    assert.equal(updatedFromMcp.important, true);
    const listedFromMcp = JSON.parse(mcpLines[3].result.content[0].text);
    assert.equal(listedFromMcp.length, 1);

    // Natural quote-free add with @yarin, !, *, #tag + numbered list + ag ara + ag ok 1 + ag rm 1 + ag geri + Turkish output!
    const naturalRaw = execFileSync(
      process.execPath,
      [cliScript, '+', 'Raporu', 'gonder', '@yarin', '!', '*', '#finans', '-j'],
      { env: isolatedEnv, encoding: 'utf8' },
    );
    const naturalTask = JSON.parse(naturalRaw);
    assert.equal(naturalTask.title, 'Raporu gonder');
    assert.equal(naturalTask.priority, 'high');
    assert.equal(naturalTask.important, true);
    assert.deepEqual(naturalTask.tags, ['finans']);
    assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(naturalTask.dueDate));

    // Turkish interactive output renders numbered list ("1.") and Turkish localized messages
    const trListText = execFileSync(process.execPath, [cliScript], {
      env: { ...isolatedEnv, AGENDAMEA_CLI_LANG: 'tr' },
      encoding: 'utf8',
    });
    assert.ok(trListText.includes('1.'), 'CLI list must use human-friendly 1, 2, 3 numbering');
    assert.ok(trListText.includes('#finans'), 'CLI list must render #tags');

    // ag ara searches titles & tags
    const searchJson = JSON.parse(
      execFileSync(process.execPath, [cliScript, 'ara', '#finans', '-j'], {
        env: isolatedEnv,
        encoding: 'utf8',
      }),
    );
    assert.equal(searchJson.length, 1);
    assert.equal(searchJson[0].id, naturalTask.id);

    // Complete & trash by 1-based number ("ag ok 1" / "ag rm 1"), then restore via "ag geri"!
    const okByNum = JSON.parse(
      execFileSync(process.execPath, [cliScript, 'ok', '1', '-j'], {
        env: isolatedEnv,
        encoding: 'utf8',
      }),
    );
    assert.equal(okByNum.completed, true);

    const rmByKeyword = JSON.parse(
      execFileSync(process.execPath, [cliScript, 'rm', 'Raporu', '-j'], {
        env: isolatedEnv,
        encoding: 'utf8',
      }),
    );
    assert.equal(rmByKeyword.movedToTrash, true);

    const undoText = execFileSync(process.execPath, [cliScript, 'geri'], {
      env: { ...isolatedEnv, AGENDAMEA_CLI_LANG: 'tr' },
      encoding: 'utf8',
    });
    assert.ok(
      undoText.includes('geri yüklendi'),
      'ag geri must restore last trashed task in Turkish',
    );

    // Short ok & rm commands by ID prefix still work cleanly
    const okOut = JSON.parse(
      execFileSync(process.execPath, [cliScript, 'ok', addedTask.id.slice(0, 12), '-j'], {
        env: isolatedEnv,
        encoding: 'utf8',
      }),
    );
    assert.equal(okOut.completed, true);

    const rmOut = JSON.parse(
      execFileSync(process.execPath, [cliScript, 'rm', addedTask.id.slice(0, 12), '-j'], {
        env: isolatedEnv,
        encoding: 'utf8',
      }),
    );
    assert.equal(rmOut.movedToTrash, true);

    // 3. Real Bi-Directional Webhooks (Outgoing HMAC-SHA256 + Test Endpoint + Incoming Trigger)
    const receivedHooks: Array<{
      event: string;
      sig: string;
      rawBody: string;
      parsed: Record<string, unknown>;
    }> = [];
    const hookReceiver = httpMod.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', () => {
        const rawBody = Buffer.concat(chunks).toString('utf8');
        receivedHooks.push({
          event: String(req.headers['x-agendamea-event'] ?? ''),
          sig: String(req.headers['x-agendamea-signature'] ?? ''),
          rawBody,
          parsed: JSON.parse(rawBody),
        });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ received: true }));
      });
    });

    await new Promise<void>((resolve) => hookReceiver.listen(0, '127.0.0.1', () => resolve()));
    const hookPort = (hookReceiver.address() as { port: number }).port;
    const hookUrl = `http://127.0.0.1:${hookPort}/hook`;
    const hookSecret = 'top-secret-ag-key';

    const appPort = await new Promise<number>((resolve, reject) => {
      const probe = netMod.createServer();
      probe.listen(0, '127.0.0.1', () => {
        const addr = probe.address() as { port: number };
        probe.close(() => resolve(addr.port));
      });
      probe.on('error', reject);
    });
    const appBase = `http://127.0.0.1:${appPort}`;
    const webhookDataDir = path.join(tmpDir, 'webhook-srv');
    fs.mkdirSync(webhookDataDir, { recursive: true });
    const tsxCli = path.join(process.cwd(), 'node_modules', 'tsx', 'dist', 'cli.mjs');
    const srvChild = spawn(process.execPath, [tsxCli, path.join(process.cwd(), 'server.ts')], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NODE_ENV: 'production',
        HOST: '127.0.0.1',
        PORT: String(appPort),
        AGENDAMEA_DATA_DIR: webhookDataDir,
      },
      stdio: 'ignore',
      windowsHide: true,
    });

    let serverReady = false;
    for (let i = 0; i < 40; i += 1) {
      try {
        const health = await fetch(`${appBase}/api/health`);
        if (health.ok) {
          serverReady = true;
          break;
        }
      } catch {
        // Wait for startup
      }
      await new Promise((r) => setTimeout(r, 120));
    }
    assert.equal(serverReady, true, 'Isolated Express server must start cleanly');

    try {
      // Save webhook config
      const setRes = await fetch(`${appBase}/api/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          webhookEnabled: true,
          webhookUrl: hookUrl,
          webhookSecret: hookSecret,
        }),
      });
      assert.equal(setRes.status, 200);
      const savedSettings = await setRes.json();
      assert.equal(savedSettings.webhookEnabled, true);
      assert.equal(savedSettings.webhookUrl, hookUrl);

      // Test outgoing webhook endpoint
      const testRes = await fetch(`${appBase}/api/webhooks/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const testJson = await testRes.json();
      assert.equal(testJson.ok, true);
      assert.equal(testJson.statusCode, 200);
      assert.equal(receivedHooks.length, 1);
      const firstHook = receivedHooks[0];
      assert.ok(firstHook);
      assert.equal(firstHook.event, 'webhook.test');
      const expectedSig = `sha256=${cryptoMod.createHmac('sha256', hookSecret).update(firstHook.rawBody).digest('hex')}`;
      assert.equal(firstHook.sig, expectedSig);
      assert.ok(String(firstHook.parsed.content).includes('Agendamea'));

      // Incoming webhook without secret must reject 401
      const badIncoming = await fetch(`${appBase}/api/webhook/incoming`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Yetkisiz' }),
      });
      assert.equal(badIncoming.status, 401);

      // Incoming webhook with valid secret creates task & fires outgoing todo.created webhook
      const goodIncoming = await fetch(`${appBase}/api/webhook/incoming`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Agendamea-Secret': hookSecret,
        },
        body: JSON.stringify({ action: 'add', title: 'Webhook Gorevi', priority: 'high' }),
      });
      assert.equal(goodIncoming.status, 201);
      const createdHookResp = await goodIncoming.json();
      assert.equal(createdHookResp.ok, true);
      assert.equal(createdHookResp.todo.title, 'Webhook Gorevi');

      // Wait briefly for fire-and-forget outgoing todo.created delivery
      for (let i = 0; i < 20 && receivedHooks.length < 2; i += 1) {
        await new Promise((r) => setTimeout(r, 30));
      }
      assert.ok(receivedHooks.some((h) => h.event === 'todo.created'));
    } finally {
      srvChild.kill();
      await new Promise<void>((resolve) => {
        if (srvChild.exitCode !== null) resolve();
        else {
          srvChild.once('exit', () => resolve());
          setTimeout(resolve, 600);
        }
      });
      hookReceiver.close();
    }

    // 4. UI Refinement Regression Checks
    const appearanceSrc = fs.readFileSync(
      path.join(process.cwd(), 'src', 'components', 'settings', 'AppearanceSettingsTab.tsx'),
      'utf8',
    );
    assert.ok(
      appearanceSrc.includes('useState(true)'),
      'App icons panel must open expanded by default',
    );
    assert.ok(!appearanceSrc.includes('t.themesCountUnit'), '15 tema label must be removed');
    assert.ok(appearanceSrc.includes('copy-theme-hex-btn'), 'Theme HEX copy button must exist');
    assert.ok(appearanceSrc.includes('copy-icon-hex-btn'), 'Icon HEX copy button must exist');

    const welcomeSrc = [
      fs.readFileSync(path.join(process.cwd(), 'src', 'components', 'WelcomeModal.tsx'), 'utf8'),
      fs.readFileSync(
        path.join(process.cwd(), 'src', 'components', 'welcome', 'WelcomeLanguageStep.tsx'),
        'utf8',
      ),
    ].join('\n');
    assert.ok(
      welcomeSrc.includes('welcome-selected-language'),
      'Welcome Step 1 selected-language display must exist',
    );
    assert.ok(
      !welcomeSrc.includes('welcome-language-select'),
      'Welcome Step 1 right-side dropdown button must be removed',
    );

    // 5. Clean Start / Reset All Data (preserves theme by default; optional full settings reset)
    const resetDb = new TodoDatabase(path.join(tmpDir, 'reset-test.db'));
    try {
      resetDb.updateSettings({
        themeMode: 'dark',
        themeId: 'purple',
        webhookUrl: 'https://example.com/hook',
        webhookEnabled: true,
      });
      const rCat = resetDb.createCategory({ name: 'Silinecek', color: '#2563eb' });
      const rTodo = resetDb.createTodo({ title: 'Silinecek gorev', categoryId: rCat.id });
      resetDb.createSubtask(rTodo.id, 'Alt gorev');
      const rTrash = resetDb.createTodo({ title: 'Copteki gorev' });
      resetDb.softDeleteTodo(rTrash.id);

      const wipedDataOnly = resetDb.resetAllData({ resetSettings: false });
      assert.equal(wipedDataOnly.todos.length, 0);
      assert.equal(wipedDataOnly.categories.length, 0);
      assert.equal(wipedDataOnly.trashedTodos.length, 0);
      assert.equal(wipedDataOnly.settings.themeId, 'purple');
      assert.equal(wipedDataOnly.settings.themeMode, 'dark');

      const wipedAll = resetDb.resetAllData({ resetSettings: true });
      assert.equal(wipedAll.settings.themeId, 'obsidian');
      assert.equal(wipedAll.settings.themeMode, 'light');
      assert.equal(wipedAll.settings.webhookEnabled ?? false, false);
      assert.equal(wipedAll.settings.webhookUrl ?? '', '');
    } finally {
      resetDb.close();
    }
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 8, retryDelay: 80 });
    } catch {
      // Ignore transient Windows WAL handle release delay in OS temp dir
    }
  }
});
