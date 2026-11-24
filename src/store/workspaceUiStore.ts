import type {
  ActiveView,
  LayoutMode,
  SettingsTabId,
  SortOption,
  StatusFilter,
  Todo,
} from '../types';
import {
  createSelectorStore,
  type EqualityFn,
  type SelectorStore,
  shallowEqual,
  useSelectorStore,
} from './createSelectorStore';

export interface TodoContextMenuState {
  x: number;
  y: number;
  todo: Todo;
}

export interface DayContextMenuState {
  x: number;
  y: number;
  dateStr: string;
}

export interface WorkspaceUiState {
  activeView: ActiveView;
  layoutMode: LayoutMode;
  statusFilter: StatusFilter;
  tagFilter: string | null;
  sortBy: SortOption;
  searchQuery: string;
  searchDateFrom: string;
  searchDateTo: string;
  isDateFilterOpen: boolean;
  selectedTodoId: string | null;
  isSettingsOpen: boolean;
  settingsInitialTab: SettingsTabId;
  isWelcomeOpen: boolean;
  isCloseModalOpen: boolean;
  isMobileSidebarOpen: boolean;
  todoContextMenu: TodoContextMenuState | null;
  dayContextMenu: DayContextMenuState | null;
}

export interface WorkspaceUiStore extends SelectorStore<WorkspaceUiState> {
  setActiveView: (view: ActiveView | ((prev: ActiveView) => ActiveView)) => void;
  setLayoutMode: (mode: LayoutMode) => void;
  setStatusFilter: (filter: StatusFilter) => void;
  setTagFilter: (tag: string | null | ((prev: string | null) => string | null)) => void;
  setSortBy: (sort: SortOption | ((prev: SortOption) => SortOption)) => void;
  setSearchQuery: (query: string) => void;
  setSearchDateFrom: (date: string) => void;
  setSearchDateTo: (date: string) => void;
  setIsDateFilterOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  setSelectedTodoId: (id: string | null | ((prev: string | null) => string | null)) => void;
  openSettings: (tab?: SettingsTabId) => void;
  closeSettings: () => void;
  setIsSettingsOpen: (open: boolean) => void;
  setSettingsInitialTab: (tab: SettingsTabId) => void;
  setIsWelcomeOpen: (open: boolean) => void;
  setIsCloseModalOpen: (open: boolean) => void;
  setIsMobileSidebarOpen: (open: boolean) => void;
  setTodoContextMenu: (menu: TodoContextMenuState | null) => void;
  setDayContextMenu: (menu: DayContextMenuState | null) => void;
  selectView: (view: ActiveView) => void;
  clearSearchAndFilters: () => void;
  resetNavigationForRestore: () => void;
  dismissModals: () => void;
}

function getInitialWorkspaceUiState(): WorkspaceUiState {
  return {
    activeView: { type: 'smart', id: 'all' },
    layoutMode: 'list',
    statusFilter: 'all',
    tagFilter: null,
    sortBy: 'manual',
    searchQuery: '',
    searchDateFrom: '',
    searchDateTo: '',
    isDateFilterOpen: false,
    selectedTodoId: null,
    isSettingsOpen: false,
    settingsInitialTab: 'appearance',
    isWelcomeOpen: false,
    isCloseModalOpen: false,
    isMobileSidebarOpen: false,
    todoContextMenu: null,
    dayContextMenu: null,
  };
}

export function createWorkspaceUiStore(): WorkspaceUiStore {
  const base = createSelectorStore<WorkspaceUiState>(getInitialWorkspaceUiState);

  const setActiveView = (view: ActiveView | ((prev: ActiveView) => ActiveView)) => {
    const next = typeof view === 'function' ? view(base.getState().activeView) : view;
    base.patchState({ activeView: next });
  };

  const setLayoutMode = (layoutMode: LayoutMode) => base.patchState({ layoutMode });
  const setStatusFilter = (statusFilter: StatusFilter) => base.patchState({ statusFilter });
  const setTagFilter = (tag: string | null | ((prev: string | null) => string | null)) => {
    const next = typeof tag === 'function' ? tag(base.getState().tagFilter) : tag;
    base.patchState({ tagFilter: next });
  };
  const setSortBy = (sort: SortOption | ((prev: SortOption) => SortOption)) => {
    const next = typeof sort === 'function' ? sort(base.getState().sortBy) : sort;
    base.patchState({ sortBy: next });
  };
  const setSearchQuery = (searchQuery: string) => base.patchState({ searchQuery });
  const setSearchDateFrom = (searchDateFrom: string) => base.patchState({ searchDateFrom });
  const setSearchDateTo = (searchDateTo: string) => base.patchState({ searchDateTo });
  const setIsDateFilterOpen = (open: boolean | ((prev: boolean) => boolean)) => {
    const next = typeof open === 'function' ? open(base.getState().isDateFilterOpen) : open;
    base.patchState({ isDateFilterOpen: next });
  };
  const setSelectedTodoId = (id: string | null | ((prev: string | null) => string | null)) => {
    const next = typeof id === 'function' ? id(base.getState().selectedTodoId) : id;
    base.patchState({ selectedTodoId: next });
  };
  const openSettings = (tab: SettingsTabId = 'appearance') => {
    base.patchState({
      settingsInitialTab: tab,
      selectedTodoId: null,
      isSettingsOpen: true,
    });
  };
  const closeSettings = () => {
    base.patchState({
      activeView: { type: 'smart', id: 'all' },
      statusFilter: 'all',
      tagFilter: null,
      isSettingsOpen: false,
    });
  };
  const setIsSettingsOpen = (isSettingsOpen: boolean) => base.patchState({ isSettingsOpen });
  const setSettingsInitialTab = (settingsInitialTab: SettingsTabId) =>
    base.patchState({ settingsInitialTab });
  const setIsWelcomeOpen = (isWelcomeOpen: boolean) => base.patchState({ isWelcomeOpen });
  const setIsCloseModalOpen = (isCloseModalOpen: boolean) => base.patchState({ isCloseModalOpen });
  const setIsMobileSidebarOpen = (isMobileSidebarOpen: boolean) =>
    base.patchState({ isMobileSidebarOpen });
  const setTodoContextMenu = (todoContextMenu: TodoContextMenuState | null) =>
    base.patchState({ todoContextMenu });
  const setDayContextMenu = (dayContextMenu: DayContextMenuState | null) =>
    base.patchState({ dayContextMenu });

  const selectView = (view: ActiveView) => {
    base.patchState({
      isSettingsOpen: false,
      activeView: view,
      statusFilter: 'all',
      tagFilter: null,
    });
  };

  const clearSearchAndFilters = () => {
    base.patchState({
      searchQuery: '',
      searchDateFrom: '',
      searchDateTo: '',
      isDateFilterOpen: false,
      tagFilter: null,
    });
  };

  const resetNavigationForRestore = () => {
    base.patchState({
      selectedTodoId: null,
      tagFilter: null,
      searchQuery: '',
      searchDateFrom: '',
      searchDateTo: '',
      isDateFilterOpen: false,
      statusFilter: 'all',
      activeView: { type: 'smart', id: 'all' },
    });
  };

  const dismissModals = () => {
    base.patchState({
      isSettingsOpen: false,
      isWelcomeOpen: false,
      isCloseModalOpen: false,
    });
  };

  return {
    ...base,
    setActiveView,
    setLayoutMode,
    setStatusFilter,
    setTagFilter,
    setSortBy,
    setSearchQuery,
    setSearchDateFrom,
    setSearchDateTo,
    setIsDateFilterOpen,
    setSelectedTodoId,
    openSettings,
    closeSettings,
    setIsSettingsOpen,
    setSettingsInitialTab,
    setIsWelcomeOpen,
    setIsCloseModalOpen,
    setIsMobileSidebarOpen,
    setTodoContextMenu,
    setDayContextMenu,
    selectView,
    clearSearchAndFilters,
    resetNavigationForRestore,
    dismissModals,
  };
}

export const workspaceUiStore = createWorkspaceUiStore();

export function useWorkspaceUiSelector<S>(
  selector: (state: WorkspaceUiState) => S,
  isEqual: EqualityFn<S> = shallowEqual,
): S {
  return useSelectorStore(workspaceUiStore, selector, isEqual);
}
