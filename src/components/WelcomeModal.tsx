import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Calendar,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Cloud,
  Columns3,
  Globe,
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

  const featuredThemes = useMemo(
    () =>
      FEATURED_THEME_IDS.map((id) =>
        COLOR_THEMES.find((item) => item.id === id),
      ).filter((item): item is (typeof COLOR_THEMES)[number] => Boolean(item)),
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
      ][step],
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
      className="animate-fade-in fixed inset-0 z-[55] flex items-center justify-center bg-black/55 p-4 backdrop-blur-[2px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          onComplete(false);
        }
      }}
    >
      {/* Generous, Strictly Fixed 700x560 Dialog: Footer & Next button stay locked across all 7 steps */}
      <div className="animate-modal-pop relative flex h-[560px] max-h-[calc(100vh-20px)] w-full max-w-[700px] flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl">
        {/* Top Bar (Fixed 48px) */}
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
            className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] transition-colors shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* 7-Segment Horizontal Progress Bar (Fixed 16px) */}
        <div
          className="grid h-4 shrink-0 grid-cols-7 items-center gap-2 px-6 pb-1"
          role="tablist"
          aria-label="Agendamea"
        >
          {Array.from({ length: TOTAL_STEPS }).map((_, idx) => {
            const active = idx === step;
            const completed = idx < step;
            return (
              <button
                key={idx}
                type="button"
                role="tab"
                aria-selected={active}
                aria-label={`${idx + 1} / ${TOTAL_STEPS}`}
                onClick={() => setStep(idx)}
                className="h-1 w-full rounded-full transition-colors"
                style={{
                  backgroundColor:
                    active || completed ? 'var(--accent)' : 'var(--border-strong)',
                  opacity: active ? 1 : completed ? 0.55 : 0.45,
                }}
              />
            );
          })}
        </div>

        {/* Fixed-Height Content Area (438px) */}
        <div key={step} className="animate-tab-enter flex flex-1 flex-col overflow-hidden px-6 py-4">
          {/* STEP 1 / 7: CENTERED HERO + SEARCH & DROPDOWN + 3-COLUMN LANGUAGE GRID */}
          {step === 0 ? (
            <div className="flex flex-1 flex-col min-h-0" data-testid="welcome-language-dropdown">
              {/* Centered Globe Icon + Title + Subtitle */}
              <div className="flex flex-col items-center text-center shrink-0">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--border-strong)] bg-[var(--canvas)] text-[var(--text-primary)]">
                  <Globe className="h-5 w-5" />
                </div>
                <h2
                  id="welcome-modal-title"
                  className="mt-2.5 font-display text-lg font-semibold tracking-tight text-[var(--text-primary)]"
                >
                  {slideCopy.title}
                </h2>
                <p className="mt-1 text-xs text-[var(--text-secondary)]">
                  {slideCopy.desc}
                </p>
              </div>

              {/* Search Input (Cols 1-2) + Selected Language Display (Col 3, pixel-aligned with tile grid below) */}
              <div className="mt-4 grid grid-cols-3 items-center gap-2 pr-2 shrink-0">
                <div className="relative col-span-2 flex items-center">
                  <Search className="pointer-events-none absolute left-3 h-3.5 w-3.5 text-[var(--text-muted)]" />
                  <input
                    type="text"
                    value={langSearch}
                    onChange={(e) => setLangSearch(e.target.value)}
                    placeholder={t.languageSearchPlaceholder}
                    aria-label={t.languageSearchPlaceholder}
                    className="h-9 w-full rounded-lg border border-[var(--border)] bg-[var(--canvas)] pl-9 pr-3 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none"
                  />
                </div>

                {/* Non-interactive Selected Language Readout aligned 1:1 with the 3rd column tile underneath */}
                <div
                  data-testid="welcome-selected-language"
                  aria-live="polite"
                  className="flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-[var(--accent)]/45 bg-[var(--accent-soft)] px-3 select-none"
                >
                  <span className="flex items-center gap-1.5 min-w-0">
                    <span className="truncate text-xs font-semibold text-[var(--text-primary)]">
                      {meta.nativeName}
                    </span>
                    <span className="rounded bg-[var(--surface)] px-1.5 py-0.5 font-mono-tabular text-[9px] font-semibold uppercase text-[var(--text-muted)] shrink-0">
                      {meta.code}
                    </span>
                  </span>
                  <Check className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />
                </div>
              </div>

              {/* 3-Column x 5-Row Scrollable Language Tile Grid (All 73 Languages) */}
              <div
                role="listbox"
                aria-label={t.languageSectionTitle}
                data-testid="welcome-language-listbox"
                className="mt-3 grid h-[228px] grid-cols-3 content-start gap-2 overflow-y-auto pr-0.5"
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
                      className={`flex h-10 items-center justify-between gap-2 rounded-lg border px-3 text-left transition-colors ${
                        selected
                          ? 'border-[var(--text-primary)] bg-[var(--surface-hover)] text-[var(--text-primary)]'
                          : 'border-[var(--border)] bg-[var(--canvas)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      <span className="flex items-center gap-1.5 min-w-0">
                        <span className="truncate text-xs font-medium text-[var(--text-primary)]">
                          {item.nativeName}
                        </span>
                        <span className="rounded bg-[var(--surface)] px-1.5 py-0.5 font-mono-tabular text-[9px] font-semibold uppercase text-[var(--text-muted)] shrink-0">
                          {item.code}
                        </span>
                      </span>
                      {selected && (
                        <Check className="h-3.5 w-3.5 shrink-0 text-[var(--text-primary)]" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <>
              {/* Consistent 76px Step Header across steps 2..7 (zero text clipping) */}
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

              {/* Step Body */}
              <div className="flex flex-1 flex-col min-h-0">
                {/* STEP 2 / 7: APPEARANCE & THEME SELECTION */}
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

                    {/* Row 2: Preset Theme Swatches */}
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

                    {/* Row 3: Custom Color Spectrum Picker (Always Open) */}
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

                {/* STEP 3 / 7: APP ICON SELECTION */}
                {step === 2 && (
                  <div
                    className="flex flex-1 flex-col justify-between"
                    data-testid="welcome-icon-step"
                  >
                    {/* Row 1: Large Active Icon Preview (Left) + Clean Mode Selector (Right) */}
                    <div className="flex flex-wrap items-center justify-between gap-3">
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
                      <div className="inline-flex max-w-full flex-wrap items-center rounded-lg border border-[var(--border)] bg-[var(--canvas)] p-1">
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

                    {/* Row 2: Large 36x36 Preset Theme App Icons */}
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

                {/* STEP 4 / 7: END-USER FOCUSED WELCOME HERO */}
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

                {/* STEP 5 / 7: 4 PLANNING VIEWS */}
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

                {/* STEP 6 / 7: SMART DETAILS & KEYBOARD SHORTCUTS */}
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

                    <div className="grid grid-cols-4 gap-3 border-t border-[var(--border)] pt-6">
                      {[
                        { keycap: 'N', label: t.shortcutNewTask },
                        { keycap: 'Ctrl + K', label: t.shortcutSearch },
                        { keycap: 'Ctrl+Alt+Space', label: t.settingsTabAi },
                        { keycap: 'Alt + ↑/↓', label: t.shortcutReorder },
                      ].map((item) => (
                        <div key={item.keycap} className="flex flex-col items-center gap-2 text-center">
                          <kbd className="rounded-md bg-[var(--accent-soft)] px-2 py-1 font-mono-tabular text-[11px] font-semibold text-[var(--accent)] whitespace-nowrap">
                            {item.keycap}
                          </kbd>
                          <span className="line-clamp-2 text-[11px] leading-snug text-[var(--text-muted)]">
                            {item.label}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* STEP 7 / 7: PRIVACY & CLOUD BACKUP */}
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
            </>
          )}
        </div>

        {/* Fixed 58px Footer: Left Skip/Back, Right Fixed Next/Start Button */}
        <div className="flex h-[58px] shrink-0 items-center justify-between gap-3 border-t border-[var(--border)] bg-[var(--canvas)] px-6">
          <div className="flex items-center gap-2 shrink-0">
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
            {!isLast && (
              <button
                type="button"
                data-testid="welcome-step-skip"
                onClick={() => onComplete(false)}
                className="rounded-md px-2.5 py-1.5 text-xs font-medium text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] transition-colors whitespace-nowrap"
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
