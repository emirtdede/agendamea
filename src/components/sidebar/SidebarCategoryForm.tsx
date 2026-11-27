import { Plus } from 'lucide-react';
import type React from 'react';
import { useI18n } from '../../i18n/I18nContext';
import { CategoryColorPicker } from '../CategoryColorPicker';

interface SidebarCategoryFormProps {
  compact: boolean;
  isAddingCategory: boolean;
  isCreatingCategory: boolean;
  newCatName: string;
  newCatColor: string;
  addInputRef: React.RefObject<HTMLInputElement | null>;
  onChangeName: (value: string) => void;
  onChangeColor: (hex: string) => void;
  onOpenFromCollapsed: () => void;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
}

export function SidebarCategoryForm({
  compact,
  isAddingCategory,
  isCreatingCategory,
  newCatName,
  newCatColor,
  addInputRef,
  onChangeName,
  onChangeColor,
  onOpenFromCollapsed,
  onClose,
  onSubmit,
}: SidebarCategoryFormProps) {
  const { t } = useI18n();

  if (compact) {
    return (
      <button
        type="button"
        onClick={onOpenFromCollapsed}
        aria-label={t.newCategory}
        title={t.newCategory}
        className="mx-auto mt-2 flex h-9 w-9 items-center justify-center rounded-lg text-[var(--text-muted)] ag-hover-glow hover:text-[var(--text-primary)] transition-colors"
      >
        <Plus className="h-4 w-4" />
      </button>
    );
  }

  if (!isAddingCategory) return null;

  return (
    <form
      onSubmit={onSubmit}
      className="mt-2 rounded-lg border border-[var(--border-strong)] bg-[var(--surface-subtle)] p-2.5 space-y-2.5"
    >
      <input
        ref={addInputRef}
        type="text"
        value={newCatName}
        onChange={(e) => onChangeName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            onClose();
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
        onChange={onChangeColor}
        ariaLabel={t.colorThemeTitle}
      />
      <div className="flex items-center justify-end gap-1.5">
        <button
          type="button"
          onClick={onClose}
          disabled={isCreatingCategory}
          className="rounded-md px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)] ag-hover-glow disabled:opacity-40"
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
  );
}
