import { Check, Copy, Pencil, Pin, Star, Trash2, X } from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../i18n/I18nContext';
import type { Category, Subtask, Todo, TodoPatch } from '../types';
import { getCachedDateTimeFormatter } from '../utils/intlCache';
import { addDaysToDateString, sanitizeTags } from '../utils/todoLogic';
import { ContextMenu } from './ContextMenu';
import { TodoScheduleSection } from './detail/TodoScheduleSection';
import { TodoSubtaskList } from './detail/TodoSubtaskList';
import { TodoTagsSection } from './detail/TodoTagsSection';

interface TodoDetailPanelProps {
  todo: Todo;
  categories: Category[];
  todayStr: string;
  onClose: () => void;
  onUpdate: (id: string, patch: TodoPatch, options?: { keepalive?: boolean }) => Promise<boolean>;
  onToggleComplete?: (id: string, completed: boolean) => void;
  onDelete: (id: string) => void;
  onAddSubtask: (todoId: string, title: string) => Promise<boolean>;
  onToggleSubtask: (todoId: string, subtaskId: string, completed: boolean) => Promise<void>;
  onRenameSubtask?: (todoId: string, subtaskId: string, title: string) => Promise<void>;
  onDeleteSubtask: (todoId: string, subtaskId: string) => Promise<void>;
}

function getCreatedAtFormatter(intlLocale: string): Intl.DateTimeFormat {
  return getCachedDateTimeFormatter(intlLocale, 'todo-created-at', {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });
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

  const flushChangesRef = useRef(
    (targetId: string, nextTitle: string, nextNotes: string, keepalive = false) => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
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

      void onUpdateRef
        .current(targetId, patch, keepalive ? { keepalive: true } : undefined)
        .then((ok) => {
          if (!ok && lastSavedRef.current === nextSaved) {
            lastSavedRef.current = prevSaved;
          }
        });
    },
  );

  const flushChangesFor = (
    targetId: string,
    nextTitle: string,
    nextNotes: string,
    keepalive = false,
  ) => {
    flushChangesRef.current(targetId, nextTitle, nextNotes, keepalive);
  };

  useEffect(() => {
    if (lastSavedRef.current.id !== todo.id) {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      flushChangesRef.current(
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
    if (timerRef.current) window.clearTimeout(timerRef.current);
    const targetId = todo.id;
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      flushChangesRef.current(targetId, nextTitle, nextNotes);
    }, 320);
  };

  useEffect(() => {
    const handleBeforeUnload = () => {
      if (skipUnmountFlushRef.current) return;
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      flushChangesRef.current(
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
        flushChangesRef.current(
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
      if (isMountedRef.current) setIsAddingSubtask(false);
    }
  };

  const tomorrowStr = useMemo(() => addDaysToDateString(todayStr, 1), [todayStr]);
  const createdFormatted = useMemo(
    () => formatCreatedAt(todo.createdAt, meta.intlLocale),
    [todo.createdAt, meta.intlLocale],
  );
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
    void onUpdate(todo.id, { tags: currentTags.filter((tg) => tg !== tagToRemove) });
  };

  const handleCommitEditSubtask = (sub: Subtask) => {
    const next = editingSubtaskTitle.trim();
    setEditingSubtaskId(null);
    if (next && next !== sub.title) {
      void onRenameSubtask?.(todo.id, sub.id, next);
    }
  };

  return (
    <aside
      aria-label={todo.title}
      className="animate-slide-in-right fixed inset-y-0 end-0 z-30 flex w-full max-w-[380px] flex-col border-s border-[var(--border)] bg-[var(--surface)] lg:relative lg:z-auto lg:w-[368px] shrink-0"
    >
      <div
        aria-hidden="true"
        className="app-drag-region absolute start-0 end-36 top-0 z-10 h-9 select-none"
      />

      <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] px-5 pt-12 pb-3">
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
          title={t.closeMenu}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--canvas)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        <div className="space-y-2">
          <input
            type="text"
            value={title}
            onChange={(e) => {
              const val = e.target.value;
              setTitle(val);
              scheduleAutoSave(val, notes);
            }}
            onBlur={() => {
              if (!title.trim()) {
                const fallbackTitle = lastSavedRef.current.title;
                setTitle(fallbackTitle);
                draftRef.current.title = fallbackTitle;
                flushChangesFor(todo.id, fallbackTitle, notes);
              } else {
                flushChangesFor(todo.id, title, notes);
              }
            }}
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

        <TodoSubtaskList
          todoId={todo.id}
          subtasks={todo.subtasks}
          newSubtaskTitle={newSubtaskTitle}
          isAddingSubtask={isAddingSubtask}
          editingSubtaskId={editingSubtaskId}
          editingSubtaskTitle={editingSubtaskTitle}
          onChangeNewSubtaskTitle={setNewSubtaskTitle}
          onAddSubtask={(e) => void handleAddSubtask(e)}
          onToggleSubtask={onToggleSubtask}
          onStartEditSubtask={(sub) => {
            setEditingSubtaskId(sub.id);
            setEditingSubtaskTitle(sub.title);
          }}
          onChangeEditSubtaskTitle={setEditingSubtaskTitle}
          onCancelEditSubtask={() => setEditingSubtaskId(null)}
          onCommitEditSubtask={handleCommitEditSubtask}
          onDeleteSubtask={onDeleteSubtask}
          onOpenContextMenu={(e, subtask) =>
            setSubtaskCtxMenu({ x: e.clientX, y: e.clientY, subtask })
          }
        />

        <TodoTagsSection
          tags={currentTags}
          newTagInput={newTagInput}
          onChangeNewTagInput={setNewTagInput}
          onAddTag={handleAddTag}
          onRemoveTag={handleRemoveTag}
        />

        <div className="h-px bg-[var(--border)]" />

        <TodoScheduleSection
          todo={todo}
          categories={categories}
          todayStr={todayStr}
          tomorrowStr={tomorrowStr}
          onUpdate={onUpdate}
        />
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-[var(--border)] px-5 py-3 text-xs text-[var(--text-muted)]">
        <span
          className="min-w-0 truncate"
          title={createdFormatted ? `${t.createdPrefix}: ${createdFormatted}` : undefined}
        >
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
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-500/10 transition-colors whitespace-nowrap"
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
                void navigator.clipboard?.writeText?.(subtaskCtxMenu.subtask.title).catch(() => {
                  /* ignore */
                });
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
