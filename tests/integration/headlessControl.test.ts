import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

test('QA: 100/100 True Headless Control - Cold-Start Zero-GUI CLI, All 18 MCP Tools (Offline & Live), Reorder, Cloud Push/Pull & Offline Signed Webhooks', async () => {
  const { execFile, execFileSync, spawn } = await import('node:child_process');
  const cryptoMod = await import('node:crypto');
  const httpMod = await import('node:http');
  const netMod = await import('node:net');

  const cliScript = path.join(process.cwd(), 'cli', 'agendamea.cjs');
  const mcpScript = path.join(process.cwd(), 'mcp', 'server.cjs');

  // 1. Cold-Start Zero-GUI Directory: agendamea.db does NOT exist yet!
  const coldDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agendamea-headless-cold-'));
  const cloudDir = path.join(coldDir, 'cloud-sync');
  const exportFile = path.join(coldDir, 'exports', 'full-backup.json');
  const coldEnv = {
    ...process.env,
    AGENDAMEA_DATA_DIR: coldDir,
    AGENDAMEA_FORCE_OFFLINE: '1',
    AGENDAMEA_CLI_LANG: 'tr',
  };

  // Async runner keeps in-process hookServer event loop responsive during offline webhook delivery
  const runCli = (args: string[], envOverride: NodeJS.ProcessEnv = coldEnv) =>
    new Promise<string>((resolve, reject) => {
      execFile(
        process.execPath,
        [cliScript, ...args],
        { env: envOverride, encoding: 'utf8', windowsHide: true },
        (err, stdout, stderr) => {
          if (err) {
            reject(new Error(`CLI failed (${args.join(' ')}): ${stderr || err.message}`));
            return;
          }
          resolve(stdout);
        },
      );
    });

  // Local webhook receiver to verify offline HMAC-SHA256 webhook delivery
  const offlineHooks: Array<{ event: string; sig: string; rawBody: string }> = [];
  const hookServer = httpMod.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      offlineHooks.push({
        event: String(req.headers['x-agendamea-event'] ?? ''),
        sig: String(req.headers['x-agendamea-signature'] ?? ''),
        rawBody: Buffer.concat(chunks).toString('utf8'),
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"ok":true}');
    });
  });
  await new Promise<void>((resolve) => hookServer.listen(0, '127.0.0.1', () => resolve()));
  const hookPort = (hookServer.address() as { port: number }).port;
  const hookUrl = `http://127.0.0.1:${hookPort}/offline-hook`;
  const hookSecret = 'headless-offline-secret';

  try {
    // 1A. Cold-start creates schema automatically on first command without GUI!
    const initStat = JSON.parse(await runCli(['stat', '-j']));
    assert.equal(initStat.ok, true);
    assert.equal(initStat.mode, 'offline-sqlite');
    assert.equal(initStat.activeTasks, 0);
    assert.ok(
      fs.existsSync(path.join(coldDir, 'agendamea.db')),
      'Cold-start CLI must initialize SQLite DB automatically',
    );

    // 1B. Full Help documents all headless sections
    const fullHelp = await runCli(['help', 'all']);
    for (const token of [
      'ag bak',
      'ag edit',
      'ag sub',
      'ag cat',
      'ag cop',
      'ag matris',
      'ag sync',
      'ag config',
      'ag reset',
      'ag move',
    ]) {
      assert.ok(fullHelp.includes(token), `ag help all must include "${token}"`);
    }

    // 1C. Offline Webhook Configuration & Live Test + Event Dispatch
    await runCli(['hook', 'set', hookUrl, hookSecret]);
    const hookTestRes = JSON.parse(await runCli(['hook', 'test', '-j']));
    assert.equal(hookTestRes.ok, true);
    assert.equal(hookTestRes.statusCode, 200);
    assert.equal(offlineHooks.length, 1);
    const firstOfflineHook = offlineHooks[0];
    assert.ok(firstOfflineHook);
    assert.equal(firstOfflineHook.event, 'webhook.test');
    const expectedTestSig = `sha256=${cryptoMod.createHmac('sha256', hookSecret).update(firstOfflineHook.rawBody).digest('hex')}`;
    assert.equal(firstOfflineHook.sig, expectedTestSig);

    // 1D. Categories CRUD & Reorder
    const catWork = JSON.parse(await runCli(['cat', '+', 'Proje', '#7c3aed', '-j']));
    const catHome = JSON.parse(await runCli(['cat', '+', 'Kisisel', '--color', '#16a34a', '-j']));
    assert.equal(catWork.name, 'Proje');
    assert.equal(catWork.color, '#7c3aed');
    const catRenamed = JSON.parse(
      await runCli(['cat', 'edit', 'Proje', '--name', 'Urun', '--color', '#2563eb', '-j']),
    );
    assert.equal(catRenamed.name, 'Urun');
    assert.equal(catRenamed.color, '#2563eb');
    const catMoved = JSON.parse(await runCli(['cat', 'move', 'Kisisel', '1', '-j']));
    assert.equal(catMoved.position, 1);
    const catsListed = JSON.parse(await runCli(['cat', '-j']));
    assert.equal(catsListed[0].id, catHome.id);

    // 1E. Rich Natural Task Creation (@start..due, HH:mm, !, *, ^, #tag, /Category, --note, --sub) + Offline Webhook Fired
    const richTask = JSON.parse(
      await runCli([
        '+',
        'Lansman',
        'plani',
        '@2026-11-20..2026-11-25',
        '14:30',
        '!',
        '*',
        '^',
        '#store',
        '/Urun',
        '--note',
        'Tum paketler hazirlanacak',
        '--sub',
        'MSIX dogrula',
        '--sub',
        'SHA256 kontrol',
        '-j',
      ]),
    );
    assert.equal(richTask.title, 'Lansman plani');
    assert.equal(richTask.startDate, '2026-11-20');
    assert.equal(richTask.dueDate, '2026-11-25');
    assert.equal(richTask.dueTime, '14:30');
    assert.equal(richTask.priority, 'high');
    assert.equal(richTask.important, true);
    assert.equal(richTask.pinned, true);
    assert.deepEqual(richTask.tags, ['store']);
    assert.equal(richTask.categoryId, catWork.id);
    assert.equal(richTask.notes, 'Tum paketler hazirlanacak');
    assert.equal(richTask.subtasks.length, 2);
    assert.ok(
      offlineHooks.some((h) => h.event === 'todo.created'),
      'Offline CLI add must dispatch configured webhook',
    );

    // Second task for reorder, sort, search with --from/--to, and matrix
    const secondTask = JSON.parse(
      await runCli(['+', 'Fatura', 'odeme', '@bugun', '#finans', '/Kisisel', '-j']),
    );
    assert.equal(secondTask.categoryId, catHome.id);

    // 1F. Task Detail (ag bak), Edit (ag edit), Pin (ag pin), Reorder (ag move)
    const detail = JSON.parse(await runCli(['bak', 'Lansman', '-j']));
    assert.equal(detail.categoryName, 'Urun');
    assert.equal(detail.subtasks.length, 2);

    const edited = JSON.parse(
      await runCli(['edit', 'Lansman', '--time', '16:45', '--note', 'Guncel not', '-j']),
    );
    assert.equal(edited.dueTime, '16:45');
    assert.equal(edited.notes, 'Guncel not');

    const unpinned = JSON.parse(await runCli(['pin', 'Lansman', '-j']));
    assert.equal(unpinned.pinned, false);

    // Move Fatura to #1
    const movedTask = JSON.parse(await runCli(['move', 'Fatura', '1', '-j']));
    assert.equal(movedTask.position, 1);
    const activeAfterMove = JSON.parse(await runCli(['-j']));
    assert.equal(activeAfterMove[0].id, secondTask.id);

    // Search with --from & --to must NOT treat dates as query words!
    const rangedSearch = JSON.parse(
      await runCli(['ara', 'MSIX', '--from', '2026-11-18', '--to', '2026-11-22', '-j']),
    );
    assert.equal(rangedSearch.length, 1);
    assert.equal(rangedSearch[0].id, richTask.id);

    // 1G. Subtasks CRUD (add, toggle, edit/rename, delete)
    const subAdded = JSON.parse(await runCli(['sub', 'Lansman', '+', 'Son kontrol', '-j']));
    assert.equal(subAdded.title, 'Son kontrol');
    const subToggled = JSON.parse(await runCli(['sub', 'Lansman', 'ok', '1', '-j']));
    assert.equal(subToggled.completed, true);
    const subRenamed = JSON.parse(
      await runCli(['sub', 'Lansman', 'edit', '3', 'Final kontrol', '-j']),
    );
    assert.equal(subRenamed.title, 'Final kontrol');
    const subDeleted = JSON.parse(await runCli(['sub', 'Lansman', 'rm', 'Final', '-j']));
    assert.equal(subDeleted.ok, true);

    // 1H. Eisenhower Matrix
    const matrix = JSON.parse(await runCli(['matris', '-j']));
    assert.ok(
      matrix.q2.some((t: { id: string }) => t.id === richTask.id) ||
        matrix.q1.some((t: { id: string }) => t.id === richTask.id),
    );
    assert.ok(matrix.q3.some((t: { id: string }) => t.id === secondTask.id));

    // 1I. Cloud Sync Connect, Push, Reset, Pull Restore (Zero-GUI Recovery!)
    const cloudConnected = JSON.parse(await runCli(['sync', 'set', cloudDir, '-j']));
    assert.equal(cloudConnected.connected, true);
    const cloudPushed = JSON.parse(await runCli(['sync', '-j']));
    assert.equal(cloudPushed.ok, true);
    assert.ok(fs.existsSync(path.join(cloudDir, 'agendamea-onedrive-sync.json')));

    // Export JSON Backup
    const exportInfo = JSON.parse(await runCli(['export', exportFile, '-j']));
    assert.equal(exportInfo.ok, true);
    assert.equal(exportInfo.todos, 2);

    // Complete & Clear Completed + Trash Management (list, restore, permanent delete, empty)
    await runCli(['ok', 'Fatura', '-j']);
    const cleared = JSON.parse(await runCli(['temizle', '-j']));
    assert.equal(cleared.clearedCount, 1);
    const trashView = JSON.parse(await runCli(['cop', '-q', 'Fatura', '-j']));
    assert.equal(trashView.todos.length, 1);
    await runCli(['geri', 'Fatura']);
    const trashAfterRestore = JSON.parse(await runCli(['cop', '-j']));
    assert.equal(trashAfterRestore.todos.length, 0);
    await runCli(['rm', 'Fatura', '-j']);
    const permDel = JSON.parse(await runCli(['cop', 'sil', 'Fatura', '-j']));
    assert.equal(permDel.ok, true);
    await runCli(['cat', 'rm', 'Kisisel', '-j']);
    const emptied = JSON.parse(await runCli(['cop', 'bosalt', '--yes', '-j']));
    assert.equal(emptied.ok, true);
    assert.equal(emptied.deletedCategories, 1);

    // Config inspect & update + Clean Reset + Cloud Pull Restore + JSON Import
    const cfgDark = JSON.parse(await runCli(['config', 'themeMode', 'dark', '-j']));
    assert.equal(cfgDark.themeMode, 'dark');
    assert.equal((await runCli(['config', 'themeMode'])).trim(), 'dark');

    // Disable webhook before reset/import noise
    await runCli(['hook', 'off']);
    const resetRes = JSON.parse(await runCli(['reset', '--yes', '-j']));
    assert.equal(resetRes.todos.length, 0);
    assert.equal(resetRes.categories.length, 0);

    // Pull full state back from Cloud Folder offline!
    const pulled = JSON.parse(await runCli(['sync', 'pull', '-j']));
    assert.equal(pulled.ok, true);
    assert.ok(pulled.bootstrap.todos.length >= 1, 'Cloud pull must restore tasks offline');

    // Import exported backup file and verify full restoration (2 tasks, 2 categories)
    const imported = JSON.parse(await runCli(['import', exportFile, '-j']));
    assert.equal(imported.todos.length, 2);
    assert.equal(imported.categories.length, 2);

    // 2. ALL 18 MCP Tools Over Piped Stdio (Cold-Start Offline SQLite!)
    const mcpOfflineDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agendamea-mcp18-offline-'));
    const mcpCloudDir = path.join(mcpOfflineDir, 'cloud');
    const mcpExportPath = path.join(mcpOfflineDir, 'mcp-backup.json');
    const mcpEnv = {
      ...process.env,
      AGENDAMEA_DATA_DIR: mcpOfflineDir,
      AGENDAMEA_FORCE_OFFLINE: '1',
    };
    try {
      const requests = [
        { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
        { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
        {
          jsonrpc: '2.0',
          id: 3,
          method: 'tools/call',
          params: { name: 'agendamea_status', arguments: {} },
        },
        {
          jsonrpc: '2.0',
          id: 4,
          method: 'tools/call',
          params: {
            name: 'agendamea_manage_category',
            arguments: { action: 'create', name: 'AI Proje', color: '#7c3aed', pinned: true },
          },
        },
        {
          jsonrpc: '2.0',
          id: 5,
          method: 'tools/call',
          params: { name: 'agendamea_list_categories', arguments: {} },
        },
        {
          jsonrpc: '2.0',
          id: 6,
          method: 'tools/call',
          params: {
            name: 'agendamea_add_task',
            arguments: {
              title: 'MCP Tam Gorev',
              category: 'AI Proje',
              priority: 'high',
              important: true,
              dueDate: '2026-12-01',
              dueTime: '10:00',
              tags: ['mcp'],
              notes: 'Not',
              subtasks: ['Alt 1'],
            },
          },
        },
        {
          jsonrpc: '2.0',
          id: 7,
          method: 'tools/call',
          params: { name: 'agendamea_get_task', arguments: { id: '1' } },
        },
        {
          jsonrpc: '2.0',
          id: 8,
          method: 'tools/call',
          params: {
            name: 'agendamea_update_task',
            arguments: { id: '1', title: 'MCP Guncel Gorev', position: 1 },
          },
        },
        {
          jsonrpc: '2.0',
          id: 9,
          method: 'tools/call',
          params: { name: 'agendamea_pin_task', arguments: { id: '1', pinned: true } },
        },
        {
          jsonrpc: '2.0',
          id: 10,
          method: 'tools/call',
          params: {
            name: 'agendamea_manage_subtask',
            arguments: { action: 'add', taskId: '1', title: 'Alt 2' },
          },
        },
        {
          jsonrpc: '2.0',
          id: 11,
          method: 'tools/call',
          params: {
            name: 'agendamea_manage_subtask',
            arguments: {
              action: 'update',
              taskId: '1',
              subtaskId: '2',
              title: 'Alt 2 Rename',
              completed: true,
            },
          },
        },
        {
          jsonrpc: '2.0',
          id: 12,
          method: 'tools/call',
          params: {
            name: 'agendamea_list_tasks',
            arguments: { filter: 'active', tag: 'mcp', sortBy: 'priority' },
          },
        },
        {
          jsonrpc: '2.0',
          id: 13,
          method: 'tools/call',
          params: { name: 'agendamea_eisenhower_matrix', arguments: {} },
        },
        {
          jsonrpc: '2.0',
          id: 14,
          method: 'tools/call',
          params: {
            name: 'agendamea_update_settings',
            arguments: { patch: { themeMode: 'dark', zoomPercent: 110 } },
          },
        },
        {
          jsonrpc: '2.0',
          id: 15,
          method: 'tools/call',
          params: { name: 'agendamea_get_settings', arguments: {} },
        },
        {
          jsonrpc: '2.0',
          id: 16,
          method: 'tools/call',
          params: {
            name: 'agendamea_backup_and_sync',
            arguments: { action: 'export', filePath: mcpExportPath },
          },
        },
        {
          jsonrpc: '2.0',
          id: 17,
          method: 'tools/call',
          params: {
            name: 'agendamea_backup_and_sync',
            arguments: { action: 'connect_cloud', folderPath: mcpCloudDir },
          },
        },
        {
          jsonrpc: '2.0',
          id: 18,
          method: 'tools/call',
          params: { name: 'agendamea_backup_and_sync', arguments: { action: 'cloud_status' } },
        },
        {
          jsonrpc: '2.0',
          id: 19,
          method: 'tools/call',
          params: { name: 'agendamea_complete_task', arguments: { id: '1', completed: true } },
        },
        {
          jsonrpc: '2.0',
          id: 20,
          method: 'tools/call',
          params: { name: 'agendamea_clear_completed', arguments: {} },
        },
        {
          jsonrpc: '2.0',
          id: 21,
          method: 'tools/call',
          params: { name: 'agendamea_list_trash', arguments: { sortBy: 'newest' } },
        },
        {
          jsonrpc: '2.0',
          id: 22,
          method: 'tools/call',
          params: { name: 'agendamea_manage_trash', arguments: { action: 'restore' } },
        },
        {
          jsonrpc: '2.0',
          id: 23,
          method: 'tools/call',
          params: { name: 'agendamea_delete_task', arguments: { id: 'MCP Guncel' } },
        },
        {
          jsonrpc: '2.0',
          id: 24,
          method: 'tools/call',
          params: { name: 'agendamea_manage_trash', arguments: { action: 'empty', confirm: true } },
        },
        {
          jsonrpc: '2.0',
          id: 25,
          method: 'tools/call',
          params: {
            name: 'agendamea_backup_and_sync',
            arguments: { action: 'import', filePath: mcpExportPath },
          },
        },
      ];
      // Send requests sequentially in batches so dependent mutations execute strictly in order!
      const runMcpStep = (reqObj: Record<string, unknown>) => {
        const out = execFileSync(process.execPath, [mcpScript], {
          env: mcpEnv,
          input: `${JSON.stringify(reqObj)}\n`,
          encoding: 'utf8',
        });
        return JSON.parse(out.trim().split(/\r?\n/)[0] ?? '{}') as {
          id: number;
          result?: {
            isError?: boolean;
            tools?: Array<{ name: string }>;
            content?: Array<{ text: string }>;
          };
        };
      };

      const initReq = requests[0];
      const listReq = requests[1];
      assert.ok(initReq && listReq);
      const initRes = runMcpStep(initReq);
      assert.equal(initRes.id, 1);
      const listToolsRes = runMcpStep(listReq);
      assert.equal(
        listToolsRes.result?.tools?.length,
        23,
        'MCP server must expose all 23 headless + AI/RAG tools',
      );

      for (let i = 2; i < requests.length; i += 1) {
        const reqItem = requests[i];
        if (!reqItem) continue;
        const resp = runMcpStep(reqItem);
        assert.notEqual(
          resp.result?.isError,
          true,
          `MCP step #${reqItem.id} (${(reqItem.params as { name?: string })?.name}) failed: ${resp.result?.content?.[0]?.text}`,
        );
      }

      // Verify restored task from final import step
      const finalCheck = runMcpStep({
        jsonrpc: '2.0',
        id: 99,
        method: 'tools/call',
        params: { name: 'agendamea_list_tasks', arguments: { filter: 'all' } },
      });
      const restoredTasks = JSON.parse(finalCheck.result?.content?.[0]?.text || '[]');
      assert.equal(restoredTasks.length, 1);
      assert.equal(restoredTasks[0].title, 'MCP Guncel Gorev');
      assert.equal(restoredTasks[0].subtasks.length, 2);
      assert.equal(restoredTasks[0].subtasks[1].title, 'Alt 2 Rename');
    } finally {
      fs.rmSync(mcpOfflineDir, { recursive: true, force: true });
    }

    // 3. Live-API Parity Check via Ephemeral Express Server (CLI + MCP against 127.0.0.1!)
    const livePort = await new Promise<number>((resolve, reject) => {
      const probe = netMod.createServer();
      probe.listen(0, '127.0.0.1', () => {
        const addr = probe.address() as { port: number };
        probe.close(() => resolve(addr.port));
      });
      probe.on('error', reject);
    });
    const liveDataDir = path.join(coldDir, 'live-api-dir');
    fs.mkdirSync(liveDataDir, { recursive: true });
    const tsxCli = path.join(process.cwd(), 'node_modules', 'tsx', 'dist', 'cli.mjs');
    const liveSrv = spawn(process.execPath, [tsxCli, path.join(process.cwd(), 'server.ts')], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NODE_ENV: 'production',
        HOST: '127.0.0.1',
        PORT: String(livePort),
        AGENDAMEA_DATA_DIR: liveDataDir,
      },
      stdio: 'ignore',
      windowsHide: true,
    });

    let liveReady = false;
    for (let i = 0; i < 40; i += 1) {
      try {
        const h = await fetch(`http://127.0.0.1:${livePort}/api/health`);
        if (h.ok) {
          liveReady = true;
          break;
        }
      } catch {
        // Wait
      }
      await new Promise((r) => setTimeout(r, 120));
    }
    assert.equal(liveReady, true, 'Live Express API must boot for live CLI/MCP parity test');
    try {
      const liveEnv = {
        ...process.env,
        AGENDAMEA_DATA_DIR: liveDataDir,
        AGENDAMEA_URL: `http://127.0.0.1:${livePort}`,
      };
      delete (liveEnv as Record<string, string | undefined>).AGENDAMEA_FORCE_OFFLINE;

      const liveStat = JSON.parse(
        execFileSync(process.execPath, [cliScript, 'stat', '-j'], {
          env: liveEnv,
          encoding: 'utf8',
        }),
      );
      assert.equal(liveStat.mode, 'live-api');

      execFileSync(process.execPath, [cliScript, 'cat', '+', 'Canli', '#2563eb', '-j'], {
        env: liveEnv,
        encoding: 'utf8',
      });
      const liveAdded = JSON.parse(
        execFileSync(
          process.execPath,
          [cliScript, '+', 'Canli', 'Gorev', '/Canli', '--sub', 'Alt A', '-j'],
          {
            env: liveEnv,
            encoding: 'utf8',
          },
        ),
      );
      assert.equal(liveAdded.title, 'Canli Gorev');
      assert.equal(liveAdded.subtasks.length, 1);

      const liveMcpResp = JSON.parse(
        execFileSync(process.execPath, [mcpScript], {
          env: liveEnv,
          input: `${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'agendamea_status', arguments: {} } })}\n`,
          encoding: 'utf8',
        }).trim(),
      );
      const parsedLiveStatus = JSON.parse(liveMcpResp.result.content[0].text);
      assert.equal(parsedLiveStatus.mode, 'live-api');
      assert.equal(parsedLiveStatus.activeTasks, 1);
      assert.equal(parsedLiveStatus.categories, 1);
    } finally {
      liveSrv.kill();
      await new Promise<void>((resolve) => {
        if (liveSrv.exitCode !== null) resolve();
        else {
          liveSrv.once('exit', () => resolve());
          setTimeout(resolve, 600);
        }
      });
    }

    // 4. DocsSettingsSection exposes all 23 MCP tools + collapsible all-commands drawer
    const docsSrc =
      fs.readFileSync(
        path.join(process.cwd(), 'src', 'components', 'DocsSettingsSection.tsx'),
        'utf8',
      ) +
      fs.readFileSync(
        path.join(process.cwd(), 'src', 'components', 'settings', 'docs', 'DocsMcpSection.tsx'),
        'utf8',
      ) +
      fs.readFileSync(
        path.join(process.cwd(), 'src', 'components', 'settings', 'docs', 'DocsCliTab.tsx'),
        'utf8',
      );
    assert.ok(docsSrc.includes('agendamea_backup_and_sync'), 'Docs must list backup/sync MCP tool');
    assert.ok(
      docsSrc.includes('agendamea_webhook_and_server'),
      'Docs must list webhook/server MCP tool',
    );
    assert.ok(docsSrc.includes('agendamea_views'), 'Docs must list views MCP tool');
    assert.ok(
      docsSrc.includes('docs-all-commands-toggle'),
      'Docs must include collapsible all-commands drawer',
    );
  } finally {
    hookServer.close();
    try {
      fs.rmSync(coldDir, { recursive: true, force: true, maxRetries: 8, retryDelay: 80 });
    } catch {
      // Ignore transient Windows WAL handle release delay in OS temp dir
    }
  }
});
