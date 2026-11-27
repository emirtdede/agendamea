import {
  Calendar as CalendarIcon,
  CalendarPlus,
  Check,
  Copy,
  CopyPlus,
  Eye,
  Flag,
  Pin,
  Star,
  Sun,
  Trash2,
  X,
} from 'lucide-react';
import type React from 'react';
import { useMemo } from 'react';
import type { UiDictionary } from '../i18n/translations';
import type { ActiveView, Priority, Todo, TodoPatch } from '../types';
import { addDaysToDateString, formatTodoDateSchedule } from '../utils/todoLogic';

interface UseWorkspaceContextMenusOptions {
  todoContextMenu: { x: number; y: number; todo: Todo } | null;
  dayContextMenu: { x: number; y: number; dateStr: string } | null;
  activeView: ActiveView;
  todayStr: string;
  intlLocale: string;
  t: UiDictionary;
  tRef: React.MutableRefObject<UiDictionary>;
  onSelectTodoId: (id: string) => void;
  onToggleTodoComplete: (id: string, completed: boolean) => void;
  onToggleTodoPin: (id: string, pinned: boolean) => void;
  onToggleTodoImportant: (id: string, important: boolean) => void;
  onUpdateTodo: (id: string, patch: TodoPatch) => Promise<boolean>;
  onDeleteTodo: (id: string) => void;
  onAddTodo: (payload: {
    title: string;
    priority: Priority;
    startDate?: string | null;
    dueDate: string | null;
    dueTime?: string | null;
    categoryId: string | null;
    important: boolean;
  }) => Promise<Todo>;
  onShowInfoToast: (message: string, variant?: 'info' | 'error') => void;
}

export function useWorkspaceContextMenus({
  todoContextMenu,
  dayContextMenu,
  activeView,
  todayStr,
  intlLocale,
  t,
  tRef,
  onSelectTodoId,
  onToggleTodoComplete,
  onToggleTodoPin,
  onToggleTodoImportant,
  onUpdateTodo,
  onDeleteTodo,
  onAddTodo,
  onShowInfoToast,
}: UseWorkspaceContextMenusOptions) {
  const todoContextMenuItems = useMemo(() => {
    if (!todoContextMenu) return [];
    const targetTodo = todoContextMenu.todo;
    return [
      {
        id: 'open-details',
        label: t.ctxOpenDetails,
        icon: <Eye className="h-3.5 w-3.5" />,
        onSelect: () => onSelectTodoId(targetTodo.id),
      },
      {
        id: 'toggle-complete',
        label: targetTodo.completed ? t.markCompletedDone : t.markComplete,
        icon: <Check className="h-3.5 w-3.5" />,
        onSelect: () => onToggleTodoComplete(targetTodo.id, !targetTodo.completed),
      },
      {
        id: 'toggle-pin',
        label: targetTodo.pinned ? t.unpinLabel : t.pinLabel,
        icon: <Pin className="h-3.5 w-3.5" />,
        onSelect: () => onToggleTodoPin(targetTodo.id, !targetTodo.pinned),
      },
      {
        id: 'toggle-important',
        label: targetTodo.important ? t.ctxRemoveImportant : t.ctxMarkImportant,
        icon: <Star className="h-3.5 w-3.5" />,
        onSelect: () => onToggleTodoImportant(targetTodo.id, !targetTodo.important),
      },
      { id: 'div-schedule', divider: true },
      {
        id: 'schedule-today',
        label: t.ctxSetToday,
        icon: <Sun className="h-3.5 w-3.5" />,
        onSelect: () =>
          void onUpdateTodo(targetTodo.id, {
            startDate: null,
            dueDate: todayStr,
          }),
      },
      {
        id: 'schedule-tomorrow',
        label: t.ctxSetTomorrow,
        icon: <CalendarIcon className="h-3.5 w-3.5" />,
        onSelect: () =>
          void onUpdateTodo(targetTodo.id, {
            startDate: null,
            dueDate: addDaysToDateString(todayStr, 1),
          }),
      },
      ...(targetTodo.dueDate || targetTodo.startDate
        ? [
            {
              id: 'schedule-clear',
              label: t.ctxClearSchedule,
              icon: <X className="h-3.5 w-3.5" />,
              onSelect: () =>
                void onUpdateTodo(targetTodo.id, {
                  startDate: null,
                  dueDate: null,
                  dueTime: null,
                }),
            },
          ]
        : []),
      { id: 'div-priority', divider: true },
      ...(
        [
          { id: 'high' as Priority, label: t.priorityHigh },
          { id: 'normal' as Priority, label: t.priorityNormal },
          { id: 'low' as Priority, label: t.priorityLow },
        ] as const
      )
        .filter((p) => p.id !== targetTodo.priority)
        .map((p) => ({
          id: `priority-${p.id}`,
          label: `${t.ctxPriorityPrefix}: ${p.label}`,
          icon: <Flag className="h-3.5 w-3.5" />,
          onSelect: () => void onUpdateTodo(targetTodo.id, { priority: p.id }),
        })),
      { id: 'div-actions', divider: true },
      {
        id: 'duplicate-todo',
        label: t.ctxDuplicateTask,
        icon: <CopyPlus className="h-3.5 w-3.5" />,
        onSelect: () => {
          void onAddTodo({
            title: targetTodo.title,
            priority: targetTodo.priority,
            startDate: targetTodo.startDate ?? null,
            dueDate: targetTodo.dueDate,
            dueTime: targetTodo.dueTime ?? null,
            categoryId: targetTodo.categoryId,
            important: targetTodo.important,
          })
            .then((created) => {
              if (created) {
                onSelectTodoId(created.id);
                onShowInfoToast(tRef.current.ctxDuplicatedToast, 'info');
              }
            })
            .catch(() => {
              // Error toast handled inside onAddTodo
            });
        },
      },
      {
        id: 'copy-title',
        label: t.ctxCopyTitle,
        icon: <Copy className="h-3.5 w-3.5" />,
        onSelect: () => {
          void navigator.clipboard
            ?.writeText?.(targetTodo.title)
            .then(() => onShowInfoToast(tRef.current.ctxCopiedToast, 'info'))
            .catch(() => {
              /* ignore */
            });
        },
      },
      {
        id: 'delete-todo',
        label: t.deleteToTrashButton,
        icon: <Trash2 className="h-3.5 w-3.5" />,
        danger: true,
        onSelect: () => onDeleteTodo(targetTodo.id),
      },
    ];
  }, [
    todoContextMenu,
    t,
    todayStr,
    onSelectTodoId,
    onToggleTodoComplete,
    onToggleTodoPin,
    onToggleTodoImportant,
    onUpdateTodo,
    onAddTodo,
    onShowInfoToast,
    tRef,
    onDeleteTodo,
  ]);

  const dayContextMenuItems = useMemo(() => {
    if (!dayContextMenu) return [];
    const targetDateStr = dayContextMenu.dateStr;
    const formattedDateLabel =
      formatTodoDateSchedule(null, targetDateStr, todayStr, intlLocale, {
        today: t.today,
        tomorrow: t.tomorrow,
        yesterday: t.yesterday,
      })?.label ?? targetDateStr;
    return [
      {
        id: 'add-task-on-day',
        label: `${t.ctxAddTaskHere} (${formattedDateLabel})`,
        icon: <CalendarPlus className="h-3.5 w-3.5" />,
        onSelect: () => {
          const categoryId = activeView.type === 'category' ? activeView.id : null;
          void onAddTodo({
            title: t.addFirstTaskButton,
            priority: 'normal',
            startDate: null,
            dueDate: targetDateStr,
            dueTime: null,
            categoryId,
            important: false,
          })
            .then((created) => {
              if (created) onSelectTodoId(created.id);
            })
            .catch(() => {
              // Error toast already handled inside onAddTodo
            });
        },
      },
    ];
  }, [
    dayContextMenu,
    todayStr,
    intlLocale,
    t.today,
    t.tomorrow,
    t.yesterday,
    t.ctxAddTaskHere,
    t.addFirstTaskButton,
    activeView,
    onAddTodo,
    onSelectTodoId,
  ]);

  return { todoContextMenuItems, dayContextMenuItems };
}
