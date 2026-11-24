import { RotateCcw, X } from 'lucide-react';
import React from 'react';
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

  if (!undoToast && !infoToast) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed bottom-5 left-1/2 z-[90] flex w-fit max-w-[min(460px,calc(100vw-2rem))] -translate-x-1/2 flex-col items-center gap-2">
      {infoToast && (
        <div
          role={infoToast.tone === 'error' ? 'alert' : 'status'}
          aria-live={infoToast.tone === 'error' ? 'assertive' : 'polite'}
          data-testid={infoToast.tone === 'error' ? 'error-toast' : 'info-toast'}
          className={`pointer-events-auto animate-toast-up flex max-w-full items-center gap-3 rounded-xl border bg-[var(--surface)] px-4 py-2.5 text-xs shadow-lg ${
            infoToast.tone === 'error'
              ? 'border-red-500/40 text-red-600 dark:text-red-400'
              : 'border-[var(--border-strong)] text-[var(--text-primary)]'
          }`}
        >
          <span className="min-w-0 break-words leading-snug">{infoToast.message}</span>
          <button
            type="button"
            onClick={onClearInfo}
            aria-label={t.closeMenu}
            className="shrink-0 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {undoToast && (
        <div
          role="status"
          aria-live="polite"
          data-testid="undo-toast"
          onMouseEnter={onPauseUndo}
          onMouseLeave={onResumeUndo}
          onFocus={onPauseUndo}
          onBlur={onResumeUndo}
          className="pointer-events-auto animate-toast-up flex max-w-full items-center gap-3.5 rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] px-4 py-2.5 text-sm shadow-lg"
        >
          <span
            className="min-w-0 break-words leading-snug line-clamp-2 text-[var(--text-primary)]"
            title={undoToast.label}
          >
            {undoToast.label}
          </span>
          <button
            type="button"
            data-testid="undo-toast-button"
            onClick={onUndo}
            className="inline-flex shrink-0 items-center gap-1.5 font-medium text-[var(--accent)] hover:underline whitespace-nowrap"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>{t.undoButton}</span>
          </button>
          <button
            type="button"
            onClick={onClearUndo}
            aria-label={t.closeMenu}
            className="shrink-0 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
});
