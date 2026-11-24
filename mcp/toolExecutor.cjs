'use strict';

const store = require('../shared/localStore.cjs');

async function executeTool(name, args, activeStore = store) {
  const input = args && typeof args === 'object' ? args : {};

  switch (name) {
    case 'agendamea_status':
      return activeStore.getStatus();
    case 'agendamea_list_tasks': {
      const all = await activeStore.listTasks({
        filter: input.filter || 'active',
        category: input.category,
        priority: input.priority,
        tag: input.tag,
        query: input.query,
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
        sortBy: input.sortBy,
      });
      const hasPagination = input.limit !== undefined || input.offset !== undefined;
      if (!hasPagination) return all;
      const offset = Math.max(0, Number.parseInt(String(input.offset ?? 0), 10) || 0);
      const rawLimit = Number.parseInt(String(input.limit ?? 50), 10);
      const limit = Math.max(
        1,
        Math.min(500, Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : 50),
      );
      const items = all.slice(offset, offset + limit);
      const nextOffset = offset + items.length < all.length ? offset + items.length : null;
      return {
        items,
        count: items.length,
        totalCount: all.length,
        offset,
        limit,
        hasMore: nextOffset !== null,
        nextOffset,
      };
    }
    case 'agendamea_get_task':
      return activeStore.getTask(input.id);
    case 'agendamea_add_task':
      return activeStore.addTask(input);
    case 'agendamea_update_task':
      return activeStore.updateTask(input.id, input);
    case 'agendamea_complete_task':
      return activeStore.completeTask(
        input.id,
        input.completed === undefined ? true : Boolean(input.completed),
      );
    case 'agendamea_pin_task':
      return activeStore.pinTask(input.id, input.pinned);
    case 'agendamea_delete_task':
      return activeStore.deleteTask(input.id);
    case 'agendamea_clear_completed':
      return activeStore.clearCompleted(input.category);
    case 'agendamea_manage_subtask':
      if (input.action === 'add') return activeStore.addSubtask(input.taskId, input.title);
      if (input.action === 'update') {
        return activeStore.updateSubtask(input.taskId, input.subtaskId, {
          title: input.title,
          completed: input.completed,
        });
      }
      if (input.action === 'toggle') {
        return activeStore.toggleSubtask(input.taskId, input.subtaskId, input.completed);
      }
      if (input.action === 'delete')
        return activeStore.deleteSubtask(input.taskId, input.subtaskId);
      throw new Error(`Unsupported subtask action: ${input.action}`);
    case 'agendamea_list_categories':
      return activeStore.listCategories();
    case 'agendamea_manage_category':
      if (input.action === 'create') {
        return activeStore.createCategory({
          name: input.name,
          color: input.color,
          pinned: input.pinned,
        });
      }
      if (input.action === 'update') {
        return activeStore.updateCategory(input.id || input.name, {
          name: input.name,
          color: input.color,
          pinned: input.pinned,
          position: input.position,
        });
      }
      if (input.action === 'delete') return activeStore.deleteCategory(input.id || input.name);
      throw new Error(`Unsupported category action: ${input.action}`);
    case 'agendamea_list_trash':
      return activeStore.listTrash({
        typeFilter: input.typeFilter,
        sortBy: input.sortBy,
        query: input.query,
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
      });
    case 'agendamea_manage_trash':
      if (input.action === 'restore') {
        return activeStore.restoreItem(input.target, input.itemType || 'auto');
      }
      if (input.action === 'permanent_delete') {
        if (input.confirm !== true) {
          return {
            requiresConfirmation: true,
            action: 'permanent_delete',
            target: input.target || null,
            warning: 'Permanent deletion cannot be undone. Re-run with confirm: true to proceed.',
          };
        }
        return activeStore.permanentDeleteItem(input.target, input.itemType || 'auto');
      }
      if (input.action === 'empty') {
        if (input.confirm !== true) {
          const trash = await activeStore.listTrash({});
          return {
            requiresConfirmation: true,
            action: 'empty',
            trashedTodos: Array.isArray(trash?.todos) ? trash.todos.length : 0,
            trashedCategories: Array.isArray(trash?.categories) ? trash.categories.length : 0,
            warning:
              'Emptying Trash permanently deletes all trashed items. Re-run with confirm: true to proceed.',
          };
        }
        return activeStore.emptyTrash();
      }
      throw new Error(`Unsupported trash action: ${input.action}`);
    case 'agendamea_eisenhower_matrix':
      return activeStore.getMatrix();
    case 'agendamea_get_settings':
      return activeStore.getSettings();
    case 'agendamea_update_settings':
      return activeStore.updateSettings(input.patch);
    case 'agendamea_backup_and_sync':
      if (input.action === 'export') return activeStore.exportBackup(input.filePath);
      if (input.action === 'import')
        return activeStore.importBackup(input.payload || input.filePath);
      if (input.action === 'cloud_status') return activeStore.getCloudStatus();
      if (input.action === 'connect_cloud') {
        return activeStore.connectCloud(
          input.folderPath,
          input.autoSync === undefined ? true : Boolean(input.autoSync),
        );
      }
      if (input.action === 'disconnect_cloud') return activeStore.disconnectCloud();
      if (input.action === 'sync_cloud') return activeStore.syncCloud();
      if (input.action === 'pull_cloud') return activeStore.pullCloud();
      if (input.action === 'test_webhook') return activeStore.testWebhook(input.webhookUrl);
      if (input.action === 'reset') {
        if (input.confirm !== true) {
          return {
            requiresConfirmation: true,
            action: 'reset',
            resetSettings: Boolean(input.resetSettings),
            warning:
              'Reset permanently clears all Agendamea tasks and categories. Re-run with confirm: true to proceed.',
          };
        }
        return activeStore.resetAllData({ resetSettings: Boolean(input.resetSettings) });
      }
      throw new Error(`Unsupported backup/sync action: ${input.action}`);
    case 'agendamea_views':
      if (input.view === 'calendar') {
        return activeStore.getCalendarAgenda({ dateFrom: input.dateFrom, dateTo: input.dateTo });
      }
      if (input.view === 'kanban') return activeStore.getKanbanBoard(input.groupBy || 'priority');
      if (input.view === 'matrix') return activeStore.getMatrix();
      throw new Error(`Unsupported view: ${input.view}`);
    case 'agendamea_webhook_and_server':
      if (input.action === 'server_status') return activeStore.getHeadlessServerStatus();
      if (input.action === 'server_start') {
        return activeStore.startHeadlessServer({ port: input.port });
      }
      if (input.action === 'server_stop') return activeStore.stopHeadlessServer();
      if (input.action === 'webhook_logs') return activeStore.getWebhookLogs(input.limit || 30);
      if (input.action === 'clear_webhook_logs') return activeStore.clearWebhookLogs();
      if (input.action === 'webhook_outbox' && typeof activeStore.getWebhookOutbox === 'function') {
        return activeStore.getWebhookOutbox(input.limit || 30);
      }
      if (
        input.action === 'replay_webhook' &&
        typeof activeStore.replayWebhookOutbox === 'function'
      ) {
        return activeStore.replayWebhookOutbox(input.outboxId);
      }
      if (input.action === 'test_webhook') return activeStore.testWebhook(input.webhookUrl);
      if (input.action === 'check_updates') return activeStore.checkForUpdates();
      throw new Error(`Unsupported webhook/server action: ${input.action}`);
    case 'agendamea_semantic_search':
      return activeStore.semanticSearchRag(input.query, {
        topK: input.topK || 5,
        minScore: input.minScore !== undefined ? Number(input.minScore) : 0.35,
      });
    case 'agendamea_ai_status':
      return activeStore.getAiStatus({ force: Boolean(input.force) });
    case 'agendamea_ask':
      return activeStore.askAiAssistant(input.text, {
        language: input.language,
        readOnly: input.readOnly === undefined ? true : Boolean(input.readOnly),
        confirmToken: input.confirmToken,
        selectedTodoId: input.selectedTodoId,
      });
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

module.exports = {
  executeTool,
};
