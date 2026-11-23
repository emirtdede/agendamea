import React from 'react';
import { Keyboard, RotateCcw } from 'lucide-react';
import { useI18n } from '../../i18n/I18nContext';
import {
  DEFAULT_CUSTOM_SHORTCUTS,
  type CustomShortcutsMap,
  type ShortcutActionId,
} from '../../utils/shortcuts';
import { ShortcutRecorder } from '../ShortcutRecorder';

export interface ShortcutsSettingsTabProps {
  globalQuickAddShortcut: boolean;
  globalQuickAddShortcutKey: string;
  voiceShortcut: string;
  customShortcuts: CustomShortcutsMap;
  onToggleGlobalQuickAddShortcut?: (enabled: boolean) => void;
  onChangeGlobalQuickAddShortcutKey?: (shortcut: string) => void;
  onVoiceShortcutChange?: (shortcut: string) => void;
  onChangeCustomShortcut?: (action: ShortcutActionId, shortcut: string) => void;
  onResetAllShortcuts?: () => void;
}

export const ShortcutsSettingsTab = React.memo(function ShortcutsSettingsTab({
  globalQuickAddShortcut,
  globalQuickAddShortcutKey,
  voiceShortcut,
  customShortcuts,
  onToggleGlobalQuickAddShortcut,
  onChangeGlobalQuickAddShortcutKey,
  onVoiceShortcutChange,
  onChangeCustomShortcut,
  onResetAllShortcuts,
}: ShortcutsSettingsTabProps) {
  const { t } = useI18n();

  const inAppShortcutRows: Array<{ id: ShortcutActionId; label: string }> = [
    { id: 'newTask', label: t.shortcutNewTask },
    { id: 'search', label: t.shortcutSearch },
    { id: 'openSettings', label: t.shortcutOpenSettings },
    { id: 'reorderUp', label: t.shortcutReorderUp },
    { id: 'reorderDown', label: t.shortcutReorderDown },
    { id: 'viewList', label: t.shortcutViewList },
    { id: 'viewKanban', label: t.shortcutViewKanban },
    { id: 'viewCalendar', label: t.shortcutViewCalendar },
    { id: 'viewMatrix', label: t.shortcutViewMatrix },
  ];

  return (
    <div className="space-y-6" data-testid="settings-shortcuts-section">
      {/* Global Quick-Add Activation Switch */}
      <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
        <div className="flex items-center justify-between gap-4 px-4 py-3.5">
          <div className="min-w-0">
            <p className="text-sm font-medium text-[var(--text-primary)]">
              {t.globalQuickAddTitle}
            </p>
            <p className="text-xs text-[var(--text-muted)]">{t.globalQuickAddDesc}</p>
          </div>
          <button
            type="button"
            role="switch"
            data-testid="toggle-global-quick-add"
            aria-checked={globalQuickAddShortcut}
            onClick={() => onToggleGlobalQuickAddShortcut?.(!globalQuickAddShortcut)}
            className={`inline-flex items-center rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              globalQuickAddShortcut
                ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text-primary)]'
                : 'border-[var(--border)] bg-[var(--canvas)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]'
            }`}
          >
            {globalQuickAddShortcut ? t.enabledBadge : t.disabledBadge}
          </button>
        </div>
      </div>

      {/* All Customizable Shortcuts (Global + In-App) */}
      <section
        aria-label={t.keyboardShortcutsTitle}
        data-testid="custom-shortcuts-section"
        className="space-y-2.5"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <Keyboard className="h-3.5 w-3.5 text-[var(--text-muted)]" />
            <h3 className="font-display text-xs font-semibold text-[var(--text-muted)]">
              {t.keyboardShortcutsTitle}
            </h3>
          </div>
          {onResetAllShortcuts && (
            <button
              type="button"
              data-testid="shortcuts-reset-all-btn"
              onClick={onResetAllShortcuts}
              className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--canvas)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
            >
              <RotateCcw className="h-3 w-3" />
              <span>{t.shortcutResetDefaults}</span>
            </button>
          )}
        </div>

        <div className="divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
          {/* Global Quick Add */}
          <div className="flex items-center justify-between gap-3 px-4 py-2.5 text-xs">
            <span className="font-medium text-[var(--text-primary)]">
              {t.shortcutGlobalQuickAdd}
            </span>
            <ShortcutRecorder
              testId="shortcut-recorder-global-quick-add"
              value={globalQuickAddShortcutKey}
              defaultValue="CommandOrControl+Alt+N"
              requireModifier
              electronFormat
              disabled={!globalQuickAddShortcut}
              recordPrompt={t.shortcutRecordPrompt}
              resetLabel={t.shortcutResetDefaults}
              modifierHint={t.shortcutRequireModifierHint}
              onChange={(next) => onChangeGlobalQuickAddShortcutKey?.(next)}
            />
          </div>

          {/* Global Voice Dictation */}
          <div className="flex items-center justify-between gap-3 px-4 py-2.5 text-xs">
            <span className="font-medium text-[var(--text-primary)]">{t.shortcutGlobalVoice}</span>
            <ShortcutRecorder
              testId="shortcut-recorder-global-voice"
              value={voiceShortcut}
              defaultValue="CommandOrControl+Alt+Space"
              requireModifier
              electronFormat
              recordPrompt={t.shortcutRecordPrompt}
              resetLabel={t.shortcutResetDefaults}
              modifierHint={t.shortcutRequireModifierHint}
              onChange={(next) => onVoiceShortcutChange?.(next)}
            />
          </div>

          {/* In-App Shortcuts */}
          {inAppShortcutRows.map((row) => (
            <div
              key={row.id}
              className="flex items-center justify-between gap-3 px-4 py-2.5 text-xs"
            >
              <span className="text-[var(--text-secondary)]">{row.label}</span>
              <ShortcutRecorder
                testId={`shortcut-recorder-${row.id}`}
                value={customShortcuts[row.id] || DEFAULT_CUSTOM_SHORTCUTS[row.id]}
                defaultValue={DEFAULT_CUSTOM_SHORTCUTS[row.id]}
                recordPrompt={t.shortcutRecordPrompt}
                resetLabel={t.shortcutResetDefaults}
                onChange={(next) => onChangeCustomShortcut?.(row.id, next)}
              />
            </div>
          ))}

          {/* Fixed Escape Reference */}
          <div className="flex items-center justify-between gap-3 px-4 py-2.5 text-xs">
            <span className="text-[var(--text-secondary)]">{t.shortcutEscape}</span>
            <kbd className="rounded-md border border-[var(--border)] bg-[var(--canvas)] px-2 py-0.5 font-mono-tabular text-[11px] text-[var(--text-primary)] whitespace-nowrap">
              Esc
            </kbd>
          </div>
        </div>
      </section>
    </div>
  );
});
