import React from 'react';
import { RotateCcw, X } from 'lucide-react';
import type { InfoToastState, UndoToastState } from '../hooks/useToast';
import { useI18n } from '../i18n/I18nContext';

interface ToastContainerProps {
  undoToast: UndoToastState | null;
  infoToast: InfoToastState | null;
  onUndo: () => void;
  onClearUndo: () => void;
  onPauseUndo?: () => void;
  onResumeUndo?: () => void;
  onClearInfo: () => void;
}

export const ToastContainer = React.memo(function ToastContainer({
  undoToast,
  infoToast,
  onUndo,
  onClearUndo,
  onPauseUndo,
  onResumeUndo,
  onClearInfo,
}: ToastContainerProps) {
  const { t } = useI18n();

  if (infoToast && infoToast.tone === 'error') {
    return (
      <div
        role="alert"
        aria-live="assertive"
        className="fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-xl border border-red-500/40 bg-[var(--surface)] px-4 py-2.5 text-xs text-red-600 dark:text-red-400 shadow-lg"
      >
        <span>{infoToast.message}</span>
        <button
          type="button"
          onClick={onClearInfo}
          aria-label={t.closeMenu}
          className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  if (undoToast) {
    return (
      <div
        role="status"
        aria-live="polite"
        data-testid="undo-toast"
        onMouseEnter={onPauseUndo}
        onMouseLeave={onResumeUndo}
        onFocus={onPauseUndo}
        onBlur={onResumeUndo}
        className="fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-4 rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] px-4 py-2.5 text-sm shadow-lg"
      >
        <span className="text-[var(--text-primary)] whitespace-nowrap">
          {undoToast.label}
        </span>
        <button
          type="button"
          data-testid="undo-toast-button"
          onClick={onUndo}
          className="inline-flex items-center gap-1.5 font-medium text-[var(--accent)] hover:underline whitespace-nowrap"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          <span>{t.undoButton}</span>
        </button>
        <button
          type="button"
          onClick={onClearUndo}
          aria-label={t.closeMenu}
          className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  if (infoToast) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] px-4 py-2.5 text-xs text-[var(--text-primary)] shadow-lg"
      >
        <span>{infoToast.message}</span>
        <button
          type="button"
          onClick={onClearInfo}
          aria-label={t.closeMenu}
          className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return null;
});
