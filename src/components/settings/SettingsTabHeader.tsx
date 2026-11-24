import { RotateCcw } from 'lucide-react';
import React from 'react';
import { useI18n } from '../../i18n/I18nContext';

export interface SettingsTabHeaderProps {
  subtitle?: string;
  onReset?: () => void;
  resetLabel?: string;
  resetTestId?: string;
  actions?: React.ReactNode;
}

export const SettingsTabHeader = React.memo(function SettingsTabHeader({
  subtitle,
  onReset,
  resetLabel,
  resetTestId,
  actions,
}: SettingsTabHeaderProps) {
  const { t } = useI18n();

  return (
    <div
      className={`flex flex-wrap items-center gap-2.5 ${
        subtitle ? 'justify-between' : 'justify-end'
      }`}
    >
      {subtitle && (
        <p className="min-w-0 flex-1 text-xs leading-relaxed text-[var(--text-muted)]">
          {subtitle}
        </p>
      )}
      {(actions || onReset) && (
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {actions}
          {onReset && (
            <button
              type="button"
              data-testid={resetTestId}
              onClick={onReset}
              className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] transition-colors shrink-0 whitespace-nowrap"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>{resetLabel ?? t.resetTabDefaultsButton}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
});
