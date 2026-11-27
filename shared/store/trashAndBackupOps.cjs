'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');
const textNormalize = require('../textNormalize.cjs');
const todoRepository = require('../todoRepository.cjs');
const {
  APP_VERSION,
  formatLocalDate,
  isValidIsoDate,
  normalizeDateRange,
  sanitizeDueTime,
  normalizeHexColor,
  sanitizeTags,
  getCandidateDataDirs,
  resolveApiBaseUrl,
  httpRequest,
} = require('./httpTransport.cjs');
const {
  withOfflineDb,
  mapCategoryRow,
  attachSubtasksOffline,
  readSettingsOffline,
  writeSettingsPatchOffline,
  getBootstrapOffline,
  getBootstrap,
} = require('./offlineDb.cjs');
const { resolveTaskSelector, resolveCategorySelector } = require('./taskQueries.cjs');
const { flushOfflineAutoSync } = require('./cloudSyncOffline.cjs');
const { dispatchConfiguredWebhookOffline } = require('./webhookOffline.cjs');

const ICON_COLOR_MAP = {
  obsidian: { bg: '#111114', fg: '#fafafa' },
  'obsidian-light': { bg: '#f4f4f5', fg: '#09090b' },
  slate: { bg: '#475569', fg: '#ffffff' },
  navy: { bg: '#1e3a8a', fg: '#ffffff' },
  blue: { bg: '#2563eb', fg: '#ffffff' },
  cyan: { bg: '#0891b2', fg: '#ffffff' },
  indigo: { bg: '#4f46e5', fg: '#ffffff' },
  purple: { bg: '#7c3aed', fg: '#ffffff' },
  pink: { bg: '#db2777', fg: '#ffffff' },
  red: { bg: '#dc2626', fg: '#ffffff' },
  orange: { bg: '#ea580c', fg: '#ffffff' },
  yellow: { bg: '#ca8a04', fg: '#09090b' },
  emerald: { bg: '#059669', fg: '#ffffff' },
  grass: { bg: '#16a34a', fg: '#ffffff' },
  lime: { bg: '#65a30d', fg: '#09090b' },
};

function syncOsSettingsBridge(patch, mergedSettings) {
  if (!patch || typeof patch !== 'object') return;
  const dataDir = getCandidateDataDirs()[0];
  if (!dataDir) return;
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    if (
      patch.closeBehavior !== undefined ||
      patch.launchAtStartup !== undefined ||
      patch.globalQuickAddShortcut !== undefined ||
      patch.voiceShortcut !== undefined
    ) {
      const prefsPath = path.join(dataDir, 'window-prefs.json');
      /** @type {Record<string, any>} */
      let existing = {};
      try {
        if (fs.existsSync(prefsPath)) {
          existing = JSON.parse(fs.readFileSync(prefsPath, 'utf8')) || {};
        }
      } catch {
        existing = {};
      }
      const nextPrefs = {
        closeBehavior: mergedSettings.closeBehavior || existing.closeBehavior || 'ask',
        launchAtStartup:
          mergedSettings.launchAtStartup !== undefined
            ? Boolean(mergedSettings.launchAtStartup)
            : Boolean(existing.launchAtStartup),
        launchMinimizedToTray:
          existing.launchMinimizedToTray !== undefined
            ? Boolean(existing.launchMinimizedToTray)
            : false,
        globalQuickAdd:
          mergedSettings.globalQuickAddShortcut !== undefined
            ? Boolean(mergedSettings.globalQuickAddShortcut)
            : existing.globalQuickAdd !== undefined
              ? Boolean(existing.globalQuickAdd)
              : true,
        globalQuickAddKey:
          typeof mergedSettings.globalQuickAddShortcutKey === 'string' &&
          mergedSettings.globalQuickAddShortcutKey.trim()
            ? mergedSettings.globalQuickAddShortcutKey.trim()
            : typeof existing.globalQuickAddKey === 'string' && existing.globalQuickAddKey.trim()
              ? existing.globalQuickAddKey.trim()
              : 'CommandOrControl+Alt+N',
        voiceShortcutEnabled:
          mergedSettings.voiceShortcutEnabled !== undefined
            ? Boolean(mergedSettings.voiceShortcutEnabled)
            : existing.voiceShortcutEnabled !== undefined
              ? Boolean(existing.voiceShortcutEnabled)
              : true,
        voiceShortcut:
          typeof mergedSettings.voiceShortcut === 'string' && mergedSettings.voiceShortcut.trim()
            ? mergedSettings.voiceShortcut.trim()
            : typeof existing.voiceShortcut === 'string' && existing.voiceShortcut.trim()
              ? existing.voiceShortcut.trim()
              : 'CommandOrControl+Alt+D',
      };
      fs.writeFileSync(prefsPath, JSON.stringify(nextPrefs, null, 2), 'utf8');

      if (
        process.platform === 'win32' &&
        patch.launchAtStartup !== undefined &&
        !process.env.AGENDAMEA_DATA_DIR
      ) {
        const exeCandidates = [
          process.env.LOCALAPPDATA
            ? path.join(process.env.LOCALAPPDATA, 'Programs', 'Agendamea', 'Agendamea.exe')
            : null,
          process.env.ProgramFiles
            ? path.join(process.env.ProgramFiles, 'Agendamea', 'Agendamea.exe')
            : null,
        ].filter(Boolean);
        const appExe = exeCandidates.find((p) => fs.existsSync(p));
        if (appExe) {
          const regArgs = nextPrefs.launchAtStartup
            ? [
                'add',
                'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run',
                '/v',
                'Agendamea',
                '/t',
                'REG_SZ',
                '/d',
                `"${appExe}" --minimized`,
                '/f',
              ]
            : [
                'delete',
                'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run',
                '/v',
                'Agendamea',
                '/f',
              ];
          execFile('reg.exe', regArgs, { windowsHide: true, timeout: 2500 }, () => {
            // Best-effort startup registry sync
          });
        }
      }
    }

    if (
      patch.appIconId !== undefined ||
      patch.customIconColor !== undefined ||
      patch.themeId !== undefined ||
      patch.customThemeColor !== undefined
    ) {
      const iconGenPath = path.resolve(__dirname, '..', '..', 'electron', 'iconGenerator.cjs');
      if (fs.existsSync(iconGenPath)) {
        const iconGen = require(iconGenPath);
        const iconId = mergedSettings.appIconId || 'match-theme';
        let bg = '#18181b';
        let fg = '#ffffff';
        if (iconId === 'custom' && mergedSettings.customIconColor) {
          bg = mergedSettings.customIconColor;
        } else if (iconId === 'match-theme') {
          if (mergedSettings.themeId === 'custom' && mergedSettings.customThemeColor) {
            bg = mergedSettings.customThemeColor;
          } else if (ICON_COLOR_MAP[mergedSettings.themeId]) {
            bg = ICON_COLOR_MAP[mergedSettings.themeId].bg;
            fg = ICON_COLOR_MAP[mergedSettings.themeId].fg;
          }
        } else if (ICON_COLOR_MAP[iconId]) {
          bg = ICON_COLOR_MAP[iconId].bg;
          fg = ICON_COLOR_MAP[iconId].fg;
        }
        iconGen.ensureDynamicIconFiles(dataDir, bg, fg);
      }
    }
  } catch {
    // Non-critical OS sync must never break core setting persistence
  }
}

async function listTrash(options = {}) {
  const { bootstrap } = await getBootstrap();
  const typeFilter = options.typeFilter || 'all';
  const sortBy = options.sortBy || 'newest';
  const from =
    typeof options.dateFrom === 'string' && isValidIsoDate(options.dateFrom)
      ? options.dateFrom.trim()
      : '';
  const to =
    typeof options.dateTo === 'string' && isValidIsoDate(options.dateTo)
      ? options.dateTo.trim()
      : '';
  const minB = from && to && from > to ? to : from;
  const maxB = from && to && from > to ? from : to;

  const matchDelDate = (iso) => {
    if (!minB && !maxB) return true;
    if (!iso) return false;
    const dt = new Date(iso);
    if (Number.isNaN(dt.getTime())) return false;
    const key = formatLocalDate(dt);
    if (minB && key < minB) return false;
    if (maxB && key > maxB) return false;
    return true;
  };

  const sortItems = (items, getName) =>
    [...items].sort((a, b) => {
      if (sortBy === 'oldest') {
        return String(a.deletedAt || '').localeCompare(String(b.deletedAt || ''));
      }
      if (sortBy === 'az') {
        return String(getName(a) || '').localeCompare(String(getName(b) || ''), 'tr-TR');
      }
      if (sortBy === 'za') {
        return String(getName(b) || '').localeCompare(String(getName(a) || ''), 'tr-TR');
      }
      return String(b.deletedAt || '').localeCompare(String(a.deletedAt || ''));
    });

  const rawQ = String(options.query || '').trim();
  const rawTagQ = rawQ.replace(/^#+/, '');
  const categories = sortItems(
    typeFilter === 'todos'
      ? []
      : (bootstrap.trashedCategories || []).filter((c) => {
          if (!matchDelDate(c.deletedAt)) return false;
          if (!rawQ) return true;
          return textNormalize.matchesNormalized(c.name, rawQ);
        }),
    (c) => c.name,
  );

  const todos = sortItems(
    typeFilter === 'categories'
      ? []
      : (bootstrap.trashedTodos || []).filter((t) => {
          if (!matchDelDate(t.deletedAt)) return false;
          if (!rawQ) return true;
          return (
            textNormalize.matchesNormalized(t.title, rawQ) ||
            textNormalize.matchesNormalized(t.notes, rawQ) ||
            (Array.isArray(t.tags) &&
              t.tags.some((tg) => textNormalize.matchesNormalized(tg, rawTagQ))) ||
            (Array.isArray(t.subtasks) &&
              t.subtasks.some((s) => textNormalize.matchesNormalized(s.title, rawQ)))
          );
        }),
    (t) => t.title,
  );

  return { categories, todos };
}

async function restoreItem(selectorOpt, itemType = 'auto') {
  const pickTarget = (boot) => {
    const trashedTodos = [...(boot.trashedTodos || [])].sort((a, b) =>
      String(b.deletedAt || '').localeCompare(String(a.deletedAt || '')),
    );
    const trashedCats = [...(boot.trashedCategories || [])].sort((a, b) =>
      String(b.deletedAt || '').localeCompare(String(a.deletedAt || '')),
    );
    const cleanSel = selectorOpt ? String(selectorOpt).trim() : '';

    if (itemType === 'category') {
      if (trashedCats.length === 0) throw new Error('No deleted categories in Trash.');
      return {
        kind: 'category',
        item: cleanSel ? resolveCategorySelector(trashedCats, cleanSel) : trashedCats[0],
      };
    }
    if (itemType === 'todo' || (trashedTodos.length > 0 && (!cleanSel || itemType === 'auto'))) {
      if (cleanSel) {
        try {
          return { kind: 'todo', item: resolveTaskSelector(trashedTodos, cleanSel) };
        } catch {
          if (itemType === 'auto' && trashedCats.length > 0) {
            return { kind: 'category', item: resolveCategorySelector(trashedCats, cleanSel) };
          }
          throw new Error(`Trashed item not found: "${cleanSel}".`);
        }
      }
      if (trashedTodos.length > 0) return { kind: 'todo', item: trashedTodos[0] };
    }
    if (trashedCats.length > 0) {
      return {
        kind: 'category',
        item: cleanSel ? resolveCategorySelector(trashedCats, cleanSel) : trashedCats[0],
      };
    }
    throw new Error('Trash is empty.');
  };

  const baseUrl = await resolveApiBaseUrl();
  if (baseUrl) {
    const boot = await httpRequest(baseUrl, 'GET', '/api/bootstrap');
    const picked = pickTarget(boot);
    const pathUrl =
      picked.kind === 'category'
        ? `/api/categories/${encodeURIComponent(picked.item.id)}/restore`
        : `/api/todos/${encodeURIComponent(picked.item.id)}/restore`;
    const restored = await httpRequest(baseUrl, 'POST', pathUrl);
    return { kind: picked.kind, item: restored };
  }
  const { result, settings } = withOfflineDb((db) => {
    const boot = getBootstrapOffline(db);
    const picked = pickTarget(boot);
    const now = new Date().toISOString();
    if (picked.kind === 'category') {
      db.prepare('UPDATE categories SET deleted_at = NULL WHERE id = ?').run(picked.item.id);
      const item = mapCategoryRow(
        db.prepare('SELECT * FROM categories WHERE id = ?').get(picked.item.id),
      );
      flushOfflineAutoSync(db);
      return { result: { kind: 'category', item }, settings: readSettingsOffline(db) };
    }
    db.prepare('UPDATE todos SET deleted_at = NULL, updated_at = ? WHERE id = ?').run(
      now,
      picked.item.id,
    );
    const row = db.prepare('SELECT * FROM todos WHERE id = ?').get(picked.item.id);
    const item = attachSubtasksOffline(db, [row])[0];
    flushOfflineAutoSync(db);
    return { result: { kind: 'todo', item }, settings: readSettingsOffline(db) };
  });
  if (result.kind === 'todo') {
    await dispatchConfiguredWebhookOffline(settings, 'todo.restored', result.item);
  } else if (result.kind === 'category') {
    await dispatchConfiguredWebhookOffline(settings, 'category.restored', result.item);
  }
  return result;
}

async function restoreLastTrashed(selectorOpt) {
  const res = await restoreItem(selectorOpt, 'auto');
  return res.item;
}

async function permanentDeleteItem(selector, itemType = 'auto') {
  const baseUrl = await resolveApiBaseUrl();
  const findInBoot = (boot) => {
    const trashedTodos = boot.trashedTodos || [];
    const trashedCats = boot.trashedCategories || [];
    if (itemType === 'category') {
      return { kind: 'category', item: resolveCategorySelector(trashedCats, selector) };
    }
    try {
      return { kind: 'todo', item: resolveTaskSelector(trashedTodos, selector) };
    } catch {
      if (itemType === 'auto' && trashedCats.length > 0) {
        return { kind: 'category', item: resolveCategorySelector(trashedCats, selector) };
      }
      throw new Error(`Trashed item not found: "${selector}".`);
    }
  };

  if (baseUrl) {
    const boot = await httpRequest(baseUrl, 'GET', '/api/bootstrap');
    const picked = findInBoot(boot);
    const endpoint =
      picked.kind === 'category'
        ? `/api/categories/${encodeURIComponent(picked.item.id)}/permanent`
        : `/api/todos/${encodeURIComponent(picked.item.id)}/permanent`;
    await httpRequest(baseUrl, 'DELETE', endpoint);
    return {
      ok: true,
      kind: picked.kind,
      id: picked.item.id,
      label: picked.item.title || picked.item.name,
    };
  }
  return withOfflineDb((db) => {
    const boot = getBootstrapOffline(db);
    const picked = findInBoot(boot);
    if (picked.kind === 'category') {
      db.prepare('DELETE FROM categories WHERE id = ? AND deleted_at IS NOT NULL').run(
        picked.item.id,
      );
    } else {
      db.prepare('DELETE FROM todos WHERE id = ? AND deleted_at IS NOT NULL').run(picked.item.id);
    }
    flushOfflineAutoSync(db);
    return {
      ok: true,
      kind: picked.kind,
      id: picked.item.id,
      label: picked.item.title || picked.item.name,
    };
  });
}

async function emptyTrash() {
  const baseUrl = await resolveApiBaseUrl();
  if (baseUrl) {
    return httpRequest(baseUrl, 'DELETE', '/api/trash');
  }
  const { res, settings } = withOfflineDb((db) => {
    const delTodos = db.prepare('DELETE FROM todos WHERE deleted_at IS NOT NULL').run().changes;
    const delCats = db.prepare('DELETE FROM categories WHERE deleted_at IS NOT NULL').run().changes;
    flushOfflineAutoSync(db);
    return {
      res: { ok: true, deletedTodos: delTodos, deletedCategories: delCats },
      settings: readSettingsOffline(db),
    };
  });
  await dispatchConfiguredWebhookOffline(settings, 'trash.emptied', res);
  return res;
}

async function getSettings() {
  const { bootstrap } = await getBootstrap();
  return bootstrap.settings;
}

async function updateSettings(patch) {
  const baseUrl = await resolveApiBaseUrl();
  let updated;
  if (baseUrl) {
    updated = await httpRequest(baseUrl, 'PATCH', '/api/settings', patch);
  } else {
    updated = withOfflineDb((db) => {
      db.transaction(() => {
        writeSettingsPatchOffline(db, patch);
      })();
      return readSettingsOffline(db);
    });
  }
  syncOsSettingsBridge(patch, updated);
  return updated;
}

async function exportBackup(outFilePath) {
  const { bootstrap } = await getBootstrap();
  const payload = {
    exportedAt: new Date().toISOString(),
    app: 'Agendamea',
    version: APP_VERSION,
    ...bootstrap,
  };
  if (typeof outFilePath === 'string' && outFilePath.trim()) {
    const resolved = path.resolve(outFilePath.trim());
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    fs.writeFileSync(resolved, JSON.stringify(payload, null, 2), 'utf8');
    return {
      ok: true,
      filePath: resolved,
      todos: bootstrap.todos.length,
      categories: bootstrap.categories.length,
    };
  }
  return payload;
}

async function importBackup(payloadOrFilePath) {
  let payload = payloadOrFilePath;
  if (typeof payloadOrFilePath === 'string') {
    const resolved = path.resolve(payloadOrFilePath.trim());
    if (!fs.existsSync(resolved)) throw new Error(`Backup file not found: ${resolved}`);
    payload = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Invalid JSON backup payload.');
  }

  const baseUrl = await resolveApiBaseUrl();
  if (baseUrl) {
    return httpRequest(baseUrl, 'POST', '/api/import', payload);
  }

  const { restored, settings } = withOfflineDb((db) => {
    const now = new Date().toISOString();
    const allCats = [
      ...(Array.isArray(payload.categories)
        ? payload.categories.map((c) => ({ ...c, _t: false }))
        : []),
      ...(Array.isArray(payload.trashedCategories)
        ? payload.trashedCategories.map((c) => ({ ...c, _t: true }))
        : []),
    ];
    const allTodos = [
      ...(Array.isArray(payload.todos) ? payload.todos.map((t) => ({ ...t, _t: false })) : []),
      ...(Array.isArray(payload.trashedTodos)
        ? payload.trashedTodos.map((t) => ({ ...t, _t: true }))
        : []),
    ];

    const tx = db.transaction(() => {
      db.prepare('DELETE FROM todo_embedding_chunks').run();
      db.prepare('DELETE FROM webhook_reminder_dispatches').run();
      db.prepare('DELETE FROM subtasks').run();
      db.prepare('DELETE FROM todos').run();
      db.prepare('DELETE FROM categories').run();

      const validCatIds = new Set();
      const catStmt = db.prepare(
        'INSERT INTO categories (id, name, color, pinned, sort_order, created_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      );
      allCats.forEach((c, idx) => {
        if (!c || typeof c.name !== 'string' || !c.name.trim()) return;
        const id =
          typeof c.id === 'string' && c.id.trim() ? c.id.trim() : `cat-${crypto.randomUUID()}`;
        if (validCatIds.has(id)) return;
        validCatIds.add(id);
        catStmt.run(
          id,
          c.name.trim().slice(0, 60),
          normalizeHexColor(c.color) || '#2563eb',
          c.pinned ? 1 : 0,
          Number.isFinite(Number(c.sortOrder)) ? Math.trunc(Number(c.sortOrder)) : idx,
          typeof c.createdAt === 'string' ? c.createdAt : now,
          c._t || c.deletedAt ? (typeof c.deletedAt === 'string' ? c.deletedAt : now) : null,
        );
      });

      const seenTodoIds = new Set();
      const todoStmt = db.prepare(
        `INSERT INTO todos (id, title, notes, completed, important, pinned, priority, start_date, due_date, due_time, tags, category_id, sort_order, created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      const subStmt = db.prepare(
        'INSERT INTO subtasks (id, todo_id, title, completed, sort_order) VALUES (?, ?, ?, ?, ?)',
      );
      allTodos.forEach((t, idx) => {
        if (!t || typeof t.title !== 'string' || !t.title.trim()) return;
        const id =
          typeof t.id === 'string' && t.id.trim() ? t.id.trim() : `todo-${crypto.randomUUID()}`;
        if (seenTodoIds.has(id)) return;
        seenTodoIds.add(id);
        const norm = normalizeDateRange(t.startDate, t.dueDate);
        const catId =
          typeof t.categoryId === 'string' && validCatIds.has(t.categoryId) ? t.categoryId : null;
        todoStmt.run(
          id,
          t.title.trim().slice(0, 300),
          typeof t.notes === 'string' ? t.notes.slice(0, 10000) : '',
          t.completed ? 1 : 0,
          t.important ? 1 : 0,
          t.pinned ? 1 : 0,
          t.priority === 'high' || t.priority === 'low' ? t.priority : 'normal',
          norm.startDate,
          norm.dueDate,
          sanitizeDueTime(t.dueTime),
          JSON.stringify(sanitizeTags(t.tags)),
          catId,
          Number.isFinite(Number(t.sortOrder)) ? Math.trunc(Number(t.sortOrder)) : idx,
          typeof t.createdAt === 'string' ? t.createdAt : now,
          typeof t.updatedAt === 'string' ? t.updatedAt : now,
          t._t || t.deletedAt ? (typeof t.deletedAt === 'string' ? t.deletedAt : now) : null,
        );
        if (Array.isArray(t.subtasks)) {
          t.subtasks.forEach((s, sIdx) => {
            if (!s || typeof s.title !== 'string' || !s.title.trim()) return;
            subStmt.run(
              typeof s.id === 'string' && s.id.trim() ? s.id.trim() : `sub-${crypto.randomUUID()}`,
              id,
              s.title.trim().slice(0, 200),
              s.completed ? 1 : 0,
              sIdx,
            );
          });
        }
      });

      if (payload.settings && typeof payload.settings === 'object') {
        writeSettingsPatchOffline(db, payload.settings);
      }
      db.exec("INSERT INTO todos_fts(todos_fts) VALUES('rebuild')");
    });
    tx();
    const restored = getBootstrapOffline(db);
    flushOfflineAutoSync(db);
    return { restored, settings: restored.settings };
  });
  await dispatchConfiguredWebhookOffline(settings, 'backup.imported', {
    todos: restored.todos.length,
    categories: restored.categories.length,
  });
  return restored;
}

async function resetAllData(options = {}) {
  const resetSettings = Boolean(options?.resetSettings);
  const baseUrl = await resolveApiBaseUrl();
  if (baseUrl) {
    return httpRequest(baseUrl, 'POST', '/api/reset', { resetSettings });
  }
  const { fresh, settingsBefore } = withOfflineDb((db) => {
    const before = readSettingsOffline(db);
    const currentLang = before.language || 'tr';
    todoRepository.resetAllDataTx(db, { resetSettings, currentLang });
    return { fresh: getBootstrapOffline(db), settingsBefore: before };
  });
  await dispatchConfiguredWebhookOffline(settingsBefore, 'data.reset', { resetSettings });
  return fresh;
}

module.exports = {
  syncOsSettingsBridge,
  listTrash,
  restoreItem,
  restoreLastTrashed,
  permanentDeleteItem,
  emptyTrash,
  getSettings,
  updateSettings,
  exportBackup,
  importBackup,
  resetAllData,
};
