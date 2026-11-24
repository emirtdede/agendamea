import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  TODO_VIRTUALIZATION_THRESHOLD,
  VirtualizedTodoList,
} from '../../src/components/VirtualizedTodoList';
import { I18nProvider } from '../../src/i18n/I18nContext';
import type { Category, Todo } from '../../src/types';

function makeTodos(count: number): Todo[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `todo-${i + 1}`,
    title: `Enterprise Task #${i + 1}`,
    notes: '',
    completed: false,
    important: i % 5 === 0,
    pinned: false,
    priority: 'normal',
    startDate: null,
    dueDate: '2026-11-23',
    dueTime: null,
    tags: [],
    categoryId: null,
    sortOrder: i,
    createdAt: '2026-11-23T08:00:00.000Z',
    updatedAt: '2026-11-23T08:00:00.000Z',
    deletedAt: null,
    subtasks: [],
  }));
}

describe('VirtualizedTodoList', () => {
  const baseHandlers = () => ({
    onSelect: vi.fn(),
    onToggleComplete: vi.fn(),
    onToggleImportant: vi.fn(),
    onTogglePin: vi.fn(),
    onDelete: vi.fn(),
    onDragStart: vi.fn(),
    onDragOver: vi.fn(),
    onDragLeave: vi.fn(),
    onDrop: vi.fn(),
    onDragEnd: vi.fn(),
    onTagClick: vi.fn(),
    onContextMenu: vi.fn(),
  });

  it('renders all rows below threshold and triggers completion handler', async () => {
    const user = userEvent.setup();
    const handlers = baseHandlers();
    render(
      <I18nProvider lang="en" onChangeLanguage={vi.fn()}>
        <VirtualizedTodoList
          todos={makeTodos(5)}
          categoryMap={new Map<string, Category>()}
          todayStr="2026-11-23"
          selectedTodoId={null}
          canDrag={true}
          draggedTodoId={null}
          todoDropTarget={null}
          {...handlers}
        />
      </I18nProvider>,
    );

    expect(screen.getByText('Enterprise Task #1')).toBeInTheDocument();
    expect(screen.getByText('Enterprise Task #5')).toBeInTheDocument();

    const completeButtons = screen.getAllByRole('button', { name: /^Complete:/i });
    expect(completeButtons.length).toBe(5);
    await user.click(completeButtons[0]!);
    expect(handlers.onToggleComplete).toHaveBeenCalledWith('todo-1', true);
  });

  it('virtualizes large lists above threshold so DOM node count stays bounded', () => {
    const handlers = baseHandlers();
    const total = TODO_VIRTUALIZATION_THRESHOLD + 200;
    const { container } = render(
      <I18nProvider lang="en" onChangeLanguage={vi.fn()}>
        <div style={{ overflowY: 'auto', height: '600px' }}>
          <VirtualizedTodoList
            todos={makeTodos(total)}
            categoryMap={new Map<string, Category>()}
            todayStr="2026-11-23"
            selectedTodoId={null}
            canDrag={false}
            draggedTodoId={null}
            todoDropTarget={null}
            {...handlers}
          />
        </div>
      </I18nProvider>,
    );

    const renderedRows = container.querySelectorAll('button[aria-label^="Complete:"]');
    expect(renderedRows.length).toBeGreaterThan(0);
    expect(renderedRows.length).toBeLessThan(80);
  });
});
