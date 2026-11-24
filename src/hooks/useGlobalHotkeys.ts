import { type RefObject, useEffect } from 'react';
import { preferencesStore } from '../store/preferencesStore';
import { shortcutStore } from '../store/shortcutStore';
import { workspaceUiStore } from '../store/workspaceUiStore';
import { matchesShortcutEvent } from '../utils/shortcuts';
import { getNextZoomPreset, getPrevZoomPreset } from '../utils/themes';

interface UseGlobalHotkeysOptions {
  quickAddRef: RefObject<HTMLInputElement | null>;
  focusSidebarSearch: () => void;
  keyboardReorderRef: RefObject<((direction: 'up' | 'down') => void) | null>;
}

/**
 * Registers global keyboard shortcuts for zoom, search, escape cascade,
 * layout switching, task creation, and Alt+Arrow task reordering.
 */
export function useGlobalHotkeys({
  quickAddRef,
  focusSidebarSearch,
  keyboardReorderRef,
}: UseGlobalHotkeysOptions): void {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const ui = workspaceUiStore.getState();
      const target = e.target as HTMLElement | null;
      const isTypingField = Boolean(
        target &&
          (target.tagName === 'INPUT' ||
            target.tagName === 'TEXTAREA' ||
            target.tagName === 'SELECT' ||
            target.isContentEditable),
      );

      // Global accessibility zoom shortcuts (Ctrl/Cmd + / - / 0)
      if ((e.ctrlKey || e.metaKey) && !e.altKey) {
        if (e.key === '=' || e.key === '+') {
          e.preventDefault();
          const next = getNextZoomPreset(preferencesStore.getState().zoomPercent);
          preferencesStore.setZoomPercent(next, { silentError: true });
          return;
        }
        if (e.key === '-') {
          e.preventDefault();
          const next = getPrevZoomPreset(preferencesStore.getState().zoomPercent);
          preferencesStore.setZoomPercent(next, { silentError: true });
          return;
        }
        if (e.key === '0') {
          e.preventDefault();
          preferencesStore.setZoomPercent(100, { silentError: true });
          return;
        }
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        if (ui.isSettingsOpen || ui.isWelcomeOpen || ui.isCloseModalOpen) {
          return;
        }
        e.preventDefault();
        focusSidebarSearch();
        return;
      }

      if (e.key === 'Escape') {
        if (ui.isSettingsOpen || ui.isWelcomeOpen || ui.isCloseModalOpen) {
          return;
        }
        if (ui.isMobileSidebarOpen) {
          workspaceUiStore.setIsMobileSidebarOpen(false);
        } else if (ui.selectedTodoId) {
          workspaceUiStore.setSelectedTodoId(null);
        } else if (ui.searchQuery || ui.searchDateFrom || ui.searchDateTo) {
          workspaceUiStore.patchState({
            searchQuery: '',
            searchDateFrom: '',
            searchDateTo: '',
            isDateFilterOpen: false,
          });
        } else if (ui.tagFilter) {
          workspaceUiStore.setTagFilter(null);
        }
        return;
      }

      if (isTypingField || ui.isSettingsOpen || ui.isWelcomeOpen || ui.isCloseModalOpen) return;

      const sc = shortcutStore.getState().customShortcuts;
      if (matchesShortcutEvent(e, sc.openSettings)) {
        e.preventDefault();
        workspaceUiStore.openSettings('appearance');
        return;
      }
      if (matchesShortcutEvent(e, sc.reorderUp)) {
        e.preventDefault();
        keyboardReorderRef.current?.('up');
        return;
      }
      if (matchesShortcutEvent(e, sc.reorderDown)) {
        e.preventDefault();
        keyboardReorderRef.current?.('down');
        return;
      }
      if (matchesShortcutEvent(e, sc.viewList)) {
        e.preventDefault();
        workspaceUiStore.setLayoutMode('list');
        return;
      }
      if (matchesShortcutEvent(e, sc.viewKanban)) {
        e.preventDefault();
        workspaceUiStore.setLayoutMode('kanban');
        return;
      }
      if (matchesShortcutEvent(e, sc.viewCalendar)) {
        e.preventDefault();
        workspaceUiStore.setLayoutMode('calendar');
        return;
      }
      if (matchesShortcutEvent(e, sc.viewMatrix)) {
        e.preventDefault();
        workspaceUiStore.setLayoutMode('matrix');
        return;
      }
      if (matchesShortcutEvent(e, sc.search)) {
        e.preventDefault();
        focusSidebarSearch();
      } else if (matchesShortcutEvent(e, sc.newTask)) {
        e.preventDefault();
        quickAddRef.current?.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [focusSidebarSearch, keyboardReorderRef, quickAddRef]);
}
