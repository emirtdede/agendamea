import React, { useEffect, useMemo, useRef, useState } from 'react';
import { usePreferencesSelector } from '../store/preferencesStore';
import type { Category, Todo } from '../types';
import { TodoItemView } from './TodoItem';

export const TODO_VIRTUALIZATION_THRESHOLD = 60;
const ESTIMATED_ROW_HEIGHT_PX = 68;
const OVERSCAN_ROWS = 10;

interface VirtualizedTodoListProps {
  todos: Todo[];
  categoryMap: Map<string, Category>;
  todayStr: string;
  selectedTodoId: string | null;
  canDrag: boolean;
  draggedTodoId: string | null;
  todoDropTarget: { id: string; position: 'before' | 'after' } | null;
  onSelect: (id: string) => void;
  onToggleComplete: (id: string, completed: boolean) => void;
  onToggleImportant: (id: string, important: boolean) => void;
  onTogglePin: (id: string, pinned: boolean) => void;
  onDelete: (id: string) => void;
  onDragStart: (e: React.DragEvent<HTMLDivElement>, id: string) => void;
  onDragOver: (e: React.DragEvent<HTMLDivElement>, id: string) => void;
  onDragLeave: (id: string) => void;
  onDrop: (e: React.DragEvent<HTMLDivElement>, targetId: string) => void;
  onDragEnd: () => void;
  onTagClick: (tag: string) => void;
  onContextMenu: (e: React.MouseEvent, todo: Todo) => void;
}

function findScrollParent(el: HTMLElement | null): HTMLElement | null {
  let current = el?.parentElement ?? null;
  while (current) {
    const style = window.getComputedStyle(current);
    if (/(auto|scroll)/i.test(style.overflowY)) {
      return current;
    }
    current = current.parentElement;
  }
  return null;
}

export const VirtualizedTodoList = React.memo(function VirtualizedTodoList({
  todos,
  categoryMap,
  todayStr,
  selectedTodoId,
  canDrag,
  draggedTodoId,
  todoDropTarget,
  onSelect,
  onToggleComplete,
  onToggleImportant,
  onTogglePin,
  onDelete,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
  onTagClick,
  onContextMenu,
}: VirtualizedTodoListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const timeFormat = usePreferencesSelector((s) => s.timeFormat, Object.is);
  const colorBlindShapes = usePreferencesSelector((s) => s.colorBlindShapes, Object.is);
  const shouldVirtualize = todos.length >= TODO_VIRTUALIZATION_THRESHOLD;
  const [range, setRange] = useState<{ start: number; end: number }>({
    start: 0,
    end: 50,
  });

  useEffect(() => {
    if (!shouldVirtualize) return;
    const container = containerRef.current;
    if (!container) return;
    const scrollParent = findScrollParent(container);
    let rafId: number | null = null;

    const recompute = () => {
      rafId = null;
      const scrollerHeight = scrollParent
        ? scrollParent.clientHeight
        : typeof window !== 'undefined'
          ? window.innerHeight
          : 720;
      const containerRect = container.getBoundingClientRect();
      const scrollerTop = scrollParent ? scrollParent.getBoundingClientRect().top : 0;
      const visibleTopOffset = Math.max(0, scrollerTop - containerRect.top);
      const start = Math.max(
        0,
        Math.floor(visibleTopOffset / ESTIMATED_ROW_HEIGHT_PX) - OVERSCAN_ROWS,
      );
      const visibleCount = Math.ceil(scrollerHeight / ESTIMATED_ROW_HEIGHT_PX) + OVERSCAN_ROWS * 2;
      const end = Math.min(todos.length, start + visibleCount);
      setRange((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
    };

    const scheduleRecompute = () => {
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(recompute);
    };

    recompute();
    const target: EventTarget = scrollParent ?? window;
    target.addEventListener('scroll', scheduleRecompute, { passive: true });
    window.addEventListener('resize', scheduleRecompute, { passive: true });

    return () => {
      target.removeEventListener('scroll', scheduleRecompute);
      window.removeEventListener('resize', scheduleRecompute);
      if (rafId !== null) window.cancelAnimationFrame(rafId);
    };
  }, [shouldVirtualize, todos.length]);

  const { slice, topSpacerPx, bottomSpacerPx } = useMemo(() => {
    if (!shouldVirtualize) {
      return { slice: todos, topSpacerPx: 0, bottomSpacerPx: 0 };
    }
    const clampedStart = Math.max(0, Math.min(range.start, todos.length));
    const clampedEnd = Math.max(clampedStart, Math.min(range.end, todos.length));
    return {
      slice: todos.slice(clampedStart, clampedEnd),
      topSpacerPx: clampedStart * ESTIMATED_ROW_HEIGHT_PX,
      bottomSpacerPx: Math.max(0, (todos.length - clampedEnd) * ESTIMATED_ROW_HEIGHT_PX),
    };
  }, [shouldVirtualize, todos, range.start, range.end]);

  return (
    <div
      ref={containerRef}
      data-testid="todo-list"
      data-virtualized={shouldVirtualize ? 'true' : 'false'}
      className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]"
    >
      {topSpacerPx > 0 && <div aria-hidden="true" style={{ height: `${topSpacerPx}px` }} />}
      {slice.map((todo) => (
        <TodoItemView
          key={todo.id}
          todo={todo}
          category={todo.categoryId ? categoryMap.get(todo.categoryId) : undefined}
          todayStr={todayStr}
          timeFormat={timeFormat}
          colorBlindShapes={colorBlindShapes}
          isSelected={selectedTodoId === todo.id}
          canDrag={canDrag}
          isDragging={draggedTodoId === todo.id}
          dropIndicator={
            todoDropTarget && todoDropTarget.id === todo.id ? todoDropTarget.position : null
          }
          onSelect={onSelect}
          onToggleComplete={onToggleComplete}
          onToggleImportant={onToggleImportant}
          onTogglePin={onTogglePin}
          onDelete={onDelete}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onDragEnd={onDragEnd}
          onTagClick={onTagClick}
          onContextMenu={onContextMenu}
        />
      ))}
      {bottomSpacerPx > 0 && <div aria-hidden="true" style={{ height: `${bottomSpacerPx}px` }} />}
    </div>
  );
});
