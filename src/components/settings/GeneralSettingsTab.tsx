import {
  Calendar,
  Check,
  ChevronDown,
  ChevronUp,
  Globe,
  Lock,
  Play,
  Power,
  RotateCw,
  Search,
  Shield,
  Sliders,
  Unlock,
  Volume2,
} from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../../i18n/I18nContext';
import { getLanguageMeta, type LanguageCode } from '../../i18n/languages';
import type {
  CloseBehavior,
  CompletedTaskBehavior,
  CompletionSoundPreset,
  DefaultStartupView,
  LayoutMode,
  Priority,
  TimeFormatPreference,
  WeekStartDay,
} from '../../types';
import { playCompletionSound } from '../../utils/soundEffects';
import { matchesLocaleQuery } from '../../utils/todoLogic';
import { InfoTooltip } from '../InfoTooltip';
import { SelectField } from '../SelectField';
import { ToggleSwitch } from '../ToggleSwitch';
import { AppLockSettingsCard } from './AppLockSettingsCard';
import { SettingsAdvancedSection } from './SettingsAdvancedSection';
import { SettingsTabHeader } from './SettingsTabHeader';

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
  dragLocked: boolean;
  expandLanguageSeq?: number;
  revealSettingId?: string;
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
  onToggleDragLock: (locked: boolean) => void;
  onResetGeneral: () => void;
  onLockAppNow?: () => void;
  onNotifyInfo?: (message: string) => void;
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
  dragLocked,
  expandLanguageSeq,
  revealSettingId,
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
  onToggleDragLock,
  onResetGeneral,
  onLockAppNow,
  onNotifyInfo,
}: GeneralSettingsTabProps) {
  const { t, lang, pendingLanguage, meta, languages, onChangeLanguage, onRestartApp } = useI18n();
  const pendingMeta = useMemo(
    () => (pendingLanguage ? getLanguageMeta(pendingLanguage) : null),
    [pendingLanguage],
  );
  const [langPickerOpen, setLangPickerOpen] = useState(false);
  const [langSearch, setLangSearch] = useState('');
  const langToggleBtnRef = useRef<HTMLButtonElement>(null);
  const isElectronDesktop =
    typeof window !== 'undefined' && Boolean(window.agendameaWindow?.setCloseBehavior);

  useEffect(() => {
    if (expandLanguageSeq) {
      setLangPickerOpen(true);
    }
  }, [expandLanguageSeq]);

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

  const forceAdvancedOpen =
    revealSettingId === 'general-desktop' || revealSettingId === 'general-safety';

  return (
    <div className="space-y-5 pb-4 animate-tab-enter">
      <SettingsTabHeader onReset={onResetGeneral} resetTestId="general-reset-btn" />

      {/* Card 1: Language, Calendar & Time Formatting */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/75 divide-y divide-[var(--border)]/70">
        {/* 1. Collapsible Language Selector */}
        <section
          aria-label={t.languageSectionTitle}
          data-setting-id="general-language"
          onKeyDown={(e) => {
            if (e.key === 'Escape' && langPickerOpen) {
              e.preventDefault();
              e.stopPropagation();
              setLangPickerOpen(false);
              setLangSearch('');
              langToggleBtnRef.current?.focus();
            }
          }}
          className="p-4 sm:p-5 space-y-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-start gap-2.5 min-w-0 flex-1">
              <Globe className="h-4 w-4 text-[var(--text-muted)] mt-0.5 shrink-0" />
              <div className="min-w-0">
                <h3 className="text-sm font-medium text-[var(--text-primary)]">
                  {t.languageSectionTitle}
                </h3>
                <p className="mt-0.5 text-xs text-[var(--text-muted)]">{t.welcomeLanguageDesc}</p>
              </div>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <div
                data-testid="general-active-language-pill"
                className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--text-primary)]"
              >
                <span>{meta.nativeName}</span>
                <span
                  lang="en"
                  dir="ltr"
                  className="font-mono-tabular text-[10.5px] uppercase text-[var(--text-muted)]"
                >
                  {meta.code}
                </span>
                <Check className="h-3.5 w-3.5 text-[var(--text-muted)]" />
              </div>
              <button
                ref={langToggleBtnRef}
                type="button"
                data-testid="general-language-toggle-btn"
                aria-expanded={langPickerOpen}
                aria-controls="general-language-picker-panel"
                onClick={() => {
                  setLangPickerOpen((prev) => {
                    if (prev) setLangSearch('');
                    return !prev;
                  });
                }}
                className="inline-flex items-center gap-1 text-xs font-medium text-[var(--text-secondary)] ag-hover-glow hover:text-[var(--text-primary)] transition-colors whitespace-nowrap"
              >
                <span>{t.generalLanguageChangeButton}</span>
                {langPickerOpen ? (
                  <ChevronUp className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                )}
              </button>
            </div>
          </div>

          {pendingMeta && pendingLanguage !== lang && (
            <div
              data-testid="general-language-pending-banner"
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--canvas)]/70 px-3 py-2 text-xs"
            >
              <div className="flex flex-1 items-center gap-2 min-w-[200px]">
                <RotateCw className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
                <span className="text-[var(--text-secondary)]">
                  {t.langRestartPendingBanner}{' '}
                  <strong className="font-semibold text-[var(--text-primary)]">
                    {pendingMeta.nativeName}
                  </strong>
                </span>
              </div>
              {onRestartApp && (
                <button
                  type="button"
                  data-testid="general-language-restart-now-btn"
                  onClick={() => void onRestartApp()}
                  className="shrink-0 inline-flex items-center gap-1.5 rounded-md bg-[var(--accent)] px-2.5 py-1 text-[11px] font-semibold text-[var(--accent-fg)] transition-opacity hover:opacity-90"
                >
                  <RotateCw className="h-3 w-3" />
                  <span>{t.langRestartNowButton}</span>
                </button>
              )}
            </div>
          )}

          {langPickerOpen && (
            <div
              id="general-language-picker-panel"
              className="animate-accordion space-y-3 border-t border-[var(--border)]/70 pt-3.5"
            >
              <div className="relative">
                <Search className="pointer-events-none absolute start-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]" />
                <input
                  type="text"
                  data-testid="general-language-search-input"
                  value={langSearch}
                  onChange={(e) => setLangSearch(e.target.value)}
                  placeholder={t.languageSearchPlaceholder}
                  aria-label={t.languageSearchPlaceholder}
                  className="h-8 w-full rounded-lg border border-[var(--border)] bg-transparent ps-8 pe-2.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--text-secondary)] focus:outline-none"
                />
              </div>

              <div
                role="listbox"
                aria-label={t.languageSectionTitle}
                className="grid max-h-48 grid-cols-2 sm:grid-cols-3 gap-x-2 gap-y-1 overflow-y-auto pe-1"
              >
                {filteredLanguages.map((item) => {
                  const selected = item.code === lang;
                  return (
                    <button
                      key={item.code}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      onClick={() => {
                        onChangeLanguage(item.code as LanguageCode);
                        setLangPickerOpen(false);
                        setLangSearch('');
                      }}
                      className={`flex items-center justify-between gap-1.5 rounded-lg px-2.5 py-1.5 text-start text-xs transition-colors ${
                        selected
                          ? 'bg-[var(--surface-subtle)] font-semibold text-[var(--text-primary)]'
                          : 'bg-transparent text-[var(--text-secondary)] ag-hover-glow hover:text-[var(--text-primary)]'
                      }`}
                    >
                      <span className="truncate">{item.nativeName}</span>
                      <span
                        lang="en"
                        dir="ltr"
                        className="shrink-0 font-mono-tabular text-[10px] uppercase text-[var(--text-muted)]"
                      >
                        {item.code}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        {/* 2. Calendar & Time Formatting */}
        <section
          aria-label={t.generalCalendarTimeTitle}
          data-setting-id="general-calendar-time"
          className="p-4 sm:p-5 space-y-3.5"
        >
          <div className="flex items-center gap-2">
            <Calendar className="h-3.5 w-3.5 text-[var(--text-muted)]" />
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
              {t.generalCalendarTimeTitle}
            </h3>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
      </div>

      {/* Card 2: Workspace & Task Defaults */}
      <section
        aria-label={t.generalWorkspaceDefaultsTitle}
        data-setting-id="general-defaults"
        className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/75 p-4 sm:p-5 space-y-4"
      >
        <div className="flex items-center gap-2">
          <Sliders className="h-3.5 w-3.5 text-[var(--text-muted)]" />
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
            {t.generalWorkspaceDefaultsTitle}
          </h3>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)]/60 pt-4">
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
              className="inline-flex h-8 w-8 items-center justify-center text-[var(--text-secondary)] ag-hover-glow hover:text-[var(--text-primary)] disabled:opacity-35"
            >
              <Play className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </section>

      {/* Optional Application PIN / Password Lock */}
      <AppLockSettingsCard onLockNow={onLockAppNow} onNotifyInfo={onNotifyInfo} />

      {/* Advanced General Settings: Desktop Startup/Tray + Safety & Drag Lock */}
      <SettingsAdvancedSection
        forceOpen={forceAdvancedOpen}
        testId="general-advanced-section"
        toggleTestId="general-advanced-toggle"
      >
        {/* 4. Desktop Close & Startup Behavior */}
        {isElectronDesktop && (
          <div
            data-setting-id="general-desktop"
            className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/75 divide-y divide-[var(--border)]/70"
          >
            <div className="p-4 sm:p-5 space-y-3">
              <div>
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-medium text-[var(--text-primary)]">
                    {t.closeBehaviorSectionTitle}
                  </p>
                  <InfoTooltip text={t.generalTrayTooltip} testId="general-tray-info" />
                </div>
                <p className="mt-0.5 text-xs text-[var(--text-muted)]">{t.closeBehaviorDesc}</p>
              </div>
              <div className="grid grid-cols-3 border-b border-[var(--border)]">
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
                    className={`-mb-px border-b-2 px-2 py-2 text-xs font-medium transition-colors ${
                      closeBehavior === value
                        ? 'border-[var(--text-primary)] text-[var(--text-primary)] font-semibold'
                        : 'border-transparent text-[var(--text-muted)] ag-hover-glow hover:text-[var(--text-primary)]'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between gap-4 p-4 sm:px-5">
              <div className="flex items-start gap-2.5 min-w-0">
                <Power className="h-4 w-4 text-[var(--text-muted)] mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[var(--text-primary)]">
                    {t.launchAtStartupTitle}
                  </p>
                  <p className="mt-0.5 text-xs text-[var(--text-muted)]">{t.launchAtStartupDesc}</p>
                </div>
              </div>
              <ToggleSwitch
                checked={launchAtStartup}
                onChange={onToggleLaunchAtStartup}
                label={t.launchAtStartupTitle}
                testId="general-launch-startup-toggle"
              />
            </div>

            {launchAtStartup && (
              <div className="flex items-center justify-between gap-4 px-4 sm:px-5 py-3.5 ps-10">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-[var(--text-primary)]">
                    {t.generalStartMinimizedTitle}
                  </p>
                  <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
                    {t.generalStartMinimizedDesc}
                  </p>
                </div>
                <ToggleSwitch
                  checked={launchMinimizedToTray}
                  onChange={onToggleLaunchMinimizedToTray}
                  label={t.generalStartMinimizedTitle}
                  testId="general-start-minimized-toggle"
                />
              </div>
            )}
          </div>
        )}

        {/* 5. Safety & Drag Lock */}
        <div
          data-setting-id="general-safety"
          className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/75 divide-y divide-[var(--border)]/70"
        >
          <div className="flex items-center justify-between gap-4 p-4 sm:px-5">
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
            <ToggleSwitch
              checked={confirmBeforeDelete}
              onChange={onToggleConfirmBeforeDelete}
              label={t.generalConfirmDeleteTitle}
              testId="general-confirm-delete-toggle"
            />
          </div>

          <div className="flex items-center justify-between gap-4 p-4 sm:px-5">
            <div className="flex items-start gap-2.5 min-w-0">
              {dragLocked ? (
                <Lock className="h-4 w-4 text-[var(--text-primary)] mt-0.5 shrink-0" />
              ) : (
                <Unlock className="h-4 w-4 text-[var(--text-muted)] mt-0.5 shrink-0" />
              )}
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <p className="text-sm font-medium text-[var(--text-primary)]">
                    {t.dragReorderTitle}
                  </p>
                  <InfoTooltip text={t.generalDragLockTooltip} testId="general-drag-lock-info" />
                  <span className="text-[11px] text-[var(--text-muted)]">
                    · {dragLocked ? t.lockedBadge : t.unlockedBadge}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                  {dragLocked ? t.dragLockedDesc : t.dragUnlockedDesc}
                </p>
              </div>
            </div>
            <ToggleSwitch
              checked={dragLocked}
              onChange={onToggleDragLock}
              label={t.dragReorderTitle}
              testId="general-drag-lock-toggle"
            />
          </div>
        </div>
      </SettingsAdvancedSection>
    </div>
  );
});
