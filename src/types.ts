import type { LanguageCode } from './i18n/languages';

export type Priority = 'low' | 'normal' | 'high';

export type ThemeMode = 'light' | 'dark';

export type ThemeId =
  | 'obsidian'
  | 'slate'
  | 'navy'
  | 'blue'
  | 'cyan'
  | 'purple'
  | 'red'
  | 'orange'
  | 'yellow'
  | 'emerald'
  | 'grass'
  | 'lime'
  | 'pink'
  | 'indigo';

export type SmartView = 'all' | 'today' | 'important' | 'completed';

export type ActiveView =
  | { type: 'smart'; id: SmartView }
  | { type: 'category'; id: string };

export type StatusFilter = 'all' | 'active' | 'completed';

export type SortOption = 'manual' | 'priority' | 'dueDate' | 'newest';

export type LayoutMode = 'list' | 'kanban' | 'calendar' | 'matrix';

export type KanbanGroupBy = 'priority' | 'status';

export type MatrixQuadrant = 'q1' | 'q2' | 'q3' | 'q4';

export interface Category {
  id: string;
  name: string;
  color: string;
  pinned: boolean;
  sortOrder: number;
  createdAt: string;
  deletedAt: string | null;
}

export interface Subtask {
  id: string;
  todoId: string;
  title: string;
  completed: boolean;
  sortOrder: number;
}

export interface Todo {
  id: string;
  title: string;
  notes: string;
  completed: boolean;
  important: boolean;
  pinned: boolean;
  priority: Priority;
  startDate?: string | null; // YYYY-MM-DD or null
  dueDate: string | null; // YYYY-MM-DD or null
  dueTime?: string | null; // HH:mm or null
  tags?: string[];
  categoryId: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  subtasks: Subtask[];
}

export interface AppSettings {
  themeMode: ThemeMode;
  themeId: ThemeId;
  dragLocked: boolean;
  sidebarCollapsed: boolean;
  themeCustomized?: boolean;
  language?: LanguageCode;
  autoUpdateCheck?: boolean;
  onedriveAutoSync?: boolean;
  onedriveCustomPath?: string;
  onboardingCompleted?: boolean;
}

export interface BootstrapPayload {
  categories: Category[];
  todos: Todo[];
  trashedCategories: Category[];
  trashedTodos: Todo[];
  settings: AppSettings;
}

export interface CategoryPatch {
  name?: string;
  color?: string;
  pinned?: boolean;
}

export interface TodoPatch {
  title?: string;
  notes?: string;
  completed?: boolean;
  important?: boolean;
  pinned?: boolean;
  priority?: Priority;
  startDate?: string | null;
  dueDate?: string | null;
  dueTime?: string | null;
  tags?: string[];
  categoryId?: string | null;
}

export interface OneDriveStatus {
  available: boolean;
  connected: boolean;
  mode: 'folder' | 'graph' | 'none';
  folderPath: string | null;
  syncFilePath: string | null;
  accountEmail: string | null;
  lastSyncedAt: string | null;
  autoSync: boolean;
  hasRemoteBackup: boolean;
  remoteTodoCount?: number;
  remoteCategoryCount?: number;
  backupFilesCount?: number;
  restoredBootstrap?: BootstrapPayload;
}

export interface SubtaskPatch {
  title?: string;
  completed?: boolean;
}

export interface UpdateCheckResult {
  ok: boolean;
  currentVersion: string;
  latestVersion: string;
  updateAvailable: boolean;
  releaseName: string;
  releaseNotes: string;
  publishedAt: string | null;
  releaseUrl: string;
  setupUrl: string | null;
  portableUrl: string | null;
  msixUrl?: string | null;
  checkedAt: string;
  error?: string;
}
