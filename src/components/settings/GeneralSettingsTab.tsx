import {
  Calendar,
  Check,
  Globe,
  Lock,
  Play,
  Power,
  RotateCcw,
  Search,
  Shield,
  Sliders,
  Unlock,
  Volume2,
} from 'lucide-react';
import React, { useMemo, useState } from 'react';
import { useI18n } from '../../i18n/I18nContext';
import type { LanguageCode } from '../../i18n/languages';
import type {
  CloseBehavior,
  CompletedTaskBehavior,
  CompletionSoundPreset,
  DefaultStartupView,
  LayoutMode,
  Priority,
  TimeFormatPreference,
  TrashAutoPurgeDays,
  WeekStartDay,
} from '../../types';
import { playCompletionSound } from '../../utils/soundEffects';
import { matchesLocaleQuery } from '../../utils/todoLogic';
import { SelectField } from '../SelectField';

interface GeneralSettingsTabProps {
  closeBehavior: CloseBehavior;
  launchAtStartup: boolean;
  launchMinimizedToTray: boolean;
  weekStartsOn: WeekStartDay;
  timeFormat: TimeFormatPreference;
  defaultStartupView: DefaultStartupView;
  defaultLayoutMode: LayoutMode;
  defaultPriority: Priority;
  completedTaskBehavior: CompletedTaskBehavior;
  completionSound: CompletionSoundPreset;
  confirmBeforeDelete: boolean;
  trashAutoPurgeDays: TrashAutoPurgeDays;
  dragLocked: boolean;
  onChangeCloseBehavior: (behavior: CloseBehavior) => void;
  onToggleLaunchAtStartup: (enabled: boolean) => void;
  onToggleLaunchMinimizedToTray: (enabled: boolean) => void;
  onChangeWeekStartsOn: (day: WeekStartDay) => void;
  onChangeTimeFormat: (fmt: TimeFormatPreference) => void;
  onChangeDefaultStartupView: (view: DefaultStartupView) => void;
  onChangeDefaultLayoutMode: (mode: LayoutMode) => void;
  onChangeDefaultPriority: (prio: Priority) => void;
  onChangeCompletedTaskBehavior: (behavior: CompletedTaskBehavior) => void;
  onChangeCompletionSound: (sound: CompletionSoundPreset) => void;
  onToggleConfirmBeforeDelete: (enabled: boolean) => void;
  onChangeTrashAutoPurgeDays: (days: TrashAutoPurgeDays) => void;
  onToggleDragLock: (locked: boolean) => void;
  onResetGeneral: () => void;
}

export const GeneralSettingsTab = React.memo(function GeneralSettingsTab({
  closeBehavior,
  launchAtStartup,
  launchMinimizedToTray,
  weekStartsOn,
  timeFormat,
  defaultStartupView,
  defaultLayoutMode,
  defaultPriority,
  completedTaskBehavior,
  completionSound,
  confirmBeforeDelete,
  trashAutoPurgeDays,
  dragLocked,
  onChangeCloseBehavior,
  onToggleLaunchAtStartup,
  onToggleLaunchMinimizedToTray,
  onChangeWeekStartsOn,
  onChangeTimeFormat,
  onChangeDefaultStartupView,
  onChangeDefaultLayoutMode,
  onChangeDefaultPriority,
  onChangeCompletedTaskBehavior,
  onChangeCompletionSound,
  onToggleConfirmBeforeDelete,
  onChangeTrashAutoPurgeDays,
  onToggleDragLock,
  onResetGeneral,
}: GeneralSettingsTabProps) {
  const { t, lang, meta, languages, onChangeLanguage } = useI18n();
  const [langSearch, setLangSearch] = useState('');
  const isElectronDesktop =
    typeof window !== 'undefined' && Boolean(window.agendameaWindow?.setCloseBehavior);

  const filteredLanguages = useMemo(() => {
    const q = langSearch.trim();
    if (!q) return languages;
    return languages.filter(
      (item) =>
        matchesLocaleQuery(item.nativeName, q) ||
        matchesLocaleQuery(item.englishName, q) ||
        matchesLocaleQuery(item.code, q),
    );
  }, [langSearch, languages]);

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <button
          type="button"
          data-testid="general-reset-btn"
          onClick={onResetGeneral}
          className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] transition-colors"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          <span>{t.resetTabDefaultsButton}</span>
        </button>
      </div>

      {/* 1. Language Card */}
      <section
        aria-label={t.languageSectionTitle}
        data-setting-id="general-language"
        className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 space-y-3"
      >
        <div className="flex items-start gap-2.5">
          <Globe className="h-4 w-4 text-[var(--accent)] mt-0.5 shrink-0" />
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">
              {t.languageSectionTitle}
            </h3>
            <p className="mt-0.5 text-xs text-[var(--text-muted)]">{t.welcomeLanguageDesc}</p>
          </div>
        </div>
        <div className="space-y-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="pointer-events-none absolute start-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]" />
              <input
                type="text"
                value={langSearch}
                onChange={(e) => setLangSearch(e.target.value)}
                placeholder={t.languageSearchPlaceholder}
                aria-label={t.languageSearchPlaceholder}
                className="h-8 w-full rounded-lg border border-[var(--border)] bg-[var(--canvas)] ps-8 pe-2.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none"
              />
            </div>
            <div className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--accent)]/45 bg-[var(--accent-soft)] px-2.5 text-xs font-semibold text-[var(--text-primary)]">
              <span>{meta.nativeName}</span>
              <span
                lang="en"
                dir="ltr"
                className="rounded bg-[var(--surface)] px-1 py-0.5 font-mono-tabular text-[9px] uppercase text-[var(--text-muted)]"
              >
                {meta.code}
              </span>
              <Check className="h-3.5 w-3.5 text-[var(--accent)]" />
            </div>
          </div>

          <div
            role="listbox"
            aria-label={t.languageSectionTitle}
            className="grid max-h-48 grid-cols-2 sm:grid-cols-3 gap-1.5 overflow-y-auto pe-1"
          >
            {filteredLanguages.map((item) => {
              const selected = item.code === lang;
              return (
                <button
                  key={item.code}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => onChangeLanguage(item.code as LanguageCode)}
                  className={`flex items-center justify-between gap-1.5 rounded-lg border px-2.5 py-1.5 text-start text-xs transition-colors ${
                    selected
                      ? 'border-[var(--accent)] bg-[var(--accent-soft)] font-semibold text-[var(--text-primary)]'
                      : 'border-[var(--border)] bg-[var(--canvas)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <span className="truncate">{item.nativeName}</span>
                  <span
                    lang="en"
                    dir="ltr"
                    className="shrink-0 font-mono-tabular text-[9px] uppercase text-[var(--text-muted)]"
                  >
                    {item.code}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* 2. Calendar & Time Formatting */}
      <section
        aria-label={t.generalCalendarTimeTitle}
        data-setting-id="general-calendar-time"
        className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 space-y-4"
      >
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-[var(--accent)]" />
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">
            {t.generalCalendarTimeTitle}
          </h3>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label
              htmlFor="general-week-start"
              className="block text-xs font-medium text-[var(--text-secondary)]"
            >
              {t.generalWeekStartsOnLabel}
            </label>
            <SelectField
              id="general-week-start"
              data-testid="general-week-start-select"
              value={weekStartsOn}
              onChange={(e) => onChangeWeekStartsOn(e.target.value as WeekStartDay)}
              wrapperClassName="w-full"
            >
              <option value="monday">{t.generalWeekMonday}</option>
              <option value="sunday">{t.generalWeekSunday}</option>
              <option value="saturday">{t.generalWeekSaturday}</option>
            </SelectField>
          </div>
          <div className="space-y-1.5">
            <label
              htmlFor="general-time-format"
              className="block text-xs font-medium text-[var(--text-secondary)]"
            >
              {t.generalTimeFormatLabel}
            </label>
            <SelectField
              id="general-time-format"
              data-testid="general-time-format-select"
              value={timeFormat}
              onChange={(e) => onChangeTimeFormat(e.target.value as TimeFormatPreference)}
              wrapperClassName="w-full"
            >
              <option value="24h">{t.generalTimeFormat24h}</option>
              <option value="12h">{t.generalTimeFormat12h}</option>
            </SelectField>
          </div>
        </div>
      </section>

      {/* 3. Workspace & Task Defaults */}
      <section
        aria-label={t.generalWorkspaceDefaultsTitle}
        data-setting-id="general-defaults"
        className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 space-y-4"
      >
        <div className="flex items-center gap-2">
          <Sliders className="h-4 w-4 text-[var(--accent)]" />
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">
            {t.generalWorkspaceDefaultsTitle}
          </h3>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label
              htmlFor="general-startup-view"
              className="block text-xs font-medium text-[var(--text-secondary)]"
            >
              {t.generalStartupViewLabel}
            </label>
            <SelectField
              id="general-startup-view"
              data-testid="general-startup-view-select"
              value={defaultStartupView}
              onChange={(e) => onChangeDefaultStartupView(e.target.value as DefaultStartupView)}
              wrapperClassName="w-full"
            >
              <option value="all">{t.allTasks}</option>
              <option value="today">{t.today}</option>
              <option value="important">{t.important}</option>
            </SelectField>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="general-default-layout"
              className="block text-xs font-medium text-[var(--text-secondary)]"
            >
              {t.generalDefaultLayoutLabel}
            </label>
            <SelectField
              id="general-default-layout"
              data-testid="general-default-layout-select"
              value={defaultLayoutMode}
              onChange={(e) => onChangeDefaultLayoutMode(e.target.value as LayoutMode)}
              wrapperClassName="w-full"
            >
              <option value="list">{t.viewList}</option>
              <option value="kanban">{t.viewKanban}</option>
              <option value="calendar">{t.viewCalendar}</option>
              <option value="matrix">{t.viewMatrix}</option>
            </SelectField>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="general-default-priority"
              className="block text-xs font-medium text-[var(--text-secondary)]"
            >
              {t.generalDefaultPriorityLabel}
            </label>
            <SelectField
              id="general-default-priority"
              data-testid="general-default-priority-select"
              value={defaultPriority}
              onChange={(e) => onChangeDefaultPriority(e.target.value as Priority)}
              wrapperClassName="w-full"
            >
              <option value="low">{t.priorityLow}</option>
              <option value="normal">{t.priorityNormal}</option>
              <option value="high">{t.priorityHigh}</option>
            </SelectField>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="general-completed-behavior"
              className="block text-xs font-medium text-[var(--text-secondary)]"
            >
              {t.generalCompletedBehaviorLabel}
            </label>
            <SelectField
              id="general-completed-behavior"
              data-testid="general-completed-behavior-select"
              value={completedTaskBehavior}
              onChange={(e) =>
                onChangeCompletedTaskBehavior(e.target.value as CompletedTaskBehavior)
              }
              wrapperClassName="w-full"
            >
              <option value="bottom">{t.generalCompletedBottom}</option>
              <option value="show">{t.generalCompletedShow}</option>
              <option value="hide">{t.generalCompletedHide}</option>
            </SelectField>
          </div>
        </div>

        {/* Completion Sound Selector + Live Preview */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-3">
          <div className="flex items-center gap-2 min-w-0">
            <Volume2 className="h-4 w-4 text-[var(--text-muted)] shrink-0" />
            <span className="text-xs font-medium text-[var(--text-primary)]">
              {t.generalCompletionSoundLabel}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <SelectField
              data-testid="general-completion-sound-select"
              value={completionSound}
              onChange={(e) => {
                const next = e.target.value as CompletionSoundPreset;
                onChangeCompletionSound(next);
                playCompletionSound(next);
              }}
              wrapperClassName="w-40"
            >
              <option value="none">{t.aiVoiceChimeNone}</option>
              <option value="pop">{t.generalSoundPop}</option>
              <option value="chime">{t.generalSoundChime}</option>
              <option value="soft">{t.aiVoiceChimeSoft}</option>
            </SelectField>
            <button
              type="button"
              disabled={completionSound === 'none'}
              onClick={() => playCompletionSound(completionSound)}
              aria-label={t.aiVoiceTtsPreviewButton}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--canvas)] text-[var(--text-primary)] hover:bg-[var(--surface-hover)] disabled:opacity-40"
            >
              <Play className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </section>

      {/* 4. Desktop Close & Startup Behavior */}
      {isElectronDesktop && (
        <div
          data-setting-id="general-desktop"
          className="divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]"
        >
          <div className="p-4 space-y-3">
            <div>
              <p className="text-sm font-medium text-[var(--text-primary)]">
                {t.closeBehaviorSectionTitle}
              </p>
              <p className="mt-0.5 text-xs text-[var(--text-muted)]">{t.closeBehaviorDesc}</p>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  ['ask', t.closeBehaviorAsk],
                  ['tray', t.closeBehaviorTray],
                  ['quit', t.closeBehaviorQuit],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => onChangeCloseBehavior(value)}
                  aria-pressed={closeBehavior === value}
                  className={`rounded-lg border px-2.5 py-2 text-xs font-medium transition-colors ${
                    closeBehavior === value
                      ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text-primary)] font-semibold'
                      : 'border-[var(--border)] bg-[var(--canvas)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between gap-4 px-4 py-3.5">
            <div className="flex items-start gap-2.5 min-w-0">
              <Power className="h-4 w-4 text-[var(--text-muted)] mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-[var(--text-primary)]">
                  {t.launchAtStartupTitle}
                </p>
                <p className="mt-0.5 text-xs text-[var(--text-muted)]">{t.launchAtStartupDesc}</p>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={launchAtStartup}
              aria-label={t.launchAtStartupTitle}
              onClick={() => onToggleLaunchAtStartup(!launchAtStartup)}
              className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                launchAtStartup ? 'bg-[var(--accent)]' : 'bg-[var(--border-strong)]'
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-[var(--surface)] shadow-sm transition-transform ${
                  launchAtStartup
                    ? 'translate-x-4.5 rtl:-translate-x-4.5'
                    : 'translate-x-0.5 rtl:-translate-x-0.5'
                }`}
              />
            </button>
          </div>

          {launchAtStartup && (
            <div className="flex items-center justify-between gap-4 bg-[var(--canvas)]/60 px-4 py-3">
              <div className="min-w-0 ps-6">
                <p className="text-xs font-medium text-[var(--text-primary)]">
                  {t.generalStartMinimizedTitle}
                </p>
                <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
                  {t.generalStartMinimizedDesc}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                data-testid="general-start-minimized-toggle"
                aria-checked={launchMinimizedToTray}
                aria-label={t.generalStartMinimizedTitle}
                onClick={() => onToggleLaunchMinimizedToTray(!launchMinimizedToTray)}
                className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                  launchMinimizedToTray ? 'bg-[var(--accent)]' : 'bg-[var(--border-strong)]'
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 transform rounded-full bg-[var(--surface)] shadow-sm transition-transform ${
                    launchMinimizedToTray
                      ? 'translate-x-4.5 rtl:-translate-x-4.5'
                      : 'translate-x-0.5 rtl:-translate-x-0.5'
                  }`}
                />
              </button>
            </div>
          )}
        </div>
      )}

      {/* 5. Safety, Trash Retention & Drag Lock */}
      <div
        data-setting-id="general-safety"
        className="divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]"
      >
        <div className="flex items-center justify-between gap-4 px-4 py-3.5">
          <div className="flex items-start gap-2.5 min-w-0">
            <Shield className="h-4 w-4 text-[var(--text-muted)] mt-0.5 shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-[var(--text-primary)]">
                {t.generalConfirmDeleteTitle}
              </p>
              <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                {t.generalConfirmDeleteDesc}
              </p>
            </div>
          </div>
          <button
            type="button"
            role="switch"
            data-testid="general-confirm-delete-toggle"
            aria-checked={confirmBeforeDelete}
            aria-label={t.generalConfirmDeleteTitle}
            onClick={() => onToggleConfirmBeforeDelete(!confirmBeforeDelete)}
            className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
              confirmBeforeDelete ? 'bg-[var(--accent)]' : 'bg-[var(--border-strong)]'
            }`}
          >
            <span
              className={`inline-block h-3.5 w-3.5 transform rounded-full bg-[var(--surface)] shadow-sm transition-transform ${
                confirmBeforeDelete
                  ? 'translate-x-4.5 rtl:-translate-x-4.5'
                  : 'translate-x-0.5 rtl:-translate-x-0.5'
              }`}
            />
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5">
          <div className="min-w-0">
            <p className="text-sm font-medium text-[var(--text-primary)]">
              {t.generalTrashAutoPurgeTitle}
            </p>
            <p className="mt-0.5 text-xs text-[var(--text-muted)]">{t.generalTrashAutoPurgeDesc}</p>
          </div>
          <SelectField
            data-testid="general-trash-purge-select"
            value={trashAutoPurgeDays}
            onChange={(e) =>
              onChangeTrashAutoPurgeDays(Number(e.target.value) as TrashAutoPurgeDays)
            }
            wrapperClassName="w-40"
          >
            <option value={0}>{t.generalTrashPurgeNever}</option>
            <option value={7}>{t.generalTrashPurge7}</option>
            <option value={30}>{t.generalTrashPurge30}</option>
            <option value={90}>{t.generalTrashPurge90}</option>
          </SelectField>
        </div>

        <div className="flex items-center justify-between gap-4 px-4 py-3.5">
          <div className="min-w-0">
            <p className="text-sm font-medium text-[var(--text-primary)]">{t.dragReorderTitle}</p>
            <p className="mt-0.5 text-xs text-[var(--text-muted)]">
              {dragLocked ? t.dragLockedDesc : t.dragUnlockedDesc}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={dragLocked}
            onClick={() => onToggleDragLock(!dragLocked)}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors shrink-0 ${
              dragLocked
                ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text-primary)]'
                : 'border-[var(--border)] bg-[var(--canvas)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]'
            }`}
          >
            {dragLocked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
            <span>{dragLocked ? t.lockedBadge : t.unlockedBadge}</span>
          </button>
        </div>
      </div>
    </div>
  );
});
