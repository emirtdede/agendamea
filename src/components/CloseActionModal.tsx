import React, { useEffect, useState } from 'react';
import { ArrowDownToLine, ChevronRight, Power, X } from 'lucide-react';
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
      className="animate-fade-in fixed inset-0 z-[58] flex items-center justify-center bg-black/50 p-4 backdrop-blur-[2px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="animate-modal-pop w-full max-w-[404px] rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-2xl">
        {/* Clean Borderless Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <BrandMark className="h-8 w-8 rounded-xl shrink-0" />
            <div className="min-w-0">
              <h2
                id="close-action-modal-title"
                className="font-display text-sm font-semibold tracking-tight text-[var(--text-primary)] truncate"
              >
                {t.closeModalTitle}
              </h2>
              <p className="mt-0.5 text-xs leading-snug text-[var(--text-muted)]">
                {t.closeModalDesc}
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label={t.cancelButton}
            onClick={onCancel}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Unified Balanced Two-Row Action List (Single Clean Container) */}
        <div className="mt-4 divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--canvas)]">
          <button
            type="button"
            data-testid="close-action-tray"
            onClick={() => onSelectAction('tray', rememberChoice)}
            className="group flex w-full items-center gap-3 px-3.5 py-3 text-left hover:bg-[var(--accent-soft)] transition-colors"
          >
            <ArrowDownToLine className="h-4 w-4 shrink-0 text-[var(--accent)]" />
            <span className="min-w-0 flex-1">
              <span className="block font-display text-[13px] font-semibold text-[var(--text-primary)] truncate">
                {t.closeActionTrayTitle}
              </span>
              <span className="mt-0.5 block text-[11px] leading-snug text-[var(--text-muted)] truncate">
                {t.closeActionTrayDesc}
              </span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-[var(--text-muted)] opacity-60 group-hover:opacity-100 rtl:rotate-180 transition-opacity" />
          </button>

          <button
            type="button"
            data-testid="close-action-quit"
            onClick={() => onSelectAction('quit', rememberChoice)}
            className="group flex w-full items-center gap-3 px-3.5 py-3 text-left hover:bg-[var(--danger-soft)] transition-colors"
          >
            <Power className="h-4 w-4 shrink-0 text-[var(--danger)]" />
            <span className="min-w-0 flex-1">
              <span className="block font-display text-[13px] font-semibold text-[var(--text-primary)] truncate">
                {t.closeActionQuitTitle}
              </span>
              <span className="mt-0.5 block text-[11px] leading-snug text-[var(--text-muted)] truncate">
                {t.closeActionQuitDesc}
              </span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-[var(--text-muted)] opacity-60 group-hover:opacity-100 rtl:rotate-180 transition-opacity" />
          </button>
        </div>

        {/* Borderless Inline Remember Preference + Minimal Cancel Action */}
        <div className="mt-4 flex items-center justify-between gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-[11px] text-[var(--text-muted)] hover:text-[var(--text-secondary)] select-none min-w-0">
            <input
              type="checkbox"
              data-testid="close-action-remember"
              checked={rememberChoice}
              onChange={(e) => setRememberChoice(e.target.checked)}
              className="h-3.5 w-3.5 shrink-0 rounded accent-[var(--accent)]"
            />
            <span className="truncate">{t.closeRememberChoiceLabel}</span>
          </label>

          <button
            type="button"
            data-testid="close-action-cancel"
            onClick={onCancel}
            className="shrink-0 rounded-lg px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] transition-colors whitespace-nowrap"
          >
            {t.cancelButton}
          </button>
        </div>
      </div>
    </div>
  );
}

export default CloseActionModal;
