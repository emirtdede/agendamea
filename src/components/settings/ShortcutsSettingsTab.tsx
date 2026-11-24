import { AlertTriangle, CheckCircle2, Globe, Keyboard, Mic, RotateCcw } from 'lucide-react';
import React, { useEffect, useMemo } from 'react';
import { useI18n } from '../../i18n/I18nContext';
import {
  type CustomShortcutsMap,
  DEFAULT_CUSTOM_SHORTCUTS,
  DEFAULT_GLOBAL_QUICK_ADD_SHORTCUT,
  DEFAULT_VOICE_SHORTCUT,
  detectShortcutConflicts,
  type ShortcutActionId,
} from '../../utils/shortcuts';
import { ShortcutRecorder } from '../ShortcutRecorder';

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
  onResetAllShortcuts,
}: ShortcutsSettingsTabProps) {
  const { t } = useI18n();
  const isElectronDesktop =
    typeof window !== 'undefined' && Boolean(window.agendameaWindow?.setGlobalQuickAddShortcut);

  useEffect(() => {
    if (isElectronDesktop) {
      void onRefreshOsStatus();
    }
  }, [isElectronDesktop, onRefreshOsStatus]);

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
      {/* Header + Reset All */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs leading-relaxed text-[var(--text-muted)]">{t.shortcutsSubtitle}</p>
        <button
          type="button"
          data-testid="shortcuts-reset-all-btn"
          onClick={onResetAllShortcuts}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] shrink-0"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          <span>{t.shortcutResetDefaults}</span>
        </button>
      </div>

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

      {/* OS Global Hotkey Hijack Alert */}
      {hasOsBlock && (
        <div
          role="alert"
          data-testid="shortcuts-os-conflict-alert"
          className="flex items-start gap-2.5 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-xs text-red-700 dark:text-red-300"
        >
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{t.shortcutsOsRegistrationFailed}</span>
        </div>
      )}

      {/* System-Wide Global Shortcuts (Desktop) */}
      {isElectronDesktop && (
        <section
          aria-label={t.shortcutGlobalQuickAdd}
          data-setting-id="shortcuts-global"
          className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] divide-y divide-[var(--border)]"
        >
          <div className="flex items-center gap-2 px-4 py-3 bg-[var(--canvas)]/60">
            <Globe className="h-4 w-4 text-[var(--accent)]" />
            <h3 className="font-display text-xs font-semibold text-[var(--text-primary)]">
              {t.shortcutGlobalQuickAdd}
            </h3>
          </div>

          {/* Global Quick Add */}
          <div className="px-4 py-3.5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium text-[var(--text-primary)]">
                    {t.globalQuickAddTitle}
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
                <p className="mt-0.5 text-xs text-[var(--text-muted)]">{t.globalQuickAddDesc}</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={globalQuickAddShortcut}
                aria-label={t.globalQuickAddTitle}
                onClick={() => onToggleGlobalQuickAddShortcut(!globalQuickAddShortcut)}
                className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                  globalQuickAddShortcut ? 'bg-[var(--accent)]' : 'bg-[var(--border-strong)]'
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 transform rounded-full bg-[var(--surface)] shadow-sm transition-transform ${
                    globalQuickAddShortcut
                      ? 'translate-x-4.5 rtl:-translate-x-4.5'
                      : 'translate-x-0.5 rtl:-translate-x-0.5'
                  }`}
                />
              </button>
            </div>
            <div className="flex items-center justify-between gap-3 pt-1">
              <span className="text-xs text-[var(--text-secondary)]">
                {t.shortcutRequireModifierHint}
              </span>
              <ShortcutRecorder
                value={globalQuickAddShortcutKey}
                defaultValue={DEFAULT_GLOBAL_QUICK_ADD_SHORTCUT}
                requireModifier
                electronFormat
                disabled={!globalQuickAddShortcut}
                hasConflict={conflicts.has('global-quick-add')}
                testId="shortcut-recorder-global-quick-add"
                onChange={onChangeGlobalQuickAddShortcutKey}
              />
            </div>
          </div>

          {/* Global Voice Dictation */}
          <div className="px-4 py-3.5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
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
                          {voiceRegistered
                            ? t.shortcutsOsRegisteredBadge
                            : t.shortcutsOsBlockedBadge}
                        </span>
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-[var(--text-muted)]">{t.shortcutGlobalVoice}</p>
                </div>
              </div>
              <button
                type="button"
                role="switch"
                data-testid="shortcut-toggle-global-voice"
                aria-checked={voiceShortcutEnabled}
                aria-label={t.aiVoiceShortcutLabel}
                onClick={() => onToggleVoiceShortcutEnabled(!voiceShortcutEnabled)}
                className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                  voiceShortcutEnabled ? 'bg-[var(--accent)]' : 'bg-[var(--border-strong)]'
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 transform rounded-full bg-[var(--surface)] shadow-sm transition-transform ${
                    voiceShortcutEnabled
                      ? 'translate-x-4.5 rtl:-translate-x-4.5'
                      : 'translate-x-0.5 rtl:-translate-x-0.5'
                  }`}
                />
              </button>
            </div>
            <div className="flex items-center justify-between gap-3 pt-1">
              <span className="text-xs text-[var(--text-secondary)]">
                {t.shortcutRequireModifierHint}
              </span>
              <ShortcutRecorder
                value={voiceShortcut}
                defaultValue={DEFAULT_VOICE_SHORTCUT}
                requireModifier
                electronFormat
                disabled={!voiceShortcutEnabled}
                hasConflict={conflicts.has('global-voice')}
                testId="shortcut-recorder-global-voice"
                onChange={onVoiceShortcutChange}
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
          <span className="text-[11px] text-[var(--text-muted)]">
            {t.shortcutRequireModifierHint}
          </span>
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
