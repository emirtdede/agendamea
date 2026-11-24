import { Check, Plus, X } from 'lucide-react';
import type React from 'react';
import { useEffect, useRef } from 'react';
import { useI18n } from '../../i18n/I18nContext';
import type { Subtask } from '../../types';

interface TodoSubtaskListProps {
  todoId: string;
  subtasks: Subtask[];
  newSubtaskTitle: string;
  isAddingSubtask: boolean;
  editingSubtaskId: string | null;
  editingSubtaskTitle: string;
  onChangeNewSubtaskTitle: (value: string) => void;
  onAddSubtask: (e: React.FormEvent) => void;
  onToggleSubtask: (todoId: string, subtaskId: string, completed: boolean) => Promise<void>;
  onStartEditSubtask: (subtask: Subtask) => void;
  onChangeEditSubtaskTitle: (value: string) => void;
  onCancelEditSubtask: () => void;
  onCommitEditSubtask: (subtask: Subtask) => void;
  onDeleteSubtask: (todoId: string, subtaskId: string) => Promise<void>;
  onOpenContextMenu: (e: React.MouseEvent, subtask: Subtask) => void;
}

export function TodoSubtaskList({
  todoId,
  subtasks,
  newSubtaskTitle,
  isAddingSubtask,
  editingSubtaskId,
  editingSubtaskTitle,
  onChangeNewSubtaskTitle,
  onAddSubtask,
  onToggleSubtask,
  onStartEditSubtask,
  onChangeEditSubtaskTitle,
  onCancelEditSubtask,
  onCommitEditSubtask,
  onDeleteSubtask,
  onOpenContextMenu,
}: TodoSubtaskListProps) {
  const { t } = useI18n();
  const editInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingSubtaskId) {
      editInputRef.current?.focus();
    }
  }, [editingSubtaskId]);

  return (
    <section aria-label={t.subtasksTitle} className="space-y-2.5">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-xs font-semibold text-[var(--text-muted)]">
          {t.subtasksTitle}
        </h3>
        {subtasks.length > 0 && (
          <span className="font-mono-tabular text-xs text-[var(--text-muted)]">
            {subtasks.filter((s) => s.completed).length}/{subtasks.length}
          </span>
        )}
      </div>

      <div className="space-y-1">
        {subtasks.map((sub) => (
          // biome-ignore lint/a11y/noStaticElementInteractions: Subtask row context-menu wrapper; actions exposed via inner buttons
          <div
            key={sub.id}
            onContextMenu={(e) => {
              e.preventDefault();
              onOpenContextMenu(e, sub);
            }}
            className="group flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-[var(--surface-hover)] transition-colors"
          >
            <button
              type="button"
              onClick={() => void onToggleSubtask(todoId, sub.id, !sub.completed)}
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
                ref={editInputRef}
                type="text"
                value={editingSubtaskTitle}
                maxLength={200}
                aria-label={sub.title}
                onChange={(e) => onChangeEditSubtaskTitle(e.target.value)}
                onBlur={() => onCommitEditSubtask(sub)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    onCommitEditSubtask(sub);
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    onCancelEditSubtask();
                  }
                }}
                className="flex-1 min-w-0 rounded border border-[var(--border-strong)] bg-[var(--canvas)] px-2 py-0.5 text-sm text-[var(--text-primary)] focus:outline-none"
              />
            ) : (
              <button
                type="button"
                onDoubleClick={() => onStartEditSubtask(sub)}
                className={`flex-1 min-w-0 text-start text-sm break-words cursor-text ${
                  sub.completed
                    ? 'line-through text-[var(--text-muted)]'
                    : 'text-[var(--text-primary)]'
                }`}
              >
                {sub.title}
              </button>
            )}
            <button
              type="button"
              onClick={() => void onDeleteSubtask(todoId, sub.id)}
              aria-label={`${t.deleteToTrashButton}: ${sub.title}`}
              className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 text-[var(--text-muted)] hover:text-red-500 p-1 rounded transition-opacity"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>

      <form onSubmit={onAddSubtask} className="flex items-center gap-2">
        <input
          type="text"
          value={newSubtaskTitle}
          onChange={(e) => onChangeNewSubtaskTitle(e.target.value)}
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
  );
}
