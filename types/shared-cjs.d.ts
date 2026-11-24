// Typed contracts for shared CommonJS modules consumed by TypeScript server/test layers

declare module '../shared/settingsCodec.cjs' {
  import type { AppSettings } from '../src/types';
  export function readSettingsFromDb(db: unknown): AppSettings;
  export function decodeSettingsMap(map: Record<string, string>): AppSettings;
  export function applySettingsPatchToDb(
    db: unknown,
    patch: Partial<AppSettings> & Record<string, unknown>,
    options?: {
      validateSyncFolder?: (folder: string) => string;
      strictWebhookUrl?: boolean;
      ValidationErrorCtor?: new (msg: string) => Error;
    },
  ): void;
}

declare module '../shared/todoRepository.cjs' {
  import type { AppSettings, BootstrapPayload, Category, Subtask, Todo } from '../src/types';
  export function mapCategoryRow(row: Record<string, unknown>): Category;
  export function mapSubtaskRow(row: Record<string, unknown>): Subtask;
  export function mapTodoRow(row: Record<string, unknown>, subtasks?: Subtask[]): Todo;
  export function attachSubtasks(db: unknown, todoRows: Array<Record<string, unknown>>): Todo[];
  export function getActiveCategories(db: unknown): Category[];
  export function getTrashedCategories(db: unknown): Category[];
  export function getActiveTodos(db: unknown): Todo[];
  export function getTrashedTodos(db: unknown): Todo[];
  export function getTodoById(db: unknown, id: string): Todo | null;
  export function getCategoryById(db: unknown, id: string): Category | null;
  export function getBootstrapSnapshot(
    db: unknown,
    readSettings: (db: unknown) => AppSettings,
  ): BootstrapPayload;
  export function emptyTrashTx(db: unknown): { deletedTodos: number; deletedCategories: number };
  export function resetAllDataTx(db: unknown, opts?: { resetSettings?: boolean }): void;
}

declare module '../shared/sqliteCore.cjs' {
  export const SCHEMA_VERSION: number;
  export function applyAgendameaSchema(db: unknown, options?: { selfHealFts?: boolean }): void;
  export function seedDefaultSettings(db: unknown): void;
}

declare module '../shared/textNormalize.cjs' {
  export function normalizeForSearch(input: string | null | undefined): string;
  export function matchesNormalized(haystack: string | null | undefined, needle: string): boolean;
  export function equalsNormalized(
    a: string | null | undefined,
    b: string | null | undefined,
  ): boolean;
}

declare module '../shared/logger.cjs' {
  export const MAX_LOG_BYTES: number;
  export const MAX_ROTATED_FILES: number;
  export const REDACT_PATHS: string[];
  export function sanitizeTextForLog(value: unknown): string;
  export function resolveLogDir(explicitDataDir?: string): string;
  export function serializeSafeError(err: unknown): Record<string, unknown>;
  export function createAppLogger(options?: {
    processName?: string;
    dataDir?: string;
    level?: string;
    disableFile?: boolean;
  }): {
    logger: Record<string, (...args: unknown[]) => unknown>;
    logFilePath: string;
    flushSync: () => void;
    close: () => void;
  };
  export function getAppLogger(
    processName?: string,
    dataDir?: string,
  ): Record<string, (...args: unknown[]) => unknown>;
  export function flushAllLoggers(): void;
  export function closeAllLoggers(): void;
}

declare module '../shared/crashDiagnostics.cjs' {
  export const MAX_CRASH_REPORTS: number;
  export function sanitizeCrashValue(input: unknown, depth?: number): unknown;
  export function writeCrashReport(options: {
    source: string;
    error?: unknown;
    message?: string;
    stack?: string;
    componentStack?: string;
    context?: Record<string, unknown>;
    dataDir?: string;
  }): { ok: boolean; filePath: string | null; report: Record<string, unknown> };
  export function listCrashReports(
    dataDir?: string,
  ): Array<{ fileName: string; bytes: number; modifiedAt: string }>;
}

declare module '../shared/schemas/index.cjs' {
  type SafeParseResult = {
    success: boolean;
    data?: Record<string, unknown>;
    error?: { issues?: Array<{ message: string; path?: Array<string | number> }> };
  };
  interface ZodLikeSchema {
    safeParse: (input: unknown) => SafeParseResult;
  }
  export const z: unknown;
  export const PrioritySchema: unknown;
  export const SubtaskInputSchema: unknown;
  export const CreateCategoryBodySchema: ZodLikeSchema;
  export const UpdateCategoryBodySchema: ZodLikeSchema;
  export const ReorderIdsBodySchema: ZodLikeSchema;
  export const CreateTodoBodySchema: ZodLikeSchema;
  export const UpdateTodoBodySchema: ZodLikeSchema;
  export const CreateSubtaskBodySchema: ZodLikeSchema;
  export const UpdateSubtaskBodySchema: ZodLikeSchema;
  export const SettingsPatchBodySchema: ZodLikeSchema;
  export const WebhookTestBodySchema: ZodLikeSchema;
  export const CrashReportBodySchema: ZodLikeSchema;
  export const AiAskBodySchema: ZodLikeSchema;
  export const AiRagSearchBodySchema: ZodLikeSchema;
  export const McpAddTaskArgsSchema: ZodLikeSchema;
  export const McpListTasksArgsSchema: ZodLikeSchema;
  export function toMcpJsonSchema(zodSchema: unknown): Record<string, unknown>;
}

declare module '../shared/store/taskQueries.cjs' {
  import type { Category, Subtask, Todo } from '../src/types';
  export function orderActiveFirst(todos: Todo[]): Todo[];
  export function resolveTaskSelector(todos: Todo[], selector: string): Todo;
  export function resolveCategorySelector(categories: Category[], selector: string): Category;
  export function resolveSubtaskSelector(subtasks: Subtask[], selector: string): Subtask;
  export function isScheduledToday(todo: Todo, today: string): boolean;
  export function applyTaskFilters(
    todos: Todo[],
    categories: Category[],
    options?: {
      filter?: string;
      category?: string;
      priority?: string;
      tag?: string;
      query?: string;
      dateFrom?: string;
      dateTo?: string;
      sortBy?: string;
      today?: string;
      tolerateMissingCategory?: boolean;
    },
  ): Todo[];
  export function buildEisenhowerMatrix(
    todos: Todo[],
    today?: string,
  ): { q1: Todo[]; q2: Todo[]; q3: Todo[]; q4: Todo[] };
  export function buildCalendarAgenda(
    todos: Todo[],
    categories: Category[],
    options?: { dateFrom?: string; dateTo?: string; includeCompleted?: boolean; today?: string },
  ): { grouped: Record<string, Todo[]>; undated: Todo[] };
  export function buildKanbanBoard(
    todos: Todo[],
    groupBy?: string,
  ):
    | { groupBy: 'status'; columns: { active: Todo[]; completed: Todo[] } }
    | { groupBy: 'priority'; columns: { high: Todo[]; normal: Todo[]; low: Todo[] } };
}
