import React, { useEffect, useMemo, useState } from 'react';
import {
  Calendar,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Cloud,
  Columns3,
  Grid2x2,
  Hash,
  List,
  Monitor,
  Moon,
  Palette,
  RotateCcw,
  Search,
  Shield,
  ShieldCheck,
  Sun,
  WifiOff,
  X,
  Zap,
} from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';
import { SUPPORTED_LANGUAGES, type LanguageCode } from '../i18n/languages';
import type { AppIconId, ThemeId, ThemeMode } from '../types';
import {
  COLOR_THEMES,
  getContrastingForeground,
  resolveAppIconColors,
  resolveEffectiveThemeMode,
} from '../utils/themes';
import { BrandMark } from './BrandMark';
import { ColorSpectrumPicker } from './ColorSpectrumPicker';

interface WelcomeModalProps {
  themeMode: ThemeMode;
  themeId: ThemeId;
  customThemeColor: string;
  appIconId?: AppIconId;
  customIconColor?: string;
  onChangeMode: (mode: ThemeMode) => void;
  onChangeTheme: (id: ThemeId) => void;
  onChangeCustomThemeColor: (hex: string) => void;
  onChangeAppIcon?: (iconId: AppIconId) => void;
  onChangeCustomIconColor?: (hex: string) => void;
  onComplete: (openSettingsAfter?: boolean) => void;
}

const TOTAL_STEPS = 7;
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

export function WelcomeModal({
  themeMode,
  themeId,
  customThemeColor,
  appIconId = 'match-theme',
  customIconColor = '#2563eb',
  onChangeMode,
  onChangeTheme,
  onChangeCustomThemeColor,
  onChangeAppIcon,
  onChangeCustomIconColor,
  onComplete,
}: WelcomeModalProps) {
  const { lang, onChangeLanguage, t, meta, getThemeDisplayName } = useI18n();
  const [step, setStep] = useState(0);
  const [langSearch, setLangSearch] = useState('');

  const filteredLanguages = useMemo(() => {
    const q = langSearch.trim().toLowerCase();
    if (!q) return SUPPORTED_LANGUAGES;
    return SUPPORTED_LANGUAGES.filter(
      (item) =>
        item.nativeName.toLowerCase().includes(q) ||
        item.englishName.toLowerCase().includes(q) ||
        item.code.toLowerCase().includes(q),
    );
  }, [langSearch]);

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

  const featuredThemes = FEATURED_THEME_IDS.map((id) =>
    COLOR_THEMES.find((item) => item.id === id),
  ).filter((item): item is (typeof COLOR_THEMES)[number] => Boolean(item));

  const activeIconColors = resolveAppIconColors(
    appIconId,
    themeId,
    themeMode,
    customThemeColor,
    customIconColor,
  );

  const slideCopy = [
    {
      title: t.languageSectionTitle,
      desc: t.welcomeLanguageDesc,
    },
    {
      title: t.colorThemeTitle,
      desc: t.customThemeHexHint,
    },
    {
      title: t.appIconSectionTitle,
      desc: t.appIconSectionDesc,
    },
    {
      title: t.welcomeStep1Title,
      desc: t.welcomeStep1Desc,
    },
    {
      title: t.welcomeStep2Title,
      desc: t.welcomeStep2Desc,
    },
    {
      title: t.welcomeStep3Title,
      desc: t.welcomeStep3Desc,
    },
    {
      title: t.welcomeStep4Title,
      desc: t.welcomeStep4Desc,
    },
  ][step];

  const isFirst = step === 0;
  const isLast = step === TOTAL_STEPS - 1;
  const effectiveMode = resolveEffectiveThemeMode(themeMode);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-modal-title"
      data-testid="welcome-modal"
      className="fixed inset-0 z-[55] flex items-center justify-center bg-black/55 p-4 backdrop-blur-[2px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          onComplete(false);
        }
      }}
    >
      {/* Generous, Strictly Fixed 700x560 Dialog: Footer & Next button never move across all 7 steps */}
      <div className="relative flex h-[560px] max-h-[calc(100vh-20px)] w-full max-w-[700px] flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl">
        {/* Top Bar (Fixed 52px) */}
        <div className="flex h-[52px] shrink-0 items-center justify-between gap-3 border-b border-[var(--border)] px-6">
          <div className="flex items-center gap-2.5 min-w-0">
            <BrandMark
              className="h-6 w-6 rounded-md border border-[var(--border-strong)]"
              bgColor={activeIconColors.bg}
              fgColor={activeIconColors.fg}
            />
            <span className="font-display text-sm font-semibold tracking-tight text-[var(--text-primary)] truncate">
              Agendamea
            </span>
            <span className="font-mono-tabular text-[11px] font-medium text-[var(--text-muted)] shrink-0">
              v1.0.0
            </span>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <span className="font-mono-tabular text-xs font-medium text-[var(--text-muted)] tabular-nums">
              {step + 1} / {TOTAL_STEPS}
            </span>
            {!isLast && (
              <button
                type="button"
                data-testid="welcome-step-skip"
                onClick={() => onComplete(false)}
                className="rounded-md px-2.5 py-1 text-xs font-medium text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] transition-colors whitespace-nowrap"
              >
                {t.welcomeSkipButton}
              </button>
            )}
            <button
              type="button"
              aria-label={t.closeMenu}
              onClick={() => onComplete(false)}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Fixed-Height Content Area: Consistent Unclipped Header Anchor + Zero Dead Space */}
        <div className="flex flex-1 flex-col overflow-hidden px-7 py-5">
          {/* Consistent 76px Step Header across all 7 steps (accommodates 2 full lines without clipping) */}
          <div className="mb-4 h-[76px] shrink-0 flex flex-col justify-start pt-0.5">
            <h2
              id="welcome-modal-title"
              className="font-display text-xl font-semibold tracking-tight text-[var(--text-primary)]"
            >
              {slideCopy.title}
            </h2>
            <p className="mt-1.5 text-sm leading-relaxed text-[var(--text-secondary)]">
              {slideCopy.desc}
            </p>
          </div>

          {/* Step Body (Available ~308px) */}
          <div className="flex flex-1 flex-col min-h-0">
            {/* STEP 1 / 7: LANGUAGE SELECTION (Single Clean Surface: Search + Strictly 5 Visible Rows) */}
            {step === 0 && (
              <div
                data-testid="welcome-language-dropdown"
                className="flex flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--canvas)]"
              >
                <div className="relative flex h-11 shrink-0 items-center border-b border-[var(--border)] px-4">
                  <Search className="pointer-events-none h-4 w-4 shrink-0 text-[var(--text-muted)]" />
                  <input
                    type="text"
                    value={langSearch}
                    onChange={(e) => setLangSearch(e.target.value)}
                    placeholder={t.languageSearchPlaceholder}
                    aria-label={t.languageSearchPlaceholder}
                    className="h-full w-full bg-transparent px-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
                  />
                  <span
                    data-testid="welcome-language-select"
                    className="font-mono-tabular text-xs font-semibold uppercase text-[var(--accent)] shrink-0"
                  >
                    {meta.code}
                  </span>
                </div>

                {/* Strictly 5 rows visible at once (5 * 48px = 240px) with smooth vertical scroll */}
                <div
                  role="listbox"
                  aria-label={t.languageSectionTitle}
                  data-testid="welcome-language-listbox"
                  className="h-[240px] overflow-y-auto divide-y divide-[var(--border)]/50"
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
                        className={`flex h-12 w-full items-center justify-between gap-3 px-4 text-left text-sm transition-colors ${
                          selected
                            ? 'bg-[var(--accent-soft)] font-semibold text-[var(--text-primary)]'
                            : 'text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]'
                        }`}
                      >
                        <span className="truncate">
                          <span className="text-[var(--text-primary)]">{item.nativeName}</span>{' '}
                          <span className="text-xs text-[var(--text-muted)]">
                            ({item.englishName})
                          </span>
                        </span>
                        {selected && (
                          <Check className="h-4 w-4 shrink-0 text-[var(--accent)]" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* STEP 2 / 7: APPEARANCE & THEME SELECTION (Clean Separated Rows + Always-Open Picker) */}
            {step === 1 && (
              <div
                className="flex flex-1 flex-col justify-between"
                data-testid="welcome-custom-theme-panel"
              >
                {/* Row 1: Appearance Mode */}
                <div className="flex items-center justify-between gap-4">
                  <span className="text-xs font-medium text-[var(--text-secondary)] shrink-0">
                    {t.appearanceModeTitle}
                  </span>
                  <div className="inline-flex items-center rounded-lg border border-[var(--border)] bg-[var(--canvas)] p-1">
                    <button
                      type="button"
                      data-testid="welcome-mode-light"
                      onClick={() => onChangeMode('light')}
                      className={`inline-flex h-7 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors whitespace-nowrap ${
                        themeMode === 'light'
                          ? 'bg-[var(--accent)] text-[var(--accent-fg)]'
                          : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                      }`}
                      style={
                        themeMode === 'light'
                          ? { backgroundColor: 'var(--accent)', color: 'var(--accent-fg)' }
                          : undefined
                      }
                    >
                      <Sun className="h-3.5 w-3.5" />
                      <span>{t.lightMode}</span>
                    </button>
                    <button
                      type="button"
                      data-testid="welcome-mode-dark"
                      onClick={() => onChangeMode('dark')}
                      className={`inline-flex h-7 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors whitespace-nowrap ${
                        themeMode === 'dark'
                          ? 'bg-[var(--accent)] text-[var(--accent-fg)]'
                          : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                      }`}
                      style={
                        themeMode === 'dark'
                          ? { backgroundColor: 'var(--accent)', color: 'var(--accent-fg)' }
                          : undefined
                      }
                    >
                      <Moon className="h-3.5 w-3.5" />
                      <span>{t.darkMode}</span>
                    </button>
                    <button
                      type="button"
                      data-testid="welcome-mode-system"
                      onClick={() => onChangeMode('system')}
                      className={`inline-flex h-7 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors whitespace-nowrap ${
                        themeMode === 'system'
                          ? 'bg-[var(--accent)] text-[var(--accent-fg)]'
                          : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                      }`}
                      style={
                        themeMode === 'system'
                          ? { backgroundColor: 'var(--accent)', color: 'var(--accent-fg)' }
                          : undefined
                      }
                    >
                      <Monitor className="h-3.5 w-3.5" />
                      <span>{t.systemMode}</span>
                    </button>
                  </div>
                </div>

                {/* Row 2: Preset Theme Swatches (Dedicated Row, Zero Crowding) */}
                <div className="flex items-center justify-between gap-4">
                  <span className="text-xs font-medium text-[var(--text-secondary)] shrink-0">
                    {t.colorThemeTitle}
                  </span>
                  <div className="flex items-center gap-2">
                    {featuredThemes.map((item) => {
                      const selected = item.id === themeId;
                      const colorHex =
                        effectiveMode === 'dark' ? item.dark.accent : item.light.accent;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          title={getThemeDisplayName(item.id, item.name)}
                          aria-label={getThemeDisplayName(item.id, item.name)}
                          aria-pressed={selected}
                          onClick={() => onChangeTheme(item.id)}
                          className={`flex h-7 w-7 items-center justify-center rounded-full border transition-transform ${
                            selected
                              ? 'scale-110 border-[var(--text-primary)] ring-2 ring-[var(--accent-ring)]'
                              : 'border-[var(--border-strong)] hover:scale-105'
                          }`}
                          style={{ backgroundColor: colorHex }}
                        >
                          {selected && (
                            <Check
                              className="h-3.5 w-3.5"
                              style={{
                                color:
                                  effectiveMode === 'dark'
                                    ? item.dark.accentFg
                                    : item.light.accentFg,
                              }}
                            />
                          )}
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      data-testid="welcome-custom-theme-btn"
                      title={t.customThemeHexTitle}
                      onClick={() => onChangeTheme('custom')}
                      className={`flex h-7 w-7 items-center justify-center rounded-full border transition-transform ${
                        themeId === 'custom'
                          ? 'scale-110 border-[var(--text-primary)] ring-2 ring-[var(--accent-ring)]'
                          : 'border-dashed border-[var(--border-strong)] hover:scale-105'
                      }`}
                      style={
                        themeId === 'custom'
                          ? {
                              backgroundColor: customThemeColor,
                              color: getContrastingForeground(customThemeColor),
                            }
                          : undefined
                      }
                    >
                      <Palette className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {/* Row 3: Custom Color Spectrum Picker (Always Open, Balanced Height) */}
                <div className="border-t border-[var(--border)] pt-4">
                  <ColorSpectrumPicker
                    value={customThemeColor}
                    onChange={(hex) => {
                      if (themeId !== 'custom') {
                        onChangeTheme('custom');
                      }
                      onChangeCustomThemeColor(hex);
                    }}
                    hexInputLabel={t.customThemeHexTitle}
                    hexInputTestId="welcome-custom-theme-hex"
                    paletteHeightClass="h-[104px]"
                    previewNode={
                      <span
                        aria-hidden="true"
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--border-strong)]"
                        style={{
                          backgroundColor: customThemeColor,
                          color: getContrastingForeground(customThemeColor),
                        }}
                      >
                        <Check className="h-4 w-4" />
                      </span>
                    }
                  />
                </div>
              </div>
            )}

            {/* STEP 3 / 7: APP ICON SELECTION (Large Crisp Preview + Larger Preset Icons + Always-Open Picker) */}
            {step === 2 && (
              <div
                className="flex flex-1 flex-col justify-between"
                data-testid="welcome-icon-step"
              >
                {/* Row 1: Large Active Icon Preview (Left) + Clean Mode Selector (Right) */}
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <BrandMark
                      className="h-12 w-12 shrink-0 rounded-xl border border-[var(--border-strong)] shadow-sm"
                      bgColor={activeIconColors.bg}
                      fgColor={activeIconColors.fg}
                    />
                    <span className="font-display text-sm font-semibold text-[var(--text-primary)] truncate">
                      Agendamea
                    </span>
                  </div>
                  <div className="inline-flex items-center rounded-lg border border-[var(--border)] bg-[var(--canvas)] p-1 shrink-0">
                    {(
                      [
                        { id: 'match-theme', label: t.appIconMatchTheme },
                        { id: 'obsidian', label: t.appIconDarkMono },
                        { id: 'obsidian-light', label: t.appIconLightMono },
                        { id: 'custom', label: t.appIconCustom },
                      ] as const
                    ).map((modeOpt) => {
                      const active = appIconId === modeOpt.id;
                      return (
                        <button
                          key={modeOpt.id}
                          type="button"
                          data-testid={`welcome-app-icon-${modeOpt.id}`}
                          onClick={() => onChangeAppIcon?.(modeOpt.id)}
                          className={`h-7 rounded-md px-2.5 text-xs font-medium transition-colors whitespace-nowrap ${
                            active
                              ? 'bg-[var(--accent)] text-[var(--accent-fg)]'
                              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                          }`}
                          style={
                            active
                              ? { backgroundColor: 'var(--accent)', color: 'var(--accent-fg)' }
                              : undefined
                          }
                        >
                          {modeOpt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Row 2: Large 36x36 Preset Theme App Icons (Clearly Legible Monograms) */}
                <div className="flex items-center justify-between gap-2">
                  {featuredThemes.map((item) => {
                    const selected = appIconId === item.id;
                    const preview = resolveAppIconColors(
                      item.id,
                      themeId,
                      themeMode,
                      customThemeColor,
                      customIconColor,
                    );
                    return (
                      <button
                        key={item.id}
                        type="button"
                        title={getThemeDisplayName(item.id, item.name)}
                        aria-label={getThemeDisplayName(item.id, item.name)}
                        aria-pressed={selected}
                        onClick={() => onChangeAppIcon?.(item.id)}
                        className={`rounded-xl p-0.5 transition-transform ${
                          selected
                            ? 'scale-110 ring-2 ring-[var(--text-primary)]'
                            : 'opacity-90 hover:scale-105 hover:opacity-100'
                        }`}
                      >
                        <BrandMark
                          className="h-9 w-9 rounded-lg border border-[var(--border-strong)]"
                          bgColor={preview.bg}
                          fgColor={preview.fg}
                        />
                      </button>
                    );
                  })}
                </div>

                {/* Row 3: Custom App Icon Color Picker (Always Open) */}
                <div className="border-t border-[var(--border)] pt-4">
                  <ColorSpectrumPicker
                    value={customIconColor}
                    onChange={(hex) => {
                      if (appIconId !== 'custom') {
                        onChangeAppIcon?.('custom');
                      }
                      onChangeCustomIconColor?.(hex);
                    }}
                    hexInputLabel={`${t.appIconCustom} (HEX)`}
                    hexInputTestId="welcome-custom-icon-hex"
                    paletteHeightClass="h-[92px]"
                    previewNode={
                      <BrandMark
                        className="h-8 w-8 rounded-lg border border-[var(--border-strong)] shrink-0"
                        bgColor={activeIconColors.bg}
                        fgColor={activeIconColors.fg}
                      />
                    }
                  />
                </div>
              </div>
            )}

            {/* STEP 4 / 7: END-USER FOCUSED WELCOME HERO (Zero Technical Jargon) */}
            {step === 3 && (
              <div className="flex flex-1 flex-col items-center justify-between py-2 text-center">
                <div className="flex flex-1 flex-col items-center justify-center space-y-3.5">
                  <BrandMark
                    className="h-[72px] w-[72px] rounded-2xl border border-[var(--border-strong)] shadow-md"
                    bgColor={activeIconColors.bg}
                    fgColor={activeIconColors.fg}
                  />
                  <div className="space-y-1">
                    <p className="font-display text-lg font-semibold text-[var(--text-primary)]">
                      Agendamea · {t.appTitleSuffix}
                    </p>
                    <p className="text-xs text-[var(--text-muted)]">
                      {t.settingsSubtitle}
                    </p>
                  </div>
                </div>

                {/* 3 End-User Benefits (Offline, Instant Save, Private) */}
                <div className="grid w-full grid-cols-3 gap-4 border-t border-[var(--border)] pt-5">
                  {[
                    { Icon: WifiOff, label: t.welcomeBenefitOffline },
                    { Icon: Zap, label: t.welcomeBenefitInstant },
                    { Icon: ShieldCheck, label: t.welcomeBenefitPrivate },
                  ].map(({ Icon, label }) => (
                    <div
                      key={label}
                      className="flex flex-col items-center gap-2 text-center"
                    >
                      <span
                        className="flex h-9 w-9 items-center justify-center rounded-xl"
                        style={{ backgroundColor: 'var(--accent-soft)', color: 'var(--accent)' }}
                      >
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="text-xs font-medium leading-snug text-[var(--text-secondary)]">
                        {label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* STEP 5 / 7: 4 PLANNING VIEWS (Even 2x2 Grid Filling Full Stage) */}
            {step === 4 && (
              <div className="grid flex-1 grid-cols-2 gap-4">
                {[
                  { Icon: List, title: t.viewList, desc: t.welcomeCardListDesc },
                  { Icon: Columns3, title: t.viewKanban, desc: t.welcomeCardKanbanDesc },
                  { Icon: Calendar, title: t.viewCalendar, desc: t.welcomeCardCalendarDesc },
                  { Icon: Grid2x2, title: t.viewMatrix, desc: t.welcomeCardMatrixDesc },
                ].map(({ Icon, title, desc }) => (
                  <div
                    key={title}
                    className="flex flex-col justify-center gap-2.5 rounded-xl border border-[var(--border)] bg-[var(--canvas)] p-5"
                  >
                    <div className="flex items-center gap-2.5">
                      <span
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                        style={{ backgroundColor: 'var(--accent-soft)', color: 'var(--accent)' }}
                      >
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="font-display text-sm font-semibold text-[var(--text-primary)] truncate">
                        {title}
                      </span>
                    </div>
                    <p className="text-xs leading-relaxed text-[var(--text-muted)]">
                      {desc}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {/* STEP 6 / 7: SMART DETAILS & KEYBOARD SHORTCUTS (Balanced Vertical Rhythm, Zero Hollow Gap) */}
            {step === 5 && (
              <div className="flex flex-1 flex-col justify-center gap-7">
                <div className="rounded-xl border border-[var(--border)] bg-[var(--canvas)] p-5">
                  <div className="flex items-start gap-3.5">
                    <span
                      className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
                      style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-fg)' }}
                    >
                      <Check className="h-3 w-3" />
                    </span>
                    <div className="min-w-0 flex-1 space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-display text-sm font-semibold text-[var(--text-primary)] truncate">
                          Agendamea · {t.today}
                        </span>
                        <span className="inline-flex items-center gap-1 font-mono-tabular text-xs font-medium text-[var(--accent)] shrink-0">
                          <Clock className="h-3.5 w-3.5" />
                          <span>14:30</span>
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-4 text-xs text-[var(--text-secondary)]">
                        <span className="inline-flex items-center gap-1.5">
                          <Calendar className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                          <span>{t.today}</span>
                        </span>
                        <span className="inline-flex items-center gap-0.5 text-[var(--accent)]">
                          <Hash className="h-3.5 w-3.5" />
                          <span>{t.important.toLowerCase()}</span>
                        </span>
                        <span className="inline-flex items-center gap-0.5 text-[var(--accent)]">
                          <Hash className="h-3.5 w-3.5" />
                          <span>{t.priorityHigh.toLowerCase()}</span>
                        </span>
                        <span className="ms-auto font-mono-tabular text-xs text-[var(--text-muted)]">
                          2 / 3 {t.subtaskCountUnit}
                        </span>
                      </div>

                      <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--surface-subtle)]">
                        <div
                          className="h-full w-2/3 rounded-full"
                          style={{ backgroundColor: 'var(--accent)' }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Clean Keyboard Shortcuts Row */}
                <div className="grid grid-cols-3 gap-4 border-t border-[var(--border)] pt-6">
                  {[
                    { keycap: 'N', label: t.shortcutNewTask },
                    { keycap: 'Ctrl + K', label: t.shortcutSearch },
                    { keycap: 'Alt + ↑/↓', label: t.shortcutReorder },
                  ].map((item) => (
                    <div key={item.keycap} className="flex flex-col items-center gap-2 text-center">
                      <kbd className="rounded-md bg-[var(--accent-soft)] px-2.5 py-1 font-mono-tabular text-xs font-semibold text-[var(--accent)]">
                        {item.keycap}
                      </kbd>
                      <span className="line-clamp-2 text-xs leading-snug text-[var(--text-muted)]">
                        {item.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* STEP 7 / 7: PRIVACY & CLOUD BACKUP (Spacious Flat Divider List) */}
            {step === 6 && (
              <div className="flex flex-1 flex-col justify-center divide-y divide-[var(--border)]">
                {[
                  {
                    Icon: Shield,
                    title: t.welcomePrivacyLocalTitle,
                    desc: t.welcomePrivacyLocalDesc,
                    action: null,
                  },
                  {
                    Icon: Cloud,
                    title: t.welcomePrivacyCloudTitle,
                    desc: t.welcomePrivacyCloudDesc,
                    action: (
                      <button
                        type="button"
                        data-testid="welcome-open-settings"
                        onClick={() => onComplete(true)}
                        className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--canvas)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors whitespace-nowrap shrink-0 self-center"
                      >
                        <span>{t.settings}</span>
                        <ChevronRight className="h-3.5 w-3.5 rtl:rotate-180 shrink-0" />
                      </button>
                    ),
                  },
                  {
                    Icon: RotateCcw,
                    title: t.welcomePrivacyUndoTitle,
                    desc: t.welcomePrivacyUndoDesc,
                    action: null,
                  },
                ].map(({ Icon, title, desc, action }) => (
                  <div key={title} className="flex items-start gap-4 py-4 first:pt-1 last:pb-1">
                    <span
                      className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                      style={{ backgroundColor: 'var(--accent-soft)', color: 'var(--accent)' }}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-display text-sm font-semibold text-[var(--text-primary)]">
                        {title}
                      </p>
                      <p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">
                        {desc}
                      </p>
                    </div>
                    {action}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Fixed 60px Footer: Next / Start Button Never Moves Across Steps */}
        <div className="flex h-[60px] shrink-0 items-center justify-between gap-3 border-t border-[var(--border)] bg-[var(--canvas)] px-6">
          {/* Interactive Step Indicators */}
          <div className="flex items-center gap-2" role="tablist" aria-label="Agendamea">
            {Array.from({ length: TOTAL_STEPS }).map((_, idx) => {
              const active = idx === step;
              return (
                <button
                  key={idx}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  aria-label={`${idx + 1} / ${TOTAL_STEPS}`}
                  onClick={() => setStep(idx)}
                  className={`h-2 rounded-full transition-all ${active ? 'w-7' : 'w-2 hover:opacity-80'}`}
                  style={{
                    backgroundColor: active ? 'var(--accent)' : 'var(--border-strong)',
                  }}
                />
              );
            })}
          </div>

          {/* Action Buttons (Fixed coordinates, High Contrast & Unselectable) */}
          <div className="flex items-center gap-2.5 shrink-0 flex-nowrap">
            {!isFirst && (
              <button
                type="button"
                data-testid="welcome-step-back"
                onClick={() => setStep((prev) => Math.max(0, prev - 1))}
                className="inline-flex h-9 select-none items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3.5 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors whitespace-nowrap shrink-0"
              >
                <ChevronLeft className="h-3.5 w-3.5 rtl:rotate-180 shrink-0" />
                <span>{t.welcomeBackButton}</span>
              </button>
            )}

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
                className="inline-flex h-9 select-none items-center gap-1 rounded-lg border border-transparent px-4 font-display text-xs font-semibold transition-opacity hover:opacity-90 whitespace-nowrap shrink-0"
                style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-fg)' }}
              >
                <span style={{ color: 'var(--accent-fg)' }}>{t.welcomeNextButton}</span>
                <ChevronRight
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

export default WelcomeModal;
