import type React from 'react';
import { useCallback, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { api } from '../api/client';
import type { SortOption, Todo } from '../types';
import { getVerticalDropPosition, moveIdRelative } from '../utils/todoLogic';

interface UseTodoDragReorderOptions {
  visibleTodos: Todo[];
  todosRef: MutableRefObject<Todo[]>;
  setTodos: Dispatch<SetStateAction<Todo[]>>;
  dragLocked: boolean;
  canDragTodos: boolean;
  sortBy: SortOption;
  setSortBy: Dispatch<SetStateAction<SortOption>>;
  showInfoToast: (message: string, tone?: 'info' | 'error') => void;
  formatUiError: (err: unknown, fallback?: string) => string;
  loadData: (silent?: boolean) => Promise<void>;
}

export function useTodoDragReorder({
  visibleTodos,
  todosRef,
  setTodos,
  dragLocked,
  canDragTodos,
  sortBy,
  setSortBy,
  showInfoToast,
  formatUiError,
  loadData,
}: UseTodoDragReorderOptions) {
  const [draggedTodoId, setDraggedTodoId] = useState<string | null>(null);
  const [todoDropTarget, setTodoDropTarget] = useState<{
    id: string;
    position: 'before' | 'after';
  } | null>(null);

  const reorderTodoSeqRef = useRef(0);
  const visibleTodosRef = useRef(visibleTodos);
  visibleTodosRef.current = visibleTodos;
  const draggedTodoIdRef = useRef(draggedTodoId);
  draggedTodoIdRef.current = draggedTodoId;
  const canDragTodosRef = useRef(canDragTodos);
  canDragTodosRef.current = canDragTodos;
  const dragLockedRef = useRef(dragLocked);
  dragLockedRef.current = dragLocked;
  const sortByRef = useRef(sortBy);
  sortByRef.current = sortBy;

  const clearDragState = useCallback(() => {
    setDraggedTodoId(null);
    setTodoDropTarget(null);
  }, []);

  const handleDropTodo = useCallback(
    (sourceId: string, targetId: string, position: 'before' | 'after') => {
      if (dragLockedRef.current || sourceId === targetId) return;

      const currentVisible = visibleTodosRef.current;
      const sourceTodo = currentVisible.find((tItem) => tItem.id === sourceId);
      const targetTodo = currentVisible.find((tItem) => tItem.id === targetId);
      if (!sourceTodo || !targetTodo) return;
      if (sourceTodo.pinned !== targetTodo.pinned || sourceTodo.completed !== targetTodo.completed) {
        return;
      }

      const visibleIds = currentVisible.map((tItem) => tItem.id);
      const reorderedVisible = moveIdRelative(visibleIds, sourceId, targetId, position);
      const visibleSet = new Set(reorderedVisible);

      const allSorted = [...todosRef.current].sort((a, b) => a.sortOrder - b.sortOrder);
      let cursor = 0;
      const nextOrderedIds = allSorted.map((tItem) => {
        if (visibleSet.has(tItem.id)) {
          const replacement = reorderedVisible[cursor];
          cursor += 1;
          return replacement;
        }
        return tItem.id;
      });

      const finalOrderMap = new Map(nextOrderedIds.map((tid, i) => [tid, i]));
      if (sortByRef.current !== 'manual') {
        setSortBy('manual');
      }
      setTodos((prev) =>
        prev.map((tItem) => ({
          ...tItem,
          sortOrder: finalOrderMap.get(tItem.id) ?? tItem.sortOrder,
        })),
      );
      const seq = reorderTodoSeqRef.current + 1;
      reorderTodoSeqRef.current = seq;
      void api.reorderTodos(nextOrderedIds).catch((err) => {
        if (reorderTodoSeqRef.current === seq) {
          showInfoToast(formatUiError(err), 'error');
          void loadData(true);
        }
      });
    },
    [todosRef, setTodos, setSortBy, showInfoToast, loadData, formatUiError],
  );

  const handleTodoDragStart = useCallback(
    (e: React.DragEvent<HTMLDivElement>, id: string) => {
      setDraggedTodoId(id);
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/agendamea-todo', id);
      e.dataTransfer.setData('text/plain', id);
    },
    [],
  );

  const handleTodoDragOver = useCallback(
    (e: React.DragEvent<HTMLDivElement>, id: string) => {
      const draggedId = draggedTodoIdRef.current;
      if (!canDragTodosRef.current || !draggedId || draggedId === id) return;
      const list = visibleTodosRef.current;
      const sourceTodo = list.find((tItem) => tItem.id === draggedId);
      const targetTodo = list.find((tItem) => tItem.id === id);
      if (
        !sourceTodo ||
        !targetTodo ||
        sourceTodo.pinned !== targetTodo.pinned ||
        sourceTodo.completed !== targetTodo.completed
      ) {
        return;
      }
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const position = getVerticalDropPosition(
        e.clientY,
        e.currentTarget.getBoundingClientRect(),
      );
      setTodoDropTarget((prev) =>
        prev && prev.id === id && prev.position === position ? prev : { id, position },
      );
    },
    [],
  );

  const handleTodoDragLeave = useCallback((id: string) => {
    setTodoDropTarget((prev) => (prev && prev.id === id ? null : prev));
  }, []);

  const handleTodoDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>, targetId: string) => {
      if (!canDragTodosRef.current) return;
      e.preventDefault();
      const sourceId = draggedTodoIdRef.current ?? e.dataTransfer.getData('text/agendamea-todo');
      if (sourceId && sourceId !== targetId) {
        const position = getVerticalDropPosition(
          e.clientY,
          e.currentTarget.getBoundingClientRect(),
        );
        handleDropTodo(sourceId, targetId, position);
      }
      setDraggedTodoId(null);
      setTodoDropTarget(null);
    },
    [handleDropTodo],
  );

  const handleTodoDragEnd = useCallback(() => {
    setDraggedTodoId(null);
    setTodoDropTarget(null);
  }, []);

  return {
    draggedTodoId,
    todoDropTarget,
    clearDragState,
    handleDropTodo,
    handleTodoDragStart,
    handleTodoDragOver,
    handleTodoDragLeave,
    handleTodoDrop,
    handleTodoDragEnd,
  };
}
