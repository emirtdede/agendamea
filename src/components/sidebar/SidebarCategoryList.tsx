import { Pencil, Pin, Trash2 } from 'lucide-react';
import type React from 'react';
import { useI18n } from '../../i18n/I18nContext';
import type { ActiveView, Category } from '../../types';
import { getVerticalDropPosition, moveIdRelative } from '../../utils/todoLogic';
import { CategoryColorPicker } from '../CategoryColorPicker';
import { ColorDot } from '../ColorDot';

interface SidebarCategoryListProps {
  compact: boolean;
  categories: Category[];
  countsByCategory: Record<string, number>;
  activeView: ActiveView;
  isSettingsOpen: boolean;
  dragLocked: boolean;
  pinnedCount: number;
  unpinnedCount: number;
  isAddingCategory: boolean;
  editingCatId: string | null;
  editCatName: string;
  editCatColor: string;
  isSavingEdit: boolean;
  editInputRef: React.RefObject<HTMLInputElement | null>;
  confirmDeleteId: string | null;
  draggedCatId: string | null;
  draggedCat: Category | null;
  catDropTarget: { id: string; position: 'before' | 'after' } | null;
  onSelectCategory: (id: string) => void;
  onOpenContextMenu: (e: React.MouseEvent, category: Category) => void;
  onStartEdit: (category: Category) => void;
  onCancelEdit: () => void;
  onChangeEditName: (value: string) => void;
  onChangeEditColor: (hex: string) => void;
  onSubmitEdit: (e: React.FormEvent) => void;
  onRequestDelete: (id: string | null) => void;
  onConfirmDelete: (id: string) => Promise<void>;
  onTogglePinCategory: (id: string, pinned: boolean) => Promise<void>;
  onReorderCategories: (orderedIds: string[]) => void;
  setDraggedCatId: (id: string | null) => void;
  setCatDropTarget: React.Dispatch<
    React.SetStateAction<{ id: string; position: 'before' | 'after' } | null>
  >;
}

export function SidebarCategoryList({
  compact,
  categories,
  countsByCategory,
  activeView,
  isSettingsOpen,
  dragLocked,
  pinnedCount,
  unpinnedCount,
  isAddingCategory,
  editingCatId,
  editCatName,
  editCatColor,
  isSavingEdit,
  editInputRef,
  confirmDeleteId,
  draggedCatId,
  draggedCat,
  catDropTarget,
  onSelectCategory,
  onOpenContextMenu,
  onStartEdit,
  onCancelEdit,
  onChangeEditName,
  onChangeEditColor,
  onSubmitEdit,
  onRequestDelete,
  onConfirmDelete,
  onTogglePinCategory,
  onReorderCategories,
  setDraggedCatId,
  setCatDropTarget,
}: SidebarCategoryListProps) {
  const { t } = useI18n();

  return (
    <div className="space-y-0.5">
      {categories.map((cat) => {
        const isActive =
          !isSettingsOpen && activeView.type === 'category' && activeView.id === cat.id;
        const isEditing = !compact && editingCatId === cat.id;
        const isConfirmingDelete = !compact && confirmDeleteId === cat.id;
        const count = countsByCategory[cat.id] ?? 0;

        if (compact) {
          return (
            <button
              key={cat.id}
              type="button"
              data-testid="category-item"
              data-category-id={cat.id}
              data-pinned={cat.pinned ? 'true' : 'false'}
              onClick={() => onSelectCategory(cat.id)}
              onContextMenu={(e) => {
                e.preventDefault();
                onOpenContextMenu(e, cat);
              }}
              aria-label={cat.name}
              aria-current={isActive ? 'page' : undefined}
              title={
                cat.pinned ? `${cat.name} (${t.pinLabel} · ${count})` : `${cat.name} (${count})`
              }
              className={`group relative mx-auto flex h-9 w-9 items-center justify-center rounded-lg ag-hover-glow ${
                isActive ? 'ag-minimal-active' : ''
              }`}
            >
              <span
                className={`inline-flex items-center justify-center rounded-full transition-transform duration-150 ${
                  isActive ? 'scale-125' : 'group-hover:scale-115'
                }`}
                style={
                  isActive
                    ? {
                        boxShadow: `0 0 12px 2px ${cat.color}`,
                      }
                    : undefined
                }
              >
                <ColorDot color={cat.color} size="md" />
              </span>
              {cat.pinned && (
                <span
                  aria-hidden="true"
                  className="absolute end-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-[var(--accent)]"
                />
              )}
            </button>
          );
        }

        if (isEditing) {
          return (
            <form
              key={cat.id}
              onSubmit={onSubmitEdit}
              className="rounded-lg border border-[var(--border-strong)] bg-[var(--surface-subtle)] p-2.5 space-y-2.5"
            >
              <input
                ref={editInputRef}
                type="text"
                value={editCatName}
                onChange={(e) => onChangeEditName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') onCancelEdit();
                }}
                aria-label={t.categoryNamePlaceholder}
                placeholder={t.categoryNamePlaceholder}
                maxLength={60}
                className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
              />
              <CategoryColorPicker
                value={editCatColor}
                onChange={onChangeEditColor}
                ariaLabel={t.colorThemeTitle}
              />
              <div className="flex items-center justify-end gap-1.5">
                <button
                  type="button"
                  onClick={onCancelEdit}
                  className="rounded-md px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)] ag-hover-glow"
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
              <p className="text-xs text-[var(--text-primary)] leading-relaxed break-words">
                <strong>{cat.name}</strong> {t.confirmMoveCategoryTrash}
              </p>
              <div className="flex items-center justify-end gap-1.5">
                <button
                  type="button"
                  onClick={() => onRequestDelete(null)}
                  className="rounded-md px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)] ag-hover-glow"
                >
                  {t.cancelButton}
                </button>
                <button
                  type="button"
                  onClick={() => void onConfirmDelete(cat.id)}
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
          // biome-ignore lint/a11y/noStaticElementInteractions: HTML5 draggable category row & context-menu wrapper; actions exposed via inner buttons
          <div
            key={cat.id}
            data-testid="category-item"
            data-category-id={cat.id}
            data-pinned={cat.pinned ? 'true' : 'false'}
            draggable={canDragCat}
            onContextMenu={(e) => {
              e.preventDefault();
              onOpenContextMenu(e, cat);
            }}
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
              const sourceId = draggedCatId ?? e.dataTransfer.getData('text/agendamea-category');
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
              isActive ? 'bg-[var(--accent-soft)]' : 'ag-hover-glow'
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
              onClick={() => onSelectCategory(cat.id)}
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
              className={`flex flex-1 items-center gap-2.5 min-w-0 px-3 py-2 text-start text-[14px] font-medium ${
                isActive
                  ? 'text-[var(--text-primary)]'
                  : 'text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]'
              }`}
            >
              <ColorDot color={cat.color} size="sm" />
              <span className="truncate whitespace-nowrap">{cat.name}</span>
            </button>

            <div className="flex items-center gap-0.5 pe-2">
              <button
                type="button"
                onClick={() => void onTogglePinCategory(cat.id, !cat.pinned)}
                aria-label={`${cat.pinned ? t.unpinLabel : t.pinLabel}: ${cat.name}`}
                aria-pressed={cat.pinned}
                title={cat.pinned ? t.unpinLabel : t.pinLabel}
                className={`flex h-6 w-6 items-center justify-center rounded transition-colors ${
                  cat.pinned
                    ? 'text-[var(--accent)] ag-hover-glow'
                    : isActive
                      ? 'text-[var(--text-muted)] ag-hover-glow hover:text-[var(--text-primary)]'
                      : 'flex md:hidden md:group-hover:flex md:group-focus-within:flex text-[var(--text-muted)] ag-hover-glow hover:text-[var(--text-primary)]'
                }`}
              >
                <Pin className={`h-3 w-3 ${cat.pinned ? 'fill-current' : ''}`} />
              </button>

              <div className="items-center gap-0.5 flex md:hidden md:group-hover:flex md:group-focus-within:flex">
                <button
                  type="button"
                  onClick={() => onStartEdit(cat)}
                  aria-label={cat.name}
                  className="flex h-6 w-6 items-center justify-center rounded text-[var(--text-muted)] ag-hover-glow hover:text-[var(--text-primary)]"
                >
                  <Pencil className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => onRequestDelete(cat.id)}
                  aria-label={`${t.deleteToTrashButton}: ${cat.name}`}
                  title={t.deleteToTrashButton}
                  className="flex h-6 w-6 items-center justify-center rounded text-[var(--text-muted)] ag-hover-danger-glow hover:text-red-500"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
              <span
                className={`font-mono-tabular px-1 text-xs hidden md:inline md:group-hover:hidden md:group-focus-within:hidden ${
                  isActive ? 'text-[var(--accent)] font-medium' : 'text-[var(--text-muted)]'
                }`}
              >
                {count}
              </span>
            </div>
          </div>
        );
      })}

      {!compact && categories.length === 0 && !isAddingCategory && (
        <p className="px-3 py-2 text-xs text-[var(--text-muted)]">{t.noCategoriesYet}</p>
      )}
    </div>
  );
}
