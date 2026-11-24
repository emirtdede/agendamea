import taskQueries from '../../shared/store/taskQueries.cjs';
import textNormalize from '../../shared/textNormalize.cjs';
import type { Todo } from '../../src/types.ts';
import { getLocalDateString } from '../../src/utils/todoLogic.ts';
import type { ServerContext } from '../types.ts';
import { createMcpAdminOps } from './mcpAdminOps.ts';

const {
  resolveTaskSelector,
  resolveCategorySelector,
  isScheduledToday: matchesToday,
  applyTaskFilters,
  buildEisenhowerMatrix,
  buildCalendarAgenda,
  buildKanbanBoard,
} = taskQueries;

/**
 * 100% In-Process MCP Store Adapter (Arch #3).
 * Reuses shared/store/taskQueries.cjs for selector, filter, matrix, calendar, and kanban logic
 * with zero loopback HTTP requests.
 */
export function createMcpInProcessStore(ctx: ServerContext) {
  const { db, cloudSync, webhooks, aiRuntime, appVersion } = ctx;

  function notifyMutation(reason: string, opts?: { rag?: boolean; cloud?: boolean }) {
    ctx.broadcastExternalChange(`MCP ${reason}`);
    if (opts?.cloud !== false) cloudSync.triggerOneDriveAutoSync();
    if (opts?.rag) aiRuntime.scheduleBackgroundRagSync();
  }

  const adminOps = createMcpAdminOps(ctx, notifyMutation);

  function getTodayStr(): string {
    return getLocalDateString();
  }

  async function getStatus() {
    const today = getTodayStr();
    const todos = db.getTodos();
    const categories = db.getCategories();
    const trashedTodos = db.getTrashedTodos();
    const trashedCategories = db.getTrashedCategories();
    const active = todos.filter((t) => !t.completed);
    const completed = todos.filter((t) => t.completed);
    const dueTodayCount = active.filter((t) => matchesToday(t, today)).length;
    const importantCount = active.filter((t) => t.important).length;
    const pinnedCount = active.filter((t) => t.pinned).length;
    const port = ctx.getActiveListenPort();
    return {
      ok: true,
      mode: 'in-process',
      endpoint: port ? `http://127.0.0.1:${port}` : null,
      port,
      version: appVersion,
      activeTasks: active.length,
      dueToday: dueTodayCount,
      todayTasks: dueTodayCount,
      important: importantCount,
      importantTasks: importantCount,
      pinned: pinnedCount,
      pinnedTasks: pinnedCount,
      completedTasks: completed.length,
      categories: categories.length,
      trashCount: trashedTodos.length + trashedCategories.length,
      trashedTasks: trashedTodos.length,
      trashedCategories: trashedCategories.length,
    };
  }

  async function listTasks(
    options: {
      filter?: string;
      category?: string;
      priority?: string;
      tag?: string;
      query?: string;
      dateFrom?: string;
      dateTo?: string;
      sortBy?: string;
    } = {},
  ) {
    return applyTaskFilters(db.getTodos(), db.getCategories(), {
      ...options,
      today: getTodayStr(),
      tolerateMissingCategory: true,
    });
  }

  async function getTask(selector: string) {
    const task = resolveTaskSelector(db.getTodos(), selector);
    const category = task.categoryId
      ? (db.getCategories().find((c) => c.id === task.categoryId) ?? null)
      : null;
    return { ...task, categoryName: category ? category.name : null };
  }

  async function addTask(input: Record<string, unknown>) {
    let categoryId = typeof input.categoryId === 'string' ? input.categoryId : null;
    if (!categoryId && typeof input.category === 'string' && input.category.trim()) {
      const cats = db.getCategories();
      const found =
        cats.find((c) => textNormalize.equalsNormalized(c.name, String(input.category))) ??
        cats.find((c) => textNormalize.matchesNormalized(c.name, String(input.category)));
      if (found) categoryId = found.id;
    }
    const subtasks = Array.isArray(input.subtasks)
      ? input.subtasks
          .map((s) =>
            typeof s === 'string'
              ? { title: s.trim(), completed: false }
              : s && typeof s === 'object' && 'title' in s
                ? {
                    title: String((s as { title: unknown }).title),
                    completed: Boolean((s as { completed?: unknown }).completed),
                  }
                : null,
          )
          .filter((x): x is { title: string; completed: boolean } => Boolean(x?.title))
      : undefined;

    const created = db.createTodo({
      title: String(input.title || ''),
      notes: typeof input.notes === 'string' ? input.notes : undefined,
      startDate: typeof input.startDate === 'string' ? input.startDate : undefined,
      dueDate: typeof input.dueDate === 'string' ? input.dueDate : undefined,
      dueTime: typeof input.dueTime === 'string' ? input.dueTime : undefined,
      priority:
        input.priority === 'high' || input.priority === 'low' || input.priority === 'normal'
          ? input.priority
          : undefined,
      important: typeof input.important === 'boolean' ? input.important : undefined,
      pinned: typeof input.pinned === 'boolean' ? input.pinned : undefined,
      tags: Array.isArray(input.tags)
        ? input.tags.filter((x): x is string => typeof x === 'string')
        : undefined,
      categoryId,
      subtasks,
    });
    webhooks.dispatchConfiguredWebhook('todo.created', created);
    notifyMutation('add_task', { rag: true });
    return created;
  }

  async function updateTask(selector: string, input: Record<string, unknown>) {
    const target = resolveTaskSelector(db.getTodos(), selector);
    let categoryId: string | null | undefined =
      input.categoryId === null || typeof input.categoryId === 'string'
        ? input.categoryId
        : undefined;
    if (categoryId === undefined && typeof input.category === 'string') {
      categoryId = input.category.trim()
        ? resolveCategorySelector(db.getCategories(), input.category).id
        : null;
    }

    const updated = db.updateTodo(target.id, {
      title: typeof input.title === 'string' ? input.title : undefined,
      notes: typeof input.notes === 'string' ? input.notes : undefined,
      completed: typeof input.completed === 'boolean' ? input.completed : undefined,
      important: typeof input.important === 'boolean' ? input.important : undefined,
      pinned: typeof input.pinned === 'boolean' ? input.pinned : undefined,
      priority:
        input.priority === 'high' || input.priority === 'low' || input.priority === 'normal'
          ? input.priority
          : undefined,
      startDate:
        input.startDate === null || typeof input.startDate === 'string'
          ? input.startDate
          : undefined,
      dueDate:
        input.dueDate === null || typeof input.dueDate === 'string' ? input.dueDate : undefined,
      dueTime:
        input.dueTime === null || typeof input.dueTime === 'string' ? input.dueTime : undefined,
      tags: Array.isArray(input.tags)
        ? input.tags.filter((x): x is string => typeof x === 'string')
        : undefined,
      categoryId,
    });
    if (!updated) throw new Error('Task not found.');

    if (
      typeof input.position === 'number' &&
      Number.isInteger(input.position) &&
      input.position >= 1
    ) {
      const ids = db
        .getTodos()
        .map((t) => t.id)
        .filter((id) => id !== target.id);
      const insertAt = Math.max(0, Math.min(ids.length, input.position - 1));
      ids.splice(insertAt, 0, target.id);
      db.reorderTodos(ids);
    }

    webhooks.dispatchConfiguredWebhook(
      !target.completed && updated.completed ? 'todo.completed' : 'todo.updated',
      updated,
    );
    notifyMutation('update_task', { rag: true });
    return db.getTodoById(target.id) ?? updated;
  }

  async function completeTask(selector: string, completed = true) {
    return updateTask(selector, { completed });
  }

  async function pinTask(selector: string, pinned?: boolean) {
    const target = resolveTaskSelector(db.getTodos(), selector);
    return updateTask(target.id, {
      pinned: pinned === undefined ? !target.pinned : Boolean(pinned),
    });
  }

  async function deleteTask(selector: string) {
    const target = resolveTaskSelector(db.getTodos(), selector);
    const trashed = db.softDeleteTodo(target.id);
    if (!trashed) throw new Error('Task not found.');
    webhooks.dispatchConfiguredWebhook('todo.deleted', trashed);
    notifyMutation('delete_task', { rag: true });
    return trashed;
  }

  async function clearCompleted(category?: string) {
    let catId: string | null = null;
    if (category?.trim()) {
      catId = resolveCategorySelector(db.getCategories(), category).id;
    }
    const trashedTodos = db.clearCompleted(catId);
    webhooks.dispatchConfiguredWebhook('todos.cleared_completed', {
      clearedCount: trashedTodos.length,
      categoryId: catId,
    });
    notifyMutation('clear_completed', { rag: true });
    return { ok: true, clearedCount: trashedTodos.length, trashedTodos };
  }

  function resolveSubtask(todo: Todo, subSelector: string) {
    const raw = String(subSelector || '').trim();
    if (!raw) throw new Error('Subtask number, title, or ID is required.');
    if (/^\d+$/.test(raw)) {
      const idx = Number.parseInt(raw, 10);
      const picked = idx >= 1 ? todo.subtasks[idx - 1] : undefined;
      if (picked) return picked;
      throw new Error(`Subtask #${idx} not found (1-${todo.subtasks.length}).`);
    }
    const match =
      todo.subtasks.find((s) => s.id.toLowerCase() === raw.toLowerCase()) ??
      todo.subtasks.find(
        (s) =>
          s.id.toLowerCase().startsWith(raw.toLowerCase()) ||
          textNormalize.matchesNormalized(s.title, raw),
      );
    if (!match) throw new Error(`Subtask not found: "${raw}".`);
    return match;
  }

  async function addSubtask(taskSel: string, title: string) {
    const task = resolveTaskSelector(db.getTodos(), taskSel);
    const created = db.createSubtask(task.id, title);
    if (!created) throw new Error('Task not found.');
    webhooks.dispatchConfiguredWebhook('subtask.created', created);
    notifyMutation('add_subtask', { rag: true });
    return created;
  }

  async function updateSubtask(
    taskSel: string,
    subSel: string,
    patch: { title?: string; completed?: boolean },
  ) {
    const task = resolveTaskSelector(db.getTodos(), taskSel);
    const sub = resolveSubtask(task, subSel);
    const updated = db.updateSubtask(sub.id, patch);
    if (!updated) throw new Error('Subtask not found.');
    webhooks.dispatchConfiguredWebhook('subtask.updated', updated);
    notifyMutation('update_subtask', { rag: true });
    return updated;
  }

  async function toggleSubtask(taskSel: string, subSel: string, completed?: boolean) {
    const task = resolveTaskSelector(db.getTodos(), taskSel);
    const sub = resolveSubtask(task, subSel);
    return updateSubtask(task.id, sub.id, {
      completed: completed === undefined ? !sub.completed : Boolean(completed),
    });
  }

  async function deleteSubtask(taskSel: string, subSel: string) {
    const task = resolveTaskSelector(db.getTodos(), taskSel);
    const sub = resolveSubtask(task, subSel);
    const ok = db.deleteSubtask(sub.id);
    if (!ok) throw new Error('Subtask not found.');
    webhooks.dispatchConfiguredWebhook('subtask.deleted', { id: sub.id, todoId: task.id });
    notifyMutation('delete_subtask', { rag: true });
    return { ok: true, id: sub.id };
  }

  async function listCategories() {
    const counts = new Map<string, number>();
    for (const todo of db.getTodos()) {
      if (!todo.completed && todo.categoryId) {
        counts.set(todo.categoryId, (counts.get(todo.categoryId) ?? 0) + 1);
      }
    }
    return db.getCategories().map((cat) => ({
      ...cat,
      activeTaskCount: counts.get(cat.id) ?? 0,
    }));
  }

  async function createCategory(input: { name: string; color?: string; pinned?: boolean }) {
    const created = db.createCategory(input);
    webhooks.dispatchConfiguredWebhook('category.created', created);
    notifyMutation('create_category');
    return created;
  }

  async function updateCategory(
    selector: string,
    patch: { name?: string; color?: string; pinned?: boolean; position?: number },
  ) {
    const found = resolveCategorySelector(db.getCategories(), selector);
    const updated = db.updateCategory(found.id, {
      name: patch.name,
      color: patch.color,
      pinned: patch.pinned,
    });
    if (!updated) throw new Error('Category not found.');
    if (
      typeof patch.position === 'number' &&
      Number.isInteger(patch.position) &&
      patch.position >= 1
    ) {
      const ids = db
        .getCategories()
        .map((c) => c.id)
        .filter((id) => id !== found.id);
      const insertAt = Math.max(0, Math.min(ids.length, patch.position - 1));
      ids.splice(insertAt, 0, found.id);
      db.reorderCategories(ids);
    }
    webhooks.dispatchConfiguredWebhook('category.updated', updated);
    notifyMutation('update_category');
    return db.getCategoryById(found.id) ?? updated;
  }

  async function deleteCategory(selector: string) {
    const found = resolveCategorySelector(db.getCategories(), selector);
    const trashed = db.softDeleteCategory(found.id);
    if (!trashed) throw new Error('Category not found.');
    webhooks.dispatchConfiguredWebhook('category.deleted', trashed);
    notifyMutation('delete_category');
    return trashed;
  }

  async function getMatrix() {
    return buildEisenhowerMatrix(db.getTodos(), getTodayStr());
  }

  async function getCalendarAgenda(
    opts: { dateFrom?: string; dateTo?: string; includeCompleted?: boolean } = {},
  ) {
    return buildCalendarAgenda(db.getTodos(), db.getCategories(), {
      ...opts,
      today: getTodayStr(),
    });
  }

  async function getKanbanBoard(groupBy = 'priority') {
    return buildKanbanBoard(db.getTodos(), groupBy);
  }

  return {
    APP_VERSION: appVersion,
    getTodayStr,
    getStatus,
    listTasks,
    getTask,
    addTask,
    updateTask,
    completeTask,
    pinTask,
    deleteTask,
    clearCompleted,
    addSubtask,
    updateSubtask,
    toggleSubtask,
    deleteSubtask,
    listCategories,
    createCategory,
    updateCategory,
    deleteCategory,
    getMatrix,
    getCalendarAgenda,
    getKanbanBoard,
    ...adminOps,
  };
}
