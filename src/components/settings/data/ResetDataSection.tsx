import { AlertTriangle, RotateCcw } from 'lucide-react';
import React from 'react';
import { useI18n } from '../../../i18n/I18nContext';

interface ResetDataSectionProps {
  confirmResetOpen: boolean;
  resetIncludeSettings: boolean;
  isResettingData: boolean;
  isImporting: boolean;
  onOpenConfirm: () => void;
  onCancelConfirm: () => void;
  onToggleIncludeSettings: (checked: boolean) => void;
  onConfirmReset: () => void;
}

export const ResetDataSection = React.memo(function ResetDataSection({
  confirmResetOpen,
  resetIncludeSettings,
  isResettingData,
  isImporting,
  onOpenConfirm,
  onCancelConfirm,
  onToggleIncludeSettings,
  onConfirmReset,
}: ResetDataSectionProps) {
  const { t } = useI18n();

  return (
    <div data-testid="reset-all-data-section" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-[var(--text-primary)]">
            {t.resetDataSectionTitle}
          </p>
          <p className="text-xs text-[var(--text-muted)]">{t.resetDataSectionDesc}</p>
        </div>
        {!confirmResetOpen && (
          <button
            type="button"
            data-testid="reset-all-data-open-btn"
            disabled={isResettingData || isImporting}
            onClick={onOpenConfirm}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-red-600 dark:text-red-400 ag-hover-danger-glow disabled:opacity-40 transition-colors whitespace-nowrap shrink-0"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>{t.resetDataButton}</span>
          </button>
        )}
      </div>

      {confirmResetOpen && (
        <div
          role="alertdialog"
          data-testid="reset-all-data-confirm-box"
          aria-label={t.resetDataSectionTitle}
          className="animate-tab-enter border-s-2 border-red-500/70 ps-4 py-2 space-y-3"
        >
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
            <p className="text-xs leading-relaxed text-[var(--text-primary)]">
              {t.resetDataConfirmWarning}
            </p>
          </div>

          <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)] cursor-pointer select-none">
            <input
              type="checkbox"
              data-testid="reset-include-settings-checkbox"
              checked={resetIncludeSettings}
              onChange={(e) => onToggleIncludeSettings(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-[var(--border-strong)] accent-red-600 cursor-pointer"
            />
            <span>{t.resetDataIncludeSettingsLabel}</span>
          </label>

          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              disabled={isResettingData}
              onClick={onCancelConfirm}
              className="text-xs font-medium text-[var(--text-secondary)] ag-hover-glow disabled:opacity-40 transition-colors"
            >
              {t.cancelButton}
            </button>
            <button
              type="button"
              data-testid="reset-all-data-confirm-btn"
              disabled={isResettingData}
              onClick={onConfirmReset}
              className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-40 transition-colors"
            >
              {isResettingData ? t.deletingButton : t.resetDataConfirmButton}
            </button>
          </div>
        </div>
      )}
    </div>
  );
});
