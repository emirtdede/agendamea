import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Calendar,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Cloud,
  Columns3,
  Database,
  Globe,
  Grid2x2,
  Hash,
  Keyboard,
  List,
  Moon,
  Palette,
  RotateCcw,
  Search,
  Shield,
  Sparkles,
  Sun,
  X,
} from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';
import { SUPPORTED_LANGUAGES, type LanguageCode } from '../i18n/languages';
import type { ThemeId, ThemeMode } from '../types';
import { COLOR_THEMES, getContrastingForeground } from '../utils/themes';
import { BrandMark } from './BrandMark';
import { ColorSpectrumPicker } from './ColorSpectrumPicker';

interface WelcomeModalProps {
  themeMode: ThemeMode;
  themeId: ThemeId;
  customThemeColor: string;
  onChangeMode: (mode: ThemeMode) => void;
  onChangeTheme: (id: ThemeId) => void;
  onChangeCustomThemeColor: (hex: string) => void;
  onComplete: (openSettingsAfter?: boolean) => void;
}

const TOTAL_STEPS = 4;
const FEATURED_THEME_IDS: readonly ThemeId[] = [
  'obsidian',
  'blue',
  'emerald',
  'orange',
];

export function WelcomeModal({
  themeMode,
  themeId,
  customThemeColor,
  onChangeMode,
  onChangeTheme,
  onChangeCustomThemeColor,
  onComplete,
}: WelcomeModalProps) {
  const { lang, onChangeLanguage, t, meta, getThemeDisplayName } = useI18n();
  const [step, setStep] = useState(0);
  const [isLangDropdownOpen, setIsLangDropdownOpen] = useState(false);
  const [langSearch, setLangSearch] = useState('');
  const [isCustomPickerOpen, setIsCustomPickerOpen] = useState(themeId === 'custom');
  const langDropdownRef = useRef<HTMLDivElement>(null);

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

  const langTriggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isLangDropdownOpen) return;
    const handlePointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        langDropdownRef.current &&
        !langDropdownRef.current.contains(target) &&
        langTriggerRef.current &&
        !langTriggerRef.current.contains(target)
      ) {
        setIsLangDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [isLangDropdownOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInput =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.tagName === 'SELECT';

      if (e.key === 'Escape') {
        e.preventDefault();
        if (isLangDropdownOpen) {
          setIsLangDropdownOpen(false);
          return;
        }
        onComplete(false);
        return;
      }
      if (isInput || isLangDropdownOpen) return;

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
  }, [onComplete, meta.dir, isLangDropdownOpen]);

  const featuredThemes = FEATURED_THEME_IDS.map((id) =>
    COLOR_THEMES.find((item) => item.id === id),
  ).filter((item): item is (typeof COLOR_THEMES)[number] => Boolean(item));

  const slideCopy = [
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

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-modal-title"
      data-testid="welcome-modal"
      className="fixed inset-0 z-[55] flex items-center justify-center bg-black/50 p-3 sm:p-4 backdrop-blur-[2px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          onComplete(false);
        }
      }}
    >
      <div className="relative flex w-full max-w-[548px] max-h-[calc(100vh-24px)] flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl">
        {/* Top Bar */}
        <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-3.5 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <BrandMark className="h-6 w-6" />
            <span className="font-display text-sm font-semibold tracking-tight text-[var(--text-primary)] truncate">
              Agendamea
            </span>
            <span className="rounded-md border border-[var(--border)] bg-[var(--canvas)] px-1.5 py-0.5 font-mono-tabular text-[10px] font-medium text-[var(--text-muted)] shrink-0">
              v1.0.0
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="font-mono-tabular text-[11px] font-medium text-[var(--text-muted)] tabular-nums">
              {step + 1} / {TOTAL_STEPS}
            </span>
            {!isLast && (
              <button
                type="button"
                data-testid="welcome-step-skip"
                onClick={() => onComplete(false)}
                className="rounded-md px-2 py-1 text-xs font-medium text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] transition-colors whitespace-nowrap"
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

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-5 py-5">
          {/* Consistent Visual Stage Container */}
          <div className="mb-5 rounded-xl border border-[var(--border)] bg-[var(--canvas)] p-4 sm:min-h-[272px] flex flex-col justify-center">
            {step === 0 && (
              <div className="space-y-3.5">
                <div className="flex flex-col items-center text-center pt-0.5">
                  <div
                    className="mb-2.5 rounded-2xl p-1.5"
                    style={{ backgroundColor: 'var(--accent-soft)' }}
                  >
                    <BrandMark className="h-11 w-11 rounded-xl" />
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-1.5">
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-secondary)]">
                      <Database className="h-3 w-3 text-[var(--accent)] shrink-0" />
                      <span>SQLite WAL</span>
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-secondary)]">
                      <Sparkles className="h-3 w-3 text-[var(--accent)] shrink-0" />
                      <span>28+ {t.themesCountUnit}</span>
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-secondary)]">
                      <Globe className="h-3 w-3 text-[var(--accent)] shrink-0" />
                      <span>73 · {meta.nativeName}</span>
                    </span>
                  </div>
                </div>

                {/* Live Theme & Language Quick Personalization */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-0.5">
                  {/* Appearance Mode + Curated Colors + Custom HEX Button */}
                  <div className="flex flex-col justify-between gap-2.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-medium text-[var(--text-muted)] whitespace-nowrap">
                        {t.appearanceModeTitle}
                      </span>
                      <div className="inline-flex items-center rounded-md border border-[var(--border)] bg-[var(--canvas)] p-0.5 shrink-0">
                        <button
                          type="button"
                          data-testid="welcome-mode-light"
                          onClick={() => onChangeMode('light')}
                          className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium transition-colors whitespace-nowrap ${
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
                          <Sun className="h-3 w-3" />
                          <span>{t.lightMode}</span>
                        </button>
                        <button
                          type="button"
                          data-testid="welcome-mode-dark"
                          onClick={() => onChangeMode('dark')}
                          className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium transition-colors whitespace-nowrap ${
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
                          <Moon className="h-3 w-3" />
                          <span>{t.darkMode}</span>
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-1.5">
                      <div className="flex items-center gap-1.5">
                        {featuredThemes.map((item) => {
                          const selected = item.id === themeId;
                          const colorHex =
                            themeMode === 'dark' ? item.dark.accent : item.light.accent;
                          return (
                            <button
                              key={item.id}
                              type="button"
                              title={getThemeDisplayName(item.id, item.name)}
                              aria-label={getThemeDisplayName(item.id, item.name)}
                              aria-pressed={selected}
                              onClick={() => {
                                onChangeTheme(item.id);
                                setIsCustomPickerOpen(false);
                              }}
                              className={`flex h-6 w-6 items-center justify-center rounded-full border transition-transform ${
                                selected
                                  ? 'scale-110 border-[var(--text-primary)] ring-2 ring-[var(--accent-ring)]'
                                  : 'border-[var(--border-strong)] hover:scale-105'
                              }`}
                              style={{ backgroundColor: colorHex }}
                            >
                              {selected && (
                                <Check
                                  className="h-3 w-3"
                                  style={{
                                    color:
                                      themeMode === 'dark'
                                        ? item.dark.accentFg
                                        : item.light.accentFg,
                                  }}
                                />
                              )}
                            </button>
                          );
                        })}
                      </div>

                      {/* Explicit Custom Color / HEX Theme Trigger Button */}
                      <button
                        type="button"
                        data-testid="welcome-custom-theme-btn"
                        aria-expanded={isCustomPickerOpen}
                        title={t.customThemeHexTitle}
                        onClick={() => {
                          setIsLangDropdownOpen(false);
                          if (themeId !== 'custom') {
                            onChangeTheme('custom');
                            setIsCustomPickerOpen(true);
                          } else {
                            setIsCustomPickerOpen((prev) => !prev);
                          }
                        }}
                        className={`inline-flex h-6 items-center gap-1 rounded-full border px-2 text-[10px] font-semibold transition-colors whitespace-nowrap shrink-0 ${
                          themeId === 'custom'
                            ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text-primary)]'
                            : 'border-dashed border-[var(--border-strong)] bg-[var(--canvas)] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--text-primary)]'
                        }`}
                      >
                        {themeId === 'custom' ? (
                          <span
                            aria-hidden="true"
                            className="h-2.5 w-2.5 rounded-full border border-black/20 shrink-0"
                            style={{ backgroundColor: customThemeColor }}
                          />
                        ) : (
                          <Palette className="h-3 w-3 shrink-0 text-[var(--accent)]" />
                        )}
                        <span className="font-mono-tabular">
                          {themeId === 'custom' ? customThemeColor.toUpperCase() : 'HEX'}
                        </span>
                      </button>
                    </div>
                  </div>

                  {/* Custom Scrollable Language Picker Trigger */}
                  <div className="flex flex-col justify-between gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2.5">
                    <span className="flex items-center gap-1.5 text-[11px] font-medium text-[var(--text-muted)]">
                      <Globe className="h-3 w-3 shrink-0" />
                      <span className="truncate">{t.languageSectionTitle}</span>
                    </span>
                    <button
                      ref={langTriggerRef}
                      type="button"
                      data-testid="welcome-language-select"
                      aria-haspopup="listbox"
                      aria-expanded={isLangDropdownOpen}
                      onClick={() => {
                        setIsCustomPickerOpen(false);
                        setIsLangDropdownOpen((prev) => !prev);
                        setLangSearch('');
                      }}
                      className="flex h-8 w-full items-center justify-between gap-2 rounded-md border border-[var(--border)] bg-[var(--canvas)] px-2.5 text-xs font-medium text-[var(--text-primary)] hover:border-[var(--border-strong)] focus:border-[var(--accent)] transition-colors"
                    >
                      <span className="truncate">
                        {meta.nativeName}
                      </span>
                      <span className="flex items-center gap-1.5 shrink-0">
                        <span className="font-mono-tabular text-[10px] text-[var(--text-muted)] uppercase">
                          {meta.code}
                        </span>
                        <ChevronDown
                          className={`h-3.5 w-3.5 text-[var(--text-muted)] transition-transform ${
                            isLangDropdownOpen ? 'rotate-180' : ''
                          }`}
                        />
                      </span>
                    </button>
                  </div>
                </div>

                {/* Inline Scrollable Language List (Strictly Max 5 Rows Visible, Zero Clipping) */}
                {isLangDropdownOpen && (
                  <div
                    ref={langDropdownRef}
                    data-testid="welcome-language-dropdown"
                    className="overflow-hidden rounded-lg border border-[var(--border-strong)] bg-[var(--surface)]"
                  >
                    <div className="border-b border-[var(--border)] p-1.5">
                      <div className="relative flex items-center">
                        <Search className="pointer-events-none absolute left-2 h-3 w-3 text-[var(--text-muted)]" />
                        <input
                          type="text"
                          autoFocus
                          value={langSearch}
                          onChange={(e) => setLangSearch(e.target.value)}
                          placeholder={t.languageSearchPlaceholder}
                          aria-label={t.languageSearchPlaceholder}
                          className="h-7 w-full rounded-md border border-[var(--border)] bg-[var(--canvas)] pl-7 pr-2 text-[11px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)]"
                        />
                      </div>
                    </div>

                    {/* Strictly max 5 rows visible (5 * 28px + 8px padding = 148px) with smooth vertical scroll */}
                    <div
                      role="listbox"
                      aria-label={t.languageSectionTitle}
                      data-testid="welcome-language-listbox"
                      className="max-h-[148px] overflow-y-auto p-1"
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
                              setIsLangDropdownOpen(false);
                              setLangSearch('');
                            }}
                            className={`flex h-7 w-full items-center justify-between gap-2 rounded-md px-2.5 text-left text-xs transition-colors ${
                              selected
                                ? 'bg-[var(--accent-soft)] text-[var(--text-primary)] font-semibold'
                                : 'text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]'
                            }`}
                          >
                            <span className="truncate">
                              <span className="text-[var(--text-primary)]">
                                {item.nativeName}
                              </span>{' '}
                              <span className="text-[10px] text-[var(--text-muted)]">
                                ({item.englishName})
                              </span>
                            </span>
                            {selected && (
                              <Check className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Expandable In-App Full-Spectrum Custom Color Picker */}
                {isCustomPickerOpen && (
                  <div
                    data-testid="welcome-custom-theme-panel"
                    className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3"
                  >
                    <ColorSpectrumPicker
                      value={customThemeColor}
                      onChange={onChangeCustomThemeColor}
                      hexInputLabel={t.customThemeHexTitle}
                      hexInputTestId="welcome-custom-theme-hex"
                      compact
                      previewNode={
                        <span
                          aria-hidden="true"
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[var(--border-strong)]"
                          style={{
                            backgroundColor: customThemeColor,
                            color: getContrastingForeground(customThemeColor),
                          }}
                        >
                          <Check className="h-3.5 w-3.5" />
                        </span>
                      }
                    />
                  </div>
                )}
              </div>
            )}

            {step === 1 && (
              <div className="grid grid-cols-2 gap-2.5">
                {/* List Card */}
                <div className="flex flex-col gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
                  <div className="flex items-center gap-2">
                    <span
                      className="flex h-6 w-6 items-center justify-center rounded-md shrink-0"
                      style={{ backgroundColor: 'var(--accent-soft)', color: 'var(--accent)' }}
                    >
                      <List className="h-3.5 w-3.5" />
                    </span>
                    <span className="font-display text-xs font-semibold text-[var(--text-primary)] truncate">
                      {t.viewList}
                    </span>
                  </div>
                  <div className="flex h-12 flex-col justify-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--canvas)] px-2.5 py-2">
                    <div className="flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-full border border-[var(--accent)] shrink-0" />
                      <span className="h-1.5 flex-1 rounded-full bg-[var(--border-strong)]" />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span
                        className="h-2.5 w-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: 'var(--accent)' }}
                      />
                      <span className="h-1.5 w-2/3 rounded-full bg-[var(--border)]" />
                    </div>
                  </div>
                  <p className="text-[11px] leading-snug text-[var(--text-muted)]">
                    {t.welcomeCardListDesc}
                  </p>
                </div>

                {/* Kanban Card */}
                <div className="flex flex-col gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
                  <div className="flex items-center gap-2">
                    <span
                      className="flex h-6 w-6 items-center justify-center rounded-md shrink-0"
                      style={{ backgroundColor: 'var(--accent-soft)', color: 'var(--accent)' }}
                    >
                      <Columns3 className="h-3.5 w-3.5" />
                    </span>
                    <span className="font-display text-xs font-semibold text-[var(--text-primary)] truncate">
                      {t.viewKanban}
                    </span>
                  </div>
                  <div className="grid h-12 grid-cols-3 items-start gap-1 rounded-md border border-[var(--border)] bg-[var(--canvas)] p-2">
                    {[2, 1, 2].map((count, colIdx) => (
                      <div key={colIdx} className="space-y-1">
                        {Array.from({ length: count }).map((_, rowIdx) => (
                          <div
                            key={rowIdx}
                            className="h-3 rounded-sm border border-[var(--border)] bg-[var(--surface)]"
                          />
                        ))}
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] leading-snug text-[var(--text-muted)]">
                    {t.welcomeCardKanbanDesc}
                  </p>
                </div>

                {/* Calendar Card */}
                <div className="flex flex-col gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
                  <div className="flex items-center gap-2">
                    <span
                      className="flex h-6 w-6 items-center justify-center rounded-md shrink-0"
                      style={{ backgroundColor: 'var(--accent-soft)', color: 'var(--accent)' }}
                    >
                      <Calendar className="h-3.5 w-3.5" />
                    </span>
                    <span className="font-display text-xs font-semibold text-[var(--text-primary)] truncate">
                      {t.viewCalendar}
                    </span>
                  </div>
                  <div className="grid h-12 grid-cols-7 content-center gap-1 rounded-md border border-[var(--border)] bg-[var(--canvas)] p-2">
                    {Array.from({ length: 14 }).map((_, idx) => (
                      <span
                        key={idx}
                        className="h-2.5 rounded-[2px]"
                        style={{
                          backgroundColor:
                            idx === 4 || idx === 9 ? 'var(--accent)' : 'var(--border)',
                        }}
                      />
                    ))}
                  </div>
                  <p className="text-[11px] leading-snug text-[var(--text-muted)]">
                    {t.welcomeCardCalendarDesc}
                  </p>
                </div>

                {/* Eisenhower Matrix Card */}
                <div className="flex flex-col gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
                  <div className="flex items-center gap-2">
                    <span
                      className="flex h-6 w-6 items-center justify-center rounded-md shrink-0"
                      style={{ backgroundColor: 'var(--accent-soft)', color: 'var(--accent)' }}
                    >
                      <Grid2x2 className="h-3.5 w-3.5" />
                    </span>
                    <span className="font-display text-xs font-semibold text-[var(--text-primary)] truncate">
                      {t.viewMatrix}
                    </span>
                  </div>
                  <div className="grid h-12 grid-cols-2 content-center gap-1 rounded-md border border-[var(--border)] bg-[var(--canvas)] p-1.5">
                    {(['I', 'II', 'III', 'IV'] as const).map((quad, idx) => (
                      <div
                        key={quad}
                        className="flex h-4 items-center justify-center rounded-sm border border-[var(--border)] font-mono-tabular text-[9px] font-semibold"
                        style={{
                          backgroundColor:
                            idx === 0 ? 'var(--accent-soft)' : 'var(--surface)',
                          color: idx === 0 ? 'var(--accent)' : 'var(--text-muted)',
                        }}
                      >
                        {quad}
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] leading-snug text-[var(--text-muted)]">
                    {t.welcomeCardMatrixDesc}
                  </p>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-3">
                {/* Realistic Task Card Anatomy Preview */}
                <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3.5">
                  <div className="flex items-start gap-2.5">
                    <span
                      className="mt-0.5 flex h-4 w-4 items-center justify-center rounded-full shrink-0"
                      style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-fg)' }}
                    >
                      <Check className="h-2.5 w-2.5" />
                    </span>
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-display text-xs font-semibold text-[var(--text-primary)] truncate">
                          Agendamea · {t.today}
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-md bg-[var(--accent-soft)] px-1.5 py-0.5 font-mono-tabular text-[10px] font-medium text-[var(--accent)] shrink-0">
                          <Clock className="h-2.5 w-2.5" />
                          <span>14:30</span>
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--canvas)] px-2 py-0.5 text-[10px] font-medium text-[var(--text-secondary)]">
                          <Calendar className="h-2.5 w-2.5 text-[var(--text-muted)]" />
                          <span>{t.today}</span>
                        </span>
                        <span className="inline-flex items-center gap-0.5 rounded-md border border-[var(--border)] bg-[var(--canvas)] px-2 py-0.5 text-[10px] font-medium text-[var(--text-secondary)]">
                          <Hash className="h-2.5 w-2.5 text-[var(--accent)]" />
                          <span>{t.important.toLowerCase()}</span>
                        </span>
                        <span className="inline-flex items-center gap-0.5 rounded-md border border-[var(--border)] bg-[var(--canvas)] px-2 py-0.5 text-[10px] font-medium text-[var(--text-secondary)]">
                          <Hash className="h-2.5 w-2.5 text-[var(--accent)]" />
                          <span>{t.priorityHigh.toLowerCase()}</span>
                        </span>
                        <span className="ms-auto font-mono-tabular text-[10px] text-[var(--text-muted)]">
                          2 / 3 {t.subtaskCountUnit}
                        </span>
                      </div>

                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-subtle)]">
                        <div
                          className="h-full w-2/3 rounded-full"
                          style={{ backgroundColor: 'var(--accent)' }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Keyboard Shortcuts Strip */}
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { keycap: 'N', label: t.shortcutNewTask },
                    { keycap: 'Ctrl+K', label: t.shortcutSearch },
                    { keycap: 'Alt+↑/↓', label: t.shortcutReorder },
                  ].map((item) => (
                    <div
                      key={item.keycap}
                      className="flex flex-col items-center justify-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-2.5 text-center"
                    >
                      <kbd className="inline-flex items-center gap-1 rounded-md border border-[var(--border-strong)] bg-[var(--canvas)] px-2 py-0.5 font-mono-tabular text-[11px] font-semibold text-[var(--text-primary)] shadow-2xs whitespace-nowrap">
                        <Keyboard className="h-2.5 w-2.5 text-[var(--text-muted)] shrink-0" />
                        <span>{item.keycap}</span>
                      </kbd>
                      <span className="line-clamp-2 text-[10px] leading-tight text-[var(--text-muted)]">
                        {item.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-2.5">
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
                        className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--canvas)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors whitespace-nowrap shrink-0 self-center"
                      >
                        <span>{t.settings}</span>
                        <ChevronRight className="h-3 w-3 rtl:rotate-180 shrink-0" />
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
                  <div
                    key={title}
                    className="flex items-start gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5"
                  >
                    <span
                      className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg shrink-0"
                      style={{ backgroundColor: 'var(--accent-soft)', color: 'var(--accent)' }}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-display text-xs font-semibold text-[var(--text-primary)]">
                        {title}
                      </p>
                      <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--text-muted)]">
                        {desc}
                      </p>
                    </div>
                    {action}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Slide Title & Description */}
          <div className="space-y-1.5">
            <h2
              id="welcome-modal-title"
              className="font-display text-lg font-semibold tracking-tight text-[var(--text-primary)]"
            >
              {slideCopy.title}
            </h2>
            <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
              {slideCopy.desc}
            </p>
          </div>
        </div>

        {/* Fixed Single-Line Footer Navigation */}
        <div className="flex items-center justify-between gap-3 border-t border-[var(--border)] bg-[var(--canvas)] px-5 py-3.5 shrink-0">
          {/* Interactive Step Indicators */}
          <div className="flex items-center gap-1.5" role="tablist" aria-label="Agendamea">
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
                  className={`h-2 rounded-full ${active ? 'w-6' : 'w-2 hover:opacity-80'}`}
                  style={{
                    backgroundColor: active ? 'var(--accent)' : 'var(--border-strong)',
                  }}
                />
              );
            })}
          </div>

          {/* Action Buttons (Always Single Line, High Contrast & Unselectable) */}
          <div className="flex items-center gap-2 shrink-0 flex-nowrap">
            {!isFirst && (
              <button
                type="button"
                data-testid="welcome-step-back"
                onClick={() => setStep((prev) => Math.max(0, prev - 1))}
                className="inline-flex select-none items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors whitespace-nowrap shrink-0"
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
                className="inline-flex select-none items-center gap-1.5 rounded-lg border border-transparent px-4 py-1.5 font-display text-xs font-semibold transition-opacity hover:opacity-90 whitespace-nowrap shrink-0"
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
                className="inline-flex select-none items-center gap-1 rounded-lg border border-transparent px-4 py-1.5 font-display text-xs font-semibold transition-opacity hover:opacity-90 whitespace-nowrap shrink-0"
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
