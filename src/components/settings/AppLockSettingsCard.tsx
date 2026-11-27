import { KeyRound, Lock, ShieldCheck, Unlock } from 'lucide-react';
import React, { lazy, Suspense, useState } from 'react';
import { useI18n } from '../../i18n/I18nContext';
import { appLockStore, useAppLockSelector } from '../../store/appLockStore';
import type { AppLockAutoLockMinutes, AppLockType } from '../../types';
import { InfoTooltip } from '../InfoTooltip';
import { SelectField } from '../SelectField';
import { ToggleSwitch } from '../ToggleSwitch';
import type { AppLockModalMode } from './AppLockModal';

const AppLockModal = lazy(() =>
  import('./AppLockModal').then((m) => ({ default: m.AppLockModal })),
);

interface AppLockSettingsCardProps {
  onLockNow?: () => void;
  onNotifyInfo?: (message: string) => void;
}

export const AppLockSettingsCard = React.memo(function AppLockSettingsCard({
  onLockNow,
  onNotifyInfo,
}: AppLockSettingsCardProps) {
  const { t } = useI18n();
  const { enabled, type, autoLockMinutes, lockOnMinimize } = useAppLockSelector((s) => ({
    enabled: s.enabled,
    type: s.type,
    autoLockMinutes: s.autoLockMinutes,
    lockOnMinimize: s.lockOnMinimize,
  }));
  const [modalMode, setModalMode] = useState<AppLockModalMode | null>(null);

  const formatTypeLabel = (lockType: AppLockType): string => {
    if (lockType === 'pin4') return t.appLockTypePin4;
    if (lockType === 'pin6') return t.appLockTypePin6;
    if (lockType === 'pin8') return t.appLockTypePin8;
    return t.appLockTypePassword;
  };

  return (
    <>
      <section
        aria-label={t.appLockTitle}
        data-setting-id="general-app-lock"
        data-testid="general-app-lock-card"
        className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/75 divide-y divide-[var(--border)]/70"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5">
          <div className="flex items-start gap-2.5 min-w-0 flex-1">
            {enabled ? (
              <ShieldCheck className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
            ) : (
              <Lock className="h-4 w-4 text-[var(--text-muted)] mt-0.5 shrink-0" />
            )}
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <h3 className="text-sm font-medium text-[var(--text-primary)]">{t.appLockTitle}</h3>
                <InfoTooltip text={t.appLockInfoTooltip} testId="general-app-lock-info" />
                <span className="rounded-md border border-[var(--border)] bg-[var(--canvas)] px-1.5 py-0.5 text-[10.5px] font-medium text-[var(--text-muted)]">
                  {enabled ? `${t.enabledBadge} · ${formatTypeLabel(type)}` : t.disabledBadge}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-[var(--text-muted)]">{t.appLockDesc}</p>
            </div>
          </div>

          {!enabled && (
            <button
              type="button"
              data-testid="app-lock-enable-btn"
              onClick={() => setModalMode('setup')}
              className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold transition-opacity hover:opacity-90 shrink-0"
              style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-fg)' }}
            >
              <Lock className="h-3.5 w-3.5" />
              <span>{t.appLockEnableButton}</span>
            </button>
          )}
        </div>

        {enabled && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 p-4 sm:px-5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-[var(--text-primary)]">
                  {t.appLockAutoLockLabel}
                </p>
                <p className="mt-0.5 text-xs text-[var(--text-muted)]">{t.appLockAutoLockDesc}</p>
              </div>
              <SelectField
                value={String(autoLockMinutes)}
                aria-label={t.appLockAutoLockLabel}
                data-testid="app-lock-timeout-select"
                wrapperClassName="w-40 shrink-0"
                onChange={(e) => {
                  const num = Number(e.target.value) as AppLockAutoLockMinutes;
                  void appLockStore.updateConfig({ autoLockMinutes: num });
                }}
              >
                <option value="0">{t.appLockAutoLockNever}</option>
                <option value="1">{t.appLockAutoLock1m}</option>
                <option value="5">{t.appLockAutoLock5m}</option>
                <option value="15">{t.appLockAutoLock15m}</option>
                <option value="30">{t.appLockAutoLock30m}</option>
                <option value="60">{t.appLockAutoLock60m}</option>
              </SelectField>
            </div>

            <div className="flex items-center justify-between gap-4 p-4 sm:px-5">
              <div className="min-w-0">
                <p className="text-sm font-medium text-[var(--text-primary)]">
                  {t.appLockOnMinimizeTitle}
                </p>
                <p className="mt-0.5 text-xs text-[var(--text-muted)]">{t.appLockOnMinimizeDesc}</p>
              </div>
              <ToggleSwitch
                checked={lockOnMinimize}
                onChange={(checked) => {
                  void appLockStore.updateConfig({ lockOnMinimize: checked });
                }}
                label={t.appLockOnMinimizeTitle}
                testId="app-lock-minimize-toggle"
              />
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 p-4 sm:px-5 bg-[var(--canvas)]/35">
              {onLockNow && (
                <button
                  type="button"
                  data-testid="app-lock-now-btn"
                  onClick={onLockNow}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] ag-hover-card-glow"
                >
                  <Lock className="h-3.5 w-3.5" />
                  <span>{t.appLockLockNowButton}</span>
                </button>
              )}
              <button
                type="button"
                data-testid="app-lock-change-btn"
                onClick={() => setModalMode('change')}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] ag-hover-card-glow"
              >
                <KeyRound className="h-3.5 w-3.5" />
                <span>{t.appLockChangeButton}</span>
              </button>
              <button
                type="button"
                data-testid="app-lock-disable-btn"
                onClick={() => setModalMode('disable')}
                className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-500 dark:text-red-400 hover:bg-red-500/15 transition-colors"
              >
                <Unlock className="h-3.5 w-3.5" />
                <span>{t.appLockDisableButton}</span>
              </button>
            </div>
          </>
        )}
      </section>

      {modalMode && (
        <Suspense fallback={null}>
          <AppLockModal
            mode={modalMode}
            currentType={type}
            onClose={() => setModalMode(null)}
            onSuccessToast={onNotifyInfo}
          />
        </Suspense>
      )}
    </>
  );
});
