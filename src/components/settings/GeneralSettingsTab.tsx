import React from 'react';
import { ArrowDownToLine, Keyboard, Lock, Power, Sparkles, Unlock } from 'lucide-react';
import { useI18n } from '../../i18n/I18nContext';
import type { CloseBehavior } from '../../types';
import { LanguageSelectorSection } from '../UpdateSettingsSection';

export interface GeneralSettingsTabProps {
  closeBehavior: CloseBehavior;
  launchAtStartup: boolean;
  globalQuickAddShortcut: boolean;
  dragLocked: boolean;
  shortcuts: Array<{ keys: string; label: string }>;
  onChangeCloseBehavior: (behavior: CloseBehavior) => void;
  onToggleLaunchAtStartup?: (enabled: boolean) => void;
  onToggleGlobalQuickAddShortcut?: (enabled: boolean) => void;
  onToggleDragLock: (locked: boolean) => void;
}

export const GeneralSettingsTab = React.memo(function GeneralSettingsTab({
  closeBehavior,
  launchAtStartup,
  globalQuickAddShortcut,
  dragLocked,
  shortcuts,
  onChangeCloseBehavior,
  onToggleLaunchAtStartup,
  onToggleGlobalQuickAddShortcut,
  onToggleDragLock,
}: GeneralSettingsTabProps) {
  const { t } = useI18n();

  return (
    <>
      {/* 73-Language Selector */}
      <LanguageSelectorSection />

      {/* Close Behavior, Windows Startup & Global Quick-Add */}
      <section aria-label={t.closeBehaviorSectionTitle} className="space-y-2.5">
        <div>
          <h3 className="font-display text-xs font-semibold text-[var(--text-muted)]">
            {t.closeBehaviorSectionTitle}
          </h3>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">{t.closeBehaviorDesc}</p>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {(
            [
              { id: 'ask' as CloseBehavior, label: t.closeBehaviorAsk, Icon: Sparkles },
              {
                id: 'tray' as CloseBehavior,
                label: t.closeBehaviorTray,
                Icon: ArrowDownToLine,
              },
              { id: 'quit' as CloseBehavior, label: t.closeBehaviorQuit, Icon: Power },
            ] as const
          ).map(({ id, label, Icon }) => {
            const selected = closeBehavior === id;
            return (
              <button
                key={id}
                type="button"
                data-testid={`close-behavior-${id}`}
                aria-pressed={selected}
                onClick={() => onChangeCloseBehavior(id)}
                className={`flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-xs font-medium transition-colors whitespace-nowrap ${
                  selected
                    ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text-primary)]'
                    : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]'
                }`}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{label}</span>
              </button>
            );
          })}
        </div>

        <div className="divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
          <div className="flex items-center justify-between gap-4 px-4 py-3.5">
            <div className="min-w-0">
              <p className="text-sm font-medium text-[var(--text-primary)]">
                {t.launchAtStartupTitle}
              </p>
              <p className="text-xs text-[var(--text-muted)]">{t.launchAtStartupDesc}</p>
            </div>
            <button
              type="button"
              role="switch"
              data-testid="toggle-launch-at-startup"
              aria-checked={launchAtStartup}
              onClick={() => onToggleLaunchAtStartup?.(!launchAtStartup)}
              className={`inline-flex items-center rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                launchAtStartup
                  ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text-primary)]'
                  : 'border-[var(--border)] bg-[var(--canvas)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]'
              }`}
            >
              {launchAtStartup ? t.enabledBadge : t.disabledBadge}
            </button>
          </div>

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

          <div className="flex items-center justify-between gap-4 px-4 py-3.5">
            <div className="min-w-0">
              <p className="text-sm font-medium text-[var(--text-primary)]">{t.dragReorderTitle}</p>
              <p className="text-xs text-[var(--text-muted)]">
                {dragLocked ? t.dragLockedDesc : t.dragUnlockedDesc}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={!dragLocked}
              aria-label={t.dragReorderTitle}
              onClick={() => onToggleDragLock(!dragLocked)}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                dragLocked
                  ? 'border-[var(--border)] bg-[var(--canvas)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]'
                  : 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text-primary)]'
              }`}
            >
              {dragLocked ? (
                <>
                  <Lock className="h-3.5 w-3.5" />
                  <span>{t.lockedBadge}</span>
                </>
              ) : (
                <>
                  <Unlock className="h-3.5 w-3.5 text-[var(--accent)]" />
                  <span>{t.unlockedBadge}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </section>

      {/* Keyboard Shortcuts */}
      <section aria-label={t.keyboardShortcutsTitle} className="space-y-2.5">
        <div className="flex items-center gap-1.5">
          <Keyboard className="h-3.5 w-3.5 text-[var(--text-muted)]" />
          <h3 className="font-display text-xs font-semibold text-[var(--text-muted)]">
            {t.keyboardShortcutsTitle}
          </h3>
        </div>
        <div className="divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
          {shortcuts.map((item) => (
            <div
              key={item.keys}
              className="flex items-center justify-between gap-3 px-4 py-2.5 text-xs"
            >
              <span className="text-[var(--text-secondary)]">{item.label}</span>
              <kbd className="rounded-md border border-[var(--border)] bg-[var(--canvas)] px-2 py-0.5 font-mono-tabular text-[11px] text-[var(--text-primary)] whitespace-nowrap">
                {item.keys}
              </kbd>
            </div>
          ))}
        </div>
      </section>
    </>
  );
});
