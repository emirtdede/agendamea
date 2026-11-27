import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TodoDetailPanel } from '../../src/components/TodoDetailPanel';
import { I18nProvider } from '../../src/i18n/I18nContext';
import type { Category, Todo } from '../../src/types';

const SAMPLE_CATEGORIES: Category[] = [
  {
    id: 'cat-launch',
    name: 'Product Launch',
    color: '#3b82f6',
    pinned: true,
    sortOrder: 0,
    createdAt: '2026-11-28T09:00:00.000Z',
    deletedAt: null,
  },
];

const SAMPLE_TODO: Todo = {
  id: 'todo-detail-1',
  title: 'Finalize Q4 product roadmap and launch checklist without truncation',
  notes: 'Review milestone priorities with design and engineering.',
  completed: false,
  important: true,
  pinned: true,
  priority: 'high',
  startDate: null,
  dueDate: '2026-11-28',
  dueTime: '14:00',
  tags: ['roadmap', 'launch'],
  categoryId: 'cat-launch',
  sortOrder: 0,
  createdAt: '2026-11-28T09:00:00.000Z',
  updatedAt: '2026-11-28T09:00:00.000Z',
  deletedAt: null,
  subtasks: [],
};

afterEach(() => {
  cleanup();
});

describe('TodoDetailPanel (Multi-Line Title & Responsive Contract)', () => {
  it('renders task title as a wrapping textarea, strips newlines, and commits on Enter', async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn().mockResolvedValue(true);

    render(
      <I18nProvider lang="en" onChangeLanguage={vi.fn()}>
        <TodoDetailPanel
          todo={SAMPLE_TODO}
          categories={SAMPLE_CATEGORIES}
          todayStr="2026-11-28"
          onClose={vi.fn()}
          onUpdate={onUpdate}
          onDelete={vi.fn()}
          onAddSubtask={vi.fn().mockResolvedValue(true)}
          onToggleSubtask={vi.fn().mockResolvedValue(undefined)}
          onDeleteSubtask={vi.fn().mockResolvedValue(undefined)}
        />
      </I18nProvider>,
    );

    const titleField = screen.getByLabelText(/task title/i);
    expect(titleField.tagName).toBe('TEXTAREA');
    expect((titleField as HTMLTextAreaElement).value).toBe(SAMPLE_TODO.title);

    await user.clear(titleField);
    await user.type(titleField, 'Updated multi-line title{Enter}');

    expect(document.activeElement).not.toBe(titleField);
    expect(onUpdate).toHaveBeenCalledWith(
      SAMPLE_TODO.id,
      expect.objectContaining({ title: 'Updated multi-line title' }),
      undefined,
    );
  });

  it('reverts blank title on blur instead of saving an empty title', async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn().mockResolvedValue(true);

    render(
      <I18nProvider lang="en" onChangeLanguage={vi.fn()}>
        <TodoDetailPanel
          todo={SAMPLE_TODO}
          categories={SAMPLE_CATEGORIES}
          todayStr="2026-11-28"
          onClose={vi.fn()}
          onUpdate={onUpdate}
          onDelete={vi.fn()}
          onAddSubtask={vi.fn().mockResolvedValue(true)}
          onToggleSubtask={vi.fn().mockResolvedValue(undefined)}
          onDeleteSubtask={vi.fn().mockResolvedValue(undefined)}
        />
      </I18nProvider>,
    );

    const titleField = screen.getByLabelText(/task title/i) as HTMLTextAreaElement;
    await user.clear(titleField);
    await user.type(titleField, '   ');
    await user.tab();

    expect(titleField.value).toBe(SAMPLE_TODO.title);
    expect(onUpdate).not.toHaveBeenCalled();
  });
});
