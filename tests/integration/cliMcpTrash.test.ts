import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { TodoDatabase } from '../../src/db/database';
import { getLegalDocuments } from '../../src/i18n/localesWorld';
import { EN_DICTIONARY, TR_DICTIONARY } from '../../src/i18n/translations';
import type { Category, Todo } from '../../src/types';
import { filterAndSortTrash } from '../../src/utils/todoLogic';

test('QA: Trash search/sort/date-range, CLI & MCP server protocol, zero icon/auto-saved leakage & Store legal compliance', async () => {
  // 1. Trash search, type filter, sorting & deleted date-range filtering
  const trashedCats: Category[] = [
    {
      id: 'c-old',
      name: 'Arşiv',
      color: '#2563eb',
      pinned: false,
      sortOrder: 0,
      createdAt: '2026-11-01T10:00:00.000Z',
      deletedAt: '2026-11-10T10:00:00.000Z',
    },
    {
      id: 'c-new',
      name: 'Zamanlama',
      color: '#16a34a',
      pinned: false,
      sortOrder: 1,
      createdAt: '2026-11-02T10:00:00.000Z',
      deletedAt: '2026-11-20T10:00:00.000Z',
    },
  ];
  const trashedItems: Todo[] = [
    {
      id: 't-1',
      title: 'Bütçe raporu',
      notes: 'Q4 özet',
      completed: false,
      important: false,
      pinned: false,
      priority: 'normal',
      dueDate: null,
      categoryId: null,
      sortOrder: 0,
      createdAt: '2026-11-01T08:00:00.000Z',
      updatedAt: '2026-11-01T08:00:00.000Z',
      deletedAt: '2026-11-12T09:00:00.000Z',
      subtasks: [],
    },
    {
      id: 't-2',
      title: 'Aylık değerlendirme',
      notes: '',
      completed: true,
      important: false,
      pinned: false,
      priority: 'high',
      dueDate: null,
      categoryId: null,
      sortOrder: 1,
      createdAt: '2026-11-05T08:00:00.000Z',
      updatedAt: '2026-11-05T08:00:00.000Z',
      deletedAt: '2026-11-21T15:00:00.000Z',
      subtasks: [],
    },
  ];

  const byNewest = filterAndSortTrash(trashedCats, trashedItems, {
    query: '',
    typeFilter: 'all',
    sortBy: 'newest',
    dateFrom: '',
    dateTo: '',
    locale: 'tr-TR',
  });
  assert.deepEqual(
    byNewest.todos.map((x) => x.id),
    ['t-2', 't-1'],
  );
  assert.deepEqual(
    byNewest.categories.map((x) => x.id),
    ['c-new', 'c-old'],
  );

  const byAZ = filterAndSortTrash(trashedCats, trashedItems, {
    query: '',
    typeFilter: 'todos',
    sortBy: 'az',
    dateFrom: '',
    dateTo: '',
    locale: 'tr-TR',
  });
  assert.equal(byAZ.categories.length, 0);
  assert.deepEqual(
    byAZ.todos.map((x) => x.id),
    ['t-2', 't-1'],
  );

  const byDateRange = filterAndSortTrash(trashedCats, trashedItems, {
    query: '',
    typeFilter: 'all',
    sortBy: 'oldest',
    dateFrom: '2026-11-15',
    dateTo: '2026-11-22',
    locale: 'tr-TR',
  });
  assert.deepEqual(
    byDateRange.categories.map((x) => x.id),
    ['c-new'],
  );
  assert.deepEqual(
    byDateRange.todos.map((x) => x.id),
    ['t-2'],
  );

  const byNoteSearch = filterAndSortTrash(trashedCats, trashedItems, {
    query: 'q4',
    typeFilter: 'all',
    sortBy: 'newest',
    dateFrom: '',
    dateTo: '',
    locale: 'tr-TR',
  });
  assert.equal(byNoteSearch.categories.length, 0);
  assert.deepEqual(
    byNoteSearch.todos.map((x) => x.id),
    ['t-1'],
  );

  // 2. CLI script responds cleanly to --help & --version
  const { execFileSync, spawn } = await import('node:child_process');
  const cliPath = path.join(process.cwd(), 'cli', 'agendamea.cjs');
  const helpOut = execFileSync(process.execPath, [cliPath, '--help'], { encoding: 'utf8' });
  assert.ok(helpOut.includes('ag +'), 'CLI help must list short simple commands');
  assert.ok(helpOut.includes('ag mcp'), 'CLI help must document MCP command');
  assert.ok(helpOut.includes('ag hook'), 'CLI help must document webhook command');

  // 3. MCP JSON-RPC 2.0 stdio server responds cleanly to initialize & tools/list
  const mcpPath = path.join(process.cwd(), 'mcp', 'server.cjs');
  const mcpResponses = await new Promise<Array<Record<string, unknown>>>((resolve, reject) => {
    const child = spawn(process.execPath, [mcpPath], { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('MCP server timed out'));
    }, 5000);
    child.stdout.on('data', (chunk) => {
      out += chunk.toString('utf8');
      const lines = out.split(/\r?\n/).filter((l) => l.trim().length > 0);
      if (lines.length >= 2) {
        clearTimeout(timer);
        child.kill();
        resolve(lines.map((l) => JSON.parse(l) as Record<string, unknown>));
      }
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.stdin.write(
      `${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} })}\n`,
    );
    child.stdin.write(
      `${JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} })}\n`,
    );
  });
  assert.equal(mcpResponses[0]?.id, 1);
  assert.equal(
    (mcpResponses[0]?.result as { serverInfo?: { name?: string } })?.serverInfo?.name,
    'agendamea',
  );
  const tools = (mcpResponses[1]?.result as { tools?: Array<{ name: string }> })?.tools ?? [];
  assert.ok(tools.length >= 6, 'MCP server must register all core task tools');
  assert.ok(tools.some((tool) => tool.name === 'agendamea_list_tasks'));
  assert.ok(tools.some((tool) => tool.name === 'agendamea_add_task'));

  // 4. Zero icon leakage in Electron fallback HTML & Jump List + zero native <input type="color"> + zero autoSavedBadge clutter in SettingsModal
  const electronBootSources = [
    path.join(process.cwd(), 'electron', 'main.cjs'),
    path.join(process.cwd(), 'electron', 'modules', 'backendProcess.cjs'),
    path.join(process.cwd(), 'electron', 'modules', 'windowFactory.cjs'),
    path.join(process.cwd(), 'electron', 'modules', 'trayAndJumpList.cjs'),
  ]
    .map((fp) => fs.readFileSync(fp, 'utf8'))
    .join('\n');
  assert.ok(
    !electronBootSources.includes('M18 33L27.5 42.5L46 22'),
    'Electron fallback HTML must use official Agendamea A-check monogram (zero generic checkmark leakage)',
  );
  assert.ok(electronBootSources.includes('M 144 378 L 252 128 L 294 224'));
  assert.ok(
    electronBootSources.includes('runtime-port.json'),
    'Electron main process must publish runtime-port.json for CLI/MCP',
  );

  const catColorPicker = fs.readFileSync(
    path.join(process.cwd(), 'src', 'components', 'CategoryColorPicker.tsx'),
    'utf8',
  );
  assert.ok(
    !catColorPicker.includes('type="color"'),
    'CategoryColorPicker must use custom ColorSpectrumPicker instead of misaligned Chromium native color popup',
  );

  const settingsModalSrc = fs.readFileSync(
    path.join(process.cwd(), 'src', 'components', 'SettingsModal.tsx'),
    'utf8',
  );
  assert.ok(
    !settingsModalSrc.includes('t.autoSavedBadge'),
    'SettingsModal must not display autoSavedBadge clutter',
  );

  // 5. Microsoft Store Policy 10.2.7 & multi-cloud accuracy in Legal Documents (TR & EN)
  const trLegal = getLegalDocuments('tr', TR_DICTIONARY);
  const enLegal = getLegalDocuments('en', EN_DICTIONARY);
  assert.ok(trLegal.privacy.sections[2]?.paragraphs[0]?.includes('10.2.7'));
  assert.ok(enLegal.privacy.sections[2]?.paragraphs[0]?.includes('10.2.7'));
  assert.ok(!enLegal.terms.sections[1]?.paragraphs[0]?.includes('without cloud synchronization'));
  assert.ok(trLegal.opensource.sections[1]?.paragraphs[0]?.includes('Electron Updater'));
  assert.ok(enLegal.opensource.sections[1]?.paragraphs[0]?.includes('Electron Updater'));
  assert.ok(trLegal.accessibility.sections[2]?.paragraphs[0]?.includes('9MT5X1NGZJXZ'));
  assert.ok(enLegal.accessibility.sections[2]?.paragraphs[0]?.includes('9MT5X1NGZJXZ'));

  // 6. Shared releaseUtils.cjs (single source of truth for Electron + Express), offline SQLite CLI/MCP localStore.cjs & CI workflow
  const { createRequire } = await import('node:module');
  const req = createRequire(import.meta.url);
  const releaseUtils = req(path.join(process.cwd(), 'shared', 'releaseUtils.cjs'));
  assert.equal(releaseUtils.compareSemver('1.2.0', '1.0.9'), 1);
  assert.equal(releaseUtils.compareSemver('v1.0.0', '1.0.0'), 0);
  const parsedRel = releaseUtils.parseGitHubRelease(
    {
      tag_name: 'v1.1.0',
      name: 'Agendamea v1.1.0',
      html_url: 'https://github.com/emirtdede/agendamea/releases/tag/v1.1.0',
      assets: [
        {
          name: 'Agendamea-Setup-1.1.0-win-x64.exe',
          browser_download_url: 'https://example.com/setup.exe',
        },
        {
          name: 'Agendamea-Store-1.1.0-win-x64.appx',
          browser_download_url: 'https://example.com/store.appx',
        },
      ],
    },
    '1.0.0',
    'https://github.com/emirtdede/agendamea/releases/latest',
    '2026-11-22T00:00:00.000Z',
  );
  assert.equal(parsedRel.updateAvailable, true);
  assert.equal(parsedRel.latestVersion, '1.1.0');
  assert.equal(parsedRel.setupUrl, 'https://example.com/setup.exe');
  assert.equal(parsedRel.msixUrl, 'https://example.com/store.appx');

  // Offline direct SQLite fallback for CLI & MCP when desktop app is closed
  const tmpOfflineDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agendamea-offline-store-'));
  const offlineDbPath = path.join(tmpOfflineDir, 'agendamea.db');
  const seedDb = new TodoDatabase(offlineDbPath);
  seedDb.createCategory({ name: 'CLI Test', color: '#2563eb' });
  seedDb.close();

  const prevForceOffline = process.env.AGENDAMEA_FORCE_OFFLINE;
  const prevDbPath = process.env.AGENDAMEA_DB_PATH;
  process.env.AGENDAMEA_FORCE_OFFLINE = '1';
  process.env.AGENDAMEA_DB_PATH = offlineDbPath;
  try {
    const localStore = req(path.join(process.cwd(), 'shared', 'localStore.cjs'));
    const added = await localStore.addTask({
      title: 'Offline CLI task',
      priority: 'high',
      important: true,
    });
    assert.ok(added.id.startsWith('todo-'));
    const listed = await localStore.listTasks({ filter: 'important' });
    assert.equal(listed.length, 1);
    assert.equal(listed[0].title, 'Offline CLI task');
    const done = await localStore.completeTask(added.id.slice(0, 12), true);
    assert.equal(done.completed, true);
    const status = await localStore.getStatus();
    assert.equal(status.mode, 'offline-sqlite');
    assert.equal(status.completedTasks, 1);
    assert.equal(status.categories, 1);
    await localStore.deleteTask(added.id.slice(0, 12));
    const afterDelete = await localStore.getStatus();
    assert.equal(afterDelete.trashCount, 1);
  } finally {
    if (prevForceOffline === undefined) delete process.env.AGENDAMEA_FORCE_OFFLINE;
    else process.env.AGENDAMEA_FORCE_OFFLINE = prevForceOffline;
    if (prevDbPath === undefined) delete process.env.AGENDAMEA_DB_PATH;
    else process.env.AGENDAMEA_DB_PATH = prevDbPath;
    fs.rmSync(tmpOfflineDir, { recursive: true, force: true });
  }

  // CI workflow presence & required quality gates
  const ciYml = fs.readFileSync(path.join(process.cwd(), '.github', 'workflows', 'ci.yml'), 'utf8');
  assert.ok(ciYml.includes('npm run lint'));
  assert.ok(ciYml.includes('npm run test:coverage') || ciYml.includes('npm test'));
  assert.ok(ciYml.includes('npm run build'));
});
