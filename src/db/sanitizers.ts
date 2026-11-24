import type { Priority } from '../types.ts';
import { normalizeHexColor } from '../utils/themes.ts';
import { isValidIsoDateString } from '../utils/todoLogic.ts';

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export interface CategoryRow {
  id: string;
  name: string;
  color: string;
  pinned: number;
  sort_order: number;
  created_at: string;
  deleted_at: string | null;
}

export interface TodoRow {
  id: string;
  title: string;
  notes: string;
  completed: number;
  important: number;
  pinned: number;
  priority: Priority;
  start_date?: string | null;
  due_date: string | null;
  due_time?: string | null;
  tags?: string;
  category_id: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface SubtaskRow {
  id: string;
  todo_id: string;
  title: string;
  completed: number;
  sort_order: number;
}

export const MAX_CATEGORY_NAME_LEN = 60;
export const MAX_TODO_TITLE_LEN = 300;
export const MAX_TODO_NOTES_LEN = 10000;
export const MAX_SUBTASK_TITLE_LEN = 200;
export const MAX_ID_LEN = 128;
export const MAX_IMPORT_CATEGORIES = 500;
export const MAX_IMPORT_TODOS = 10000;
export const MAX_SUBTASKS_PER_TODO = 200;
export const MAX_IMPORT_SUBTASKS = 50000;

export function sanitizeId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_ID_LEN) return null;
  return trimmed;
}

export function sanitizeColor(value: unknown, fallback = '#2563eb'): string {
  if (typeof value !== 'string') return fallback;
  return normalizeHexColor(value) ?? fallback;
}

export function sanitizeDueDate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return isValidIsoDateString(trimmed) ? trimmed : null;
}

export function sanitizeIsoTimestamp(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const dt = new Date(value);
  return Number.isNaN(dt.getTime()) ? fallback : dt.toISOString();
}

export function sanitizePriority(value: unknown, fallback: Priority = 'normal'): Priority {
  if (value === 'high' || value === 'normal' || value === 'low') {
    return value;
  }
  return fallback;
}

export function isGenuineSqliteCorruption(err: unknown): boolean {
  const code = String((err as { code?: unknown })?.code ?? '').toUpperCase();
  const msg = String((err as { message?: unknown })?.message ?? '').toLowerCase();
  return (
    code === 'SQLITE_CORRUPT' ||
    code === 'SQLITE_NOTADB' ||
    msg.includes('database disk image is malformed') ||
    msg.includes('file is not a database')
  );
}
