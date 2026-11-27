import { ArrowRight, Check, ChevronLeft, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '../i18n/I18nContext';
import { preferencesStore, usePreferencesSelector } from '../store/preferencesStore';
import { useShortcutSelector } from '../store/shortcutStore';
import type { SettingsTabId, ThemeId } from '../types';
import { COLOR_THEMES, resolveAppIconColors, resolveEffectiveThemeMode } from '../utils/themes';
import { BrandMark } from './BrandMark';
import { WelcomeFeatureSteps } from './welcome/WelcomeFeatureSteps';
import { WelcomeIconStep } from './welcome/WelcomeIconStep';
import { WelcomeLanguageStep } from './welcome/WelcomeLanguageStep';
import { WelcomeThemeStep } from './welcome/WelcomeThemeStep';

interface WelcomeModalProps {
  onComplete: (openSettingsTarget?: boolean | SettingsTabId) => void;
}

const TOTAL_STEPS = 10;
const STEP_INDICES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as const;
const FEATURED_THEME_IDS: readonly Exclude<ThemeId, 'custom'>[] = [
  'obsidian',
  'blue',
  'emerald',
  'cyan',
  'indigo',
  'purple',
  'pink',
  'red',
  'orange',
  'yellow',
];

export function WelcomeModal({ onComplete }: WelcomeModalProps) {
  const { t, meta } = useI18n();
  const { themeMode, themeId, customThemeColor, appIconId, customIconColor } =
    usePreferencesSelector((s) => ({
      themeMode: s.themeMode,
      themeId: s.themeId,
      customThemeColor: s.customThemeColor,
      appIconId: s.appIconId,
      customIconColor: s.customIconColor,
    }));
  const { customShortcuts, voiceShortcut } = useShortcutSelector((s) => ({
    customShortcuts: s.customShortcuts,
    voiceShortcut: s.voiceShortcut,
  }));
  const [step, setStep] = useState(0);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInput =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.tagName === 'SELECT';

      if (e.key === 'Escape') {
        e.preventDefault();
        onComplete(false);
        return;
      }
      if (isInput) return;

      const forwardKey = meta.dir === 'rtl' ? 'ArrowLeft' : 'ArrowRight';
      const backKey = meta.dir === 'rtl' ? 'ArrowRight' : 'ArrowLeft';

      if (e.key === forwardKey) {
        e.preventDefault();
        setStep((prev) => (prev < TOTAL_STEPS - 1 ? prev + 1 : prev));
      } else if (e.key === backKey) {
        e.preventDefault();
        setStep((prev) => (prev > 0 ? prev - 1 : prev));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onComplete, meta.dir]);

  const featuredThemes = useMemo(
    () =>
      FEATURED_THEME_IDS.map((id) => COLOR_THEMES.find((item) => item.id === id)).filter(
        (item): item is (typeof COLOR_THEMES)[number] => Boolean(item),
      ),
    [],
  );

  const activeIconColors = resolveAppIconColors(
    appIconId,
    themeId,
    themeMode,
    customThemeColor,
    customIconColor,
  );

  const slideCopy = useMemo(
    () =>
      [
        { title: t.languageSectionTitle, desc: t.welcomeLanguageDesc, optional: false },
        { title: t.colorThemeTitle, desc: t.customThemeHexHint, optional: false },
        { title: t.appIconSectionTitle, desc: t.appIconSectionDesc, optional: false },
        { title: t.welcomeStep1Title, desc: t.welcomeStep1Desc, optional: false },
        { title: t.welcomeStep2Title, desc: t.welcomeStep2Desc, optional: false },
        { title: t.welcomeStep3Title, desc: t.welcomeStep3Desc, optional: false },
        { title: t.welcomeFocusTitle, desc: t.welcomeFocusDesc, optional: false },
        { title: t.welcomeAiTitle, desc: t.welcomeAiDesc, optional: true },
        { title: t.welcomePowerTitle, desc: t.welcomePowerDesc, optional: true },
        { title: t.welcomeStep4Title, desc: t.welcomeStep4Desc, optional: false },
      ][step] ?? { title: t.languageSectionTitle, desc: t.welcomeLanguageDesc, optional: false },
    [
      step,
      t.languageSectionTitle,
      t.welcomeLanguageDesc,
      t.colorThemeTitle,
      t.customThemeHexHint,
      t.appIconSectionTitle,
      t.appIconSectionDesc,
      t.welcomeStep1Title,
      t.welcomeStep1Desc,
      t.welcomeStep2Title,
      t.welcomeStep2Desc,
      t.welcomeStep3Title,
      t.welcomeStep3Desc,
      t.welcomeFocusTitle,
      t.welcomeFocusDesc,
      t.welcomeAiTitle,
      t.welcomeAiDesc,
      t.welcomePowerTitle,
      t.welcomePowerDesc,
      t.welcomeStep4Title,
      t.welcomeStep4Desc,
    ],
  );

  const isFirst = step === 0;
  const isLast = step === TOTAL_STEPS - 1;
  const effectiveMode = resolveEffectiveThemeMode(themeMode);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-modal-title"
      data-testid="welcome-modal"
      className="animate-fade-in fixed inset-0 z-[65] flex items-center justify-center bg-black/55 p-4 backdrop-blur-[2px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onComplete(false);
      }}
    >
      <div className="animate-modal-pop relative flex h-[560px] max-h-[calc(100vh-20px)] w-full max-w-[700px] flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl">
        <div className="flex h-12 shrink-0 items-center justify-between gap-3 px-6">
          <div className="flex items-center gap-2.5 min-w-0">
            <BrandMark
              className="h-6 w-6 rounded-md border border-[var(--border-strong)]"
              bgColor={activeIconColors.bg}
              fgColor={activeIconColors.fg}
            />
            <span className="font-display text-sm font-semibold tracking-tight text-[var(--text-primary)] truncate">
              Agendamea
            </span>
            <span className="rounded-full border border-[var(--border)] bg-[var(--canvas)] px-2 py-0.5 font-mono-tabular text-[11px] font-medium text-[var(--text-muted)] tabular-nums shrink-0">
              {step + 1} / {TOTAL_STEPS}
            </span>
          </div>

          <button
            type="button"
            aria-label={t.closeMenu}
            onClick={() => onComplete(false)}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--text-muted)] ag-hover-glow hover:text-[var(--text-primary)] transition-colors shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div
          className="grid h-4 shrink-0 grid-cols-10 items-center gap-1.5 px-6 pb-1"
          role="tablist"
          aria-label="Agendamea"
        >
          {STEP_INDICES.map((idx) => {
            const active = idx === step;
            const completed = idx < step;
            return (
              <button
                key={`step-${idx}`}
                type="button"
                role="tab"
                aria-selected={active}
                aria-label={`${idx + 1} / ${TOTAL_STEPS}`}
                onClick={() => setStep(idx)}
                className="h-1 w-full rounded-full transition-colors"
                style={{
                  backgroundColor: active || completed ? 'var(--accent)' : 'var(--border-strong)',
                  opacity: active ? 1 : completed ? 0.55 : 0.45,
                }}
              />
            );
          })}
        </div>

        <div
          key={step}
          className="animate-tab-enter flex flex-1 flex-col overflow-hidden px-6 py-4"
        >
          {step === 0 ? (
            <WelcomeLanguageStep title={slideCopy.title} desc={slideCopy.desc} />
          ) : (
            <>
              <div className="mb-3 min-h-[68px] shrink-0 flex flex-col justify-start pt-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <h2
                    id="welcome-modal-title"
                    className="font-display text-xl font-semibold tracking-tight text-[var(--text-primary)]"
                  >
                    {slideCopy.title}
                  </h2>
                  {slideCopy.optional && (
                    <span
                      data-testid="welcome-optional-badge"
                      className="rounded-full border border-[var(--accent)]/35 bg-[var(--accent-soft)] px-2.5 py-0.5 text-[11px] font-semibold text-[var(--accent)] shrink-0"
                    >
                      {t.welcomeOptionalBadge}
                    </span>
                  )}
                </div>
                <p className="mt-1.5 text-sm leading-relaxed text-[var(--text-secondary)]">
                  {slideCopy.desc}
                </p>
              </div>

              <div className="flex flex-1 flex-col min-h-0">
                {step === 1 && (
                  <WelcomeThemeStep
                    themeMode={themeMode}
                    effectiveMode={effectiveMode}
                    themeId={themeId}
                    customThemeColor={customThemeColor}
                    featuredThemes={featuredThemes}
                    onChangeMode={preferencesStore.setThemeMode}
                    onChangeTheme={preferencesStore.setThemeId}
                    onChangeCustomThemeColor={preferencesStore.setCustomThemeColor}
                  />
                )}
                {step === 2 && (
                  <WelcomeIconStep
                    appIconId={appIconId}
                    themeId={themeId}
                    themeMode={themeMode}
                    customThemeColor={customThemeColor}
                    customIconColor={customIconColor}
                    activeIconColors={activeIconColors}
                    featuredThemes={featuredThemes}
                    onChangeAppIcon={preferencesStore.setAppIconId}
                    onChangeCustomIconColor={preferencesStore.setCustomIconColor}
                  />
                )}
                {step >= 3 && (
                  <WelcomeFeatureSteps
                    step={step}
                    activeIconColors={activeIconColors}
                    customShortcuts={customShortcuts}
                    voiceShortcut={voiceShortcut}
                    onComplete={onComplete}
                  />
                )}
              </div>
            </>
          )}
        </div>

        <div className="flex h-[58px] shrink-0 items-center justify-between gap-3 border-t border-[var(--border)] bg-[var(--canvas)] px-6">
          <div className="flex items-center gap-2 shrink-0">
            {!isFirst && (
              <button
                type="button"
                data-testid="welcome-step-back"
                onClick={() => setStep((prev) => Math.max(0, prev - 1))}
                className="inline-flex h-9 select-none items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3.5 text-xs font-medium text-[var(--text-primary)] ag-hover-card-glow transition-colors whitespace-nowrap shrink-0"
              >
                <ChevronLeft className="h-3.5 w-3.5 rtl:rotate-180 shrink-0" />
                <span>{t.welcomeBackButton}</span>
              </button>
            )}
            {!isLast && (
              <button
                type="button"
                data-testid="welcome-step-skip"
                onClick={() => onComplete(false)}
                className="rounded-md px-2.5 py-1.5 text-xs font-medium text-[var(--text-muted)] ag-hover-glow hover:text-[var(--text-primary)] transition-colors whitespace-nowrap"
              >
                {t.welcomeSkipButton}
              </button>
            )}
          </div>

          <div className="flex items-center shrink-0">
            {isLast ? (
              <button
                type="button"
                data-testid="welcome-step-start"
                onClick={() => onComplete(false)}
                className="inline-flex h-9 select-none items-center gap-1.5 rounded-lg border border-transparent px-4 font-display text-xs font-semibold transition-opacity hover:opacity-90 whitespace-nowrap shrink-0"
                style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-fg)' }}
              >
                <span style={{ color: 'var(--accent-fg)' }}>{t.welcomeStartButton}</span>
                <Check className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--accent-fg)' }} />
              </button>
            ) : (
              <button
                type="button"
                data-testid="welcome-step-next"
                onClick={() => setStep((prev) => Math.min(TOTAL_STEPS - 1, prev + 1))}
                className="inline-flex h-9 select-none items-center gap-1.5 rounded-lg border border-transparent px-4 font-display text-xs font-semibold transition-opacity hover:opacity-90 whitespace-nowrap shrink-0"
                style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-fg)' }}
              >
                <span style={{ color: 'var(--accent-fg)' }}>{t.welcomeNextButton}</span>
                <ArrowRight
                  className="h-3.5 w-3.5 rtl:rotate-180 shrink-0"
                  style={{ color: 'var(--accent-fg)' }}
                />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
