'use strict';

const crypto = require('node:crypto');
const {
  normalizeDateRange,
  sanitizeDueTime,
  sanitizeTags,
  resolveApiBaseUrl,
  httpRequest,
} = require('./httpTransport.cjs');
const {
  withOfflineDb,
  mapCategoryRow,
  mapSubtaskRow,
  attachSubtasksOffline,
  readSettingsOffline,
  getBootstrapOffline,
  getBootstrap,
} = require('./offlineDb.cjs');
const {
  orderActiveFirst,
  resolveTaskSelector,
  resolveCategorySelector,
  resolveSubtaskSelector,
} = require('./taskQueries.cjs');
const { flushOfflineAutoSync } = require('./cloudSyncOffline.cjs');
const { dispatchConfiguredWebhookOffline } = require('./webhookOffline.cjs');

async function addTask(input) {
  const title = typeof input?.title === 'string' ? input.title.trim() : '';
  if (!title) throw new Error('Task title is required.');
  const { startDate, dueDate } = normalizeDateRange(input?.startDate, input?.dueDate);
  const dueTime = sanitizeDueTime(input?.dueTime);
  const tags = sanitizeTags(input?.tags);
  const subtasksInput = Array.isArray(input?.subtasks)
    ? input.subtasks
        .map((s) => (typeof s === 'string' ? { title: s.trim(), completed: false } : s))
        .filter((s) => s && typeof s.title === 'string' && s.title.trim())
        .map((s) => ({ title: s.title.trim().slice(0, 200), completed: Boolean(s.completed) }))
    : [];

  const baseUrl = await resolveApiBaseUrl();
  if (baseUrl) {
    let resolvedCategoryId =
      typeof input?.categoryId === 'string' && input.categoryId ? input.categoryId : null;
    if (!resolvedCategoryId && typeof input?.category === 'string' && input.category.trim()) {
      const boot = await httpRequest(baseUrl, 'GET', '/api/bootstrap');
      resolvedCategoryId = resolveCategorySelector(boot.categories, input.category.trim()).id;
    }
    return httpRequest(baseUrl, 'POST', '/api/todos', {
      title,
      notes: typeof input?.notes === 'string' ? input.notes : '',
      startDate,
      dueDate,
      dueTime,
      priority:
        input?.priority === 'high' || input?.priority === 'low' || input?.priority === 'normal'
          ? input.priority
          : 'normal',
      important: Boolean(input?.important),
      pinned: Boolean(input?.pinned),
      tags,
      categoryId: resolvedCategoryId,
      subtasks: subtasksInput,
    });
  }

  const { created, settings } = withOfflineDb((db) => {
    let resolvedCategoryId =
      typeof input?.categoryId === 'string' && input.categoryId ? input.categoryId : null;
    if (!resolvedCategoryId && typeof input?.category === 'string' && input.category.trim()) {
      const cats = db
        .prepare(
          'SELECT * FROM categories WHERE deleted_at IS NULL ORDER BY pinned DESC, sort_order ASC',
        )
        .all()
        .map(mapCategoryRow);
      resolvedCategoryId = resolveCategorySelector(cats, input.category.trim()).id;
    }

    const id = `todo-${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const minRow = db
      .prepare(
        'SELECT COALESCE(MIN(sort_order), 1) AS minOrder FROM todos WHERE deleted_at IS NULL',
      )
      .get();
    const sortOrder = Number(minRow?.minOrder ?? 1) - 1;
    const priority =
      input?.priority === 'high' || input?.priority === 'low' || input?.priority === 'normal'
        ? input.priority
        : 'normal';

    const tx = db.transaction(() => {
      db.prepare(
        `INSERT INTO todos (id, title, notes, completed, important, pinned, priority, start_date, due_date, due_time, tags, category_id, sort_order, created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
      ).run(
        id,
        title,
        typeof input?.notes === 'string' ? input.notes : '',
        input?.important ? 1 : 0,
        input?.pinned ? 1 : 0,
        priority,
        startDate,
        dueDate,
        dueTime,
        JSON.stringify(tags),
        resolvedCategoryId,
        sortOrder,
        now,
        now,
      );
      const subStmt = db.prepare(
        'INSERT INTO subtasks (id, todo_id, title, completed, sort_order) VALUES (?, ?, ?, ?, ?)',
      );
      subtasksInput.forEach((sub, idx) => {
        subStmt.run(`sub-${crypto.randomUUID()}`, id, sub.title, sub.completed ? 1 : 0, idx);
      });
    });
    tx();

    const createdRow = db.prepare('SELECT * FROM todos WHERE id = ?').get(id);
    const hydrated = attachSubtasksOffline(db, [createdRow])[0];
    flushOfflineAutoSync(db);
    return { created: hydrated, settings: readSettingsOffline(db) };
  });
  await dispatchConfiguredWebhookOffline(settings, 'todo.created', created);
  return created;
}

async function moveTask(selector, targetPosition) {
  const pos = Number.parseInt(String(targetPosition), 10);
  if (!Number.isInteger(pos) || pos < 1) {
    throw new Error('Target position must be a positive integer (1, 2, 3...).');
  }
  const computeOrder = (todos) => {
    const ordered = orderActiveFirst(todos);
    const target = resolveTaskSelector(ordered, selector);
    const active = ordered.filter((t) => !t.completed);
    const completed = ordered.filter((t) => t.completed);
    const listToEdit = target.completed ? completed : active;
    const remaining = listToEdit.filter((t) => t.id !== target.id);
    const insertIdx = Math.min(pos - 1, remaining.length);
    remaining.splice(insertIdx, 0, target);
    const orderedIds = target.completed
      ? [...active.map((t) => t.id), ...remaining.map((t) => t.id)]
      : [...remaining.map((t) => t.id), ...completed.map((t) => t.id)];
    return { target, insertIdx, orderedIds };
  };

  const baseUrl = await resolveApiBaseUrl();
  if (baseUrl) {
    const boot = await httpRequest(baseUrl, 'GET', '/api/bootstrap');
    const { target, insertIdx, orderedIds } = computeOrder(boot.todos);
    await httpRequest(baseUrl, 'PATCH', '/api/todos/reorder', { orderedIds });
    return { ok: true, id: target.id, title: target.title, position: insertIdx + 1, orderedIds };
  }
  return withOfflineDb((db) => {
    const boot = getBootstrapOffline(db);
    const { target, insertIdx, orderedIds } = computeOrder(boot.todos);
    const stmt = db.prepare('UPDATE todos SET sort_order = ? WHERE id = ?');
    db.transaction(() => {
      orderedIds.forEach((id, idx) => {
        stmt.run(idx, id);
      });
    })();
    flushOfflineAutoSync(db);
    return { ok: true, id: target.id, title: target.title, position: insertIdx + 1, orderedIds };
  });
}

async function updateTask(selector, patch) {
  /** @type {Record<string, any>} */
  const cleanPatch = {};
  if (typeof patch?.title === 'string' && patch.title.trim()) cleanPatch.title = patch.title.trim();
  if (typeof patch?.notes === 'string') cleanPatch.notes = patch.notes;
  if (typeof patch?.completed === 'boolean') cleanPatch.completed = patch.completed;
  if (typeof patch?.important === 'boolean') cleanPatch.important = patch.important;
  if (typeof patch?.pinned === 'boolean') cleanPatch.pinned = patch.pinned;
  if (patch?.priority === 'high' || patch?.priority === 'normal' || patch?.priority === 'low') {
    cleanPatch.priority = patch.priority;
  }
  if (patch?.startDate === null || typeof patch?.startDate === 'string') {
    cleanPatch.startDate = patch.startDate;
  }
  if (patch?.dueDate === null || typeof patch?.dueDate === 'string') {
    cleanPatch.dueDate = patch.dueDate;
  }
  if (patch?.dueTime === null || typeof patch?.dueTime === 'string') {
    cleanPatch.dueTime = patch.dueTime === null ? null : sanitizeDueTime(patch.dueTime);
  }
  if (Array.isArray(patch?.tags)) cleanPatch.tags = sanitizeTags(patch.tags);
  if (patch?.categoryId === null || typeof patch?.categoryId === 'string') {
    cleanPatch.categoryId = patch.categoryId;
  }

  const baseUrl = await resolveApiBaseUrl();
  if (baseUrl) {
    const boot = await httpRequest(baseUrl, 'GET', '/api/bootstrap');
    const target = resolveTaskSelector(boot.todos, selector);
    if (typeof patch?.category === 'string') {
      cleanPatch.categoryId = patch.category.trim()
        ? resolveCategorySelector(boot.categories, patch.category.trim()).id
        : null;
    }
    let updated = target;
    if (Object.keys(cleanPatch).length > 0) {
      updated = await httpRequest(
        baseUrl,
        'PATCH',
        `/api/todos/${encodeURIComponent(target.id)}`,
        cleanPatch,
      );
    }
    if (patch?.position !== undefined) {
      await moveTask(target.id, patch.position);
    }
    return updated;
  }

  const { updated, settings } = withOfflineDb((db) => {
    const boot = getBootstrapOffline(db);
    const target = resolveTaskSelector(boot.todos, selector);
    if (typeof patch?.category === 'string') {
      cleanPatch.categoryId = patch.category.trim()
        ? resolveCategorySelector(boot.categories, patch.category.trim()).id
        : null;
    }
    const nextRange = normalizeDateRange(
      cleanPatch.startDate !== undefined ? cleanPatch.startDate : target.startDate,
      cleanPatch.dueDate !== undefined ? cleanPatch.dueDate : target.dueDate,
    );
    const now = new Date().toISOString();
    db.prepare(
      'UPDATE todos SET title = ?, notes = ?, completed = ?, important = ?, pinned = ?, priority = ?, start_date = ?, due_date = ?, due_time = ?, tags = ?, category_id = ?, updated_at = ? WHERE id = ?',
    ).run(
      cleanPatch.title !== undefined ? cleanPatch.title : target.title,
      cleanPatch.notes !== undefined ? cleanPatch.notes : target.notes,
      (cleanPatch.completed !== undefined ? cleanPatch.completed : target.completed) ? 1 : 0,
      (cleanPatch.important !== undefined ? cleanPatch.important : target.important) ? 1 : 0,
      (cleanPatch.pinned !== undefined ? cleanPatch.pinned : target.pinned) ? 1 : 0,
      cleanPatch.priority !== undefined ? cleanPatch.priority : target.priority,
      nextRange.startDate,
      nextRange.dueDate,
      cleanPatch.dueTime !== undefined ? cleanPatch.dueTime : target.dueTime,
      JSON.stringify(cleanPatch.tags !== undefined ? cleanPatch.tags : target.tags || []),
      cleanPatch.categoryId !== undefined ? cleanPatch.categoryId : target.categoryId,
      now,
      target.id,
    );
    const row = db.prepare('SELECT * FROM todos WHERE id = ?').get(target.id);
    const hydrated = attachSubtasksOffline(db, [row])[0];
    flushOfflineAutoSync(db);
    return { updated: hydrated, settings: readSettingsOffline(db) };
  });
  if (patch?.position !== undefined) {
    await moveTask(updated.id, patch.position);
  }
  await dispatchConfiguredWebhookOffline(
    settings,
    cleanPatch.completed === true ? 'todo.completed' : 'todo.updated',
    updated,
  );
  return updated;
}

async function completeTask(selector, completedOpt) {
  const { bootstrap } = await getBootstrap();
  const target = resolveTaskSelector(bootstrap.todos, selector);
  const nextCompleted = completedOpt === undefined ? !target.completed : Boolean(completedOpt);
  return updateTask(target.id, { completed: nextCompleted });
}

async function batchCompleteTasks(selectors, completedOpt) {
  const baseUrl = await resolveApiBaseUrl();
  if (baseUrl) {
    const boot = await httpRequest(baseUrl, 'GET', '/api/bootstrap');
    const targets = selectors.map((sel) => resolveTaskSelector(boot.todos, sel));
    const seen = new Set();
    const results = [];
    for (const target of targets) {
      if (seen.has(target.id)) continue;
      seen.add(target.id);
      const nextCompleted = completedOpt === undefined ? !target.completed : Boolean(completedOpt);
      results.push(
        await httpRequest(baseUrl, 'PATCH', `/api/todos/${encodeURIComponent(target.id)}`, {
          completed: nextCompleted,
        }),
      );
    }
    return results;
  }

  const { results, settings } = withOfflineDb((db) => {
    const boot = getBootstrapOffline(db);
    const targets = selectors.map((sel) => resolveTaskSelector(boot.todos, sel));
    const seen = new Set();
    const uniqueTargets = [];
    for (const target of targets) {
      if (!seen.has(target.id)) {
        seen.add(target.id);
        uniqueTargets.push(target);
      }
    }
    const now = new Date().toISOString();
    const stmt = db.prepare('UPDATE todos SET completed = ?, updated_at = ? WHERE id = ?');
    db.transaction(() => {
      for (const target of uniqueTargets) {
        const nextCompleted =
          completedOpt === undefined ? !target.completed : Boolean(completedOpt);
        stmt.run(nextCompleted ? 1 : 0, now, target.id);
      }
    })();
    const updatedRows = uniqueTargets.map((t) =>
      db.prepare('SELECT * FROM todos WHERE id = ?').get(t.id),
    );
    const hydrated = attachSubtasksOffline(db, updatedRows.filter(Boolean));
    flushOfflineAutoSync(db);
    return { results: hydrated, settings: readSettingsOffline(db) };
  });
  for (const item of results) {
    await dispatchConfiguredWebhookOffline(
      settings,
      item.completed ? 'todo.completed' : 'todo.updated',
      item,
    );
  }
  return results;
}

async function pinTask(selector, pinnedOpt) {
  const { bootstrap } = await getBootstrap();
  const target = resolveTaskSelector(bootstrap.todos, selector);
  const nextPinned = pinnedOpt === undefined ? !target.pinned : Boolean(pinnedOpt);
  return updateTask(target.id, { pinned: nextPinned });
}

async function batchPinTasks(selectors, pinnedOpt) {
  const baseUrl = await resolveApiBaseUrl();
  if (baseUrl) {
    const boot = await httpRequest(baseUrl, 'GET', '/api/bootstrap');
    const targets = selectors.map((sel) => resolveTaskSelector(boot.todos, sel));
    const seen = new Set();
    const results = [];
    for (const target of targets) {
      if (seen.has(target.id)) continue;
      seen.add(target.id);
      const nextPinned = pinnedOpt === undefined ? !target.pinned : Boolean(pinnedOpt);
      results.push(
        await httpRequest(baseUrl, 'PATCH', `/api/todos/${encodeURIComponent(target.id)}`, {
          pinned: nextPinned,
        }),
      );
    }
    return results;
  }

  const { results, settings } = withOfflineDb((db) => {
    const boot = getBootstrapOffline(db);
    const targets = selectors.map((sel) => resolveTaskSelector(boot.todos, sel));
    const seen = new Set();
    const uniqueTargets = [];
    for (const target of targets) {
      if (!seen.has(target.id)) {
        seen.add(target.id);
        uniqueTargets.push(target);
      }
    }
    const now = new Date().toISOString();
    const stmt = db.prepare('UPDATE todos SET pinned = ?, updated_at = ? WHERE id = ?');
    db.transaction(() => {
      for (const target of uniqueTargets) {
        const nextPinned = pinnedOpt === undefined ? !target.pinned : Boolean(pinnedOpt);
        stmt.run(nextPinned ? 1 : 0, now, target.id);
      }
    })();
    const updatedRows = uniqueTargets.map((t) =>
      db.prepare('SELECT * FROM todos WHERE id = ?').get(t.id),
    );
    const hydrated = attachSubtasksOffline(db, updatedRows.filter(Boolean));
    flushOfflineAutoSync(db);
    return { results: hydrated, settings: readSettingsOffline(db) };
  });
  for (const item of results) {
    await dispatchConfiguredWebhookOffline(settings, 'todo.updated', item);
  }
  return results;
}

async function deleteTask(selector) {
  const baseUrl = await resolveApiBaseUrl();
  if (baseUrl) {
    const boot = await httpRequest(baseUrl, 'GET', '/api/bootstrap');
    const target = resolveTaskSelector(boot.todos, selector);
    await httpRequest(baseUrl, 'DELETE', `/api/todos/${encodeURIComponent(target.id)}`);
    return { ok: true, id: target.id, title: target.title, movedToTrash: true };
  }
  const { result, target, settings } = withOfflineDb((db) => {
    const boot = getBootstrapOffline(db);
    const found = resolveTaskSelector(boot.todos, selector);
    const now = new Date().toISOString();
    db.prepare('UPDATE todos SET deleted_at = ?, updated_at = ? WHERE id = ?').run(
      now,
      now,
      found.id,
    );
    flushOfflineAutoSync(db);
    return {
      result: { ok: true, id: found.id, title: found.title, movedToTrash: true },
      target: { ...found, deletedAt: now },
      settings: readSettingsOffline(db),
    };
  });
  await dispatchConfiguredWebhookOffline(settings, 'todo.deleted', target);
  return result;
}

async function batchDeleteTasks(selectors) {
  const baseUrl = await resolveApiBaseUrl();
  if (baseUrl) {
    const boot = await httpRequest(baseUrl, 'GET', '/api/bootstrap');
    const targets = selectors.map((sel) => resolveTaskSelector(boot.todos, sel));
    const seen = new Set();
    const results = [];
    for (const target of targets) {
      if (seen.has(target.id)) continue;
      seen.add(target.id);
      await httpRequest(baseUrl, 'DELETE', `/api/todos/${encodeURIComponent(target.id)}`);
      results.push({ ok: true, id: target.id, title: target.title, movedToTrash: true });
    }
    return results;
  }

  const { results, deletedTargets, settings } = withOfflineDb((db) => {
    const boot = getBootstrapOffline(db);
    const targets = selectors.map((sel) => resolveTaskSelector(boot.todos, sel));
    const seen = new Set();
    const uniqueTargets = [];
    for (const target of targets) {
      if (!seen.has(target.id)) {
        seen.add(target.id);
        uniqueTargets.push(target);
      }
    }
    const now = new Date().toISOString();
    const stmt = db.prepare('UPDATE todos SET deleted_at = ?, updated_at = ? WHERE id = ?');
    db.transaction(() => {
      for (const found of uniqueTargets) {
        stmt.run(now, now, found.id);
      }
    })();
    flushOfflineAutoSync(db);
    return {
      results: uniqueTargets.map((found) => ({
        ok: true,
        id: found.id,
        title: found.title,
        movedToTrash: true,
      })),
      deletedTargets: uniqueTargets.map((found) => ({ ...found, deletedAt: now })),
      settings: readSettingsOffline(db),
    };
  });
  for (const target of deletedTargets) {
    await dispatchConfiguredWebhookOffline(settings, 'todo.deleted', target);
  }
  return results;
}

async function clearCompleted(categoryOpt) {
  const baseUrl = await resolveApiBaseUrl();
  if (baseUrl) {
    let catId = null;
    if (typeof categoryOpt === 'string' && categoryOpt.trim()) {
      const boot = await httpRequest(baseUrl, 'GET', '/api/bootstrap');
      catId = resolveCategorySelector(boot.categories, categoryOpt.trim()).id;
    }
    const query = catId ? `?categoryId=${encodeURIComponent(catId)}` : '';
    const res = await httpRequest(baseUrl, 'DELETE', `/api/todos/completed${query}`);
    return {
      ok: true,
      clearedCount: Array.isArray(res?.trashedTodos) ? res.trashedTodos.length : 0,
    };
  }
  const { res, settings } = withOfflineDb((db) => {
    const boot = getBootstrapOffline(db);
    let catId = null;
    if (typeof categoryOpt === 'string' && categoryOpt.trim()) {
      catId = resolveCategorySelector(boot.categories, categoryOpt.trim()).id;
    }
    const now = new Date().toISOString();
    const info = catId
      ? db
          .prepare(
            'UPDATE todos SET deleted_at = ?, updated_at = ? WHERE completed = 1 AND deleted_at IS NULL AND category_id = ?',
          )
          .run(now, now, catId)
      : db
          .prepare(
            'UPDATE todos SET deleted_at = ?, updated_at = ? WHERE completed = 1 AND deleted_at IS NULL',
          )
          .run(now, now);
    flushOfflineAutoSync(db);
    return {
      res: { ok: true, clearedCount: info.changes, categoryId: catId },
      settings: readSettingsOffline(db),
    };
  });
  await dispatchConfiguredWebhookOffline(settings, 'todos.cleared_completed', res);
  return res;
}

async function addSubtask(taskSelector, title) {
  const cleanTitle = typeof title === 'string' ? title.trim().slice(0, 200) : '';
  if (!cleanTitle) throw new Error('Subtask title is required.');

  const baseUrl = await resolveApiBaseUrl();
  if (baseUrl) {
    const boot = await httpRequest(baseUrl, 'GET', '/api/bootstrap');
    const task = resolveTaskSelector(boot.todos, taskSelector);
    return httpRequest(baseUrl, 'POST', `/api/todos/${encodeURIComponent(task.id)}/subtasks`, {
      title: cleanTitle,
    });
  }
  const { created, settings } = withOfflineDb((db) => {
    const boot = getBootstrapOffline(db);
    const task = resolveTaskSelector(boot.todos, taskSelector);
    const maxRow = db
      .prepare('SELECT COALESCE(MAX(sort_order), -1) AS maxOrder FROM subtasks WHERE todo_id = ?')
      .get(task.id);
    const id = `sub-${crypto.randomUUID()}`;
    db.prepare(
      'INSERT INTO subtasks (id, todo_id, title, completed, sort_order) VALUES (?, ?, ?, 0, ?)',
    ).run(id, task.id, cleanTitle, Number(maxRow?.maxOrder ?? -1) + 1);
    const row = mapSubtaskRow(db.prepare('SELECT * FROM subtasks WHERE id = ?').get(id));
    flushOfflineAutoSync(db);
    return { created: row, settings: readSettingsOffline(db) };
  });
  await dispatchConfiguredWebhookOffline(settings, 'subtask.created', created);
  return created;
}

async function updateSubtask(taskSelector, subtaskSelector, patch) {
  /** @type {Record<string, any>} */
  const cleanPatch = {};
  if (typeof patch?.title === 'string' && patch.title.trim()) {
    cleanPatch.title = patch.title.trim().slice(0, 200);
  }
  if (typeof patch?.completed === 'boolean') {
    cleanPatch.completed = patch.completed;
  }
  const baseUrl = await resolveApiBaseUrl();
  if (baseUrl) {
    const boot = await httpRequest(baseUrl, 'GET', '/api/bootstrap');
    const task = resolveTaskSelector(boot.todos, taskSelector);
    const sub = resolveSubtaskSelector(task.subtasks, subtaskSelector);
    return httpRequest(baseUrl, 'PATCH', `/api/subtasks/${encodeURIComponent(sub.id)}`, cleanPatch);
  }
  const { updated, settings } = withOfflineDb((db) => {
    const boot = getBootstrapOffline(db);
    const task = resolveTaskSelector(boot.todos, taskSelector);
    const sub = resolveSubtaskSelector(task.subtasks, subtaskSelector);
    db.prepare('UPDATE subtasks SET title = ?, completed = ? WHERE id = ?').run(
      cleanPatch.title !== undefined ? cleanPatch.title : sub.title,
      (cleanPatch.completed !== undefined ? cleanPatch.completed : sub.completed) ? 1 : 0,
      sub.id,
    );
    flushOfflineAutoSync(db);
    return {
      updated: mapSubtaskRow(db.prepare('SELECT * FROM subtasks WHERE id = ?').get(sub.id)),
      settings: readSettingsOffline(db),
    };
  });
  await dispatchConfiguredWebhookOffline(settings, 'subtask.updated', updated);
  return updated;
}

async function toggleSubtask(taskSelector, subtaskSelector, completedOpt) {
  const { bootstrap } = await getBootstrap();
  const task = resolveTaskSelector(bootstrap.todos, taskSelector);
  const sub = resolveSubtaskSelector(task.subtasks, subtaskSelector);
  const nextCompleted = completedOpt === undefined ? !sub.completed : Boolean(completedOpt);
  return updateSubtask(task.id, sub.id, { completed: nextCompleted });
}

async function deleteSubtask(taskSelector, subtaskSelector) {
  const baseUrl = await resolveApiBaseUrl();
  if (baseUrl) {
    const boot = await httpRequest(baseUrl, 'GET', '/api/bootstrap');
    const task = resolveTaskSelector(boot.todos, taskSelector);
    const sub = resolveSubtaskSelector(task.subtasks, subtaskSelector);
    await httpRequest(baseUrl, 'DELETE', `/api/subtasks/${encodeURIComponent(sub.id)}`);
    return { ok: true, id: sub.id, title: sub.title };
  }
  const { res, settings } = withOfflineDb((db) => {
    const boot = getBootstrapOffline(db);
    const task = resolveTaskSelector(boot.todos, taskSelector);
    const sub = resolveSubtaskSelector(task.subtasks, subtaskSelector);
    db.prepare('DELETE FROM subtasks WHERE id = ?').run(sub.id);
    flushOfflineAutoSync(db);
    return { res: { ok: true, id: sub.id, title: sub.title }, settings: readSettingsOffline(db) };
  });
  await dispatchConfiguredWebhookOffline(settings, 'subtask.deleted', res);
  return res;
}

module.exports = {
  addTask,
  moveTask,
  updateTask,
  completeTask,
  batchCompleteTasks,
  pinTask,
  batchPinTasks,
  batchDeleteTasks,
  deleteTask,
  clearCompleted,
  addSubtask,
  updateSubtask,
  toggleSubtask,
  deleteSubtask,
};
