import type {
  AiModelStatus,
  AiStatusPayload,
  AppLockAutoLockMinutes,
  AppLockStatus,
  AppLockType,
  AppSettings,
  BootstrapPayload,
  Category,
  CategoryPatch,
  HardwareProfile,
  HybridRagHit,
  OneDriveStatus,
  Priority,
  Subtask,
  SubtaskPatch,
  Todo,
  TodoPatch,
  UpdateCheckResult,
  VoiceAskResponse,
  WebhookLogEntry,
  WebhookOutboxEntry,
  WebhookTestResult,
} from '../types';

const DEFAULT_TIMEOUT_MS = 10_000;
const AI_SEARCH_TIMEOUT_MS = 20_000;
const AI_ASK_TIMEOUT_MS = 45_000;
const AI_STT_TIMEOUT_MS = 60_000;
const AI_REINDEX_TIMEOUT_MS = 120_000;
const AI_VOICE_DOWNLOAD_TIMEOUT_MS = 300_000;

export class ApiLocalizedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApiLocalizedError';
  }
}

export class AppLockRequiredError extends Error {
  readonly lock: AppLockStatus;

  constructor(lock: AppLockStatus, message = 'APP_LOCKED') {
    super(message);
    this.name = 'AppLockRequiredError';
    this.lock = lock;
  }
}

function getActiveClientLang(): string {
  if (typeof document !== 'undefined' && document.documentElement?.lang) {
    return document.documentElement.lang.trim() || 'en';
  }
  return 'en';
}

async function request<T>(
  url: string,
  options?: RequestInit,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<T> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  const signal =
    options?.signal && typeof AbortSignal.any === 'function'
      ? AbortSignal.any([options.signal, controller.signal])
      : (options?.signal ?? controller.signal);

  try {
    const hasBody = options?.body !== undefined;
    const res = await fetch(url, {
      ...options,
      signal,
      headers: {
        'X-Agendamea-Source': 'ui',
        'X-Agendamea-Lang': getActiveClientLang(),
        ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
        ...(options?.headers ?? {}),
      },
    });

    if (!res.ok) {
      let localizedMsg: string | null = null;
      let lockedPayload: AppLockStatus | null = null;
      try {
        const data = await res.json();
        if (res.status === 423 && data?.code === 'APP_LOCKED' && data?.lock) {
          lockedPayload = data.lock as AppLockStatus;
        }
        if (typeof data?.error === 'string' && data.error.trim()) {
          localizedMsg = data.error.trim();
        }
      } catch {
        // Ignore JSON parse error
      }
      if (lockedPayload) {
        throw new AppLockRequiredError(lockedPayload, localizedMsg ?? 'APP_LOCKED');
      }
      if (localizedMsg) {
        throw new ApiLocalizedError(localizedMsg);
      }
      throw new Error(`HTTP ${res.status}`);
    }

    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      if (timedOut) {
        throw new Error('NETWORK_TIMEOUT');
      }
      throw err;
    }
    if (err instanceof Error && err.message && !(err instanceof TypeError)) {
      throw err;
    }
    throw new Error('NETWORK_UNREACHABLE');
  } finally {
    window.clearTimeout(timer);
  }
}

const enc = (id: string) => encodeURIComponent(id);

let prefetchedBootstrapPromise: Promise<BootstrapPayload> | null = null;
let prefetchedBootstrapAt = 0;
const BOOTSTRAP_PREFETCH_TTL_MS = 5_000;

async function postAppLockJson<T extends { ok: boolean; code?: string }>(
  url: string,
  payload: Record<string, unknown>,
): Promise<T> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'X-Agendamea-Source': 'ui',
        'X-Agendamea-Lang': getActiveClientLang(),
      },
      body: JSON.stringify(payload),
    });
    const parsed = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (parsed && typeof parsed.ok === 'boolean') {
      return parsed as unknown as T;
    }
    return {
      ok: false,
      code: typeof parsed?.code === 'string' ? parsed.code : `HTTP_${res.status}`,
    } as T;
  } finally {
    window.clearTimeout(timer);
  }
}

export const api = {
  prefetchBootstrap(): void {
    if (typeof window === 'undefined' || typeof fetch !== 'function') return;
    if (
      prefetchedBootstrapPromise &&
      Date.now() - prefetchedBootstrapAt < BOOTSTRAP_PREFETCH_TTL_MS
    ) {
      return;
    }
    const pending = request<BootstrapPayload>('/api/bootstrap');
    prefetchedBootstrapPromise = pending;
    prefetchedBootstrapAt = Date.now();
    // Prevent unhandled rejection if caller doesn't consume or server is briefly unavailable
    void pending.catch(() => {
      if (prefetchedBootstrapPromise === pending) {
        prefetchedBootstrapPromise = null;
      }
    });
  },

  bootstrap(): Promise<BootstrapPayload> {
    if (
      prefetchedBootstrapPromise &&
      Date.now() - prefetchedBootstrapAt < BOOTSTRAP_PREFETCH_TTL_MS
    ) {
      const pending = prefetchedBootstrapPromise;
      prefetchedBootstrapPromise = null;
      return pending;
    }
    prefetchedBootstrapPromise = null;
    return request<BootstrapPayload>('/api/bootstrap');
  },

  getSettings(): Promise<AppSettings> {
    return request<AppSettings>('/api/settings');
  },

  createCategory(input: {
    id?: string;
    name: string;
    color: string;
    pinned?: boolean;
  }): Promise<Category> {
    return request<Category>('/api/categories', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  updateCategory(id: string, patch: CategoryPatch): Promise<Category> {
    return request<Category>(`/api/categories/${enc(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
  },

  deleteCategory(id: string): Promise<Category> {
    return request<Category>(`/api/categories/${enc(id)}`, {
      method: 'DELETE',
    });
  },

  restoreCategory(id: string): Promise<Category> {
    return request<Category>(`/api/categories/${enc(id)}/restore`, {
      method: 'POST',
    });
  },

  permanentDeleteCategory(id: string): Promise<{ ok: boolean }> {
    return request<{ ok: boolean }>(`/api/categories/${enc(id)}/permanent`, {
      method: 'DELETE',
    });
  },

  reorderCategories(orderedIds: string[]): Promise<{ ok: boolean }> {
    return request<{ ok: boolean }>('/api/categories/reorder', {
      method: 'PATCH',
      body: JSON.stringify({ orderedIds }),
    });
  },

  createTodo(
    input: {
      id?: string;
      title: string;
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
      subtasks?: Array<{ title: string; completed?: boolean }>;
    },
    options?: { source?: 'ui' | 'overlay' | 'playground' },
  ): Promise<Todo> {
    return request<Todo>('/api/todos', {
      method: 'POST',
      headers: options?.source ? { 'X-Agendamea-Source': options.source } : undefined,
      body: JSON.stringify(input),
    });
  },

  updateTodo(id: string, patch: TodoPatch, options?: { keepalive?: boolean }): Promise<Todo> {
    return request<Todo>(`/api/todos/${enc(id)}`, {
      method: 'PATCH',
      ...(options?.keepalive ? { keepalive: true } : {}),
      body: JSON.stringify(patch),
    });
  },

  deleteTodo(id: string): Promise<Todo> {
    return request<Todo>(`/api/todos/${enc(id)}`, {
      method: 'DELETE',
    });
  },

  restoreTodo(id: string): Promise<Todo> {
    return request<Todo>(`/api/todos/${enc(id)}/restore`, {
      method: 'POST',
    });
  },

  permanentDeleteTodo(id: string): Promise<{ ok: boolean }> {
    return request<{ ok: boolean }>(`/api/todos/${enc(id)}/permanent`, {
      method: 'DELETE',
    });
  },

  clearCompleted(categoryId?: string | null): Promise<{ ok: boolean; trashedTodos: Todo[] }> {
    const query = categoryId ? `?categoryId=${enc(categoryId)}` : '';
    return request<{ ok: boolean; trashedTodos: Todo[] }>(`/api/todos/completed${query}`, {
      method: 'DELETE',
    });
  },

  emptyTrash(): Promise<{ ok: boolean; deletedTodos: number; deletedCategories: number }> {
    return request<{ ok: boolean; deletedTodos: number; deletedCategories: number }>('/api/trash', {
      method: 'DELETE',
    });
  },

  reorderTodos(orderedIds: string[]): Promise<{ ok: boolean }> {
    return request<{ ok: boolean }>('/api/todos/reorder', {
      method: 'PATCH',
      body: JSON.stringify({ orderedIds }),
    });
  },

  createSubtask(todoId: string, title: string): Promise<Subtask> {
    return request<Subtask>(`/api/todos/${enc(todoId)}/subtasks`, {
      method: 'POST',
      body: JSON.stringify({ title }),
    });
  },

  updateSubtask(id: string, patch: SubtaskPatch): Promise<Subtask> {
    return request<Subtask>(`/api/subtasks/${enc(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
  },

  deleteSubtask(id: string): Promise<{ ok: boolean }> {
    return request<{ ok: boolean }>(`/api/subtasks/${enc(id)}`, {
      method: 'DELETE',
    });
  },

  updateSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
    return request<AppSettings>('/api/settings', {
      method: 'PATCH',
      keepalive: true,
      body: JSON.stringify(patch),
    });
  },

  importBackup(payload: unknown): Promise<BootstrapPayload> {
    return request<BootstrapPayload>('/api/import', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  minimizeWindow(): Promise<{ ok: boolean; supported: boolean }> {
    return request<{ ok: boolean; supported: boolean }>('/api/window/minimize', {
      method: 'POST',
    });
  },

  async checkForUpdates(): Promise<UpdateCheckResult> {
    if (typeof window !== 'undefined' && window.agendameaWindow?.checkForUpdates) {
      return window.agendameaWindow.checkForUpdates();
    }
    return request<UpdateCheckResult>('/api/update-check');
  },

  getOneDriveStatus(): Promise<OneDriveStatus> {
    return request<OneDriveStatus>('/api/onedrive/status');
  },

  connectOneDrive(input?: {
    folderPath?: string;
    accountEmail?: string;
    autoSync?: boolean;
  }): Promise<OneDriveStatus> {
    return request<OneDriveStatus>('/api/onedrive/connect', {
      method: 'POST',
      body: JSON.stringify(input ?? {}),
    });
  },

  disconnectOneDrive(): Promise<OneDriveStatus> {
    return request<OneDriveStatus>('/api/onedrive/disconnect', {
      method: 'POST',
    });
  },

  syncOneDrivePush(): Promise<OneDriveStatus> {
    return request<OneDriveStatus>('/api/onedrive/sync-push', {
      method: 'POST',
    });
  },

  syncOneDrivePull(): Promise<{ status: OneDriveStatus; bootstrap: BootstrapPayload }> {
    return request<{ status: OneDriveStatus; bootstrap: BootstrapPayload }>(
      '/api/onedrive/sync-pull',
      {
        method: 'POST',
      },
    );
  },

  async openOneDriveFolder(folderPath?: string | null): Promise<{ ok: boolean; path?: string }> {
    if (typeof window !== 'undefined' && window.agendameaWindow?.openOneDriveFolder) {
      return window.agendameaWindow.openOneDriveFolder(folderPath);
    }
    return request<{ ok: boolean; path?: string }>('/api/onedrive/open-folder', {
      method: 'POST',
      body: JSON.stringify({ folderPath: folderPath ?? undefined }),
    });
  },

  testWebhook(input?: {
    url?: string;
    secret?: string;
    format?: string;
  }): Promise<WebhookTestResult> {
    return request<WebhookTestResult>('/api/webhooks/test', {
      method: 'POST',
      body: JSON.stringify(input ?? {}),
    });
  },

  getWebhookLogs(limit = 30): Promise<WebhookLogEntry[]> {
    return request<WebhookLogEntry[]>(
      `/api/webhooks/logs?limit=${Math.max(1, Math.min(200, limit))}`,
    );
  },

  clearWebhookLogs(): Promise<{ ok: boolean; cleared: number }> {
    return request<{ ok: boolean; cleared: number }>('/api/webhooks/logs', {
      method: 'DELETE',
    });
  },

  getWebhookOutbox(limit = 30): Promise<WebhookOutboxEntry[]> {
    return request<WebhookOutboxEntry[]>(
      `/api/webhooks/outbox?limit=${Math.max(1, Math.min(200, limit))}`,
    );
  },

  replayWebhookOutbox(
    id: string,
  ): Promise<{ ok: boolean; id: string; statusCode?: number | null; error?: string }> {
    return request<{ ok: boolean; id: string; statusCode?: number | null; error?: string }>(
      `/api/webhooks/replay/${enc(id)}`,
      { method: 'POST', body: '{}' },
    );
  },

  testIncomingWebhook(secret?: string): Promise<{
    ok: boolean;
    action?: string;
    listening?: boolean;
    port?: number;
    error?: string;
  }> {
    const headers: Record<string, string> = {};
    if (secret?.trim()) {
      headers['X-Agendamea-Secret'] = secret.trim();
    }
    return request('/api/webhook/incoming', {
      method: 'POST',
      headers,
      body: JSON.stringify({ action: 'ping' }),
    });
  },

  resetAllData(options?: { resetSettings?: boolean }): Promise<BootstrapPayload> {
    return request<BootstrapPayload>('/api/reset', {
      method: 'POST',
      body: JSON.stringify(options ?? {}),
    });
  },

  getAiStatus(force = false): Promise<AiStatusPayload> {
    return request<AiStatusPayload>(force ? '/api/ai/status?force=1' : '/api/ai/status');
  },

  getHardwareProfile(force = false): Promise<HardwareProfile> {
    return request<HardwareProfile>(force ? '/api/ai/hardware?force=1' : '/api/ai/hardware');
  },

  getAiModels(): Promise<{
    modelsDir: string;
    installedDiskBytes: number;
    models: AiModelStatus[];
  }> {
    return request('/api/ai/models');
  },

  downloadAiModel(
    modelId: string,
    options?: { activate?: boolean },
  ): Promise<{ ok: boolean; started?: boolean; modelId?: string; error?: string; code?: string }> {
    return request(`/api/ai/models/${enc(modelId)}/download`, {
      method: 'POST',
      body: JSON.stringify(options ?? {}),
    });
  },

  activateAiModel(
    modelId: string,
  ): Promise<{ ok: boolean; modelId?: string; role?: string; error?: string }> {
    return request(`/api/ai/models/${enc(modelId)}/activate`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  },

  startAiOneClickSetup(options?: {
    tier?: import('../types').AiTierId;
    profileId?: import('../types').AiTierId;
    customModels?: {
      sttModelId: string;
      llmModelId: string;
      embedModelId: string;
    };
  }): Promise<{ ok: boolean; setup: import('../types').AiSetupState }> {
    return request('/api/ai/setup', {
      method: 'POST',
      body: JSON.stringify(options ?? {}),
    });
  },

  cancelAiOneClickSetup(): Promise<{ ok: boolean; setup: import('../types').AiSetupState }> {
    return request('/api/ai/setup/cancel', {
      method: 'POST',
      body: JSON.stringify({}),
    });
  },

  getAiSetupStatus(): Promise<{ ok: boolean; setup: import('../types').AiSetupState }> {
    return request('/api/ai/setup/status');
  },

  warmupAiEngines(options?: { includeLlm?: boolean }): Promise<{
    ok: boolean;
    stt: { ok: boolean; loaded?: boolean; code?: string };
    llm?: { ok: boolean; loaded?: boolean; code?: string };
  }> {
    return request(
      '/api/ai/warmup',
      {
        method: 'POST',
        body: JSON.stringify(options ?? {}),
      },
      AI_REINDEX_TIMEOUT_MS,
    );
  },

  cancelAiModelDownload(modelId: string): Promise<{ ok: boolean; cancelled: boolean }> {
    return request(`/api/ai/models/${enc(modelId)}/cancel`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  },

  deleteAiModel(modelId: string): Promise<{ ok: boolean; removed?: boolean }> {
    return request(`/api/ai/models/${enc(modelId)}`, {
      method: 'DELETE',
    });
  },

  deleteAllAiModels(): Promise<{ ok: boolean; removedFiles: number }> {
    return request('/api/ai/models/all', {
      method: 'DELETE',
    });
  },

  reindexRag(): Promise<{ ok: boolean; mode: string; recomputed: number; skipped: number }> {
    return request(
      '/api/ai/rag/reindex',
      {
        method: 'POST',
        body: JSON.stringify({}),
      },
      AI_REINDEX_TIMEOUT_MS,
    );
  },

  searchHybridRag(
    query: string,
    topK = 5,
  ): Promise<{ hits: HybridRagHit[]; disambiguationRequired: boolean; mode: string }> {
    return request(
      '/api/ai/rag/search',
      {
        method: 'POST',
        body: JSON.stringify({ query, topK }),
      },
      AI_SEARCH_TIMEOUT_MS,
    );
  },

  askAi(payload: {
    text: string;
    language?: string;
    readOnly?: boolean;
    confirmToken?: string;
    selectedTodoId?: string;
  }): Promise<VoiceAskResponse> {
    return request<VoiceAskResponse>(
      '/api/ai/ask',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      AI_ASK_TIMEOUT_MS,
    );
  },

  transcribeAudio(
    pcmOrBase64: Float32Array | string,
    language?: string,
    options?: { cleanup?: boolean },
  ): Promise<{
    ok: boolean;
    text?: string;
    rawText?: string;
    cleaned?: boolean;
    language?: string;
    code?: string;
    message?: string;
    parsed?: {
      intent: string;
      title: string;
      dueDate: string | null;
      dueTime: string | null;
      priority: Priority;
      important: boolean;
      category: string | null;
      tags: string[];
    };
  }> {
    if (pcmOrBase64 instanceof Float32Array) {
      const pcm16 = new Int16Array(pcmOrBase64.length);
      for (let i = 0; i < pcmOrBase64.length; i += 1) {
        const v = pcmOrBase64[i] ?? 0;
        const clamped = Math.max(-1, Math.min(1, v));
        pcm16[i] = clamped < 0 ? Math.round(clamped * 32768) : Math.round(clamped * 32767);
      }
      const params = new URLSearchParams();
      if (language) params.set('language', language);
      if (options?.cleanup) params.set('cleanup', '1');
      const qs = params.toString();
      return request(
        `/api/ai/transcribe${qs ? `?${qs}` : ''}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/octet-stream' },
          body: new Uint8Array(pcm16.buffer, pcm16.byteOffset, pcm16.byteLength),
        },
        AI_STT_TIMEOUT_MS,
      );
    }
    return request(
      '/api/ai/transcribe',
      {
        method: 'POST',
        body: JSON.stringify({
          pcmBase64: pcmOrBase64,
          language,
          ...(options?.cleanup ? { cleanup: true } : {}),
        }),
      },
      AI_STT_TIMEOUT_MS,
    );
  },

  getPiperVoices(): Promise<{ voices: import('../types').PiperVoiceStatus[] }> {
    return request('/api/ai/tts-voices');
  },

  downloadPiperVoice(voiceId: string): Promise<{
    ok: boolean;
    voiceId?: string;
    alreadyInstalled?: boolean;
    code?: string;
    message?: string;
  }> {
    return request(
      '/api/ai/tts-voices/download',
      {
        method: 'POST',
        body: JSON.stringify({ voiceId }),
      },
      AI_VOICE_DOWNLOAD_TIMEOUT_MS,
    );
  },

  cancelPiperVoiceDownload(voiceId: string): Promise<{ ok: boolean; cancelled: boolean }> {
    return request('/api/ai/tts-voices/cancel', {
      method: 'POST',
      body: JSON.stringify({ voiceId }),
    });
  },

  deletePiperVoice(voiceId: string): Promise<{ ok: boolean; removed: boolean }> {
    return request(`/api/ai/tts-voices/${enc(voiceId)}`, {
      method: 'DELETE',
    });
  },

  getSystemInfo(): Promise<import('../types').SystemInfoPayload> {
    return request('/api/system/info');
  },

  listCloudBackups(): Promise<{ backups: import('../types').CloudBackupFileEntry[] }> {
    return request('/api/onedrive/backups');
  },

  restoreCloudBackupFile(fileName: string): Promise<{
    status: OneDriveStatus;
    bootstrap: BootstrapPayload;
  }> {
    return request('/api/onedrive/restore-file', {
      method: 'POST',
      body: JSON.stringify({ fileName }),
    });
  },

  restoreAllTrash(): Promise<{
    ok: boolean;
    restoredTodos: number;
    restoredCategories: number;
    bootstrap: BootstrapPayload;
  }> {
    return request('/api/trash/restore-all', {
      method: 'POST',
      body: JSON.stringify({}),
    });
  },

  async exportBackupText(format: 'json' | 'csv' | 'md' | 'ics', lang?: string): Promise<string> {
    const { blob } = await api.exportBackupBlob(format, lang);
    return blob.text();
  },

  async exportBackupBlob(
    format: 'json' | 'csv' | 'md' | 'ics',
    lang?: string,
  ): Promise<{ blob: Blob; fileName: string }> {
    const qs = new URLSearchParams({ format });
    const activeLang = lang || getActiveClientLang();
    qs.set('lang', activeLang);
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
    try {
      const res = await fetch(`/api/export?${qs.toString()}`, {
        signal: controller.signal,
        headers: {
          'X-Agendamea-Source': 'ui',
          'X-Agendamea-Lang': activeLang,
        },
      });
      if (!res.ok) {
        let localizedMsg: string | null = null;
        try {
          const data = await res.json();
          if (typeof data?.error === 'string' && data.error.trim()) {
            localizedMsg = data.error.trim();
          }
        } catch {
          // Ignore non-JSON error body
        }
        if (localizedMsg) throw new ApiLocalizedError(localizedMsg);
        throw new Error(`HTTP ${res.status}`);
      }
      const disp = res.headers.get('content-disposition') ?? '';
      const match = disp.match(/filename="([^"]+)"/);
      const fileName = match?.[1] ?? `agendamea-backup.${format}`;
      const blob = await res.blob();
      return { blob, fileName };
    } finally {
      window.clearTimeout(timer);
    }
  },

  async callMcpTool(
    name: string,
    args: Record<string, unknown> = {},
  ): Promise<Record<string, unknown>> {
    return request('/api/mcp', {
      method: 'POST',
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: `docs-${Date.now()}`,
        method: 'tools/call',
        params: { name, arguments: args },
      }),
    });
  },

  getAppLockStatus(): Promise<AppLockStatus> {
    return request<AppLockStatus>('/api/security/lock/status');
  },

  lockAppNow(): Promise<AppLockStatus> {
    return request<AppLockStatus>('/api/security/lock/lock', {
      method: 'POST',
    });
  },

  verifyAppLock(secret: string): Promise<{
    ok: boolean;
    status: AppLockStatus;
    code?: string;
    retryAfterSeconds?: number;
  }> {
    return postAppLockJson('/api/security/lock/verify', { secret });
  },

  recoverAppLock(recoveryCode: string): Promise<{
    ok: boolean;
    status: AppLockStatus;
    code?: string;
    retryAfterSeconds?: number;
  }> {
    return postAppLockJson('/api/security/lock/recover', { recoveryCode });
  },

  setupAppLock(input: {
    type: AppLockType;
    secret: string;
    autoLockMinutes?: AppLockAutoLockMinutes;
    lockOnMinimize?: boolean;
  }): Promise<{
    ok: boolean;
    recoveryCode?: string;
    status: AppLockStatus;
    code?: string;
  }> {
    return postAppLockJson('/api/security/lock/setup', input);
  },

  changeAppLock(input: { currentSecret: string; type: AppLockType; newSecret: string }): Promise<{
    ok: boolean;
    recoveryCode?: string;
    status: AppLockStatus;
    code?: string;
    retryAfterSeconds?: number;
  }> {
    return postAppLockJson('/api/security/lock/change', input);
  },

  disableAppLock(currentSecret: string): Promise<{
    ok: boolean;
    status: AppLockStatus;
    code?: string;
    retryAfterSeconds?: number;
  }> {
    return postAppLockJson('/api/security/lock/disable', { currentSecret });
  },

  updateAppLockConfig(input: {
    autoLockMinutes?: AppLockAutoLockMinutes;
    lockOnMinimize?: boolean;
  }): Promise<AppLockStatus> {
    return request<AppLockStatus>('/api/security/lock/config', {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  },
};
