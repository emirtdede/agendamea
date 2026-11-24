import { AlertTriangle, CheckCircle2, Globe, Keyboard, Mic, RefreshCw, Zap } from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import { useI18n } from '../../i18n/I18nContext';
import {
  type CustomShortcutsMap,
  DEFAULT_CUSTOM_SHORTCUTS,
  DEFAULT_GLOBAL_QUICK_ADD_SHORTCUT,
  DEFAULT_VOICE_SHORTCUT,
  detectShortcutConflicts,
  formatShortcutDisplay,
  type ShortcutActionId,
} from '../../utils/shortcuts';
import { ShortcutRecorder } from '../ShortcutRecorder';
import { ToggleSwitch } from '../ToggleSwitch';
import { SettingsTabHeader } from './SettingsTabHeader';

interface ShortcutsSettingsTabProps {
  globalQuickAddShortcut: boolean;
  globalQuickAddShortcutKey: string;
  quickAddRegistered: boolean;
  voiceShortcutEnabled: boolean;
  voiceShortcut: string;
  voiceRegistered: boolean;
  customShortcuts: CustomShortcutsMap;
  onToggleGlobalQuickAddShortcut: (enabled: boolean) => void;
  onChangeGlobalQuickAddShortcutKey: (nextKey: string) => void;
  onToggleVoiceShortcutEnabled: (enabled: boolean) => void;
  onVoiceShortcutChange: (nextKey: string) => void;
  onChangeCustomShortcut: (action: ShortcutActionId, nextShortcut: string) => void;
  onRefreshOsStatus: () => Promise<void>;
  onAutoResolveOsShortcuts?: () => Promise<void>;
  onResetAllShortcuts: () => void;
}

export const ShortcutsSettingsTab = React.memo(function ShortcutsSettingsTab({
  globalQuickAddShortcut,
  globalQuickAddShortcutKey,
  quickAddRegistered,
  voiceShortcutEnabled,
  voiceShortcut,
  voiceRegistered,
  customShortcuts,
  onToggleGlobalQuickAddShortcut,
  onChangeGlobalQuickAddShortcutKey,
  onToggleVoiceShortcutEnabled,
  onVoiceShortcutChange,
  onChangeCustomShortcut,
  onRefreshOsStatus,
  onAutoResolveOsShortcuts,
  onResetAllShortcuts,
}: ShortcutsSettingsTabProps) {
  const { t } = useI18n();
  const [resolvingOs, setResolvingOs] = useState(false);
  const isElectronDesktop =
    typeof window !== 'undefined' && Boolean(window.agendameaWindow?.setGlobalQuickAddShortcut);

  useEffect(() => {
    if (isElectronDesktop) {
      void onRefreshOsStatus();
    }
  }, [isElectronDesktop, onRefreshOsStatus]);

  const quickAddDisplayKey = useMemo(
    () => formatShortcutDisplay(globalQuickAddShortcutKey || DEFAULT_GLOBAL_QUICK_ADD_SHORTCUT),
    [globalQuickAddShortcutKey],
  );

  // Strip any legacy hardcoded "(Ctrl+Alt+N)" from localized titles and reflect live bound key in desc
  const quickAddTitleClean = useMemo(
    () => t.globalQuickAddTitle.replace(/\s*\([^)]*Ctrl\+Alt\+N[^)]*\)/gi, '').trim(),
    [t.globalQuickAddTitle],
  );
  const quickAddDescLive = useMemo(
    () => t.globalQuickAddDesc.replace(/Ctrl\+Alt\+N/gi, quickAddDisplayKey),
    [t.globalQuickAddDesc, quickAddDisplayKey],
  );

  const handleResolveOsConflict = async () => {
    setResolvingOs(true);
    try {
      if (onAutoResolveOsShortcuts) {
        await onAutoResolveOsShortcuts();
      } else {
        await onRefreshOsStatus();
      }
    } finally {
      setResolvingOs(false);
    }
  };

  const inAppRows: Array<{ id: ShortcutActionId; label: string }> = useMemo(
    () => [
      { id: 'newTask', label: t.shortcutNewTask },
      { id: 'search', label: t.shortcutSearch },
      { id: 'openSettings', label: t.shortcutOpenSettings },
      { id: 'reorderUp', label: t.shortcutReorderUp },
      { id: 'reorderDown', label: t.shortcutReorderDown },
      { id: 'viewList', label: t.shortcutViewList },
      { id: 'viewKanban', label: t.shortcutViewKanban },
      { id: 'viewCalendar', label: t.shortcutViewCalendar },
      { id: 'viewMatrix', label: t.shortcutViewMatrix },
    ],
    [
      t.shortcutNewTask,
      t.shortcutSearch,
      t.shortcutOpenSettings,
      t.shortcutReorderUp,
      t.shortcutReorderDown,
      t.shortcutViewList,
      t.shortcutViewKanban,
      t.shortcutViewCalendar,
      t.shortcutViewMatrix,
    ],
  );

  const conflicts = useMemo(() => {
    const entries: Array<{ id: string; shortcut: string }> = [];
    if (isElectronDesktop && globalQuickAddShortcut) {
      entries.push({ id: 'global-quick-add', shortcut: globalQuickAddShortcutKey });
    }
    if (isElectronDesktop && voiceShortcutEnabled) {
      entries.push({ id: 'global-voice', shortcut: voiceShortcut });
    }
    for (const row of inAppRows) {
      const val = customShortcuts[row.id];
      if (val?.trim()) {
        entries.push({ id: row.id, shortcut: val });
      }
    }
    return detectShortcutConflicts(entries);
  }, [
    customShortcuts,
    globalQuickAddShortcut,
    globalQuickAddShortcutKey,
    inAppRows,
    isElectronDesktop,
    voiceShortcut,
    voiceShortcutEnabled,
  ]);

  const hasAnyConflict = conflicts.size > 0;
  const hasOsBlock =
    isElectronDesktop &&
    ((globalQuickAddShortcut && !quickAddRegistered) || (voiceShortcutEnabled && !voiceRegistered));

  return (
    <div className="space-y-6" data-testid="settings-shortcuts-section">
      <SettingsTabHeader
        subtitle={t.shortcutsSubtitle}
        onReset={onResetAllShortcuts}
        resetLabel={t.shortcutResetDefaults}
        resetTestId="shortcuts-reset-all-btn"
      />

      {/* Live Duplicate Conflict Alert */}
      {hasAnyConflict && (
        <div
          role="alert"
          data-testid="shortcuts-conflict-alert"
          className="flex items-start gap-2.5 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-xs text-amber-800 dark:text-amber-300"
        >
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{t.shortcutsConflictWarning}</span>
        </div>
      )}

      {/* OS Global Hotkey Hijack Alert with 1-Click Auto-Resolve */}
      {hasOsBlock && (
        <div
          role="alert"
          data-testid="shortcuts-os-conflict-alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-xs text-red-700 dark:text-red-300"
        >
          <div className="flex items-start gap-2.5 min-w-0 flex-1">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{t.shortcutsOsRegistrationFailed}</span>
          </div>
          <button
            type="button"
            data-testid="shortcuts-os-resolve-btn"
            disabled={resolvingOs}
            onClick={() => void handleResolveOsConflict()}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-red-500/40 bg-red-500/15 px-2.5 py-1 text-[11px] font-semibold text-red-700 transition-colors hover:bg-red-500/25 disabled:opacity-50 dark:text-red-200 whitespace-nowrap"
          >
            <RefreshCw className={`h-3 w-3 ${resolvingOs ? 'animate-spin' : ''}`} />
            <span>{t.retry}</span>
          </button>
        </div>
      )}

      {/* System-Wide Global Shortcuts (Desktop) */}
      {isElectronDesktop && (
        <section
          aria-label={t.shortcutsGlobalSectionTitle}
          data-setting-id="shortcuts-global"
          className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] divide-y divide-[var(--border)]"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 bg-[var(--canvas)]/60">
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-[var(--accent)]" />
              <h3 className="font-display text-xs font-semibold text-[var(--text-primary)]">
                {t.shortcutsGlobalSectionTitle}
              </h3>
            </div>
            <span className="text-[11px] text-[var(--text-muted)]">
              {t.shortcutRequireModifierHint}
            </span>
          </div>

          {/* Global Quick Add */}
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5">
            <div className="flex items-start gap-2.5 min-w-0 flex-1">
              <Zap className="h-4 w-4 text-[var(--accent)] mt-0.5 shrink-0" />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium text-[var(--text-primary)]">
                    {quickAddTitleClean}
                  </p>
                  {globalQuickAddShortcut && (
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        quickAddRegistered
                          ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                          : 'bg-red-500/15 text-red-600 dark:text-red-400'
                      }`}
                    >
                      {quickAddRegistered ? (
                        <CheckCircle2 className="h-2.5 w-2.5" />
                      ) : (
                        <AlertTriangle className="h-2.5 w-2.5" />
                      )}
                      <span>
                        {quickAddRegistered
                          ? t.shortcutsOsRegisteredBadge
                          : t.shortcutsOsBlockedBadge}
                      </span>
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-[var(--text-muted)]">{quickAddDescLive}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <ShortcutRecorder
                value={globalQuickAddShortcutKey}
                defaultValue={DEFAULT_GLOBAL_QUICK_ADD_SHORTCUT}
                requireModifier
                electronFormat
                disabled={!globalQuickAddShortcut}
                hasConflict={conflicts.has('global-quick-add')}
                hasOsError={globalQuickAddShortcut && !quickAddRegistered}
                testId="shortcut-recorder-global-quick-add"
                onChange={onChangeGlobalQuickAddShortcutKey}
              />
              <ToggleSwitch
                checked={globalQuickAddShortcut}
                onChange={onToggleGlobalQuickAddShortcut}
                label={quickAddTitleClean}
                testId="shortcut-toggle-global-quick-add"
              />
            </div>
          </div>

          {/* Global Voice Dictation */}
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5">
            <div className="flex items-start gap-2.5 min-w-0 flex-1">
              <Mic className="h-4 w-4 text-[var(--accent)] mt-0.5 shrink-0" />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium text-[var(--text-primary)]">
                    {t.aiVoiceShortcutLabel}
                  </p>
                  {voiceShortcutEnabled && (
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        voiceRegistered
                          ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                          : 'bg-red-500/15 text-red-600 dark:text-red-400'
                      }`}
                    >
                      {voiceRegistered ? (
                        <CheckCircle2 className="h-2.5 w-2.5" />
                      ) : (
                        <AlertTriangle className="h-2.5 w-2.5" />
                      )}
                      <span>
                        {voiceRegistered ? t.shortcutsOsRegisteredBadge : t.shortcutsOsBlockedBadge}
                      </span>
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-[var(--text-muted)]">{t.shortcutGlobalVoice}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <ShortcutRecorder
                value={voiceShortcut}
                defaultValue={DEFAULT_VOICE_SHORTCUT}
                requireModifier
                electronFormat
                disabled={!voiceShortcutEnabled}
                hasConflict={conflicts.has('global-voice')}
                hasOsError={voiceShortcutEnabled && !voiceRegistered}
                testId="shortcut-recorder-global-voice"
                onChange={onVoiceShortcutChange}
              />
              <ToggleSwitch
                checked={voiceShortcutEnabled}
                onChange={onToggleVoiceShortcutEnabled}
                label={t.aiVoiceShortcutLabel}
                testId="shortcut-toggle-global-voice"
              />
            </div>
          </div>
        </section>
      )}

      {/* In-App Keyboard Shortcuts */}
      <section
        aria-label={t.keyboardShortcutsTitle}
        data-setting-id="shortcuts-inapp"
        className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]"
      >
        <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] bg-[var(--canvas)]/60 px-4 py-3">
          <div className="flex items-center gap-2">
            <Keyboard className="h-4 w-4 text-[var(--accent)]" />
            <h3 className="font-display text-xs font-semibold text-[var(--text-primary)]">
              {t.keyboardShortcutsTitle}
            </h3>
          </div>
        </div>

        <div className="divide-y divide-[var(--border)]">
          {inAppRows.map((row) => (
            <div
              key={row.id}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5"
            >
              <span className="text-xs font-medium text-[var(--text-primary)]">{row.label}</span>
              <ShortcutRecorder
                value={customShortcuts[row.id] ?? DEFAULT_CUSTOM_SHORTCUTS[row.id]}
                defaultValue={DEFAULT_CUSTOM_SHORTCUTS[row.id]}
                allowClear
                hasConflict={conflicts.has(row.id)}
                testId={`shortcut-recorder-${row.id}`}
                onChange={(next) => onChangeCustomShortcut(row.id, next)}
              />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
});
