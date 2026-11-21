import React, { useEffect, useState } from 'react';
import { ArrowDownToLine, Power, X } from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';
import { BrandMark } from './BrandMark';

interface CloseActionModalProps {
  onSelectAction: (action: 'tray' | 'quit', rememberChoice: boolean) => void;
  onCancel: () => void;
}

export function CloseActionModal({ onSelectAction, onCancel }: CloseActionModalProps) {
  const { t } = useI18n();
  const [rememberChoice, setRememberChoice] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="close-action-modal-title"
      data-testid="close-action-modal"
      className="fixed inset-0 z-[58] flex items-center justify-center bg-black/50 p-4 backdrop-blur-[2px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="w-full max-w-[440px] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-3.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <BrandMark className="h-6 w-6" />
            <h2
              id="close-action-modal-title"
              className="font-display text-sm font-semibold text-[var(--text-primary)] truncate"
            >
              {t.closeModalTitle}
            </h2>
          </div>
          <button
            type="button"
            aria-label={t.cancelButton}
            onClick={onCancel}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] transition-colors shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-4 px-5 py-4">
          <p className="text-xs leading-relaxed text-[var(--text-secondary)]">
            {t.closeModalDesc}
          </p>

          <div className="space-y-2.5">
            <button
              type="button"
              data-testid="close-action-tray"
              onClick={() => onSelectAction('tray', rememberChoice)}
              className="flex w-full items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--canvas)] px-3.5 py-3 text-left hover:border-[var(--accent)] hover:bg-[var(--accent-soft)] transition-colors"
            >
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                style={{ backgroundColor: 'var(--accent-soft)', color: 'var(--accent)' }}
              >
                <ArrowDownToLine className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-display text-xs font-semibold text-[var(--text-primary)]">
                  {t.closeActionTrayTitle}
                </span>
                <span className="mt-0.5 block text-[11px] leading-snug text-[var(--text-muted)]">
                  {t.closeActionTrayDesc}
                </span>
              </span>
            </button>

            <button
              type="button"
              data-testid="close-action-quit"
              onClick={() => onSelectAction('quit', rememberChoice)}
              className="flex w-full items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--canvas)] px-3.5 py-3 text-left hover:border-[var(--danger)] hover:bg-[var(--danger-soft)] transition-colors"
            >
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                style={{ backgroundColor: 'var(--danger-soft)', color: 'var(--danger)' }}
              >
                <Power className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-display text-xs font-semibold text-[var(--text-primary)]">
                  {t.closeActionQuitTitle}
                </span>
                <span className="mt-0.5 block text-[11px] leading-snug text-[var(--text-muted)]">
                  {t.closeActionQuitDesc}
                </span>
              </span>
            </button>
          </div>

          <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-[var(--border)] bg-[var(--canvas)] px-3 py-2 text-xs text-[var(--text-secondary)] select-none">
            <input
              type="checkbox"
              data-testid="close-action-remember"
              checked={rememberChoice}
              onChange={(e) => setRememberChoice(e.target.checked)}
              className="h-3.5 w-3.5 rounded accent-[var(--accent)]"
            />
            <span>{t.closeRememberChoiceLabel}</span>
          </label>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end border-t border-[var(--border)] bg-[var(--canvas)] px-5 py-3">
          <button
            type="button"
            data-testid="close-action-cancel"
            onClick={onCancel}
            className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3.5 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors whitespace-nowrap"
          >
            {t.cancelButton}
          </button>
        </div>
      </div>
    </div>
  );
}

export default CloseActionModal;
