import { Eye, Heart, Home, Lock, Pencil, Pin, Plus, Settings, Trash2 } from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useDelayedFocus } from '../hooks/useDelayedFocus';
import { useI18n } from '../i18n/I18nContext';
import { preferencesStore } from '../store/preferencesStore';
import type { ActiveView, Category, CategoryPatch, SmartView } from '../types';
import { createClientId } from '../utils/id';
import { CATEGORY_COLORS } from '../utils/themes';
import { ContextMenu } from './ContextMenu';
import { SidebarCategoryForm } from './sidebar/SidebarCategoryForm';
import { SidebarCategoryList } from './sidebar/SidebarCategoryList';
import { SidebarBrandAndSearch, SidebarSmartViewsNav } from './sidebar/SidebarSearchHeader';

const GITHUB_URL = 'https://github.com/emirtdede/agendamea';
const SPONSOR_URL = 'https://github.com/sponsors/emirtdede';

function GithubMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
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
  onOpenCommandPalette?: () => void;
  isSettingsOpen?: boolean;
  onOpenSettings: () => void;
  appLockEnabled?: boolean;
  onLockAppNow?: () => void;
  onNewTaskInView?: (view: ActiveView) => void;
  onClearAllCompleted?: () => void;
  onNotifyInfo?: (message: string) => void;
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
  onOpenCommandPalette,
  isSettingsOpen = false,
  onOpenSettings,
  appLockEnabled = false,
  onLockAppNow,
  onNewTaskInView,
  onClearAllCompleted,
  onNotifyInfo,
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
  const defaultCatHex = CATEGORY_COLORS[1]?.hex ?? '#2563eb';
  const [newCatName, setNewCatName] = useState('');
  const [newCatColor, setNewCatColor] = useState(defaultCatHex);
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editCatName, setEditCatName] = useState('');
  const [editCatColor, setEditCatColor] = useState(defaultCatHex);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [draggedCatId, setDraggedCatId] = useState<string | null>(null);
  const [catDropTarget, setCatDropTarget] = useState<{
    id: string;
    position: 'before' | 'after';
  } | null>(null);
  const [catContextMenu, setCatContextMenu] = useState<{
    x: number;
    y: number;
    category: Category;
  } | null>(null);
  const [smartContextMenu, setSmartContextMenu] = useState<{
    x: number;
    y: number;
    viewId: SmartView;
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

  const { pinnedCount, unpinnedCount } = useMemo(() => {
    let pinned = 0;
    for (const c of categories) {
      if (c.pinned) pinned += 1;
    }
    return { pinnedCount: pinned, unpinnedCount: categories.length - pinned };
  }, [categories]);

  const draggedCat = useMemo(
    () => (draggedCatId ? (categories.find((c) => c.id === draggedCatId) ?? null) : null),
    [categories, draggedCatId],
  );

  useEffect(() => {
    if (isAddingCategory) addInputRef.current?.focus();
  }, [isAddingCategory]);

  useEffect(() => {
    if (editingCatId) editInputRef.current?.focus();
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
      setNewCatColor(
        CATEGORY_COLORS[(categories.length + 1) % CATEGORY_COLORS.length]?.hex ?? defaultCatHex,
      );
      setIsAddingCategory(false);
      pendingCreateIdRef.current = null;
    } catch {
      // Keep form open and retain pendingCreateIdRef for safe idempotent retry
    } finally {
      isCreatingRef.current = false;
      if (isMountedRef.current) setIsCreatingCategory(false);
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
      if (isMountedRef.current) setEditingCatId(null);
    } catch {
      // Error feedback handled by App toast
    } finally {
      isEditingRef.current = false;
      if (isMountedRef.current) setIsSavingEdit(false);
    }
  };

  const handleConfirmDelete = async (id: string) => {
    if (isDeletingRef.current) return;
    isDeletingRef.current = true;
    try {
      await onDeleteCategory(id);
      if (isMountedRef.current) setConfirmDeleteId(null);
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

  const handleOpenCommandPalette = () => {
    if (onOpenCommandPalette) {
      onCloseMobile();
      onOpenCommandPalette();
      return;
    }
    if (isCollapsed) {
      onToggleCollapse();
      scheduleFocus(() => searchInputRef.current?.focus(), 60);
    } else {
      searchInputRef.current?.focus();
    }
  };

  const renderSidebar = (compact: boolean) => (
    <aside
      aria-label="Agendamea"
      data-collapsed={compact ? 'true' : 'false'}
      className={`flex h-full shrink-0 flex-col border-e border-[var(--border)] bg-[var(--surface)] select-none transition-[width] duration-200 ease-out ${
        compact ? 'w-[68px]' : 'w-[264px]'
      }`}
    >
      <SidebarBrandAndSearch
        compact={compact}
        searchQuery={searchQuery}
        searchInputRef={searchInputRef}
        onToggleCollapse={onToggleCollapse}
        onCloseMobile={onCloseMobile}
        onSearchChange={onSearchChange}
        onOpenCommandPalette={handleOpenCommandPalette}
      />

      <div className={`flex-1 overflow-y-auto py-3 space-y-5 ${compact ? 'px-2' : 'px-3'}`}>
        <SidebarSmartViewsNav
          compact={compact}
          activeView={activeView}
          isSettingsOpen={isSettingsOpen}
          smartCounts={counts.smart}
          onSelectView={handleSelectAndClose}
          onSmartViewContextMenu={(e, viewId) =>
            setSmartContextMenu({ x: e.clientX, y: e.clientY, viewId })
          }
        />

        <div className="mx-2 h-px bg-[var(--border)]" />

        <section aria-label={t.categories}>
          {!compact && (
            <div className="mb-2 flex items-center justify-between ps-3 pe-1">
              <h2 className="font-display text-xs font-semibold tracking-wide text-[var(--text-muted)]">
                {t.categories}
              </h2>
              <button
                type="button"
                data-testid="sidebar-add-category-btn"
                onClick={() =>
                  isAddingCategory ? closeAddCategoryForm() : openAddCategoryForm(false)
                }
                aria-label={t.newCategory}
                title={t.newCategory}
                className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--text-muted)] ag-hover-glow hover:text-[var(--text-primary)] transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          <SidebarCategoryList
            compact={compact}
            categories={categories}
            countsByCategory={counts.categories}
            activeView={activeView}
            isSettingsOpen={isSettingsOpen}
            dragLocked={dragLocked}
            pinnedCount={pinnedCount}
            unpinnedCount={unpinnedCount}
            isAddingCategory={isAddingCategory}
            editingCatId={editingCatId}
            editCatName={editCatName}
            editCatColor={editCatColor}
            isSavingEdit={isSavingEdit}
            editInputRef={editInputRef}
            confirmDeleteId={confirmDeleteId}
            draggedCatId={draggedCatId}
            draggedCat={draggedCat}
            catDropTarget={catDropTarget}
            onSelectCategory={(id) => handleSelectAndClose({ type: 'category', id })}
            onOpenContextMenu={(e, category) =>
              setCatContextMenu({ x: e.clientX, y: e.clientY, category })
            }
            onStartEdit={startEditingCategory}
            onCancelEdit={() => setEditingCatId(null)}
            onChangeEditName={setEditCatName}
            onChangeEditColor={setEditCatColor}
            onSubmitEdit={handleEditSubmit}
            onRequestDelete={setConfirmDeleteId}
            onConfirmDelete={handleConfirmDelete}
            onTogglePinCategory={onTogglePinCategory}
            onReorderCategories={onReorderCategories}
            setDraggedCatId={setDraggedCatId}
            setCatDropTarget={setCatDropTarget}
          />

          <SidebarCategoryForm
            compact={compact}
            isAddingCategory={isAddingCategory}
            isCreatingCategory={isCreatingCategory}
            newCatName={newCatName}
            newCatColor={newCatColor}
            addInputRef={addInputRef}
            onChangeName={setNewCatName}
            onChangeColor={setNewCatColor}
            onOpenFromCollapsed={() => openAddCategoryForm(true)}
            onClose={closeAddCategoryForm}
            onSubmit={handleCreateSubmit}
          />
        </section>
      </div>

      <div className={compact ? 'px-2 pb-2 pt-1 space-y-1' : 'px-3 pb-2.5 pt-1 space-y-1'}>
        {appLockEnabled && onLockAppNow && (
          <button
            type="button"
            data-testid="sidebar-lock-now-btn"
            onClick={() => {
              onCloseMobile();
              onLockAppNow();
            }}
            aria-label={compact ? t.appLockLockNowButton : undefined}
            title={compact ? t.appLockLockNowButton : undefined}
            className={
              compact
                ? 'mx-auto flex h-9 w-9 items-center justify-center rounded-lg text-[var(--text-muted)] ag-hover-glow'
                : 'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[14px] font-medium text-[var(--text-secondary)] ag-hover-glow'
            }
          >
            <Lock
              className={`shrink-0 ${
                compact ? 'h-[18px] w-[18px]' : 'h-4 w-4 text-[var(--text-muted)]'
              }`}
            />
            {!compact && <span className="whitespace-nowrap">{t.appLockLockNowButton}</span>}
          </button>
        )}
        <button
          type="button"
          data-testid="open-settings-button"
          aria-current={isSettingsOpen ? 'page' : undefined}
          onClick={() => {
            onCloseMobile();
            onOpenSettings();
          }}
          aria-label={compact ? t.settings : undefined}
          title={compact ? t.settings : undefined}
          className={
            compact
              ? `mx-auto flex h-9 w-9 items-center justify-center rounded-lg ag-hover-glow ${
                  isSettingsOpen ? 'ag-minimal-active' : 'text-[var(--text-muted)]'
                }`
              : `flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[14px] font-medium ag-hover-glow ${
                  isSettingsOpen
                    ? 'bg-[var(--accent-soft)] text-[var(--text-primary)]'
                    : 'text-[var(--text-secondary)]'
                }`
          }
        >
          <Settings
            className={`shrink-0 ${
              compact
                ? 'h-[18px] w-[18px]'
                : isSettingsOpen
                  ? 'h-4 w-4 text-[var(--accent)]'
                  : 'h-4 w-4 text-[var(--text-muted)]'
            }`}
          />
          {!compact && <span className="whitespace-nowrap">{t.settings}</span>}
        </button>
      </div>

      <div
        className={
          compact
            ? 'border-t border-[var(--border)] p-2 space-y-1'
            : 'border-t border-[var(--border)] p-3'
        }
      >
        {compact ? (
          <>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="GitHub"
              title="GitHub"
              className="mx-auto flex h-9 w-9 items-center justify-center rounded-lg text-[var(--text-muted)] ag-hover-glow"
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
                className="group mx-auto flex h-9 w-9 items-center justify-center rounded-lg text-[var(--text-muted)] ag-hover-glow"
              >
                <Heart className="h-4 w-4 transition-colors group-hover:text-rose-400" />
              </a>
            )}
          </>
        ) : (
          <div
            className={
              window.agendameaWindow?.isWindowsStore
                ? 'grid grid-cols-1 gap-1.5'
                : 'grid grid-cols-2 gap-1.5'
            }
          >
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={onCloseMobile}
              title="GitHub"
              data-testid="sidebar-github-btn"
              className="group flex min-w-0 items-center justify-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-subtle)]/50 px-2.5 py-1.5 text-[12.5px] font-medium text-[var(--text-secondary)] ag-hover-card-glow"
            >
              <GithubMark className="h-3.5 w-3.5 shrink-0 transition-transform duration-150 group-hover:scale-105" />
              <span className="truncate">GitHub</span>
            </a>
            {!window.agendameaWindow?.isWindowsStore && (
              <a
                href={SPONSOR_URL}
                target="_blank"
                rel="noopener noreferrer"
                onClick={onCloseMobile}
                title={t.sponsor}
                data-testid="sidebar-sponsor-btn"
                className="group flex min-w-0 items-center justify-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-subtle)]/50 px-2.5 py-1.5 text-[12.5px] font-medium text-[var(--text-secondary)] ag-hover-card-glow"
              >
                <Heart className="h-3.5 w-3.5 shrink-0 transition-all duration-150 group-hover:scale-105 group-hover:text-rose-400" />
                <span className="truncate">{t.sponsor}</span>
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
            className="animate-fade-in fixed inset-0 bg-black/45"
          />
          <div className="animate-slide-in-left relative z-10 flex h-full">
            {renderSidebar(false)}
          </div>
        </div>
      )}

      {smartContextMenu && (
        <ContextMenu
          testId="smart-view-context-menu"
          x={smartContextMenu.x}
          y={smartContextMenu.y}
          onClose={() => setSmartContextMenu(null)}
          items={[
            {
              id: 'open-view',
              label: t.ctxOpenView,
              icon: <Eye className="h-3.5 w-3.5" />,
              onSelect: () => handleSelectAndClose({ type: 'smart', id: smartContextMenu.viewId }),
            },
            ...(smartContextMenu.viewId !== 'completed' && onNewTaskInView
              ? [
                  {
                    id: 'new-task-in-view',
                    label: t.shortcutNewTask,
                    icon: <Plus className="h-3.5 w-3.5" />,
                    onSelect: () => {
                      onCloseMobile();
                      onNewTaskInView({ type: 'smart', id: smartContextMenu.viewId });
                    },
                  },
                ]
              : []),
            ...(smartContextMenu.viewId === 'all' ||
            smartContextMenu.viewId === 'today' ||
            smartContextMenu.viewId === 'important'
              ? [
                  { id: 'div-startup', divider: true as const },
                  {
                    id: 'set-startup',
                    label: t.ctxSetStartupView,
                    icon: <Home className="h-3.5 w-3.5" />,
                    onSelect: () => {
                      const target = smartContextMenu.viewId as 'all' | 'today' | 'important';
                      preferencesStore.setDefaultStartupView(target);
                      onNotifyInfo?.(t.ctxStartupViewUpdatedToast);
                    },
                  },
                ]
              : []),
            ...(smartContextMenu.viewId === 'completed' &&
            counts.smart.completed > 0 &&
            onClearAllCompleted
              ? [
                  { id: 'div-clear', divider: true as const },
                  {
                    id: 'clear-completed',
                    label: t.clearCompleted,
                    icon: <Trash2 className="h-3.5 w-3.5" />,
                    danger: true,
                    onSelect: () => onClearAllCompleted(),
                  },
                ]
              : []),
          ]}
        />
      )}

      {catContextMenu && (
        <ContextMenu
          testId="category-context-menu"
          x={catContextMenu.x}
          y={catContextMenu.y}
          onClose={() => setCatContextMenu(null)}
          items={[
            {
              id: 'rename',
              label: t.ctxRename,
              icon: <Pencil className="h-3.5 w-3.5" />,
              onSelect: () => {
                if (isCollapsed) onToggleCollapse();
                startEditingCategory(catContextMenu.category);
              },
            },
            {
              id: 'pin',
              label: catContextMenu.category.pinned ? t.unpinLabel : t.pinLabel,
              icon: <Pin className="h-3.5 w-3.5" />,
              onSelect: () =>
                void onTogglePinCategory(
                  catContextMenu.category.id,
                  !catContextMenu.category.pinned,
                ),
            },
            { id: 'div-1', divider: true },
            {
              id: 'delete',
              label: t.deleteToTrashButton,
              icon: <Trash2 className="h-3.5 w-3.5" />,
              danger: true,
              onSelect: () => {
                if (isCollapsed) onToggleCollapse();
                setConfirmDeleteId(catContextMenu.category.id);
              },
            },
          ]}
        />
      )}
    </>
  );
});
