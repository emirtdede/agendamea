'use strict';

/**
 * Shared 100% Headless Data Engine Facade for Agendamea CLI & MCP Server.
 * Preserves all 64 public exports and the cold-start lazy-loading guarantee
 * while delegating domain logic to cohesive submodules under `shared/store/`.
 */

const {
  APP_VERSION,
  ABI_FALLBACK_EXIT_CODE,
  getTodayStr,
  getTomorrowStr,
  getCandidateDataDirs,
} = require('./store/httpTransport.cjs');
const { getPreferredLanguage } = require('./store/offlineDb.cjs');
const {
  getStatus,
  getMatrix,
  getCalendarAgenda,
  getKanbanBoard,
  listTasks,
  getTask,
} = require('./store/taskQueries.cjs');
const {
  listCategories,
  createCategory,
  updateCategory,
  moveCategory,
  deleteCategory,
} = require('./store/categoryOps.cjs');
const {
  addTask,
  updateTask,
  moveTask,
  completeTask,
  batchCompleteTasks,
  pinTask,
  batchPinTasks,
  deleteTask,
  batchDeleteTasks,
  clearCompleted,
  addSubtask,
  updateSubtask,
  toggleSubtask,
  deleteSubtask,
} = require('./store/taskMutations.cjs');
const {
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
} = require('./store/trashAndBackupOps.cjs');
const {
  getCloudStatus,
  connectCloud,
  disconnectCloud,
  syncCloud,
  createPullCloud,
} = require('./store/cloudSyncOffline.cjs');
const {
  testWebhook,
  getWebhookLogs,
  clearWebhookLogs,
  getWebhookOutbox,
  replayWebhookOutbox,
} = require('./store/webhookOffline.cjs');
const {
  checkForUpdates,
  getHeadlessServerStatus,
  startHeadlessServer,
  stopHeadlessServer,
  installCli,
  uninstallCli,
} = require('./store/daemonBridge.cjs');
const {
  getAiStatus,
  listAiModels,
  downloadAiModel,
  deleteAiModel,
  semanticSearchRag,
  askAiAssistant,
} = require('./store/aiOffline.cjs');

const pullCloud = createPullCloud(importBackup);

module.exports = {
  APP_VERSION,
  ABI_FALLBACK_EXIT_CODE,
  getTodayStr,
  getTomorrowStr,
  getPreferredLanguage,
  getCandidateDataDirs,
  getStatus,
  getMatrix,
  getCalendarAgenda,
  getKanbanBoard,
  listTasks,
  getTask,
  addTask,
  updateTask,
  moveTask,
  completeTask,
  batchCompleteTasks,
  pinTask,
  batchPinTasks,
  deleteTask,
  batchDeleteTasks,
  clearCompleted,
  addSubtask,
  updateSubtask,
  toggleSubtask,
  deleteSubtask,
  listCategories,
  createCategory,
  updateCategory,
  moveCategory,
  deleteCategory,
  listTrash,
  restoreItem,
  restoreLastTrashed,
  permanentDeleteItem,
  emptyTrash,
  getSettings,
  updateSettings,
  exportBackup,
  importBackup,
  getCloudStatus,
  connectCloud,
  disconnectCloud,
  syncCloud,
  pullCloud,
  resetAllData,
  testWebhook,
  getWebhookLogs,
  clearWebhookLogs,
  getWebhookOutbox,
  replayWebhookOutbox,
  checkForUpdates,
  getHeadlessServerStatus,
  startHeadlessServer,
  stopHeadlessServer,
  installCli,
  uninstallCli,
  getAiStatus,
  listAiModels,
  downloadAiModel,
  deleteAiModel,
  semanticSearchRag,
  askAiAssistant,
};
