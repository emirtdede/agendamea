import type { LanguageCode } from './i18n/languages';

export type Priority = 'low' | 'normal' | 'high';

export type ThemeMode = 'light' | 'dark' | 'system';

export type EffectiveThemeMode = 'light' | 'dark';

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
  | 'indigo'
  | 'custom';

export type AppIconId = 'match-theme' | 'obsidian-light' | ThemeId;

export type CloseBehavior = 'ask' | 'tray' | 'quit';

export type SettingsTabId =
  | 'appearance'
  | 'accessibility'
  | 'general'
  | 'notifications'
  | 'ai'
  | 'data'
  | 'trash'
  | 'docs'
  | 'about';

export type VoiceSensitivityMode = 'auto' | 'low' | 'medium' | 'high';
export type VoiceTtsStyle = 'natural' | 'crisp' | 'calm' | 'bright' | 'studio';
export type VoiceChimePreset = 'soft' | 'crystal' | 'studio' | 'minimal' | 'none';
export type PiperVoiceGender = 'female' | 'male';

export interface PiperVoiceStatus {
  id: string;
  name: string;
  language: string;
  baseLang: string;
  gender: PiperVoiceGender;
  quality: string;
  sampleRate: number;
  license: string;
  expectedBytes: number;
  installed: boolean;
  bytes: number;
  downloading: boolean;
  progress: {
    voiceId: string;
    receivedBytes: number;
    totalBytes: number;
    percent: number;
  } | null;
}

export type NotificationProfileId =
  | 'balanced'
  | 'all'
  | 'focus'
  | 'silent_inapp'
  | 'custom';

export type NotificationChannelMode = 'both' | 'inApp' | 'desktop' | 'off';

export type NotificationEventType =
  | 'taskUpcoming'
  | 'taskDue'
  | 'taskCompleted'
  | 'voiceAssistant'
  | 'cloudSync'
  | 'appUpdates';

export type NotificationChannelsMap = Record<NotificationEventType, NotificationChannelMode>;

export type AiTierId =
  | 'tier-light'
  | 'tier-medium'
  | 'tier-strong'
  | 'external-ollama'
  | 'external-lmstudio';

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
  customThemeColor?: string;
  appIconId?: AppIconId;
  customIconColor?: string;
  zoomPercent?: number;
  highContrast?: boolean;
  reducedMotion?: boolean;
  closeBehavior?: CloseBehavior;
  launchAtStartup?: boolean;
  globalQuickAddShortcut?: boolean;
  dragLocked: boolean;
  sidebarCollapsed: boolean;
  themeCustomized?: boolean;
  language?: LanguageCode;
  autoUpdateCheck?: boolean;
  onedriveAutoSync?: boolean;
  onedriveCustomPath?: string;
  onboardingCompleted?: boolean;
  webhookEnabled?: boolean;
  webhookUrl?: string;
  webhookSecret?: string;
  webhookEvents?: string;
  aiEnabled?: boolean;
  aiTier?: AiTierId;
  aiLlmModelId?: string;
  aiSttModelId?: string;
  aiEmbedModelId?: string;
  aiUseExternalOllama?: boolean;
  aiOllamaModel?: string;
  voiceShortcut?: string;
  voiceAutoStopMs?: number;
  voiceTtsEnabled?: boolean;
  voiceTtsVoice?: string;
  voiceTtsStyle?: VoiceTtsStyle;
  voiceChimePreset?: VoiceChimePreset;
  voiceMicDeviceId?: string;
  voiceNoiseSuppression?: boolean;
  voiceSensitivity?: VoiceSensitivityMode;
  globalQuickAddShortcutKey?: string;
  customShortcuts?: Record<string, string>;
  notificationProfile?: NotificationProfileId;
  notificationLeadMinutes?: number;
  notificationChannels?: NotificationChannelsMap;
}

export interface HardwareProfile {
  platform: string;
  arch: string;
  ramGb: number;
  cpuCores: number;
  cpuModel: string;
  avx2Likely: boolean;
  gpuName: string;
  gpuVendor: string;
  vramBytes: number;
  vramGb: number;
  vramSource: string;
  hasDiscreteGpu: boolean;
  vulkanLikely: boolean;
  freeDiskBytes: number | null;
  freeDiskGb: number | null;
  fallbackReason: string | null;
  recommendedTier: 'tier-light' | 'tier-medium' | 'tier-strong';
  measuredAt: string;
}

export interface AiModelStatus {
  id: string;
  role: 'stt' | 'llm' | 'embed';
  tier: string;
  label: string;
  file: string;
  license: string;
  expectedBytes: number;
  expectedSha256: string;
  present: boolean;
  verified: boolean;
  bytes: number;
  partialBytes: number;
  downloading: boolean;
  progress: {
    modelId: string;
    receivedBytes: number;
    totalBytes: number;
    percent: number;
    resumed: boolean;
  } | null;
  fitsHardware?: boolean;
  warningCode?: string | null;
}

export interface AiStatusPayload {
  hardware: HardwareProfile;
  recommendation: {
    recommendedTier: 'tier-light' | 'tier-medium' | 'tier-strong';
    primaryOptionId: AiTierId;
    preferExternalOllama: boolean;
    preferExternalLmStudio: boolean;
    externalOllama: {
      detected: boolean;
      baseUrl: string;
      models: string[];
      downloadBytes: number;
    };
    externalLmStudio: {
      detected: boolean;
      baseUrl: string;
      models: string[];
      downloadBytes: number;
    };
    tiers: Array<{
      id: 'tier-light' | 'tier-medium' | 'tier-strong';
      sttModelId: string;
      llmModelId: string;
      embedModelId: string;
      totalBytes: number;
      recommended: boolean;
      fitsHardware: boolean;
      warningCode: string | null;
    }>;
  };
  models: AiModelStatus[];
  installedDiskBytes: number;
  ragIndexedChunks: number;
  settings: {
    aiEnabled: boolean;
    aiTier: AiTierId;
    aiLlmModelId: string;
    aiSttModelId: string;
    aiEmbedModelId: string;
    aiUseExternalOllama: boolean;
    aiOllamaModel: string;
    voiceShortcut: string;
    voiceAutoStopMs: number;
    voiceTtsEnabled: boolean;
    voiceTtsVoice: string;
    voiceTtsStyle: VoiceTtsStyle;
    voiceChimePreset: VoiceChimePreset;
    voiceMicDeviceId: string;
    voiceNoiseSuppression: boolean;
    voiceSensitivity: VoiceSensitivityMode;
  };
}

export interface HybridRagHit {
  todoId: string;
  title: string;
  notes: string;
  dueDate: string | null;
  dueTime: string | null;
  priority: Priority;
  completed: boolean;
  score: number;
  matchedChunkText: string;
  matchedChunkIndex: number;
}

export interface VoiceAskResponse {
  ok: boolean;
  status:
    | 'executed'
    | 'answered'
    | 'not_found'
    | 'disambiguation'
    | 'confirmation_required'
    | 'confirmation_expired'
    | 'blocked_read_only'
    | 'blocked'
    | 'preview';
  intent: string;
  parser?: string;
  mutated?: boolean;
  destructive?: boolean;
  requiresConfirmation?: boolean;
  confirmationToken?: string;
  readOnlyIsolated?: boolean;
  spokenText: string;
  displayText: string;
  ttsTruncated?: boolean;
  todo?: Todo;
  matches?: HybridRagHit[];
  candidates?: Array<{
    index: number;
    todoId: string;
    title: string;
    score: number;
    snippet: string;
  }>;
  payload?: { title?: string };
}

export interface WebhookLogEntry {
  id: string;
  direction: 'outgoing' | 'incoming';
  event: string;
  targetUrl: string;
  statusCode: number | null;
  ok: boolean;
  attempts: number;
  latencyMs: number;
  error: string;
  createdAt: string;
}

export interface WebhookTestResult {
  ok: boolean;
  statusCode?: number;
  latencyMs?: number;
  error?: string;
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

export type CloudProviderId = 'onedrive' | 'googledrive' | 'icloud' | 'dropbox';

export interface DetectedCloudProvider {
  id: CloudProviderId;
  label: string;
  folderPath: string;
  detected: boolean;
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
  activeProvider?: CloudProviderId | 'custom' | null;
  detectedProviders?: DetectedCloudProvider[];
  restoredBootstrap?: BootstrapPayload;
}

export interface SubtaskPatch {
  title?: string;
  completed?: boolean;
}

export interface UpdateCheckResult {
  ok: boolean;
  storeManaged?: boolean;
  nativeAutoUpdateReady?: boolean;
  downloaded?: boolean;
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
