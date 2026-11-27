import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { TodoDatabase } from '../../src/db/database';
import { isValidLanguageCode, SUPPORTED_LANGUAGES } from '../../src/i18n/languages';
import { getDictionary, getLegalDocuments } from '../../src/i18n/localesWorld';
import {
  EN_DICTIONARY,
  localizeErrorMessage,
  resolveCategoryColorName,
  resolveThemeColorName,
  TR_DICTIONARY,
  type UiDictionary,
} from '../../src/i18n/translations';
import type { Todo } from '../../src/types';
import { CATEGORY_COLORS, COLOR_THEMES } from '../../src/utils/themes';
import {
  classifyEisenhowerQuadrant,
  compareSemver,
  filterAndSortTodos,
  formatTodoDateSchedule,
  isTodoOnCalendarDate,
  isTodoScheduledForToday,
  isValidTimeString,
  normalizeDateRange,
  sanitizeDueTime,
  sanitizeTags,
} from '../../src/utils/todoLogic';

test('QA: Optional start-end dates, 73-language i18n, legal documents & semver update checker work cleanly', () => {
  // 1. Exactly 73 supported languages, all valid with complete dictionaries and legal documents
  assert.equal(SUPPORTED_LANGUAGES.length, 73);
  for (const langMeta of SUPPORTED_LANGUAGES) {
    assert.ok(isValidLanguageCode(langMeta.code));
    const dict = getDictionary(langMeta.code);
    assert.ok(dict.allTasks.length > 0);
    assert.ok(dict.instantSaveBadge.length > 0);
    assert.ok(!dict.instantSaveBadge.toLowerCase().includes('sqlite'));
    const docs = getLegalDocuments(langMeta.code, dict);
    assert.ok(docs.privacy.sections.length >= 3);
    assert.ok(docs.terms.sections.length >= 3);
    assert.ok(docs.gdpr.sections.length >= 3);
    assert.ok(docs.opensource.sections.length >= 2);
    assert.ok(docs.accessibility.sections.length >= 3);
  }

  // 2. Date range normalization & schedule formatting (no date, single date, start-end range, swapped range)
  assert.deepEqual(normalizeDateRange(null, null), { startDate: null, dueDate: null });
  assert.deepEqual(normalizeDateRange('2026-11-25', '2026-11-20'), {
    startDate: '2026-11-20',
    dueDate: '2026-11-25',
  });
  assert.equal(formatTodoDateSchedule(null, null, '2026-11-20'), null);
  const singleDue = formatTodoDateSchedule(null, '2026-11-20', '2026-11-20');
  assert.equal(singleDue?.label, 'Bugün');
  assert.equal(singleDue?.isRange, false);
  const rangeSchedule = formatTodoDateSchedule('2026-11-20', '2026-11-21', '2026-11-20');
  assert.equal(rangeSchedule?.label, 'Bugün - Yarın');
  assert.equal(rangeSchedule?.isRange, true);
  assert.equal(rangeSchedule?.isToday, true);
  assert.ok(
    isTodoScheduledForToday({ startDate: '2026-11-18', dueDate: '2026-11-22' }, '2026-11-20'),
  );

  // 3. SQLite persistence for optional startDate, dueDate, language & autoUpdateCheck
  const db = new TodoDatabase(':memory:');
  try {
    const undated = db.createTodo({ title: 'Tarihsiz hızlı görev' });
    assert.equal(undated.startDate, null);
    assert.equal(undated.dueDate, null);

    const ranged = db.createTodo({
      title: 'Aralıklı görev',
      startDate: '2026-11-25',
      dueDate: '2026-11-20',
    });
    // Swapped automatically so startDate <= dueDate
    assert.equal(ranged.startDate, '2026-11-20');
    assert.equal(ranged.dueDate, '2026-11-25');

    const clearedStart = db.updateTodo(ranged.id, { startDate: null });
    assert.equal(clearedStart?.startDate, null);
    assert.equal(clearedStart?.dueDate, '2026-11-25');

    const settings = db.updateSettings({ language: 'en', autoUpdateCheck: false });
    assert.equal(settings.language, 'en');
    assert.equal(settings.autoUpdateCheck, false);
  } finally {
    db.close();
  }

  // 4. Semver comparison for manual & automatic update checker
  assert.equal(compareSemver('1.0.0', '1.0.0'), 0);
  assert.equal(compareSemver('v1.0.1', '1.0.0'), 1);
  assert.equal(compareSemver('1.1.0', '1.0.9'), 1);
  assert.equal(compareSemver('1.0.0', '1.0.2'), -1);
});

test('QA: Zero language leakage across all 73 languages, UI components, color names, legal docs & international search', () => {
  const requiredKeys = Object.keys(TR_DICTIONARY) as Array<keyof UiDictionary>;
  assert.ok(requiredKeys.length >= 170, 'UiDictionary must contain all 171 localized UI keys');

  // Sentence/phrase keys that must NEVER fall back to English in non-English languages
  // or to Turkish in non-Turkish languages
  const sentenceCheckKeys: Array<keyof UiDictionary> = [
    'allTasks',
    'emptySearchTitle',
    'emptySearchDesc',
    'emptyCompletedTitle',
    'emptyCompletedDesc',
    'emptyListTitle',
    'emptyListDesc',
    'settingsSubtitle',
    'backupRestoreDesc',
    'trashIntroDesc',
    'trashEmptyTitle',
    'trashEmptyDesc',
    'upToDateLabel',
    'autoUpdateToggleDesc',
    'offlineBannerText',
    'todoMovedToTrashToast',
    'categoryMovedToTrashToast',
    'backupRestoredToast',
    'windowClose',
    'operationFailedToast',
    'loadFailedError',
    'onedriveSectionDesc',
    'onedriveBackupDetectedTitle',
    'onedriveBackupDetectedDesc',
    'onedriveStartFreshButton',
    'onedriveOpenFolderButton',
    'addTagPlaceholder',
    'welcomeStep1Title',
    'welcomeStep2Desc',
    'welcomeStep4Desc',
    'welcomeStartButton',
    'welcomePrivacyLocalTitle',
    'customThemeHexTitle',
    'appIconSectionDesc',
    'zoomLevelDesc',
    'closeModalTitle',
    'closeActionTrayDesc',
    'closeActionQuitDesc',
    'launchAtStartupTitle',
    'launchAtStartupDesc',
    'globalQuickAddTitle',
    'globalQuickAddDesc',
    'cloudPickFolderButton',
    'cloudCustomFolderHint',
    'copyDiagnosticsButton',
    'diagnosticsCopiedToast',
    'updateReadyToInstallLabel',
    'restartAndUpdateButton',
    'settingsTabAppearance',
    'settingsTabGeneral',
    'settingsTabAbout',
  ];

  for (const langMeta of SUPPORTED_LANGUAGES) {
    const dict = getDictionary(langMeta.code);

    // 1. Every single key in UiDictionary must be non-empty string
    for (const key of requiredKeys) {
      assert.equal(
        typeof dict[key],
        'string',
        `Missing string key ${String(key)} in ${langMeta.code}`,
      );
      assert.ok(dict[key].trim().length > 0, `Empty key ${String(key)} in ${langMeta.code}`);
    }

    // 2. Zero English sentence leakage in non-English languages & zero Turkish leakage in non-Turkish languages
    if (langMeta.code !== 'en') {
      for (const sKey of sentenceCheckKeys) {
        assert.notEqual(
          dict[sKey],
          EN_DICTIONARY[sKey],
          `English leakage detected in [${langMeta.code}] for key "${String(sKey)}": "${dict[sKey]}"`,
        );
      }
    }
    if (langMeta.code !== 'tr') {
      for (const sKey of sentenceCheckKeys) {
        assert.notEqual(
          dict[sKey],
          TR_DICTIONARY[sKey],
          `Turkish leakage detected in [${langMeta.code}] for key "${String(sKey)}": "${dict[sKey]}"`,
        );
      }
    }

    // 3. All 14 theme colors & 8 category colors resolve to non-empty localized names
    for (const theme of COLOR_THEMES) {
      const localizedThemeName = resolveThemeColorName(theme.id, theme.name, dict);
      assert.ok(localizedThemeName.trim().length > 0);
      if (langMeta.code !== 'tr') {
        // Ensure non-TR languages don't leak Turkish-only color names like "Kırmızı" or "Kehribar"
        assert.notEqual(localizedThemeName, 'Kırmızı');
        assert.notEqual(localizedThemeName, 'Kehribar');
      }
    }
    for (const catColor of CATEGORY_COLORS) {
      const localizedCatColor = resolveCategoryColorName(catColor.hex, catColor.name, dict);
      assert.ok(localizedCatColor.trim().length > 0);
      if (langMeta.code !== 'tr') {
        assert.notEqual(localizedCatColor, 'Kırmızı');
        assert.notEqual(localizedCatColor, 'Beyaz');
      }
    }

    // 4. Legal documents must be localized in the target language (zero English leakage in non-English)
    const docs = getLegalDocuments(langMeta.code, dict);
    if (langMeta.code !== 'en') {
      assert.notEqual(
        docs.privacy.sections[0]?.paragraphs[0],
        'Agendamea is built by Vellium (vellium.dev) with a strict local-first privacy architecture. All tasks, optional start and due dates, subtasks, notes, categories, and theme settings you create are stored exclusively on your own device (%APPDATA%\\Agendamea).',
        `English legal paragraph leaked in [${langMeta.code}] privacy policy`,
      );
    }

    // 5. localizeErrorMessage never leaks raw Turkish server errors into non-Turkish locales
    if (langMeta.code !== 'tr') {
      const errMsg = localizeErrorMessage(
        new Error('Sunucu ile bağlantı kurulamadı.'),
        dict.operationFailedToast,
        langMeta.code,
        dict,
      );
      assert.equal(errMsg, dict.operationFailedToast);
    }
  }

  // 6. Multilingual search matches both Turkish İ/ı and international I/i (e.g. "Install" <-> "install")
  const intlTodos: Todo[] = [
    {
      id: 'intl-1',
      title: 'Install Windows Update',
      notes: 'Important deployment note',
      completed: false,
      important: true,
      pinned: false,
      priority: 'high',
      startDate: null,
      dueDate: null,
      categoryId: null,
      sortOrder: 0,
      createdAt: '2026-11-20T10:00:00.000Z',
      updatedAt: '2026-11-20T10:00:00.000Z',
      deletedAt: null,
      subtasks: [],
    },
  ];
  const matchedLower = filterAndSortTodos({
    todos: intlTodos,
    activeView: { type: 'smart', id: 'all' },
    statusFilter: 'all',
    searchQuery: 'install',
    sortBy: 'manual',
  });
  assert.equal(matchedLower.length, 1, 'Lowercase "install" must match uppercase "Install"');
  const matchedUpper = filterAndSortTodos({
    todos: intlTodos,
    activeView: { type: 'smart', id: 'all' },
    statusFilter: 'all',
    searchQuery: 'IMPORTANT',
    sortBy: 'manual',
  });
  assert.equal(matchedUpper.length, 1, 'Uppercase "IMPORTANT" must match "Important"');

  // 7. Recursive static source scan of all React components (including subdirectories) & App.tsx for zero hardcoded Turkish characters
  const componentDir = path.join(process.cwd(), 'src', 'components');
  const componentFiles: string[] = [];
  const collectTsxFiles = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        collectTsxFiles(fullPath);
      } else if (entry.name.endsWith('.tsx')) {
        componentFiles.push(fullPath);
      }
    }
  };
  collectTsxFiles(componentDir);
  componentFiles.push(path.join(process.cwd(), 'src', 'App.tsx'));

  const trCharRegex = /[ğüşıöçĞÜŞİÖÇ]/;
  for (const filePath of componentFiles) {
    const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
    lines.forEach((line, idx) => {
      const trimmed = line.trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return;
      assert.ok(
        !trCharRegex.test(line),
        `Hardcoded Turkish character found in ${path.basename(filePath)}:${idx + 1} -> ${trimmed}`,
      );
    });
  }

  // 8. Zero runtime .replace() hacks in i18n locale files and strict Unicode script purity across all 73 languages
  const localesDir = path.join(process.cwd(), 'src', 'i18n', 'locales');
  const localeFiles = fs
    .readdirSync(localesDir)
    .filter((f) => f.endsWith('.ts'))
    .map((f) => path.join(localesDir, f));
  assert.equal(localeFiles.length, 73, 'Expected all 73 lazy locale modules in src/i18n/locales');
  for (const absFile of localeFiles) {
    const srcText = fs.readFileSync(absFile, 'utf8');
    assert.ok(
      !srcText.includes('.replace('),
      `Unexpected .replace() hack in ${path.basename(absFile)}`,
    );
  }

  const expectedScripts: Record<string, RegExp[]> = {
    ru: [/[\u0400-\u04FF]/],
    uk: [/[\u0400-\u04FF]/],
    bg: [/[\u0400-\u04FF]/],
    sr: [/[\u0400-\u04FF]/],
    mk: [/[\u0400-\u04FF]/],
    kk: [/[\u0400-\u04FF]/],
    ky: [/[\u0400-\u04FF]/],
    el: [/[\u0370-\u03FF]/],
    ka: [/[\u10A0-\u10FF]/],
    hy: [/[\u0530-\u058F]/],
    ar: [/[\u0600-\u06FF]/],
    fa: [/[\u0600-\u06FF]/],
    ur: [/[\u0600-\u06FF]/],
    he: [/[\u0590-\u05FF]/],
    hi: [/[\u0900-\u097F]/],
    mr: [/[\u0900-\u097F]/],
    ne: [/[\u0900-\u097F]/],
    bn: [/[\u0980-\u09FF\u0964]/],
    pa: [/[\u0A00-\u0A7F\u0964]/],
    gu: [/[\u0A80-\u0AFF]/],
    ta: [/[\u0B80-\u0BFF]/],
    te: [/[\u0C00-\u0C7F]/],
    kn: [/[\u0C80-\u0CFF]/],
    ml: [/[\u0D00-\u0D7F]/],
    si: [/[\u0D80-\u0DFF]/],
    th: [/[\u0E00-\u0E7F]/],
    lo: [/[\u0E80-\u0EFF]/],
    my: [/[\u1000-\u109F]/],
    km: [/[\u1780-\u17FF]/],
    am: [/[\u1200-\u137F]/],
    ja: [/[\u3040-\u30FF\u4E00-\u9FFF]/],
    ko: [/[\uAC00-\uD7AF\u1100-\u11FF]/],
    'zh-CN': [/[\u4E00-\u9FFF]/],
    'zh-TW': [/[\u4E00-\u9FFF]/],
  };

  const nonLatinBlocks: Array<[string, RegExp]> = [
    ['Cyrillic', /[\u0400-\u04FF]/],
    ['Greek', /[\u0370-\u03FF]/],
    ['Georgian', /[\u10A0-\u10FF]/],
    ['Armenian', /[\u0530-\u058F]/],
    ['Arabic', /[\u0600-\u06FF]/],
    ['Hebrew', /[\u0590-\u05FF]/],
    ['Devanagari', /[\u0900-\u0963\u0966-\u097F]/],
    ['Bengali', /[\u0980-\u09FF]/],
    ['Gurmukhi', /[\u0A00-\u0A7F]/],
    ['Gujarati', /[\u0A80-\u0AFF]/],
    ['Tamil', /[\u0B80-\u0BFF]/],
    ['Telugu', /[\u0C00-\u0C7F]/],
    ['Kannada', /[\u0C80-\u0CFF]/],
    ['Malayalam', /[\u0D00-\u0D7F]/],
    ['Sinhala', /[\u0D80-\u0DFF]/],
    ['Thai', /[\u0E00-\u0E7F]/],
    ['Lao', /[\u0E80-\u0EFF]/],
    ['Myanmar', /[\u1000-\u109F]/],
    ['Khmer', /[\u1780-\u17FF]/],
    ['Ethiopic', /[\u1200-\u137F]/],
    ['Hiragana/Katakana', /[\u3040-\u30FF]/],
    ['Hangul', /[\uAC00-\uD7AF]/],
    ['CJK', /[\u4E00-\u9FFF]/],
  ];

  for (const langMeta of SUPPORTED_LANGUAGES) {
    const dict = getDictionary(langMeta.code);
    const allowed = expectedScripts[langMeta.code] || [];
    for (const [k, val] of Object.entries(dict)) {
      for (const [blockName, rx] of nonLatinBlocks) {
        if (rx.test(val)) {
          const isAllowed = allowed.some((a) => a.test(val));
          assert.ok(
            isAllowed,
            `Foreign script (${blockName}) leaked into [${langMeta.code}] key "${k}": "${val}"`,
          );
        }
      }
    }
  }
});

test('QA: Optional dueTime, post-creation #tags, Kanban/Calendar/Matrix helpers & OneDrive settings persist cleanly', () => {
  assert.equal(isValidTimeString('09:30'), true);
  assert.equal(isValidTimeString('23:59'), true);
  assert.equal(isValidTimeString('24:00'), false);
  assert.equal(sanitizeDueTime(' 14:45 '), '14:45');
  assert.equal(sanitizeDueTime('invalid'), null);

  assert.deepEqual(sanitizeTags(['#iş', 'acil', '#İŞ', '  fatura öde  ']), [
    'iş',
    'acil',
    'fatura-öde',
  ]);

  const timedLabel = formatTodoDateSchedule(
    null,
    '2026-11-21',
    '2026-11-21',
    'tr-TR',
    undefined,
    '14:30',
  );
  assert.equal(timedLabel?.label, 'Bugün · 14:30');

  assert.equal(
    classifyEisenhowerQuadrant(
      { important: true, priority: 'high', startDate: null, dueDate: '2026-11-21' },
      '2026-11-21',
    ),
    'q1',
  );
  assert.equal(
    classifyEisenhowerQuadrant(
      { important: true, priority: 'normal', startDate: null, dueDate: '2026-11-25' },
      '2026-11-21',
    ),
    'q2',
  );
  assert.equal(
    classifyEisenhowerQuadrant(
      { important: false, priority: 'normal', startDate: null, dueDate: '2026-11-21' },
      '2026-11-21',
    ),
    'q3',
  );
  assert.equal(
    classifyEisenhowerQuadrant(
      { important: false, priority: 'low', startDate: null, dueDate: null },
      '2026-11-21',
    ),
    'q4',
  );

  assert.equal(
    isTodoOnCalendarDate({ startDate: '2026-11-20', dueDate: '2026-11-22' }, '2026-11-21'),
    true,
  );
  assert.equal(isTodoOnCalendarDate({ startDate: null, dueDate: null }, '2026-11-21'), false);

  const db = new TodoDatabase(':memory:');
  try {
    const created = db.createTodo({
      title: 'Sunucu faturasını öde',
      dueDate: '2026-11-21',
      dueTime: '15:30',
      tags: ['#finans', 'bulut'],
    });
    assert.equal(created.dueTime, '15:30');
    assert.deepEqual(created.tags, ['finans', 'bulut']);

    const updated = db.updateTodo(created.id, {
      dueTime: '16:45',
      tags: ['finans', 'bulut', '#onedrive'],
    });
    assert.equal(updated?.dueTime, '16:45');
    assert.deepEqual(updated?.tags, ['finans', 'bulut', 'onedrive']);

    const byTag = filterAndSortTodos({
      todos: db.getTodos(),
      activeView: { type: 'smart', id: 'all' },
      statusFilter: 'all',
      searchQuery: '#onedrive',
      sortBy: 'dueDate',
      todayStr: '2026-11-21',
      tagFilter: 'finans',
    });
    assert.equal(byTag.length, 1);

    const snap = db.getBootstrap();
    const afterOnboarding = db.updateSettings({ onboardingCompleted: true });
    assert.equal(afterOnboarding.onboardingCompleted, true);
    assert.equal(db.getSettings().onboardingCompleted, true);
    const db2 = new TodoDatabase(':memory:');
    try {
      const restored = db2.importBackup(snap);
      assert.equal(restored.todos[0]?.dueTime, '16:45');
      assert.deepEqual(restored.todos[0]?.tags, ['finans', 'bulut', 'onedrive']);
    } finally {
      db2.close();
    }
  } finally {
    db.close();
  }

  // Self-healing SQLite corruption recovery test: corrupted DB file is backed up as .corrupt-*.bak and reinitialized cleanly
  const corruptDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agendamea-corrupt-'));
  const corruptDbPath = path.join(corruptDir, 'agendamea.db');
  fs.writeFileSync(corruptDbPath, 'NOT_A_VALID_SQLITE_HEADER_CORRUPTED_BYTES', 'utf8');
  const recoveredDb = new TodoDatabase(corruptDbPath);
  try {
    assert.equal(recoveredDb.getTodos().length, 0);
    const createdAfterRecovery = recoveredDb.createTodo({ title: 'Kurtarılan veritabanı görevi' });
    assert.equal(createdAfterRecovery.title, 'Kurtarılan veritabanı görevi');
    const dirFiles = fs.readdirSync(corruptDir);
    assert.ok(
      dirFiles.some((f) => f.startsWith('agendamea.db.corrupt-') && f.endsWith('.bak')),
      'Corrupted SQLite file must be preserved as .corrupt-*.bak',
    );
  } finally {
    recoveredDb.close();
    fs.rmSync(corruptDir, { recursive: true, force: true });
  }
});

test('QA: Permanent ban on em-dash and en-dash characters across all 73 locales, legal docs, and source files', () => {
  const forbiddenDashRegex = /[\u2013\u2014]/;

  // 1. Verify all 73 dictionaries and legal documents contain zero em-dash or en-dash characters
  for (const langMeta of SUPPORTED_LANGUAGES) {
    const dict = getDictionary(langMeta.code);
    for (const [k, val] of Object.entries(dict)) {
      assert.equal(
        forbiddenDashRegex.test(val),
        false,
        `Forbidden long dash (em-dash/en-dash) found in [${langMeta.code}] dictionary key "${k}": "${val}"`,
      );
    }
    const docs = getLegalDocuments(langMeta.code);
    for (const docId of ['privacy', 'terms', 'gdpr', 'opensource', 'accessibility'] as const) {
      const doc = docs[docId];
      assert.equal(forbiddenDashRegex.test(doc.title), false);
      assert.equal(forbiddenDashRegex.test(doc.subtitle), false);
      for (const sec of doc.sections) {
        assert.equal(
          forbiddenDashRegex.test(sec.heading),
          false,
          `Forbidden long dash in [${langMeta.code}] legal heading: "${sec.heading}"`,
        );
        for (const p of sec.paragraphs) {
          assert.equal(
            forbiddenDashRegex.test(p),
            false,
            `Forbidden long dash in [${langMeta.code}] legal paragraph: "${p}"`,
          );
        }
      }
    }
  }

  // 2. Verify all source, HTML, Electron, and server files in the repository contain zero em-dash or en-dash characters
  const projectRoot = path.resolve(import.meta.dirname, '..');
  const skipDirs = new Set([
    'node_modules',
    '.git',
    'dist',
    'dist-server',
    'release',
    'release-build',
    'release-verify',
    'testsprite_tests',
  ]);
  const inspectFile = (filePath: string) => {
    const content = fs.readFileSync(filePath, 'utf8');
    assert.equal(
      forbiddenDashRegex.test(content),
      false,
      `Forbidden long dash (\\u2013 or \\u2014) found in file: ${path.relative(projectRoot, filePath)}`,
    );
  };
  const walkDir = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (skipDirs.has(entry.name)) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walkDir(fullPath);
      } else if (
        /\.(ts|tsx|js|cjs|mjs|html|css|json|md|bat|ps1|yml|yaml|nsh|txt)$/i.test(entry.name) &&
        entry.name !== 'package-lock.json'
      ) {
        inspectFile(fullPath);
      }
    }
  };
  walkDir(projectRoot);
});
