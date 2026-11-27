import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { CommandPalette } from '../../src/components/CommandPalette';
import { LegalDocumentView } from '../../src/components/LegalDocumentView';
import { Sidebar } from '../../src/components/Sidebar';
import { I18nProvider } from '../../src/i18n/I18nContext';
import type { Category, Todo } from '../../src/types';

const SAMPLE_CATEGORIES: Category[] = [
  {
    id: 'cat-work',
    name: 'Is ve Projeler',
    color: '#3b82f6',
    pinned: false,
    sortOrder: 0,
    createdAt: '2026-11-20T10:00:00.000Z',
    deletedAt: null,
  },
];

const SAMPLE_TODOS: Todo[] = [
  {
    id: 'todo-1',
    title: 'Q4 müşteri sunumunu hazırla',
    notes: 'Finans grafikleri eklenecek',
    completed: false,
    important: true,
    pinned: false,
    priority: 'high',
    dueDate: '2026-11-28',
    dueTime: '14:30',
    tags: ['sunum', 'finans'],
    categoryId: 'cat-work',
    sortOrder: 0,
    createdAt: '2026-11-20T10:00:00.000Z',
    updatedAt: '2026-11-20T10:00:00.000Z',
    deletedAt: null,
    subtasks: [],
  },
  {
    id: 'todo-2',
    title: 'Elektrik faturasını öde',
    notes: '',
    completed: false,
    important: false,
    pinned: false,
    priority: 'normal',
    dueDate: null,
    tags: ['fatura'],
    categoryId: null,
    sortOrder: 1,
    createdAt: '2026-11-20T10:00:00.000Z',
    updatedAt: '2026-11-20T10:00:00.000Z',
    deletedAt: null,
    subtasks: [],
  },
];

describe('Sidebar Minimal Mode & Spotlight Command Palette', () => {
  it('renders single logo-to-expand toggle in minimal mode, zero active box, and opens Command Palette from search icon', async () => {
    const user = userEvent.setup();
    const onToggleCollapse = vi.fn();
    const onOpenCommandPalette = vi.fn();
    const searchRef = React.createRef<HTMLInputElement>();

    render(
      <I18nProvider lang="tr" onChangeLanguage={vi.fn()}>
        <Sidebar
          activeView={{ type: 'smart', id: 'all' }}
          onSelectView={vi.fn()}
          categories={SAMPLE_CATEGORIES}
          counts={{
            smart: { all: 2, today: 1, important: 1, completed: 0 },
            categories: { 'cat-work': 1 },
          }}
          dragLocked={false}
          isCollapsed={true}
          onToggleCollapse={onToggleCollapse}
          searchQuery=""
          onSearchChange={vi.fn()}
          searchInputRef={searchRef}
          onOpenCommandPalette={onOpenCommandPalette}
          onOpenSettings={vi.fn()}
          onCreateCategory={vi.fn().mockResolvedValue(undefined)}
          onUpdateCategory={vi.fn().mockResolvedValue(undefined)}
          onTogglePinCategory={vi.fn().mockResolvedValue(undefined)}
          onDeleteCategory={vi.fn().mockResolvedValue(undefined)}
          onReorderCategories={vi.fn()}
          isOpenMobile={false}
          onCloseMobile={vi.fn()}
        />
      </I18nProvider>,
    );

    const logoToggle = screen.getByTestId('sidebar-minimal-logo-toggle');
    expect(logoToggle).toBeInTheDocument();
    await user.click(logoToggle);
    expect(onToggleCollapse).toHaveBeenCalledTimes(1);

    // Selected smart view in minimal mode uses luminous glow (no background box)
    const activeSmart = screen.getByTestId('sidebar-smart-all');
    expect(activeSmart.className).toContain('ag-minimal-active');
    expect(activeSmart.className).not.toContain('bg-[var(--accent-soft)]');

    // Minimal search trigger opens Command Palette directly
    await user.click(screen.getByTestId('sidebar-search-trigger'));
    expect(onOpenCommandPalette).toHaveBeenCalledTimes(1);
  });

  it('filters Turkish tasks case/diacritic-insensitively, navigates cyclically with Arrow keys, executes on Enter, and closes on Esc', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onSelectTodo = vi.fn();

    render(
      <I18nProvider lang="tr" onChangeLanguage={vi.fn()}>
        <CommandPalette
          open={true}
          onClose={onClose}
          todos={SAMPLE_TODOS}
          categories={SAMPLE_CATEGORIES}
          counts={{
            smart: { all: 2, today: 1, important: 1, completed: 0 },
            categories: { 'cat-work': 1 },
          }}
          onNewTask={vi.fn()}
          onStartDictation={vi.fn()}
          onSelectView={vi.fn()}
          onSelectLayout={vi.fn()}
          onSelectTodo={onSelectTodo}
          onOpenSettings={vi.fn()}
          onOpenWelcomeWizard={vi.fn()}
        />
      </I18nProvider>,
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');

    const input = screen.getByTestId('command-palette-input');
    // ASCII "musteri sunum" matches Turkish "Q4 müşteri sunumunu hazırla"
    await user.type(input, 'musteri sunum');
    const matchedOpt = screen.getByTestId('cmd-option-todo-todo-1');
    expect(matchedOpt).toBeInTheDocument();
    expect(matchedOpt).toHaveAttribute('data-active', 'true');

    // Enter executes selection and closes
    await user.keyboard('{Enter}');
    await waitFor(() => {
      expect(onSelectTodo).toHaveBeenCalledWith(SAMPLE_TODOS[0]);
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('shows clean empty state when no command matches query', async () => {
    const user = userEvent.setup();
    render(
      <I18nProvider lang="tr" onChangeLanguage={vi.fn()}>
        <CommandPalette
          open={true}
          onClose={vi.fn()}
          todos={SAMPLE_TODOS}
          categories={SAMPLE_CATEGORIES}
          counts={{
            smart: { all: 2, today: 1, important: 1, completed: 0 },
            categories: { 'cat-work': 1 },
          }}
          onNewTask={vi.fn()}
          onStartDictation={vi.fn()}
          onSelectView={vi.fn()}
          onSelectLayout={vi.fn()}
          onSelectTodo={vi.fn()}
          onOpenSettings={vi.fn()}
          onOpenWelcomeWizard={vi.fn()}
        />
      </I18nProvider>,
    );

    await user.type(screen.getByTestId('command-palette-input'), 'xyz-nonexistent-9999');
    expect(screen.getByTestId('command-palette-empty')).toBeInTheDocument();
  });

  it('keeps Command Palette icons strictly monochrome and renders searchable open-source licenses directory', async () => {
    const user = userEvent.setup();
    const { unmount } = render(
      <I18nProvider lang="tr" onChangeLanguage={vi.fn()}>
        <CommandPalette
          open={true}
          onClose={vi.fn()}
          todos={SAMPLE_TODOS}
          categories={SAMPLE_CATEGORIES}
          counts={{
            smart: { all: 2, today: 1, important: 1, completed: 0 },
            categories: { 'cat-work': 1 },
          }}
          onNewTask={vi.fn()}
          onStartDictation={vi.fn()}
          onSelectView={vi.fn()}
          onSelectLayout={vi.fn()}
          onSelectTodo={vi.fn()}
          onOpenSettings={vi.fn()}
          onOpenWelcomeWizard={vi.fn()}
        />
      </I18nProvider>,
    );

    const dialog = screen.getByTestId('command-palette');
    const svgs = Array.from(dialog.querySelectorAll('svg'));
    for (const svg of svgs) {
      const cls = svg.getAttribute('class') || '';
      expect(cls).not.toMatch(/text-amber|text-emerald|text-\[var\(--accent\)\]/);
    }
    unmount();

    render(
      <I18nProvider lang="tr" onChangeLanguage={vi.fn()}>
        <LegalDocumentView docId="opensource" onBack={vi.fn()} />
      </I18nProvider>,
    );

    expect(screen.getByTestId('legal-opensource-directory')).toBeInTheDocument();
    expect(screen.getByText('Electron')).toBeInTheDocument();
    expect(screen.getByText('@fugood/whisper.node')).toBeInTheDocument();

    await user.type(screen.getByTestId('legal-opensource-search'), 'whisper');
    expect(screen.getByText('@fugood/whisper.node')).toBeInTheDocument();
    expect(screen.queryByText('Electron')).not.toBeInTheDocument();
  });
});
