import type {
  AppSettings,
  BootstrapPayload,
  Category,
  CategoryPatch,
  OneDriveStatus,
  Priority,
  Subtask,
  SubtaskPatch,
  Todo,
  TodoPatch,
  UpdateCheckResult,
} from '../types';

const DEFAULT_TIMEOUT_MS = 10000;

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, DEFAULT_TIMEOUT_MS);

  const signal =
    options?.signal && typeof AbortSignal.any === 'function'
      ? AbortSignal.any([options.signal, controller.signal])
      : options?.signal ?? controller.signal;

  try {
    const hasBody = options?.body !== undefined;
    const res = await fetch(url, {
      ...options,
      signal,
      headers: {
        ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
        ...(options?.headers ?? {}),
      },
    });

    if (!res.ok) {
      let message = 'Sunucu ile iletişim kurulamadı.';
      try {
        const data = await res.json();
        if (typeof data?.error === 'string') {
          message = data.error;
        }
      } catch {
        // Ignore JSON parse error
      }
      throw new Error(message);
    }

    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      if (timedOut) {
        throw new Error('Sunucu yanıt vermedi (zaman aşımı).');
      }
      throw err;
    }
    if (err instanceof Error && err.message && !(err instanceof TypeError)) {
      throw err;
    }
    throw new Error('Sunucu ile bağlantı kurulamadı.');
  } finally {
    window.clearTimeout(timer);
  }
}

const enc = (id: string) => encodeURIComponent(id);

export const api = {
  bootstrap(): Promise<BootstrapPayload> {
    return request<BootstrapPayload>('/api/bootstrap');
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

  createTodo(input: {
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
  }): Promise<Todo> {
    return request<Todo>('/api/todos', {
      method: 'POST',
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
};
