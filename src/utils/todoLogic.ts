import type {
  ActiveView,
  Category,
  MatrixQuadrant,
  Priority,
  SmartView,
  SortOption,
  StatusFilter,
  Todo,
} from '../types';

const PRIORITY_WEIGHT: Record<Priority, number> = {
  high: 3,
  normal: 2,
  low: 1,
};

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_24H_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const MAX_TAGS_PER_TODO = 12;
const MAX_TAG_LEN = 28;

export function isValidTimeString(value: string): boolean {
  return TIME_24H_RE.test(value);
}

export function sanitizeDueTime(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return isValidTimeString(trimmed) ? trimmed : null;
}

export function sanitizeTagName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const cleaned = raw
    .trim()
    .replace(/^#+/, '')
    .replace(/\s+/g, '-')
    .slice(0, MAX_TAG_LEN);
  return cleaned.length > 0 ? cleaned : null;
}

export function sanitizeTags(value: unknown): string[] {
  let list: unknown[] = [];
  if (Array.isArray(value)) {
    list = value;
  } else if (typeof value === 'string' && value.trim().startsWith('[')) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) list = parsed;
    } catch {
      list = [];
    }
  }
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of list) {
    if (result.length >= MAX_TAGS_PER_TODO) break;
    const tag = sanitizeTagName(item);
    if (!tag) continue;
    const key = normalizeTurkish(tag);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(tag);
    }
  }
  return result;
}

const FORMATTER_CACHE = new Map<string, Intl.DateTimeFormat>();

function getShortDateFormatter(locale = 'tr-TR'): Intl.DateTimeFormat {
  let fmt = FORMATTER_CACHE.get(locale);
  if (!fmt) {
    try {
      fmt = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' });
    } catch {
      fmt = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short' });
    }
    FORMATTER_CACHE.set(locale, fmt);
  }
  return fmt;
}

export function isValidIsoDateString(value: string): boolean {
  if (!ISO_DATE_RE.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return (
    !Number.isNaN(dt.getTime()) &&
    dt.getFullYear() === y &&
    dt.getMonth() === m - 1 &&
    dt.getDate() === d
  );
}

export function normalizeDateRange(
  startDate: string | null | undefined,
  dueDate: string | null | undefined,
): { startDate: string | null; dueDate: string | null } {
  const validStart =
    typeof startDate === 'string' && isValidIsoDateString(startDate.trim())
      ? startDate.trim()
      : null;
  const validDue =
    typeof dueDate === 'string' && isValidIsoDateString(dueDate.trim())
      ? dueDate.trim()
      : null;

  if (validStart && validDue && validStart > validDue) {
    return { startDate: validDue, dueDate: validStart };
  }
  return { startDate: validStart, dueDate: validDue };
}

export function getLocalDateString(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function addDaysToDateString(baseDateStr: string, days: number): string {
  if (!isValidIsoDateString(baseDateStr)) {
    return getLocalDateString();
  }
  const [y, m, d] = baseDateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return getLocalDateString(dt);
}

let cachedRelativeBase = '';
let cachedTomorrowStr = '';
let cachedYesterdayStr = '';

function getRelativeDayBounds(todayStr: string): {
  tomorrowStr: string;
  yesterdayStr: string;
} {
  if (cachedRelativeBase !== todayStr) {
    cachedRelativeBase = todayStr;
    cachedTomorrowStr = addDaysToDateString(todayStr, 1);
    cachedYesterdayStr = addDaysToDateString(todayStr, -1);
  }
  return {
    tomorrowStr: cachedTomorrowStr,
    yesterdayStr: cachedYesterdayStr,
  };
}

export interface RelativeDateLabels {
  today: string;
  tomorrow: string;
  yesterday: string;
}

const DEFAULT_TR_DATE_LABELS: RelativeDateLabels = {
  today: 'Bugün',
  tomorrow: 'Yarın',
  yesterday: 'Dün',
};

export function formatDueDateLabel(
  dueDate: string | null | undefined,
  todayStr: string = getLocalDateString(),
  locale = 'tr-TR',
  labels: RelativeDateLabels = DEFAULT_TR_DATE_LABELS,
): { label: string; isOverdue: boolean; isToday: boolean } | null {
  if (!dueDate || !isValidIsoDateString(dueDate)) return null;
  const { tomorrowStr, yesterdayStr } = getRelativeDayBounds(todayStr);

  if (dueDate === todayStr) {
    return { label: labels.today, isOverdue: false, isToday: true };
  }
  if (dueDate === tomorrowStr) {
    return { label: labels.tomorrow, isOverdue: false, isToday: false };
  }
  if (dueDate === yesterdayStr) {
    return { label: labels.yesterday, isOverdue: true, isToday: false };
  }

  const [y, m, d] = dueDate.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  if (Number.isNaN(dt.getTime())) return null;

  return {
    label: getShortDateFormatter(locale).format(dt),
    isOverdue: dueDate < todayStr,
    isToday: false,
  };
}

export function formatTodoDateSchedule(
  startDate: string | null | undefined,
  dueDate: string | null | undefined,
  todayStr: string = getLocalDateString(),
  locale = 'tr-TR',
  labels: RelativeDateLabels = DEFAULT_TR_DATE_LABELS,
  dueTime?: string | null,
): { label: string; isOverdue: boolean; isToday: boolean; isRange: boolean } | null {
  const { startDate: normStart, dueDate: normDue } = normalizeDateRange(startDate, dueDate);
  const validTime = sanitizeDueTime(dueTime);
  const timeSuffix = validTime ? ` · ${validTime}` : '';

  if (!normStart && !normDue) return null;

  if (!normStart && normDue) {
    const dueInfo = formatDueDateLabel(normDue, todayStr, locale, labels);
    return dueInfo ? { ...dueInfo, label: `${dueInfo.label}${timeSuffix}`, isRange: false } : null;
  }

  if (normStart && !normDue) {
    const startInfo = formatDueDateLabel(normStart, todayStr, locale, labels);
    if (!startInfo) return null;
    return {
      label: `${startInfo.label}${timeSuffix}`,
      isOverdue: false,
      isToday: normStart <= todayStr,
      isRange: false,
    };
  }

  // Both startDate and dueDate present
  if (normStart === normDue) {
    const singleInfo = formatDueDateLabel(normDue, todayStr, locale, labels);
    return singleInfo
      ? { ...singleInfo, label: `${singleInfo.label}${timeSuffix}`, isRange: false }
      : null;
  }

  const startInfo = formatDueDateLabel(normStart, todayStr, locale, labels);
  const dueInfo = formatDueDateLabel(normDue, todayStr, locale, labels);
  if (!startInfo || !dueInfo) return null;

  return {
    label: `${startInfo.label} - ${dueInfo.label}${timeSuffix}`,
    isOverdue: dueInfo.isOverdue,
    isToday: (normStart! <= todayStr && todayStr <= normDue!) || dueInfo.isToday,
    isRange: true,
  };
}

export function isTodoScheduledForToday(todo: Pick<Todo, 'startDate' | 'dueDate'>, todayStr: string): boolean {
  const { startDate, dueDate } = normalizeDateRange(todo.startDate, todo.dueDate);
  if (dueDate !== null && dueDate <= todayStr) {
    return true;
  }
  if (startDate !== null && startDate <= todayStr && (dueDate === null || dueDate >= todayStr)) {
    return true;
  }
  return false;
}

export function getPriorityLabel(priority: Priority): string {
  switch (priority) {
    case 'high':
      return 'Yüksek';
    case 'low':
      return 'Düşük';
    default:
      return 'Normal';
  }
}

export function normalizeTurkish(text: string): string {
  return text.toLocaleLowerCase('tr-TR').trim();
}

function matchesMultilingualSearch(haystack: string, qTr: string, qStd: string): boolean {
  return (
    normalizeTurkish(haystack).includes(qTr) ||
    haystack.toLowerCase().trim().includes(qStd)
  );
}

export function filterAndSortTodos(params: {
  todos: Todo[];
  activeView: ActiveView;
  statusFilter: StatusFilter;
  searchQuery: string;
  sortBy: SortOption;
  todayStr?: string;
  tagFilter?: string | null;
}): Todo[] {
  const {
    todos,
    activeView,
    statusFilter,
    searchQuery,
    sortBy,
    todayStr = getLocalDateString(),
    tagFilter = null,
  } = params;

  const q = normalizeTurkish(searchQuery);
  const qStd = searchQuery.toLowerCase().trim();
  const qTag = q.startsWith('#') ? q.slice(1) : q;
  const qTagStd = qStd.startsWith('#') ? qStd.slice(1) : qStd;
  const normalizedTagFilter = tagFilter ? tagFilter.trim().toLowerCase() : null;

  const filtered = todos.filter((todo) => {
    // View scoping
    if (activeView.type === 'smart') {
      if (activeView.id === 'today') {
        if (!isTodoScheduledForToday(todo, todayStr)) return false;
      } else if (activeView.id === 'important') {
        if (!todo.important) return false;
      } else if (activeView.id === 'completed') {
        if (!todo.completed) return false;
      }
    } else {
      if (todo.categoryId !== activeView.id) return false;
    }

    // Status filter (when not already in dedicated 'completed' smart view)
    if (!(activeView.type === 'smart' && activeView.id === 'completed')) {
      if (statusFilter === 'active' && todo.completed) return false;
      if (statusFilter === 'completed' && !todo.completed) return false;
    }

    // Active tag chip filter
    if (normalizedTagFilter) {
      const hasTag = (todo.tags ?? []).some((tg) => tg.toLowerCase() === normalizedTagFilter);
      if (!hasTag) return false;
    }

    // Search query matching title, notes, subtasks, or tags (supports both Turkish İ/ı and international I/i)
    if (q.length > 0) {
      const inTitle = matchesMultilingualSearch(todo.title, q, qStd);
      const inNotes = matchesMultilingualSearch(todo.notes, q, qStd);
      const inSubtasks = todo.subtasks.some((s) => matchesMultilingualSearch(s.title, q, qStd));
      const inTags =
        qTag.length > 0 &&
        (todo.tags ?? []).some((tg) => matchesMultilingualSearch(tg, qTag, qTagStd));
      if (!inTitle && !inNotes && !inSubtasks && !inTags) return false;
    }

    return true;
  });

  return [...filtered].sort((a, b) => {
    // Always float active tasks above completed tasks in mixed views
    if (a.completed !== b.completed) {
      return a.completed ? 1 : -1;
    }

    // Keep pinned tasks at the top within their status group
    if (a.pinned !== b.pinned) {
      return a.pinned ? -1 : 1;
    }

    if (sortBy === 'priority') {
      const diff = PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority];
      if (diff !== 0) return diff;
    } else if (sortBy === 'dueDate') {
      const dateA = a.dueDate ?? a.startDate ?? null;
      const dateB = b.dueDate ?? b.startDate ?? null;
      if (dateA && dateB && dateA !== dateB) {
        return dateA.localeCompare(dateB);
      }
      if (dateA && !dateB) return -1;
      if (!dateA && dateB) return 1;
      const timeA = sanitizeDueTime(a.dueTime);
      const timeB = sanitizeDueTime(b.dueTime);
      if (timeA && timeB && timeA !== timeB) {
        return timeA.localeCompare(timeB);
      }
      if (timeA && !timeB) return -1;
      if (!timeA && timeB) return 1;
    } else if (sortBy === 'newest') {
      const diff = b.createdAt.localeCompare(a.createdAt);
      if (diff !== 0) return diff;
    }

    // Default / tie-breaker: manual sortOrder ascending, then newest first
    if (a.sortOrder !== b.sortOrder) {
      return a.sortOrder - b.sortOrder;
    }
    return b.createdAt.localeCompare(a.createdAt);
  });
}

export function classifyEisenhowerQuadrant(
  todo: Pick<Todo, 'important' | 'priority' | 'startDate' | 'dueDate'>,
  todayStr: string = getLocalDateString(),
): MatrixQuadrant {
  const isImportant = Boolean(todo.important || todo.priority === 'high');
  const isUrgent = isTodoScheduledForToday(todo, todayStr);
  if (isImportant && isUrgent) return 'q1';
  if (isImportant && !isUrgent) return 'q2';
  if (!isImportant && isUrgent) return 'q3';
  return 'q4';
}

export function isTodoOnCalendarDate(
  todo: Pick<Todo, 'startDate' | 'dueDate'>,
  dateStr: string,
): boolean {
  const { startDate, dueDate } = normalizeDateRange(todo.startDate, todo.dueDate);
  if (!startDate && !dueDate) return false;
  if (startDate && dueDate) {
    return startDate <= dateStr && dateStr <= dueDate;
  }
  return (dueDate ?? startDate) === dateStr;
}

export function computeViewCounts(
  todos: Todo[],
  categories: Category[],
  todayStr: string = getLocalDateString(),
): {
  smart: Record<SmartView, number>;
  categories: Record<string, number>;
} {
  const smart: Record<SmartView, number> = {
    all: 0,
    today: 0,
    important: 0,
    completed: 0,
  };

  const catCounts: Record<string, number> = {};
  for (const cat of categories) {
    catCounts[cat.id] = 0;
  }

  for (const todo of todos) {
    if (todo.completed) {
      smart.completed += 1;
    } else {
      smart.all += 1;
      if (isTodoScheduledForToday(todo, todayStr)) {
        smart.today += 1;
      }
      if (todo.important) {
        smart.important += 1;
      }
      if (todo.categoryId && catCounts[todo.categoryId] !== undefined) {
        catCounts[todo.categoryId] += 1;
      }
    }
  }

  return { smart, categories: catCounts };
}

export function moveIdRelative(
  ids: string[],
  draggedId: string,
  targetId: string,
  position: 'before' | 'after',
): string[] {
  if (draggedId === targetId) return [...ids];
  if (!ids.includes(draggedId) || !ids.includes(targetId)) return [...ids];

  const remaining = ids.filter((id) => id !== draggedId);
  const targetIdx = remaining.indexOf(targetId);
  if (targetIdx === -1) return [...ids];

  const insertIdx = position === 'after' ? targetIdx + 1 : targetIdx;
  remaining.splice(insertIdx, 0, draggedId);
  return remaining;
}

export function sortCategoriesWithPin(categories: Category[]): Category[] {
  return [...categories].sort((a, b) => {
    if (a.pinned !== b.pinned) {
      return a.pinned ? -1 : 1;
    }
    if (a.sortOrder !== b.sortOrder) {
      return a.sortOrder - b.sortOrder;
    }
    return a.createdAt.localeCompare(b.createdAt);
  });
}

export function getVerticalDropPosition(
  clientY: number,
  rect: DOMRect,
): 'before' | 'after' {
  return clientY - rect.top < rect.height / 2 ? 'before' : 'after';
}

export function compareSemver(a: string, b: string): number {
  const cleanA = a.trim().replace(/^v/i, '').split('-')[0];
  const cleanB = b.trim().replace(/^v/i, '').split('-')[0];
  const partsA = cleanA.split('.').map((n) => Number.parseInt(n, 10) || 0);
  const partsB = cleanB.split('.').map((n) => Number.parseInt(n, 10) || 0);
  const len = Math.max(partsA.length, partsB.length, 3);
  for (let i = 0; i < len; i += 1) {
    const va = partsA[i] ?? 0;
    const vb = partsB[i] ?? 0;
    if (va > vb) return 1;
    if (va < vb) return -1;
  }
  return 0;
}
