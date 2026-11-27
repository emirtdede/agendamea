import { ArrowRight, Globe, RotateCw, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useI18n } from '../i18n/I18nContext';
import { getLanguageMeta, type LanguageCode } from '../i18n/languages';

interface LanguageRestartModalProps {
  targetLanguage: LanguageCode;
  onRestartNow: () => Promise<void> | void;
  onLater: () => Promise<void> | void;
  onCancel: () => void;
}

export function LanguageRestartModal({
  targetLanguage,
  onRestartNow,
  onLater,
  onCancel,
}: LanguageRestartModalProps) {
  const { t, meta } = useI18n();
  const [busyAction, setBusyAction] = useState<'restart' | 'later' | null>(null);
  const targetMeta = getLanguageMeta(targetLanguage);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && busyAction === null) {
        e.preventDefault();
        e.stopPropagation();
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [busyAction, onCancel]);

  const handleRestartClick = async () => {
    if (busyAction !== null) return;
    setBusyAction('restart');
    try {
      await onRestartNow();
    } finally {
      setBusyAction(null);
    }
  };

  const handleLaterClick = async () => {
    if (busyAction !== null) return;
    setBusyAction('later');
    try {
      await onLater();
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="lang-restart-modal-title"
      data-testid="language-restart-modal"
      className="animate-fade-in fixed inset-0 z-[72] flex items-center justify-center bg-black/55 p-4 backdrop-blur-[2px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && busyAction === null) {
          onCancel();
        }
      }}
    >
      <div className="animate-modal-pop w-full max-w-[440px] rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--canvas)] text-[var(--text-primary)]">
              <Globe className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h2
                id="lang-restart-modal-title"
                className="font-display text-sm font-semibold tracking-tight text-[var(--text-primary)]"
              >
                {t.langRestartModalTitle}
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">
                {t.langRestartModalDesc}
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label={t.cancelButton}
            disabled={busyAction !== null}
            onClick={onCancel}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[var(--text-muted)] ag-hover-glow hover:text-[var(--text-primary)] transition-colors disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Language Transition Summary */}
        <div className="mt-4 flex items-center justify-between gap-2 rounded-xl border border-[var(--border)] bg-[var(--canvas)] px-3.5 py-3">
          <div className="min-w-0 flex-1">
            <span className="block text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
              {t.langRestartCurrentLabel}
            </span>
            <div className="mt-0.5 flex items-center gap-1.5 min-w-0">
              <span className="truncate text-xs font-medium text-[var(--text-secondary)]">
                {meta.nativeName}
              </span>
              <span
                lang="en"
                dir="ltr"
                className="font-mono-tabular text-[10px] uppercase text-[var(--text-muted)]"
              >
                {meta.code}
              </span>
            </div>
          </div>

          <ArrowRight className="h-4 w-4 shrink-0 text-[var(--text-muted)] rtl:rotate-180" />

          <div className="min-w-0 flex-1 text-end">
            <span className="block text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
              {t.langRestartTargetLabel}
            </span>
            <div className="mt-0.5 flex items-center justify-end gap-1.5 min-w-0">
              <span
                data-testid="lang-restart-target-name"
                className="truncate text-xs font-semibold text-[var(--text-primary)]"
              >
                {targetMeta.nativeName}
              </span>
              <span
                lang="en"
                dir="ltr"
                className="rounded bg-[var(--surface)] px-1.5 py-0.5 font-mono-tabular text-[10px] font-semibold uppercase text-[var(--text-secondary)]"
              >
                {targetMeta.code}
              </span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            data-testid="lang-restart-cancel-btn"
            disabled={busyAction !== null}
            onClick={onCancel}
            className="rounded-lg px-3 py-1.5 text-xs font-medium text-[var(--text-muted)] ag-hover-glow hover:text-[var(--text-primary)] transition-colors disabled:opacity-50"
          >
            {t.cancelButton}
          </button>
          <button
            type="button"
            data-testid="lang-restart-later-btn"
            disabled={busyAction !== null}
            onClick={() => void handleLaterClick()}
            className="rounded-lg border border-[var(--border)] bg-[var(--canvas)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] ag-hover-glow hover:text-[var(--text-primary)] transition-colors disabled:opacity-50"
          >
            {t.langRestartLaterButton}
          </button>
          <button
            type="button"
            data-testid="lang-restart-now-btn"
            disabled={busyAction !== null}
            onClick={() => void handleRestartClick()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3.5 py-1.5 text-xs font-semibold text-[var(--accent-fg)] transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            <RotateCw className={`h-3.5 w-3.5 ${busyAction === 'restart' ? 'animate-spin' : ''}`} />
            <span>{t.langRestartNowButton}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
