import { Hash, Plus, X } from 'lucide-react';
import type React from 'react';
import { useI18n } from '../../i18n/I18nContext';

interface TodoTagsSectionProps {
  tags: string[];
  newTagInput: string;
  onChangeNewTagInput: (value: string) => void;
  onAddTag: (e: React.FormEvent) => void;
  onRemoveTag: (tag: string) => void;
}

export function TodoTagsSection({
  tags,
  newTagInput,
  onChangeNewTagInput,
  onAddTag,
  onRemoveTag,
}: TodoTagsSectionProps) {
  const { t } = useI18n();

  return (
    <section aria-label={t.tagsLabel} className="space-y-2.5">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-xs font-semibold text-[var(--text-muted)]">
          {t.tagsLabel}
        </h3>
        {tags.length > 0 && (
          <span className="font-mono-tabular text-xs text-[var(--text-muted)]">
            {tags.length}/12
          </span>
        )}
      </div>

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <span
              key={tag}
              data-testid="detail-tag-chip"
              className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--canvas)] px-2.5 py-1 text-xs font-medium text-[var(--text-primary)]"
            >
              <Hash className="h-3 w-3 text-[var(--accent)] shrink-0" />
              <span>{tag}</span>
              <button
                type="button"
                onClick={() => onRemoveTag(tag)}
                aria-label={`${t.clearDate}: #${tag}`}
                className="ms-0.5 rounded p-0.5 text-[var(--text-muted)] ag-hover-danger-glow hover:text-red-500 transition-colors"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <form onSubmit={onAddTag} className="flex items-center gap-2">
        <input
          type="text"
          data-testid="detail-tag-input"
          value={newTagInput}
          onChange={(e) => onChangeNewTagInput(e.target.value)}
          disabled={tags.length >= 12}
          maxLength={40}
          aria-label={t.addTagPlaceholder}
          placeholder={t.addTagPlaceholder}
          className="flex-1 min-w-0 rounded-lg border border-[var(--border)] bg-[var(--canvas)] px-3 py-1.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] transition-colors focus:border-[var(--border-strong)] focus:outline-none disabled:opacity-45"
        />
        <button
          type="submit"
          data-testid="detail-tag-add-button"
          disabled={!newTagInput.trim() || tags.length >= 12}
          aria-label={t.addButton}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--canvas)] text-[var(--text-secondary)] ag-hover-card-glow hover:text-[var(--text-primary)] disabled:opacity-35"
        >
          <Plus className="h-4 w-4" />
        </button>
      </form>
    </section>
  );
}
