import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Calendar, Check, Clock, Copy, Hash, Pencil, Pin, Plus, Star, Trash2, X } from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';
import type { Category, Priority, Subtask, Todo, TodoPatch } from '../types';
import { addDaysToDateString, sanitizeTags } from '../utils/todoLogic';
import { ContextMenu } from './ContextMenu';
import { SelectField } from './SelectField';

interface TodoDetailPanelProps {
  todo: Todo;
  categories: Category[];
  todayStr: string;
  onClose: () => void;
  onUpdate: (
    id: string,
    patch: TodoPatch,
    options?: { keepalive?: boolean },
  ) => Promise<boolean>;
  onToggleComplete?: (id: string, completed: boolean) => void;
  onDelete: (id: string) => void;
  onAddSubtask: (todoId: string, title: string) => Promise<boolean>;
  onToggleSubtask: (todoId: string, subtaskId: string, completed: boolean) => Promise<void>;
  onRenameSubtask?: (todoId: string, subtaskId: string, title: string) => Promise<void>;
  onDeleteSubtask: (todoId: string, subtaskId: string) => Promise<void>;
}

const CREATED_AT_FORMATTER_CACHE = new Map<string, Intl.DateTimeFormat>();

function getCreatedAtFormatter(intlLocale: string): Intl.DateTimeFormat {
  let fmt = CREATED_AT_FORMATTER_CACHE.get(intlLocale);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat(intlLocale, {
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
    });
    CREATED_AT_FORMATTER_CACHE.set(intlLocale, fmt);
  }
  return fmt;
}

function formatCreatedAt(iso: string, intlLocale: string): string {
  try {
    const dt = new Date(iso);
    if (Number.isNaN(dt.getTime())) return '';
    return getCreatedAtFormatter(intlLocale).format(dt);
  } catch {
    return '';
  }
}

export const TodoDetailPanel = React.memo(function TodoDetailPanel({
  todo,
  categories,
  todayStr,
  onClose,
  onUpdate,
  onToggleComplete,
  onDelete,
  onAddSubtask,
  onToggleSubtask,
  onRenameSubtask,
  onDeleteSubtask,
}: TodoDetailPanelProps) {
  const { t, meta } = useI18n();
  const [title, setTitle] = useState(todo.title);
  const [notes, setNotes] = useState(todo.notes);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [editingSubtaskId, setEditingSubtaskId] = useState<string | null>(null);
  const [editingSubtaskTitle, setEditingSubtaskTitle] = useState('');
  const [newTagInput, setNewTagInput] = useState('');
  const [isAddingSubtask, setIsAddingSubtask] = useState(false);
  const [subtaskCtxMenu, setSubtaskCtxMenu] = useState<{
    x: number;
    y: number;
    subtask: Subtask;
  } | null>(null);

  const timerRef = useRef<number | null>(null);
  const isAddingSubtaskRef = useRef(false);
  const skipUnmountFlushRef = useRef(false);
  const isMountedRef = useRef(true);
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  const lastSavedRef = useRef({ id: todo.id, title: todo.title, notes: todo.notes });
  const draftRef = useRef({ id: todo.id, title: todo.title, notes: todo.notes });

  const flushChangesFor = (
    targetId: string,
    nextTitle: string,
    nextNotes: string,
    keepalive = false,
  ) => {
    if (lastSavedRef.current.id !== targetId) return;

    const trimmedTitle = nextTitle.trim();
    const titleChanged = trimmedTitle.length > 0 && trimmedTitle !== lastSavedRef.current.title;
    const notesChanged = nextNotes !== lastSavedRef.current.notes;

    if (!titleChanged && !notesChanged) return;

    const patch: { title?: string; notes?: string } = {};
    if (titleChanged) patch.title = trimmedTitle;
    if (notesChanged) patch.notes = nextNotes;

    const prevSaved = lastSavedRef.current;
    const nextSaved = {
      id: targetId,
      title: titleChanged ? trimmedTitle : prevSaved.title,
      notes: notesChanged ? nextNotes : prevSaved.notes,
    };
    lastSavedRef.current = nextSaved;

    void onUpdateRef.current(targetId, patch, keepalive ? { keepalive: true } : undefined).then(
      (ok) => {
        if (!ok) {
          if (lastSavedRef.current === nextSaved) {
            lastSavedRef.current = prevSaved;
          }
        }
      },
    );
  };

  useEffect(() => {
    if (lastSavedRef.current.id !== todo.id) {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      flushChangesFor(
        lastSavedRef.current.id,
        draftRef.current.title,
        draftRef.current.notes,
      );

      setTitle(todo.title);
      setNotes(todo.notes);
      setNewSubtaskTitle('');
      setEditingSubtaskId(null);
      setEditingSubtaskTitle('');
      setNewTagInput('');
      lastSavedRef.current = { id: todo.id, title: todo.title, notes: todo.notes };
      draftRef.current = { id: todo.id, title: todo.title, notes: todo.notes };
      return;
    }

    if (timerRef.current === null) {
      if (todo.title !== lastSavedRef.current.title) {
        setTitle(todo.title);
        lastSavedRef.current.title = todo.title;
        draftRef.current.title = todo.title;
      }
      if (todo.notes !== lastSavedRef.current.notes) {
        setNotes(todo.notes);
        lastSavedRef.current.notes = todo.notes;
        draftRef.current.notes = todo.notes;
      }
    }
  }, [todo.id, todo.title, todo.notes]);

  const scheduleAutoSave = (nextTitle: string, nextNotes: string) => {
    draftRef.current = { id: todo.id, title: nextTitle, notes: nextNotes };
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
    }
    const targetId = todo.id;
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      flushChangesFor(targetId, nextTitle, nextNotes);
    }, 320);
  };

  useEffect(() => {
    const handleBeforeUnload = () => {
      if (skipUnmountFlushRef.current) return;
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      flushChangesFor(
        lastSavedRef.current.id,
        draftRef.current.title,
        draftRef.current.notes,
        true,
      );
    };

    isMountedRef.current = true;
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      isMountedRef.current = false;
      window.removeEventListener('beforeunload', handleBeforeUnload);
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (!skipUnmountFlushRef.current) {
        flushChangesFor(
          lastSavedRef.current.id,
          draftRef.current.title,
          draftRef.current.notes,
        );
      }
    };
  }, []);

  const handleAddSubtask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isAddingSubtaskRef.current) return;
    const trimmed = newSubtaskTitle.trim();
    if (!trimmed) return;

    const targetTodoId = todo.id;
    isAddingSubtaskRef.current = true;
    setIsAddingSubtask(true);
    try {
      const ok = await onAddSubtask(targetTodoId, trimmed);
      if (ok && isMountedRef.current && draftRef.current.id === targetTodoId) {
        setNewSubtaskTitle('');
      }
    } finally {
      isAddingSubtaskRef.current = false;
      if (isMountedRef.current) {
        setIsAddingSubtask(false);
      }
    }
  };

  const tomorrowStr = useMemo(() => addDaysToDateString(todayStr, 1), [todayStr]);
  const createdFormatted = useMemo(
    () => formatCreatedAt(todo.createdAt, meta.intlLocale),
    [todo.createdAt, meta.intlLocale],
  );

  const priorities: Array<{ value: Priority; label: string }> = [
    { value: 'low', label: t.priorityLow },
    { value: 'normal', label: t.priorityNormal },
    { value: 'high', label: t.priorityHigh },
  ];

  const hasAnyDate = Boolean(todo.startDate || todo.dueDate || todo.dueTime);
  const currentTags = todo.tags ?? [];

  const handleAddTag = (e: React.FormEvent) => {
    e.preventDefault();
    const raw = newTagInput.trim();
    if (!raw) return;
    const rawTokens = raw.split(/[,;\s]+/).filter(Boolean);
    const merged = sanitizeTags([...currentTags, ...rawTokens]);
    setNewTagInput('');
    if (merged.length !== currentTags.length) {
      void onUpdate(todo.id, { tags: merged });
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    const next = currentTags.filter((tg) => tg !== tagToRemove);
    void onUpdate(todo.id, { tags: next });
  };

  return (
    <aside
      aria-label={todo.title}
      className="animate-slide-in-right fixed inset-y-0 right-0 z-30 flex w-full max-w-[380px] flex-col border-l border-[var(--border)] bg-[var(--surface)] lg:relative lg:z-auto lg:w-[368px] shrink-0"
    >
      {/* Top frameless drag clearance (stops before top-right WindowControls) */}
      <div
        aria-hidden="true"
        className="app-drag-region absolute start-0 end-36 top-0 z-10 h-9 select-none"
      />

      {/* Top Bar */}
      <div className="flex items-center justify-between border-b border-[var(--border)] px-5 pt-11 pb-3">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() =>
              onToggleComplete
                ? onToggleComplete(todo.id, !todo.completed)
                : void onUpdate(todo.id, { completed: !todo.completed })
            }
            aria-pressed={todo.completed}
            className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--canvas)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors whitespace-nowrap"
          >
            <span
              className="flex h-4 w-4 items-center justify-center rounded-full border"
              style={
                todo.completed
                  ? {
                      backgroundColor: 'var(--accent)',
                      borderColor: 'var(--accent)',
                      color: 'var(--accent-fg)',
                    }
                  : { borderColor: 'var(--border-strong)' }
              }
            >
              {todo.completed && <Check className="h-2.5 w-2.5 stroke-[3]" />}
            </span>
            <span>{todo.completed ? t.markCompletedDone : t.markComplete}</span>
          </button>

          <button
            type="button"
            onClick={() => void onUpdate(todo.id, { pinned: !todo.pinned })}
            aria-label={todo.pinned ? t.unpinLabel : t.pinLabel}
            aria-pressed={todo.pinned}
            title={todo.pinned ? t.unpinLabel : t.pinLabel}
            className={`flex h-8 w-8 items-center justify-center rounded-lg border transition-colors ${
              todo.pinned
                ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]'
                : 'border-[var(--border)] bg-[var(--canvas)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Pin className={`h-3.5 w-3.5 ${todo.pinned ? 'fill-current' : ''}`} />
          </button>

          <button
            type="button"
            onClick={() => void onUpdate(todo.id, { important: !todo.important })}
            aria-label={t.important}
            aria-pressed={todo.important}
            title={t.important}
            className={`flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] transition-colors ${
              todo.important
                ? 'bg-amber-500/10 text-amber-500 border-amber-500/30'
                : 'bg-[var(--canvas)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Star className={`h-4 w-4 ${todo.important ? 'fill-current' : ''}`} />
          </button>
        </div>

        <button
          type="button"
          onClick={() => {
            if (timerRef.current) {
              window.clearTimeout(timerRef.current);
              timerRef.current = null;
            }
            flushChangesFor(todo.id, title, notes);
            onClose();
          }}
          aria-label={t.closeMenu}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {/* Title & Notes (Instant Auto-Save) */}
        <div className="space-y-2">
          <input
            type="text"
            value={title}
            onChange={(e) => {
              const val = e.target.value;
              setTitle(val);
              scheduleAutoSave(val, notes);
            }}
            onBlur={() => flushChangesFor(todo.id, title, notes)}
            maxLength={300}
            aria-label={t.taskTitlePlaceholder}
            placeholder={t.taskTitlePlaceholder}
            className={`w-full bg-transparent font-display text-lg font-semibold leading-snug text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none ${
              todo.completed ? 'line-through text-[var(--text-muted)]' : ''
            }`}
          />

          <textarea
            value={notes}
            onChange={(e) => {
              const val = e.target.value;
              setNotes(val);
              scheduleAutoSave(title, val);
            }}
            onBlur={() => flushChangesFor(todo.id, title, notes)}
            rows={3}
            maxLength={10000}
            aria-label={t.notesPlaceholder}
            placeholder={t.notesPlaceholder}
            className="w-full resize-y min-h-[76px] max-h-[280px] rounded-lg border border-[var(--border)] bg-[var(--canvas)] px-3 py-2 text-sm leading-relaxed text-[var(--text-primary)] placeholder:text-[var(--text-muted)] transition-colors focus:border-[var(--border-strong)] focus:outline-none"
          />
        </div>

        {/* Subtasks */}
        <section aria-label={t.subtasksTitle} className="space-y-2.5">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-xs font-semibold text-[var(--text-muted)]">
              {t.subtasksTitle}
            </h3>
            {todo.subtasks.length > 0 && (
              <span className="font-mono-tabular text-xs text-[var(--text-muted)]">
                {todo.subtasks.filter((s) => s.completed).length}/{todo.subtasks.length}
              </span>
            )}
          </div>

          <div className="space-y-1">
            {todo.subtasks.map((sub) => (
              <div
                key={sub.id}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setSubtaskCtxMenu({ x: e.clientX, y: e.clientY, subtask: sub });
                }}
                className="group flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-[var(--surface-hover)] transition-colors"
              >
                <button
                  type="button"
                  onClick={() => void onToggleSubtask(todo.id, sub.id, !sub.completed)}
                  aria-label={sub.title}
                  className="flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors"
                  style={
                    sub.completed
                      ? {
                          backgroundColor: 'var(--accent)',
                          borderColor: 'var(--accent)',
                          color: 'var(--accent-fg)',
                        }
                      : { borderColor: 'var(--border-strong)' }
                  }
                >
                  {sub.completed && <Check className="h-2.5 w-2.5 stroke-[3]" />}
                </button>
                {editingSubtaskId === sub.id ? (
                  <input
                    type="text"
                    autoFocus
                    value={editingSubtaskTitle}
                    maxLength={200}
                    aria-label={sub.title}
                    onChange={(e) => setEditingSubtaskTitle(e.target.value)}
                    onBlur={() => {
                      const next = editingSubtaskTitle.trim();
                      setEditingSubtaskId(null);
                      if (next && next !== sub.title) {
                        void onRenameSubtask?.(todo.id, sub.id, next);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        const next = editingSubtaskTitle.trim();
                        setEditingSubtaskId(null);
                        if (next && next !== sub.title) {
                          void onRenameSubtask?.(todo.id, sub.id, next);
                        }
                      } else if (e.key === 'Escape') {
                        e.preventDefault();
                        setEditingSubtaskId(null);
                      }
                    }}
                    className="flex-1 min-w-0 rounded border border-[var(--border-strong)] bg-[var(--canvas)] px-2 py-0.5 text-sm text-[var(--text-primary)] focus:outline-none"
                  />
                ) : (
                  <span
                    onDoubleClick={() => {
                      setEditingSubtaskId(sub.id);
                      setEditingSubtaskTitle(sub.title);
                    }}
                    className={`flex-1 min-w-0 text-sm break-words cursor-text ${
                      sub.completed
                        ? 'line-through text-[var(--text-muted)]'
                        : 'text-[var(--text-primary)]'
                    }`}
                  >
                    {sub.title}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => void onDeleteSubtask(todo.id, sub.id)}
                  aria-label={`${t.deleteToTrashButton}: ${sub.title}`}
                  className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 text-[var(--text-muted)] hover:text-red-500 p-1 rounded transition-opacity"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>

          <form onSubmit={handleAddSubtask} className="flex items-center gap-2">
            <input
              type="text"
              value={newSubtaskTitle}
              onChange={(e) => setNewSubtaskTitle(e.target.value)}
              disabled={isAddingSubtask}
              maxLength={200}
              aria-label={t.addSubtaskPlaceholder}
              placeholder={t.addSubtaskPlaceholder}
              className="flex-1 min-w-0 rounded-lg border border-[var(--border)] bg-[var(--canvas)] px-3 py-1.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] transition-colors focus:border-[var(--border-strong)] focus:outline-none disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={!newSubtaskTitle.trim() || isAddingSubtask}
              aria-label={t.addButton}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--canvas)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] disabled:opacity-35"
            >
              <Plus className="h-4 w-4" />
            </button>
          </form>
        </section>

        {/* Post-Creation Tags (#tag - Microsoft To Do style) */}
        <section aria-label={t.tagsLabel} className="space-y-2.5">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-xs font-semibold text-[var(--text-muted)]">
              {t.tagsLabel}
            </h3>
            {currentTags.length > 0 && (
              <span className="font-mono-tabular text-xs text-[var(--text-muted)]">
                {currentTags.length}/12
              </span>
            )}
          </div>

          {currentTags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {currentTags.map((tag) => (
                <span
                  key={tag}
                  data-testid="detail-tag-chip"
                  className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--canvas)] px-2.5 py-1 text-xs font-medium text-[var(--text-primary)]"
                >
                  <Hash className="h-3 w-3 text-[var(--accent)] shrink-0" />
                  <span>{tag}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveTag(tag)}
                    aria-label={`${t.clearDate}: #${tag}`}
                    className="ml-0.5 rounded p-0.5 text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-red-500 transition-colors"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          <form onSubmit={handleAddTag} className="flex items-center gap-2">
            <input
              type="text"
              data-testid="detail-tag-input"
              value={newTagInput}
              onChange={(e) => setNewTagInput(e.target.value)}
              disabled={currentTags.length >= 12}
              maxLength={40}
              aria-label={t.addTagPlaceholder}
              placeholder={t.addTagPlaceholder}
              className="flex-1 min-w-0 rounded-lg border border-[var(--border)] bg-[var(--canvas)] px-3 py-1.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] transition-colors focus:border-[var(--border-strong)] focus:outline-none disabled:opacity-45"
            />
            <button
              type="submit"
              data-testid="detail-tag-add-button"
              disabled={!newTagInput.trim() || currentTags.length >= 12}
              aria-label={t.addButton}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--canvas)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] disabled:opacity-35"
            >
              <Plus className="h-4 w-4" />
            </button>
          </form>
        </section>

        <div className="h-px bg-[var(--border)]" />

        {/* Structured Properties */}
        <div className="space-y-4">
          {/* Category */}
          <div className="space-y-1.5">
            <label
              htmlFor="detail-category-select"
              className="block font-display text-xs font-semibold text-[var(--text-muted)]"
            >
              {t.categories}
            </label>
            <SelectField
              id="detail-category-select"
              value={todo.categoryId ?? ''}
              onChange={(e) => void onUpdate(todo.id, { categoryId: e.target.value || null })}
              wrapperClassName="w-full"
              selectClassName="py-2 text-sm"
            >
              <option value="" className="bg-[var(--surface)]">
                {t.uncategorized}
              </option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id} className="bg-[var(--surface)]">
                  {cat.name}
                </option>
              ))}
            </SelectField>
          </div>

          {/* Priority */}
          <div className="space-y-1.5">
            <p className="font-display text-xs font-semibold text-[var(--text-muted)]">
              {t.priorityLabel}
            </p>
            <div className="grid grid-cols-3 gap-1 rounded-lg bg-[var(--surface-subtle)] p-1 border border-[var(--border)]">
              {priorities.map(({ value, label }) => {
                const active = todo.priority === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => void onUpdate(todo.id, { priority: value })}
                    aria-pressed={active}
                    className={`rounded-md py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                      active
                        ? 'bg-[var(--surface)] text-[var(--text-primary)] border border-[var(--border)] shadow-xs'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Optional Start Date & End / Due Date */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-display text-xs font-semibold text-[var(--text-muted)]">
                {t.dateButton}
              </span>
              {hasAnyDate && (
                <button
                  type="button"
                  onClick={() =>
                    void onUpdate(todo.id, { startDate: null, dueDate: null, dueTime: null })
                  }
                  className="rounded-md px-2 py-0.5 text-xs font-medium text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] whitespace-nowrap"
                >
                  {t.clearDate}
                </button>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => void onUpdate(todo.id, { startDate: null, dueDate: todayStr })}
                className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                  todo.dueDate === todayStr && !todo.startDate
                    ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text-primary)]'
                    : 'border-[var(--border)] bg-[var(--canvas)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]'
                }`}
              >
                {t.today}
              </button>
              <button
                type="button"
                onClick={() => void onUpdate(todo.id, { startDate: null, dueDate: tomorrowStr })}
                className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                  todo.dueDate === tomorrowStr && !todo.startDate
                    ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text-primary)]'
                    : 'border-[var(--border)] bg-[var(--canvas)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]'
                }`}
              >
                {t.tomorrow}
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="space-y-1">
                <label
                  htmlFor="detail-start-date"
                  className="block text-[11px] font-medium text-[var(--text-muted)]"
                >
                  {t.startDateLabel}
                </label>
                <div className="relative flex items-center">
                  <Calendar className="pointer-events-none absolute start-2.5 h-3.5 w-3.5 text-[var(--text-muted)]" />
                  <input
                    id="detail-start-date"
                    type="date"
                    value={todo.startDate ?? ''}
                    onChange={(e) =>
                      void onUpdate(todo.id, { startDate: e.target.value || null })
                    }
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--canvas)] ps-8 pe-2 py-1.5 text-xs text-[var(--text-primary)] transition-colors focus:border-[var(--border-strong)] focus:outline-none"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label
                  htmlFor="detail-due-date"
                  className="block text-[11px] font-medium text-[var(--text-muted)]"
                >
                  {t.dueDateLabel}
                </label>
                <div className="relative flex items-center">
                  <Calendar className="pointer-events-none absolute start-2.5 h-3.5 w-3.5 text-[var(--text-muted)]" />
                  <input
                    id="detail-due-date"
                    type="date"
                    value={todo.dueDate ?? ''}
                    onChange={(e) =>
                      void onUpdate(todo.id, { dueDate: e.target.value || null })
                    }
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--canvas)] ps-8 pe-2 py-1.5 text-xs text-[var(--text-primary)] transition-colors focus:border-[var(--border-strong)] focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Optional Due Time Input */}
            <div className="space-y-1">
              <label
                htmlFor="detail-due-time"
                className="block text-[11px] font-medium text-[var(--text-muted)]"
              >
                {t.dueTimeLabel}
              </label>
              <div className="relative flex items-center gap-1.5">
                <div className="relative flex flex-1 items-center">
                  <Clock className="pointer-events-none absolute start-2.5 h-3.5 w-3.5 text-[var(--text-muted)]" />
                  <input
                    id="detail-due-time"
                    type="time"
                    value={todo.dueTime ?? ''}
                    onChange={(e) => {
                      const nextTime = e.target.value || null;
                      const patch: TodoPatch = { dueTime: nextTime };
                      if (nextTime && !todo.dueDate && !todo.startDate) {
                        patch.dueDate = todayStr;
                      }
                      void onUpdate(todo.id, patch);
                    }}
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--canvas)] ps-8 pe-2 py-1.5 text-xs text-[var(--text-primary)] transition-colors focus:border-[var(--border-strong)] focus:outline-none"
                  />
                </div>
                {todo.dueTime && (
                  <button
                    type="button"
                    onClick={() => void onUpdate(todo.id, { dueTime: null })}
                    aria-label={t.clearDate}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--canvas)] text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>

            <p className="text-[11px] leading-snug text-[var(--text-muted)]">
              {t.optionalDateHint}
            </p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-[var(--border)] px-5 py-3 text-xs text-[var(--text-muted)]">
        <span>
          {createdFormatted ? `${t.createdPrefix}: ${createdFormatted}` : ''}
        </span>
        <button
          type="button"
          onClick={() => {
            skipUnmountFlushRef.current = true;
            if (timerRef.current) {
              window.clearTimeout(timerRef.current);
              timerRef.current = null;
            }
            onDelete(todo.id);
          }}
          className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-500/10 transition-colors whitespace-nowrap"
        >
          <Trash2 className="h-3.5 w-3.5" />
          <span>{t.deleteToTrashButton}</span>
        </button>
      </div>

      {subtaskCtxMenu && (
        <ContextMenu
          testId="subtask-context-menu"
          x={subtaskCtxMenu.x}
          y={subtaskCtxMenu.y}
          onClose={() => setSubtaskCtxMenu(null)}
          items={[
            {
              id: 'toggle',
              label: subtaskCtxMenu.subtask.completed ? t.markCompletedDone : t.markComplete,
              icon: <Check className="h-3.5 w-3.5" />,
              onSelect: () =>
                void onToggleSubtask(
                  todo.id,
                  subtaskCtxMenu.subtask.id,
                  !subtaskCtxMenu.subtask.completed,
                ),
            },
            {
              id: 'rename',
              label: t.ctxRename,
              icon: <Pencil className="h-3.5 w-3.5" />,
              onSelect: () => {
                setEditingSubtaskId(subtaskCtxMenu.subtask.id);
                setEditingSubtaskTitle(subtaskCtxMenu.subtask.title);
              },
            },
            {
              id: 'copy',
              label: t.ctxCopyTitle,
              icon: <Copy className="h-3.5 w-3.5" />,
              onSelect: () => {
                void navigator.clipboard?.writeText?.(subtaskCtxMenu.subtask.title).catch(() => {});
              },
            },
            { id: 'div-1', divider: true },
            {
              id: 'delete',
              label: t.ctxDeleteSubtask,
              icon: <Trash2 className="h-3.5 w-3.5" />,
              danger: true,
              onSelect: () => void onDeleteSubtask(todo.id, subtaskCtxMenu.subtask.id),
            },
          ]}
        />
      )}
    </aside>
  );
});
