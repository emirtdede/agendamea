'use strict';

const crypto = require('node:crypto');
const { normalizeHexColor, resolveApiBaseUrl, httpRequest } = require('./httpTransport.cjs');
const {
  withOfflineDb,
  mapCategoryRow,
  readSettingsOffline,
  getBootstrap,
} = require('./offlineDb.cjs');
const { resolveCategorySelector } = require('./taskQueries.cjs');
const { flushOfflineAutoSync } = require('./cloudSyncOffline.cjs');
const { dispatchConfiguredWebhookOffline } = require('./webhookOffline.cjs');

async function listCategories() {
  const { bootstrap } = await getBootstrap();
  const counts = new Map();
  for (const todo of bootstrap.todos) {
    if (!todo.completed && todo.categoryId) {
      counts.set(todo.categoryId, (counts.get(todo.categoryId) || 0) + 1);
    }
  }
  return bootstrap.categories.map((cat) => ({
    ...cat,
    activeTaskCount: counts.get(cat.id) || 0,
  }));
}

async function createCategory(input) {
  const name = typeof input?.name === 'string' ? input.name.trim().slice(0, 60) : '';
  if (!name) throw new Error('Category name is required.');
  const color = normalizeHexColor(input?.color) || '#2563eb';
  const pinned = Boolean(input?.pinned);

  const baseUrl = await resolveApiBaseUrl();
  if (baseUrl) {
    return httpRequest(baseUrl, 'POST', '/api/categories', { name, color, pinned });
  }
  const { created, settings } = withOfflineDb((db) => {
    const id = `cat-${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const maxRow = db
      .prepare(
        'SELECT COALESCE(MAX(sort_order), -1) AS maxOrder FROM categories WHERE deleted_at IS NULL',
      )
      .get();
    const sortOrder = Number(maxRow?.maxOrder ?? -1) + 1;
    db.prepare(
      'INSERT INTO categories (id, name, color, pinned, sort_order, created_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, NULL)',
    ).run(id, name, color, pinned ? 1 : 0, sortOrder, now);
    const createdRow = mapCategoryRow(db.prepare('SELECT * FROM categories WHERE id = ?').get(id));
    flushOfflineAutoSync(db);
    return { created: createdRow, settings: readSettingsOffline(db) };
  });
  await dispatchConfiguredWebhookOffline(settings, 'category.created', created);
  return created;
}

async function moveCategory(selector, targetPosition) {
  const pos = Number.parseInt(String(targetPosition), 10);
  if (!Number.isInteger(pos) || pos < 1) {
    throw new Error('Target position must be a positive integer (1, 2, 3...).');
  }
  const baseUrl = await resolveApiBaseUrl();
  if (baseUrl) {
    const boot = await httpRequest(baseUrl, 'GET', '/api/bootstrap');
    const cats = [...boot.categories];
    const target = resolveCategorySelector(cats, selector);
    const remaining = cats.filter((c) => c.id !== target.id);
    const insertIdx = Math.min(pos - 1, remaining.length);
    remaining.splice(insertIdx, 0, target);
    const orderedIds = remaining.map((c) => c.id);
    await httpRequest(baseUrl, 'PATCH', '/api/categories/reorder', { orderedIds });
    return { ok: true, id: target.id, name: target.name, position: insertIdx + 1, orderedIds };
  }
  return withOfflineDb((db) => {
    const cats = db
      .prepare(
        'SELECT * FROM categories WHERE deleted_at IS NULL ORDER BY pinned DESC, sort_order ASC, created_at ASC',
      )
      .all()
      .map(mapCategoryRow);
    const target = resolveCategorySelector(cats, selector);
    const remaining = cats.filter((c) => c.id !== target.id);
    const insertIdx = Math.min(pos - 1, remaining.length);
    remaining.splice(insertIdx, 0, target);
    const orderedIds = remaining.map((c) => c.id);
    const stmt = db.prepare('UPDATE categories SET sort_order = ? WHERE id = ?');
    db.transaction(() => {
      orderedIds.forEach((id, idx) => {
        stmt.run(idx, id);
      });
    })();
    flushOfflineAutoSync(db);
    return { ok: true, id: target.id, name: target.name, position: insertIdx + 1, orderedIds };
  });
}

async function updateCategory(selector, patch) {
  /** @type {Record<string, any>} */
  const cleanPatch = {};
  if (typeof patch?.name === 'string' && patch.name.trim()) {
    cleanPatch.name = patch.name.trim().slice(0, 60);
  }
  if (typeof patch?.color === 'string') {
    const norm = normalizeHexColor(patch.color);
    if (norm) cleanPatch.color = norm;
  }
  if (typeof patch?.pinned === 'boolean') cleanPatch.pinned = patch.pinned;

  const baseUrl = await resolveApiBaseUrl();
  if (baseUrl) {
    const boot = await httpRequest(baseUrl, 'GET', '/api/bootstrap');
    const target = resolveCategorySelector(boot.categories, selector);
    let updated = target;
    if (Object.keys(cleanPatch).length > 0) {
      updated = await httpRequest(
        baseUrl,
        'PATCH',
        `/api/categories/${encodeURIComponent(target.id)}`,
        cleanPatch,
      );
    }
    if (patch?.position !== undefined) {
      await moveCategory(target.id, patch.position);
    }
    return updated;
  }
  const { updated, settings } = withOfflineDb((db) => {
    const cats = db
      .prepare(
        'SELECT * FROM categories WHERE deleted_at IS NULL ORDER BY pinned DESC, sort_order ASC',
      )
      .all()
      .map(mapCategoryRow);
    const target = resolveCategorySelector(cats, selector);
    db.prepare('UPDATE categories SET name = ?, color = ?, pinned = ? WHERE id = ?').run(
      cleanPatch.name !== undefined ? cleanPatch.name : target.name,
      cleanPatch.color !== undefined ? cleanPatch.color : target.color,
      (cleanPatch.pinned !== undefined ? cleanPatch.pinned : target.pinned) ? 1 : 0,
      target.id,
    );
    flushOfflineAutoSync(db);
    return {
      updated: mapCategoryRow(db.prepare('SELECT * FROM categories WHERE id = ?').get(target.id)),
      settings: readSettingsOffline(db),
    };
  });
  if (patch?.position !== undefined) {
    await moveCategory(updated.id, patch.position);
  }
  await dispatchConfiguredWebhookOffline(settings, 'category.updated', updated);
  return updated;
}

async function deleteCategory(selector) {
  const baseUrl = await resolveApiBaseUrl();
  if (baseUrl) {
    const boot = await httpRequest(baseUrl, 'GET', '/api/bootstrap');
    const target = resolveCategorySelector(boot.categories, selector);
    await httpRequest(baseUrl, 'DELETE', `/api/categories/${encodeURIComponent(target.id)}`);
    return { ok: true, id: target.id, name: target.name, movedToTrash: true };
  }
  const { res, target, settings } = withOfflineDb((db) => {
    const cats = db
      .prepare(
        'SELECT * FROM categories WHERE deleted_at IS NULL ORDER BY pinned DESC, sort_order ASC',
      )
      .all()
      .map(mapCategoryRow);
    const found = resolveCategorySelector(cats, selector);
    const now = new Date().toISOString();
    db.prepare('UPDATE categories SET deleted_at = ? WHERE id = ?').run(now, found.id);
    flushOfflineAutoSync(db);
    return {
      res: { ok: true, id: found.id, name: found.name, movedToTrash: true },
      target: { ...found, deletedAt: now },
      settings: readSettingsOffline(db),
    };
  });
  await dispatchConfiguredWebhookOffline(settings, 'category.deleted', target);
  return res;
}

module.exports = {
  listCategories,
  createCategory,
  moveCategory,
  updateCategory,
  deleteCategory,
};
