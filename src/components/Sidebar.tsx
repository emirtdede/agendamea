import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  FolderPlus,
  Heart,
  Inbox,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Pin,
  Plus,
  Search,
  Settings,
  Star,
  Sun,
  Trash2,
  X,
} from 'lucide-react';
import { useDelayedFocus } from '../hooks/useDelayedFocus';
import { useI18n } from '../i18n/I18nContext';
import type { ActiveView, Category, CategoryPatch, SmartView } from '../types';
import { createClientId } from '../utils/id';
import { CATEGORY_COLORS } from '../utils/themes';
import { getVerticalDropPosition, moveIdRelative } from '../utils/todoLogic';
import { BrandMark } from './BrandMark';
import { CategoryColorPicker } from './CategoryColorPicker';
import { ColorDot } from './ColorDot';

const GITHUB_URL = 'https://github.com/emirtdede/agendamea';
const SPONSOR_URL = 'https://github.com/sponsors/emirtdede';

function GithubMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2Z" />
    </svg>
  );
}

interface SidebarProps {
  activeView: ActiveView;
  onSelectView: (view: ActiveView) => void;
  categories: Category[];
  counts: {
    smart: Record<SmartView, number>;
    categories: Record<string, number>;
  };
  dragLocked: boolean;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  isSettingsOpen?: boolean;
  onOpenSettings: () => void;
  onCreateCategory: (payload: { id: string; name: string; color: string }) => Promise<void>;
  onUpdateCategory: (id: string, patch: CategoryPatch) => Promise<void>;
  onTogglePinCategory: (id: string, pinned: boolean) => Promise<void>;
  onDeleteCategory: (id: string) => Promise<void>;
  onReorderCategories: (orderedIds: string[]) => void;
  isOpenMobile: boolean;
  onCloseMobile: () => void;
}

export const Sidebar = React.memo(function Sidebar({
  activeView,
  onSelectView,
  categories,
  counts,
  dragLocked,
  isCollapsed,
  onToggleCollapse,
  searchQuery,
  onSearchChange,
  searchInputRef,
  isSettingsOpen = false,
  onOpenSettings,
  onCreateCategory,
  onUpdateCategory,
  onTogglePinCategory,
  onDeleteCategory,
  onReorderCategories,
  isOpenMobile,
  onCloseMobile,
}: SidebarProps) {
  const { t } = useI18n();
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatColor, setNewCatColor] = useState(CATEGORY_COLORS[1].hex);
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editCatName, setEditCatName] = useState('');
  const [editCatColor, setEditCatColor] = useState(CATEGORY_COLORS[1].hex);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [draggedCatId, setDraggedCatId] = useState<string | null>(null);
  const [catDropTarget, setCatDropTarget] = useState<{
    id: string;
    position: 'before' | 'after';
  } | null>(null);

  const addInputRef = useRef<HTMLInputElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  const scheduleFocus = useDelayedFocus();

  const isCreatingRef = useRef(false);
  const pendingCreateIdRef = useRef<string | null>(null);
  const isEditingRef = useRef(false);
  const isDeletingRef = useRef(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const smartItems: Array<{
    id: SmartView;
    label: string;
    Icon: React.ComponentType<{ className?: string }>;
  }> = useMemo(
    () => [
      { id: 'all', label: t.allTasks, Icon: Inbox },
      { id: 'today', label: t.today, Icon: Sun },
      { id: 'important', label: t.important, Icon: Star },
      { id: 'completed', label: t.completed, Icon: CheckCircle2 },
    ],
    [t.allTasks, t.today, t.important, t.completed],
  );

  const { pinnedCount, unpinnedCount } = useMemo(() => {
    let pinned = 0;
    for (const c of categories) {
      if (c.pinned) pinned += 1;
    }
    return { pinnedCount: pinned, unpinnedCount: categories.length - pinned };
  }, [categories]);

  const draggedCat = useMemo(
    () => (draggedCatId ? categories.find((c) => c.id === draggedCatId) ?? null : null),
    [categories, draggedCatId],
  );

  useEffect(() => {
    if (isAddingCategory) {
      addInputRef.current?.focus();
    }
  }, [isAddingCategory]);

  useEffect(() => {
    if (editingCatId) {
      editInputRef.current?.focus();
    }
  }, [editingCatId]);

  const openAddCategoryForm = (fromCollapsed = false) => {
    setEditingCatId(null);
    setConfirmDeleteId(null);
    pendingCreateIdRef.current = null;
    setIsAddingCategory(true);
    if (fromCollapsed && isCollapsed) {
      onToggleCollapse();
      scheduleFocus(() => addInputRef.current?.focus(), 60);
    }
  };

  const closeAddCategoryForm = () => {
    setIsAddingCategory(false);
    setNewCatName('');
    pendingCreateIdRef.current = null;
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isCreatingRef.current) return;

    const trimmed = newCatName.trim();
    if (!trimmed) return;

    isCreatingRef.current = true;
    setIsCreatingCategory(true);
    const id = pendingCreateIdRef.current ?? createClientId('cat');
    pendingCreateIdRef.current = id;

    try {
      await onCreateCategory({ id, name: trimmed, color: newCatColor });
      if (!isMountedRef.current) return;
      setNewCatName('');
      setNewCatColor(CATEGORY_COLORS[(categories.length + 1) % CATEGORY_COLORS.length].hex);
      setIsAddingCategory(false);
      pendingCreateIdRef.current = null;
    } catch {
      // Keep form open and retain pendingCreateIdRef for safe idempotent retry
    } finally {
      isCreatingRef.current = false;
      if (isMountedRef.current) {
        setIsCreatingCategory(false);
      }
    }
  };

  const startEditingCategory = (cat: Category) => {
    setConfirmDeleteId(null);
    setEditingCatId(cat.id);
    setEditCatName(cat.name);
    setEditCatColor(cat.color);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCatId || isEditingRef.current) return;
    const trimmed = editCatName.trim();
    if (!trimmed) return;

    isEditingRef.current = true;
    setIsSavingEdit(true);
    try {
      await onUpdateCategory(editingCatId, { name: trimmed, color: editCatColor });
      if (isMountedRef.current) {
        setEditingCatId(null);
      }
    } catch {
      // Error feedback handled by App toast
    } finally {
      isEditingRef.current = false;
      if (isMountedRef.current) {
        setIsSavingEdit(false);
      }
    }
  };

  const handleConfirmDelete = async (id: string) => {
    if (isDeletingRef.current) return;
    isDeletingRef.current = true;
    try {
      await onDeleteCategory(id);
      if (isMountedRef.current) {
        setConfirmDeleteId(null);
      }
    } catch {
      // Error feedback handled by App toast
    } finally {
      isDeletingRef.current = false;
    }
  };

  const handleSelectAndClose = (view: ActiveView) => {
    onSelectView(view);
    onCloseMobile();
  };

  const handleCollapsedSearchClick = () => {
    onToggleCollapse();
    scheduleFocus(() => searchInputRef.current?.focus(), 60);
  };

  const renderSidebar = (compact: boolean) => (
    <aside
      aria-label="Agendamea"
      data-collapsed={compact ? 'true' : 'false'}
      className={`flex h-full shrink-0 flex-col border-r border-[var(--border)] bg-[var(--surface)] select-none transition-[width] duration-200 ease-out ${
        compact ? 'w-[68px]' : 'w-[264px]'
      }`}
    >
      {/* Brand Header & Minimal Mode Toggle */}
      {compact ? (
        <div className="app-drag-region flex flex-col items-center gap-2 border-b border-[var(--border)] py-3">
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label={t.expandSidebar}
            title={`Agendamea - ${t.expandSidebar}`}
            className="app-no-drag flex h-9 w-9 items-center justify-center rounded-lg hover:bg-[var(--surface-hover)] transition-colors"
          >
            <BrandMark className="h-6 w-6" />
          </button>
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label={t.expandSidebar}
            title={t.expandSidebar}
            className="app-no-drag flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] transition-colors"
          >
            <PanelLeftOpen className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className="app-drag-region flex h-14 shrink-0 items-center justify-between border-b border-[var(--border)] px-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <BrandMark className="h-6 w-6" />
            <span className="font-display text-[16px] font-bold tracking-tight text-[var(--text-primary)] whitespace-nowrap">
              Agendamea
            </span>
          </div>
          <div className="app-no-drag flex items-center gap-1">
            <button
              type="button"
              onClick={onToggleCollapse}
              aria-label={t.collapseSidebar}
              title={t.collapseSidebar}
              className="hidden md:flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] transition-colors"
            >
              <PanelLeftClose className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onCloseMobile}
              aria-label={t.closeMenu}
              className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] md:hidden"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Search directly above Smart Views */}
      <div className={compact ? 'px-2 pt-3 pb-1' : 'px-3 pt-3 pb-1'}>
        {compact ? (
          <button
            type="button"
            onClick={handleCollapsedSearchClick}
            aria-label={t.searchPlaceholder}
            title={searchQuery ? `${t.searchPlaceholder} ${searchQuery}` : `${t.searchPlaceholder} (Ctrl+K)`}
            className={`mx-auto flex h-9 w-9 items-center justify-center rounded-lg border transition-colors ${
              searchQuery
                ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]'
                : 'border-[var(--border)] bg-[var(--canvas)] text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Search className="h-4 w-4" />
          </button>
        ) : (
          <div className="relative flex items-center">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-[var(--text-muted)]"
            />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              aria-label={t.searchPlaceholder}
              placeholder={t.searchPlaceholder}
              className="h-9 w-full rounded-lg border border-[var(--border)] bg-[var(--canvas)] pl-8 pr-7 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] transition-colors focus:border-[var(--border-strong)] focus:outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => onSearchChange('')}
                aria-label={t.clearSearch}
                className="absolute right-1.5 flex h-5 w-5 items-center justify-center rounded text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Navigation & Categories */}
      <div
        className={`flex-1 overflow-y-auto py-3 space-y-5 ${
          compact ? 'px-2' : 'px-3'
        }`}
      >
        {/* Smart Views */}
        <nav aria-label={t.allTasks} className="space-y-0.5">
          {smartItems.map(({ id, label, Icon }) => {
            const isActive = !isSettingsOpen && activeView.type === 'smart' && activeView.id === id;
            const count = counts.smart[id];

            if (compact) {
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => handleSelectAndClose({ type: 'smart', id })}
                  aria-label={label}
                  aria-current={isActive ? 'page' : undefined}
                  title={`${label} (${count})`}
                  className={`mx-auto flex h-9 w-9 items-center justify-center rounded-lg transition-colors duration-150 ${
                    isActive
                      ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
                      : 'text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                </button>
              );
            }

            return (
              <button
                key={id}
                type="button"
                onClick={() => handleSelectAndClose({ type: 'smart', id })}
                aria-current={isActive ? 'page' : undefined}
                className={`group flex w-full items-center justify-between rounded-lg px-3 py-2 text-[14px] font-medium transition-colors duration-150 ${
                  isActive
                    ? 'bg-[var(--accent-soft)] text-[var(--text-primary)]'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]'
                }`}
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  <Icon
                    className={`h-4 w-4 shrink-0 ${
                      isActive
                        ? 'text-[var(--accent)]'
                        : 'text-[var(--text-muted)] group-hover:text-[var(--text-secondary)]'
                    }`}
                  />
                  <span className="truncate whitespace-nowrap">{label}</span>
                </span>
                <span
                  className={`font-mono-tabular text-xs shrink-0 ${
                    isActive ? 'text-[var(--accent)] font-medium' : 'text-[var(--text-muted)]'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </nav>

        {/* Divider */}
        <div className="mx-2 h-px bg-[var(--border)]" />

        {/* Categories Section */}
        <section aria-label={t.categories}>
          {!compact && (
            <div className="mb-2 flex items-center justify-between pl-3 pr-1">
              <h2 className="font-display text-xs font-semibold tracking-wide text-[var(--text-muted)]">
                {t.categories}
              </h2>
              <button
                type="button"
                data-testid="sidebar-add-category-btn"
                onClick={() => {
                  if (isAddingCategory) {
                    closeAddCategoryForm();
                  } else {
                    openAddCategoryForm(false);
                  }
                }}
                aria-label={t.newCategory}
                title={t.newCategory}
                className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          <div className="space-y-0.5">
            {categories.map((cat) => {
              const isActive = !isSettingsOpen && activeView.type === 'category' && activeView.id === cat.id;
              const isEditing = !compact && editingCatId === cat.id;
              const isConfirmingDelete = !compact && confirmDeleteId === cat.id;
              const count = counts.categories[cat.id] ?? 0;

              if (compact) {
                return (
                  <button
                    key={cat.id}
                    type="button"
                    data-testid="category-item"
                    data-category-id={cat.id}
                    data-pinned={cat.pinned ? 'true' : 'false'}
                    onClick={() => handleSelectAndClose({ type: 'category', id: cat.id })}
                    aria-label={cat.name}
                    aria-current={isActive ? 'page' : undefined}
                    title={
                      cat.pinned
                        ? `${cat.name} (${t.pinLabel} · ${count})`
                        : `${cat.name} (${count})`
                    }
                    className={`relative mx-auto flex h-9 w-9 items-center justify-center rounded-lg transition-colors duration-150 ${
                      isActive
                        ? 'bg-[var(--accent-soft)]'
                        : 'hover:bg-[var(--surface-hover)]'
                    }`}
                  >
                    <ColorDot color={cat.color} size="md" />
                    {cat.pinned && (
                      <span
                        aria-hidden="true"
                        className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-[var(--accent)]"
                      />
                    )}
                  </button>
                );
              }

              if (isEditing) {
                return (
                  <form
                    key={cat.id}
                    onSubmit={handleEditSubmit}
                    className="rounded-lg border border-[var(--border-strong)] bg-[var(--surface-subtle)] p-2.5 space-y-2.5"
                  >
                    <input
                      ref={editInputRef}
                      type="text"
                      value={editCatName}
                      onChange={(e) => setEditCatName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') setEditingCatId(null);
                      }}
                      aria-label={t.categoryNamePlaceholder}
                      placeholder={t.categoryNamePlaceholder}
                      maxLength={60}
                      className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
                    />
                    <CategoryColorPicker
                      value={editCatColor}
                      onChange={setEditCatColor}
                      ariaLabel={t.colorThemeTitle}
                    />
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => setEditingCatId(null)}
                        className="rounded-md px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]"
                      >
                        {t.cancelButton}
                      </button>
                      <button
                        type="submit"
                        disabled={!editCatName.trim() || isSavingEdit}
                        className="rounded-md px-2.5 py-1 text-xs font-medium transition-opacity disabled:opacity-40"
                        style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-fg)' }}
                      >
                        {t.applyButton}
                      </button>
                    </div>
                  </form>
                );
              }

              if (isConfirmingDelete) {
                return (
                  <div
                    key={cat.id}
                    className="rounded-lg border border-[var(--border-strong)] bg-[var(--surface-subtle)] p-2.5 space-y-2"
                  >
                    <p className="text-xs text-[var(--text-primary)] leading-relaxed">
                      <strong>{cat.name}</strong> {t.confirmMoveCategoryTrash}
                    </p>
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(null)}
                        className="rounded-md px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]"
                      >
                        {t.cancelButton}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleConfirmDelete(cat.id)}
                        className="rounded-md px-2.5 py-1 text-xs font-medium text-white bg-red-600 hover:bg-red-700"
                      >
                        {t.deleteToTrashButton}
                      </button>
                    </div>
                  </div>
                );
              }

              const sameGroupCount = cat.pinned ? pinnedCount : unpinnedCount;
              const canDragCat = !dragLocked && sameGroupCount > 1;
              const isDraggingCat = draggedCatId === cat.id;
              const canAcceptDrop =
                canDragCat &&
                draggedCat !== null &&
                draggedCat.id !== cat.id &&
                draggedCat.pinned === cat.pinned;
              const dropPos =
                catDropTarget && catDropTarget.id === cat.id ? catDropTarget.position : null;

              return (
                <div
                  key={cat.id}
                  data-testid="category-item"
                  data-category-id={cat.id}
                  data-pinned={cat.pinned ? 'true' : 'false'}
                  draggable={canDragCat}
                  onDragStart={(e) => {
                    if (!canDragCat) return;
                    setDraggedCatId(cat.id);
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/agendamea-category', cat.id);
                    e.dataTransfer.setData('text/plain', cat.id);
                  }}
                  onDragOver={(e) => {
                    if (!canAcceptDrop) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    const position = getVerticalDropPosition(
                      e.clientY,
                      e.currentTarget.getBoundingClientRect(),
                    );
                    setCatDropTarget((prev) =>
                      prev && prev.id === cat.id && prev.position === position
                        ? prev
                        : { id: cat.id, position },
                    );
                  }}
                  onDragLeave={(e) => {
                    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
                    setCatDropTarget((prev) => (prev && prev.id === cat.id ? null : prev));
                  }}
                  onDrop={(e) => {
                    if (!canAcceptDrop) return;
                    e.preventDefault();
                    const sourceId =
                      draggedCatId ?? e.dataTransfer.getData('text/agendamea-category');
                    if (sourceId && sourceId !== cat.id) {
                      const position = getVerticalDropPosition(
                        e.clientY,
                        e.currentTarget.getBoundingClientRect(),
                      );
                      const orderedIds = moveIdRelative(
                        categories.map((c) => c.id),
                        sourceId,
                        cat.id,
                        position,
                      );
                      onReorderCategories(orderedIds);
                    }
                    setDraggedCatId(null);
                    setCatDropTarget(null);
                  }}
                  onDragEnd={() => {
                    setDraggedCatId(null);
                    setCatDropTarget(null);
                  }}
                  className={`group relative flex items-center rounded-lg transition-colors duration-150 ${
                    isActive
                      ? 'bg-[var(--accent-soft)]'
                      : 'hover:bg-[var(--surface-hover)]'
                  } ${isDraggingCat ? 'opacity-45' : ''}`}
                >
                  {dropPos === 'before' && (
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-x-2 top-0 h-0.5 rounded-full bg-[var(--accent)]"
                    />
                  )}
                  {dropPos === 'after' && (
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-[var(--accent)]"
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => handleSelectAndClose({ type: 'category', id: cat.id })}
                    onKeyDown={(e) => {
                      if (!canDragCat || !e.altKey) return;
                      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
                      e.preventDefault();
                      const idx = categories.findIndex((c) => c.id === cat.id);
                      const neighborIdx = e.key === 'ArrowUp' ? idx - 1 : idx + 1;
                      const neighbor = categories[neighborIdx];
                      if (!neighbor || neighbor.pinned !== cat.pinned) return;
                      const orderedIds = moveIdRelative(
                        categories.map((c) => c.id),
                        cat.id,
                        neighbor.id,
                        e.key === 'ArrowUp' ? 'before' : 'after',
                      );
                      onReorderCategories(orderedIds);
                    }}
                    aria-current={isActive ? 'page' : undefined}
                    className={`flex flex-1 items-center gap-2.5 min-w-0 px-3 py-2 text-left text-[14px] font-medium ${
                      isActive
                        ? 'text-[var(--text-primary)]'
                        : 'text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]'
                    }`}
                  >
                    <ColorDot color={cat.color} size="sm" />
                    <span className="truncate whitespace-nowrap">{cat.name}</span>
                  </button>

                  <div className="flex items-center gap-0.5 pr-2">
                    <button
                      type="button"
                      onClick={() => void onTogglePinCategory(cat.id, !cat.pinned)}
                      aria-label={`${cat.pinned ? t.unpinLabel : t.pinLabel}: ${cat.name}`}
                      aria-pressed={cat.pinned}
                      title={cat.pinned ? t.unpinLabel : t.pinLabel}
                      className={`flex h-6 w-6 items-center justify-center rounded transition-colors ${
                        cat.pinned
                          ? 'text-[var(--accent)] hover:bg-[var(--surface)]'
                          : isActive
                            ? 'text-[var(--text-muted)] hover:bg-[var(--surface)] hover:text-[var(--text-primary)]'
                            : 'flex md:hidden md:group-hover:flex md:group-focus-within:flex text-[var(--text-muted)] hover:bg-[var(--surface)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      <Pin className={`h-3 w-3 ${cat.pinned ? 'fill-current' : ''}`} />
                    </button>

                    <div
                      className={`items-center gap-0.5 ${
                        isActive
                          ? 'flex'
                          : 'flex md:hidden md:group-hover:flex md:group-focus-within:flex'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => startEditingCategory(cat)}
                        aria-label={cat.name}
                        className="flex h-6 w-6 items-center justify-center rounded text-[var(--text-muted)] hover:bg-[var(--surface)] hover:text-[var(--text-primary)]"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(cat.id)}
                        aria-label={`${t.deleteToTrashButton}: ${cat.name}`}
                        title={t.deleteToTrashButton}
                        className="flex h-6 w-6 items-center justify-center rounded text-[var(--text-muted)] hover:bg-[var(--surface)] hover:text-red-500"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                    <span
                      className={`font-mono-tabular px-1 text-xs ${
                        isActive
                          ? 'hidden'
                          : 'hidden md:inline md:group-hover:hidden md:group-focus-within:hidden text-[var(--text-muted)]'
                      }`}
                    >
                      {count}
                    </span>
                  </div>
                </div>
              );
            })}

            {!compact && categories.length === 0 && !isAddingCategory && (
              <p className="px-3 py-2 text-xs text-[var(--text-muted)]">
                {t.noCategoriesYet}
              </p>
            )}
          </div>

          {/* Inline Create Category Form / Minimal Add Trigger */}
          {compact ? (
            <button
              type="button"
              onClick={() => openAddCategoryForm(true)}
              aria-label={t.newCategory}
              title={t.newCategory}
              className="mx-auto mt-2 flex h-9 w-9 items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] transition-colors"
            >
              <Plus className="h-4 w-4" />
            </button>
          ) : isAddingCategory ? (
            <form
              onSubmit={handleCreateSubmit}
              className="mt-2 rounded-lg border border-[var(--border-strong)] bg-[var(--surface-subtle)] p-2.5 space-y-2.5"
            >
              <input
                ref={addInputRef}
                type="text"
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    closeAddCategoryForm();
                  }
                }}
                disabled={isCreatingCategory}
                aria-label={t.categoryNamePlaceholder}
                placeholder={t.categoryNamePlaceholder}
                maxLength={60}
                className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] disabled:opacity-60"
              />
              <CategoryColorPicker
                value={newCatColor}
                onChange={setNewCatColor}
                ariaLabel={t.colorThemeTitle}
              />
              <div className="flex items-center justify-end gap-1.5">
                <button
                  type="button"
                  onClick={closeAddCategoryForm}
                  disabled={isCreatingCategory}
                  className="rounded-md px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] disabled:opacity-40"
                >
                  {t.cancelButton}
                </button>
                <button
                  type="submit"
                  disabled={!newCatName.trim() || isCreatingCategory}
                  className="rounded-md px-2.5 py-1 text-xs font-medium transition-opacity disabled:opacity-40"
                  style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-fg)' }}
                >
                  {isCreatingCategory ? t.addingButton : t.addButton}
                </button>
              </div>
            </form>
          ) : categories.length === 0 ? (
            <button
              type="button"
              onClick={() => openAddCategoryForm(false)}
              className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[13px] font-medium text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] transition-colors"
            >
              <FolderPlus className="h-4 w-4 shrink-0" />
              <span className="whitespace-nowrap">{t.newCategory}</span>
            </button>
          ) : null}
        </section>
      </div>

      {/* Settings Button */}
      <div className={compact ? 'px-2 pb-2 pt-1' : 'px-3 pb-2.5 pt-1'}>
        {compact ? (
          <button
            type="button"
            data-testid="open-settings-button"
            aria-current={isSettingsOpen ? 'page' : undefined}
            onClick={() => {
              onCloseMobile();
              onOpenSettings();
            }}
            aria-label={t.settings}
            title={t.settings}
            className={`mx-auto flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${
              isSettingsOpen
                ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
                : 'text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Settings className="h-4 w-4" />
          </button>
        ) : (
          <button
            type="button"
            data-testid="open-settings-button"
            aria-current={isSettingsOpen ? 'page' : undefined}
            onClick={() => {
              onCloseMobile();
              onOpenSettings();
            }}
            className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[14px] font-medium transition-colors ${
              isSettingsOpen
                ? 'bg-[var(--accent-soft)] text-[var(--text-primary)]'
                : 'text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Settings
              className={`h-4 w-4 shrink-0 ${
                isSettingsOpen ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'
              }`}
            />
            <span className="whitespace-nowrap">{t.settings}</span>
          </button>
        )}
      </div>

      {/* Footer Links */}
      <div className={compact ? 'border-t border-[var(--border)] p-2 space-y-1' : 'border-t border-[var(--border)] p-3'}>
        {compact ? (
          <>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="GitHub"
              title="GitHub"
              className="mx-auto flex h-9 w-9 items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] transition-colors"
            >
              <GithubMark className="h-4 w-4" />
            </a>
            {!window.agendameaWindow?.isWindowsStore && (
              <a
                href={SPONSOR_URL}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={t.sponsor}
                title={t.sponsor}
                className="mx-auto flex h-9 w-9 items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] transition-colors"
              >
                <Heart className="h-4 w-4" />
              </a>
            )}
          </>
        ) : (
          <div className={window.agendameaWindow?.isWindowsStore ? 'grid grid-cols-1 gap-1.5' : 'grid grid-cols-2 gap-1.5'}>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={onCloseMobile}
              className="flex items-center justify-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-subtle)]/60 px-2.5 py-1.5 text-[12.5px] font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] transition-colors whitespace-nowrap"
            >
              <GithubMark className="h-3.5 w-3.5 shrink-0" />
              <span>GitHub</span>
            </a>
            {!window.agendameaWindow?.isWindowsStore && (
              <a
                href={SPONSOR_URL}
                target="_blank"
                rel="noopener noreferrer"
                onClick={onCloseMobile}
                className="flex items-center justify-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-subtle)]/60 px-2.5 py-1.5 text-[12.5px] font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] transition-colors whitespace-nowrap"
              >
                <Heart className="h-3.5 w-3.5 shrink-0" />
                <span>{t.sponsor}</span>
              </a>
            )}
          </div>
        )}
      </div>
    </aside>
  );

  return (
    <>
      <div className="hidden md:flex h-full">{renderSidebar(isCollapsed)}</div>

      {isOpenMobile && (
        <div className="fixed inset-0 z-40 flex md:hidden">
          <button
            type="button"
            aria-label={t.closeMenu}
            onClick={onCloseMobile}
            className="fixed inset-0 bg-black/45"
          />
          <div className="relative z-10 flex h-full">{renderSidebar(false)}</div>
        </div>
      )}
    </>
  );
});
