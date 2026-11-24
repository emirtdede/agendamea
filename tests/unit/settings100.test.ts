import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { APP_CHANGELOG } from '../../src/data/changelog.ts';
import { TodoDatabase } from '../../src/db/database.ts';
import { EN_LEGAL_DOCUMENTS, TR_LEGAL_DOCUMENTS } from '../../src/i18n/translations.ts';
import type { Category, Todo } from '../../src/types.ts';
import {
  buildCsvExport,
  buildIcsExport,
  buildMarkdownExport,
  decryptBackupPayload,
  encryptBackupPayload,
  isEncryptedBackupEnvelope,
  parseCsvToBackupPayload,
  parseIcsToBackupPayload,
} from '../../src/utils/exportFormats.ts';
import { isWithinQuietHours, sanitizeTimeHHMM } from '../../src/utils/notifications.ts';
import { detectShortcutConflicts, sanitizeCustomShortcuts } from '../../src/utils/shortcuts.ts';
import { filterAndSortTodos, formatDueTimeDisplay } from '../../src/utils/todoLogic.ts';

function withTempDb(fn: (db: TodoDatabase, dbFile: string) => void | Promise<void>) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agendamea-settings100-'));
  const dbFile = path.join(dir, 'agendamea.db');
  const db = new TodoDatabase(dbFile);
  return Promise.resolve()
    .then(() => fn(db, dbFile))
    .finally(() => {
      db.close();
      fs.rmSync(dir, { recursive: true, force: true });
    });
}

test('SQLite settings codec round-trips all 24 new personalization & runtime settings cleanly', async () => {
  await withTempDb((db, dbFile) => {
    assert.equal(db.getDbPath(), dbFile);
    assert.ok(db.getSchemaVersion() >= 5, 'SQLite schema version should be >= 5');

    const updated = db.updateSettings({
      listDensity: 'compact',
      fontFamily: 'mono',
      recentCustomColors: ['#112233', '#abcdef', '#ff0055'],
      colorBlindShapes: true,
      strongFocusRing: true,
      weekStartsOn: 'sunday',
      timeFormat: '12h',
      defaultStartupView: 'today',
      defaultLayoutMode: 'calendar',
      defaultPriority: 'high',
      completedTaskBehavior: 'hide',
      completionSound: 'chime',
      confirmBeforeDelete: true,
      launchMinimizedToTray: true,
      trashAutoPurgeDays: 30,
      voiceShortcutEnabled: false,
      quietHoursEnabled: true,
      quietHoursStart: '23:15',
      quietHoursEnd: '07:45',
      notificationSoundEnabled: false,
      dailyDigestEnabled: true,
      dailyDigestTime: '08:30',
      voiceDictationLanguage: 'tr',
      aiExternalBaseUrl: 'http://127.0.0.1:11434/v1',
    });

    const reread = db.getSettings();
    for (const target of [updated, reread]) {
      assert.equal(target.listDensity, 'compact');
      assert.equal(target.fontFamily, 'mono');
      assert.deepEqual(target.recentCustomColors, ['#112233', '#abcdef', '#ff0055']);
      assert.equal(target.colorBlindShapes, true);
      assert.equal(target.strongFocusRing, true);
      assert.equal(target.weekStartsOn, 'sunday');
      assert.equal(target.timeFormat, '12h');
      assert.equal(target.defaultStartupView, 'today');
      assert.equal(target.defaultLayoutMode, 'calendar');
      assert.equal(target.defaultPriority, 'high');
      assert.equal(target.completedTaskBehavior, 'hide');
      assert.equal(target.completionSound, 'chime');
      assert.equal(target.confirmBeforeDelete, true);
      assert.equal(target.launchMinimizedToTray, true);
      assert.equal(target.trashAutoPurgeDays, 30);
      assert.equal(target.voiceShortcutEnabled, false);
      assert.equal(target.quietHoursEnabled, true);
      assert.equal(target.quietHoursStart, '23:15');
      assert.equal(target.quietHoursEnd, '07:45');
      assert.equal(target.notificationSoundEnabled, false);
      assert.equal(target.dailyDigestEnabled, true);
      assert.equal(target.dailyDigestTime, '08:30');
      assert.equal(target.voiceDictationLanguage, 'tr');
      assert.equal(target.aiExternalBaseUrl, 'http://127.0.0.1:11434/v1');
    }
  });
});

test('Multi-format export/import: CSV, Todoist CSV, Markdown, iCalendar (.ics), and AES-256-GCM encrypted backups', async () => {
  const categories: Category[] = [
    {
      id: 'cat-1',
      name: 'Work',
      color: '#2563eb',
      pinned: false,
      sortOrder: 0,
      createdAt: '2026-11-20T09:00:00.000Z',
      deletedAt: null,
    },
  ];
  const todos: Todo[] = [
    {
      id: 'todo-1',
      title: 'Prepare release notes, "final"',
      notes: 'Line 1\nLine 2',
      completed: false,
      important: true,
      pinned: true,
      priority: 'high',
      startDate: '2026-11-21',
      dueDate: '2026-11-24',
      dueTime: '14:30',
      categoryId: 'cat-1',
      tags: ['release', 'qa'],
      sortOrder: 0,
      createdAt: '2026-11-20T09:00:00.000Z',
      updatedAt: '2026-11-20T09:00:00.000Z',
      deletedAt: null,
      subtasks: [
        { id: 'sub-1', todoId: 'todo-1', title: 'Check changelog', completed: true, sortOrder: 0 },
      ],
    },
  ];

  // CSV round-trip
  const csv = buildCsvExport(todos, categories);
  assert.ok(csv.startsWith('\uFEFF'), 'CSV export should include UTF-8 BOM for Excel');
  const fromCsv = parseCsvToBackupPayload(csv);
  assert.ok(fromCsv.todos && fromCsv.categories);
  assert.equal(fromCsv.todos.length, 1);
  assert.equal(fromCsv.todos[0]?.title, 'Prepare release notes, "final"');
  assert.equal(fromCsv.todos[0]?.priority, 'high');
  assert.equal(fromCsv.todos[0]?.dueDate, '2026-11-24');
  assert.equal(fromCsv.todos[0]?.dueTime, '14:30');
  assert.equal(fromCsv.categories.length, 1);
  assert.equal(fromCsv.categories[0]?.name, 'Work');

  // Todoist CSV import compatibility
  const todoistCsv =
    'TYPE,CONTENT,DESCRIPTION,PRIORITY,DATE\ntask,Ship v1.1.0,QA sign-off,1,2026-12-01\n';
  const fromTodoist = parseCsvToBackupPayload(todoistCsv);
  assert.ok(fromTodoist.todos);
  assert.equal(fromTodoist.todos.length, 1);
  assert.equal(fromTodoist.todos[0]?.title, 'Ship v1.1.0');
  assert.equal(fromTodoist.todos[0]?.priority, 'high');

  // Markdown export
  const md = buildMarkdownExport(todos, categories);
  assert.ok(md.includes('## Work'));
  assert.ok(md.includes('- [ ] Prepare release notes, "final"'));
  assert.ok(md.includes('  - [x] Check changelog'));

  // ICS round-trip
  const ics = buildIcsExport(todos, categories);
  assert.ok(ics.includes('BEGIN:VCALENDAR'));
  assert.ok(ics.includes('BEGIN:VTODO'));
  const fromIcs = parseIcsToBackupPayload(ics);
  assert.ok(fromIcs.todos);
  assert.equal(fromIcs.todos.length, 1);
  assert.equal(fromIcs.todos[0]?.title, 'Prepare release notes, "final"');
  assert.equal(fromIcs.todos[0]?.dueDate, '2026-11-24');

  // AES-256-GCM encrypted backup round-trip + wrong passphrase rejection
  const envelope = await encryptBackupPayload({ todos, categories }, 'super-secret-pass-2026');
  assert.equal(isEncryptedBackupEnvelope(envelope), true);
  const decrypted = await decryptBackupPayload(envelope, 'super-secret-pass-2026');
  assert.equal(Array.isArray(decrypted.todos), true);
  assert.equal((decrypted.todos as Todo[]).length, 1);
  await assert.rejects(
    () => decryptBackupPayload(envelope, 'wrong-passphrase'),
    'Decrypting with wrong passphrase must fail',
  );
});

test('Shortcuts: conflict detection across global + in-app bindings and individual binding clear', () => {
  const sanitized = sanitizeCustomShortcuts({
    newTask: '',
    search: 'ctrl+k',
    openSettings: 'Ctrl+K',
  });
  assert.equal(sanitized.newTask, '', 'Empty string must disable individual shortcut');
  assert.equal(sanitized.search, 'Ctrl+K');

  const conflicts = detectShortcutConflicts([
    { id: 'globalQuickAdd', shortcut: 'CommandOrControl+Alt+N' },
    { id: 'globalVoice', shortcut: 'Ctrl+Alt+N' },
    { id: 'search', shortcut: 'Ctrl+K' },
    { id: 'openSettings', shortcut: 'Ctrl+K' },
    { id: 'newTask', shortcut: '' },
  ]);
  assert.deepEqual(conflicts.get('globalQuickAdd'), ['globalVoice']);
  assert.deepEqual(conflicts.get('globalVoice'), ['globalQuickAdd']);
  assert.deepEqual(conflicts.get('search'), ['openSettings']);
  assert.equal(conflicts.has('newTask'), false, 'Disabled binding must never collide');
});

test('Notifications: Quiet Hours supports overnight wrap and daytime windows accurately', () => {
  assert.equal(sanitizeTimeHHMM('22:00', '09:00'), '22:00');
  assert.equal(sanitizeTimeHHMM('25:99', '09:00'), '09:00');

  const lateNight = new Date(2026, 10, 24, 23, 30);
  const earlyMorning = new Date(2026, 10, 24, 6, 15);
  const midday = new Date(2026, 10, 24, 14, 0);

  assert.equal(isWithinQuietHours(lateNight, true, '22:00', '08:00'), true);
  assert.equal(isWithinQuietHours(earlyMorning, true, '22:00', '08:00'), true);
  assert.equal(isWithinQuietHours(midday, true, '22:00', '08:00'), false);
  assert.equal(isWithinQuietHours(lateNight, false, '22:00', '08:00'), false);

  // Daytime window
  assert.equal(isWithinQuietHours(midday, true, '13:00', '15:00'), true);
  assert.equal(isWithinQuietHours(earlyMorning, true, '13:00', '15:00'), false);
});

test('Time formatting (12h/24h) and completedTaskBehavior (show/bottom/hide) behave deterministically', () => {
  assert.equal(formatDueTimeDisplay('14:30', '24h'), '14:30');
  assert.equal(formatDueTimeDisplay('14:30', '12h'), '2:30 PM');
  assert.equal(formatDueTimeDisplay('00:05', '12h'), '12:05 AM');
  assert.equal(formatDueTimeDisplay('12:00', '12h'), '12:00 PM');

  const list: Todo[] = [
    {
      id: 'c1',
      title: 'Done task',
      notes: '',
      completed: true,
      important: false,
      pinned: false,
      priority: 'normal',
      dueDate: null,
      categoryId: null,
      sortOrder: 0,
      createdAt: '2026-11-24T08:00:00.000Z',
      updatedAt: '2026-11-24T08:00:00.000Z',
      deletedAt: null,
      subtasks: [],
    },
    {
      id: 'a1',
      title: 'Active task',
      notes: '',
      completed: false,
      important: false,
      pinned: false,
      priority: 'normal',
      dueDate: null,
      categoryId: null,
      sortOrder: 1,
      createdAt: '2026-11-24T09:00:00.000Z',
      updatedAt: '2026-11-24T09:00:00.000Z',
      deletedAt: null,
      subtasks: [],
    },
  ];

  const hidden = filterAndSortTodos({
    todos: list,
    activeView: { type: 'smart', id: 'all' },
    statusFilter: 'all',
    searchQuery: '',
    sortBy: 'manual',
    completedBehavior: 'hide',
  });
  assert.deepEqual(
    hidden.map((x) => x.id),
    ['a1'],
  );

  const inlineShown = filterAndSortTodos({
    todos: list,
    activeView: { type: 'smart', id: 'all' },
    statusFilter: 'all',
    searchQuery: '',
    sortBy: 'manual',
    completedBehavior: 'show',
  });
  assert.deepEqual(
    inlineShown.map((x) => x.id),
    ['c1', 'a1'],
  );

  const bottomed = filterAndSortTodos({
    todos: list,
    activeView: { type: 'smart', id: 'all' },
    statusFilter: 'all',
    searchQuery: '',
    sortBy: 'manual',
    completedBehavior: 'bottom',
  });
  assert.deepEqual(
    bottomed.map((x) => x.id),
    ['a1', 'c1'],
  );
});

test('SQLite Trash: restoreAllTrash restores all deleted items and purgeExpiredTrash removes expired rows', async () => {
  await withTempDb((db) => {
    const cat = db.createCategory({ name: 'Archive', color: '#2563eb' });
    const t1 = db.createTodo({ title: 'First deleted', categoryId: cat.id });
    const t2 = db.createTodo({ title: 'Second deleted' });
    db.softDeleteTodo(t1.id);
    db.softDeleteTodo(t2.id);
    db.softDeleteCategory(cat.id);

    assert.equal(db.getBootstrap().trashedTodos.length, 2);
    assert.equal(db.getBootstrap().trashedCategories.length, 1);

    const restored = db.restoreAllTrash();
    assert.equal(restored.restoredTodos, 2);
    assert.equal(restored.restoredCategories, 1);
    assert.equal(db.getBootstrap().trashedTodos.length, 0);
    assert.equal(db.getBootstrap().trashedCategories.length, 0);

    // Zero-day purge should never purge anything
    db.softDeleteTodo(t1.id);
    assert.deepEqual(db.purgeExpiredTrash(0), { deletedTodos: 0, deletedCategories: 0 });
    assert.equal(db.getBootstrap().trashedTodos.length, 1);
  });
});

test('Changelog & Open Source Legal Attributions stay synchronized with CHANGELOG.md and core dependencies', () => {
  const changelogMd = fs.readFileSync(path.join(process.cwd(), 'CHANGELOG.md'), 'utf8');
  const match = changelogMd.match(/##\s*\[(\d+\.\d+\.\d+)\]/);
  assert.ok(match?.[1], 'CHANGELOG.md must declare a top semantic version');
  assert.equal(
    APP_CHANGELOG[0]?.version,
    match[1],
    'In-app APP_CHANGELOG[0].version must match top CHANGELOG.md release',
  );

  const enOss = EN_LEGAL_DOCUMENTS.opensource.sections
    .flatMap((s) => s.paragraphs)
    .join(' ')
    .toLowerCase();
  const trOss = TR_LEGAL_DOCUMENTS.opensource.sections
    .flatMap((s) => s.paragraphs)
    .join(' ')
    .toLowerCase();
  for (const dep of [
    'electron',
    'react',
    'sqlite',
    'express',
    'zod',
    'pino',
    'rnnoise',
    'silero',
    'piper',
  ]) {
    assert.ok(enOss.includes(dep), `EN Open Source legal notice must attribute "${dep}"`);
    assert.ok(trOss.includes(dep), `TR Open Source legal notice must attribute "${dep}"`);
  }
});

test('End-to-end SQLite importBackup accepts CSV, Todoist CSV, and iCalendar (.ics) payloads cleanly', async () => {
  await withTempDb((db) => {
    const csvInput =
      '\uFEFFTitle,Completed,Priority,Category,DueDate,DueTime,Tags,Notes\r\n"Ship 100/100 release",false,high,Launch,2026-12-01,15:30,"qa; release","Ready to ship"\r\n';
    const csvPayload = parseCsvToBackupPayload(csvInput);
    db.importBackup(csvPayload);
    const snap1 = db.getBootstrap();
    assert.equal(snap1.todos.length, 1);
    assert.equal(snap1.categories.length, 1);
    assert.equal(snap1.todos[0]?.title, 'Ship 100/100 release');
    assert.equal(snap1.todos[0]?.dueDate, '2026-12-01');
    assert.equal(snap1.todos[0]?.dueTime, '15:30');

    const icsInput = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'BEGIN:VTODO',
      'SUMMARY:Renew SSL cert',
      'DUE:20261215T090000',
      'PRIORITY:1',
      'STATUS:NEEDS-ACTION',
      'END:VTODO',
      'END:VCALENDAR',
    ].join('\r\n');
    const icsPayload = parseIcsToBackupPayload(icsInput);
    db.importBackup(icsPayload);
    const snap2 = db.getBootstrap();
    assert.equal(snap2.todos.length, 1);
    assert.equal(snap2.todos[0]?.title, 'Renew SSL cert');
    assert.equal(snap2.todos[0]?.priority, 'high');
    assert.equal(snap2.todos[0]?.dueDate, '2026-12-15');
  });
});

test('LlmService normalizes trailing /v1 on custom aiExternalBaseUrl to prevent double /v1/v1 URLs', async () => {
  const { createRequire } = await import('node:module');
  const req = createRequire(import.meta.url);
  const { LlmService } = req('../../electron/ai/llmService.cjs');
  const svc = new LlmService();
  svc.configure({
    useExternalOllama: true,
    externalKind: 'lmstudio',
    externalBaseUrl: 'http://127.0.0.1:1234/v1/',
    externalModel: 'qwen3-4b',
  });
  assert.equal(svc.externalBaseUrl, 'http://127.0.0.1:1234');
});
