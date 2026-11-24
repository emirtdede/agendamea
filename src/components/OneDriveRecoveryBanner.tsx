import { Cloud, FolderOpen, Upload, X } from 'lucide-react';
import React from 'react';
import { useI18n } from '../i18n/I18nContext';
import type { OneDriveStatus } from '../types';

interface OneDriveRecoveryBannerProps {
  prompt: OneDriveStatus;
  isRestoring: boolean;
  onRestore: () => void;
  onDismiss: () => void;
  onOpenFolder: () => void;
}

export const OneDriveRecoveryBanner = React.memo(function OneDriveRecoveryBanner({
  prompt,
  isRestoring,
  onRestore,
  onDismiss,
  onOpenFolder,
}: OneDriveRecoveryBannerProps) {
  const { t } = useI18n();

  return (
    <section
      aria-label={t.onedriveBackupDetectedTitle}
      data-testid="onedrive-recovery-banner"
      className="rounded-xl border border-[var(--accent)]/45 bg-[var(--surface)] p-4 shadow-xs space-y-3"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div
            className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
            style={{ backgroundColor: 'var(--accent-soft)', color: 'var(--accent)' }}
          >
            <Cloud className="h-4 w-4" />
          </div>
          <div className="space-y-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-sm font-bold text-[var(--text-primary)]">
                {t.onedriveBackupDetectedTitle}
              </h2>
              {((prompt.remoteTodoCount ?? 0) > 0 || (prompt.remoteCategoryCount ?? 0) > 0) && (
                <span className="rounded-md border border-[var(--border)] bg-[var(--surface-subtle)] px-2 py-0.5 font-mono-tabular text-[11px] text-[var(--text-secondary)]">
                  {(prompt.remoteTodoCount ?? 0) > 0
                    ? `${prompt.remoteTodoCount} ${t.tasksTitle.toLowerCase()}`
                    : `${prompt.remoteCategoryCount} ${t.categories.toLowerCase()}`}
                </span>
              )}
            </div>
            <p className="text-xs leading-relaxed text-[var(--text-secondary)]">
              {t.onedriveBackupDetectedDesc}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label={t.closeMenu}
          className="rounded-md p-1 text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 sm:ps-12">
        <button
          type="button"
          disabled={isRestoring}
          onClick={onRestore}
          className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-opacity disabled:opacity-45"
          style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-fg)' }}
        >
          <Upload className="h-3.5 w-3.5" />
          <span>{isRestoring ? t.restoringButton : t.onedriveRestoreButton}</span>
        </button>

        <button
          type="button"
          disabled={isRestoring}
          onClick={onDismiss}
          className="inline-flex items-center rounded-lg border border-[var(--border)] bg-[var(--canvas)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors"
        >
          {t.onedriveStartFreshButton}
        </button>

        <button
          type="button"
          onClick={onOpenFolder}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--canvas)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] transition-colors"
        >
          <FolderOpen className="h-3.5 w-3.5" />
          <span>{t.onedriveOpenFolderButton}</span>
        </button>
      </div>
    </section>
  );
});
