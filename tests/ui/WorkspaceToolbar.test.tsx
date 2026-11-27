import { fireEvent, render, screen } from '@testing-library/react';
import type React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { WorkspaceToolbar } from '../../src/components/WorkspaceToolbar';
import { I18nProvider } from '../../src/i18n/I18nContext';

function renderToolbar(overrides: Partial<React.ComponentProps<typeof WorkspaceToolbar>> = {}) {
  const props: React.ComponentProps<typeof WorkspaceToolbar> = {
    isCompletedView: false,
    statusFilter: 'all',
    layoutMode: 'list',
    tagFilter: null,
    completedCountInView: 3,
    searchQuery: '',
    searchDateFrom: '',
    searchDateTo: '',
    isDateFilterOpen: false,
    hasDateRangeFilter: false,
    showDateRangeBar: false,
    sortBy: 'manual',
    onChangeStatusFilter: vi.fn(),
    onChangeLayoutMode: vi.fn(),
    onClearTagFilter: vi.fn(),
    onClearCompleted: vi.fn(),
    onToggleDateFilter: vi.fn(),
    onChangeDateFrom: vi.fn(),
    onChangeDateTo: vi.fn(),
    onClearDateRange: vi.fn(),
    onCloseDateRangeBar: vi.fn(),
    onChangeSortBy: vi.fn(),
    ...overrides,
  };

  render(
    <I18nProvider lang="en" onChangeLanguage={vi.fn()}>
      <WorkspaceToolbar {...props} />
    </I18nProvider>,
  );

  return props;
}

describe('WorkspaceToolbar (Option A single-row minimal design)', () => {
  it('switches 4 layout views directly from hairline tabs and toggles date range', () => {
    const props = renderToolbar();

    expect(screen.getByTestId('layout-tab-list')).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByTestId('layout-tab-kanban'));
    expect(props.onChangeLayoutMode).toHaveBeenCalledWith('kanban');

    fireEvent.click(screen.getByTestId('tasks-date-range-toggle'));
    expect(props.onToggleDateFilter).toHaveBeenCalledTimes(1);
  });

  it('opens unified display popover to change status, sort order, clear completed, and closes on Escape', () => {
    const props = renderToolbar();

    expect(screen.queryByTestId('workspace-display-popover')).toBeNull();
    fireEvent.click(screen.getByTestId('workspace-display-menu-toggle'));
    expect(screen.getByTestId('workspace-display-popover')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('status-filter-active'));
    expect(props.onChangeStatusFilter).toHaveBeenCalledWith('active');

    fireEvent.click(screen.getByTestId('sort-option-priority'));
    expect(props.onChangeSortBy).toHaveBeenCalledWith('priority');
    // Selecting a sort option closes the popover cleanly
    expect(screen.queryByTestId('workspace-display-popover')).toBeNull();

    // Re-open and invoke Clear Completed
    fireEvent.click(screen.getByTestId('workspace-display-menu-toggle'));
    fireEvent.click(screen.getByTestId('toolbar-clear-completed-btn'));
    expect(props.onClearCompleted).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('workspace-display-popover')).toBeNull();

    // Re-open and dismiss with Escape
    fireEvent.click(screen.getByTestId('workspace-display-menu-toggle'));
    expect(screen.getByTestId('workspace-display-popover')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('workspace-display-popover')).toBeNull();
  });

  it('hides status tabs in Completed view and hides Clear Completed when count is 0', () => {
    renderToolbar({ isCompletedView: true, completedCountInView: 0, sortBy: 'dueDate' });

    fireEvent.click(screen.getByTestId('workspace-display-menu-toggle'));
    expect(screen.queryByTestId('status-filter-all')).toBeNull();
    expect(screen.queryByTestId('toolbar-clear-completed-btn')).toBeNull();
    expect(screen.getByTestId('sort-option-dueDate')).toHaveAttribute('aria-checked', 'true');
  });
});
