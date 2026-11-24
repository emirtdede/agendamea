import {
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Monitor,
  Moon,
  Pipette,
  RotateCcw,
  Sparkles,
  Star,
  Sun,
  Type,
} from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { useI18n } from '../../i18n/I18nContext';
import type { AppIconId, FontFamilyPreset, ListDensity, ThemeId, ThemeMode } from '../../types';
import {
  COLOR_THEMES,
  getContrastingForeground,
  normalizeHexColor,
  resolveAppIconColors,
  resolveEffectiveThemeMode,
} from '../../utils/themes';
import { BrandMark } from '../BrandMark';

interface AppearanceSettingsTabProps {
  themeMode: ThemeMode;
  themeId: ThemeId;
  customThemeColor: string;
  recentCustomColors: string[];
  appIconId: AppIconId;
  customIconColor: string;
  listDensity: ListDensity;
  fontFamily: FontFamilyPreset;
  onChangeMode: (mode: ThemeMode) => void;
  onChangeTheme: (id: ThemeId) => void;
  onChangeCustomThemeColor: (hex: string) => void;
  onChangeAppIcon: (id: AppIconId) => void;
  onChangeCustomIconColor: (hex: string) => void;
  onChangeListDensity: (density: ListDensity) => void;
  onChangeFontFamily: (font: FontFamilyPreset) => void;
  onResetAppearance: () => void;
}

export const AppearanceSettingsTab = React.memo(function AppearanceSettingsTab({
  themeMode,
  themeId,
  customThemeColor,
  recentCustomColors,
  appIconId,
  customIconColor,
  listDensity,
  fontFamily,
  onChangeMode,
  onChangeTheme,
  onChangeCustomThemeColor,
  onChangeAppIcon,
  onChangeCustomIconColor,
  onChangeListDensity,
  onChangeFontFamily,
  onResetAppearance,
}: AppearanceSettingsTabProps) {
  const { t } = useI18n();
  const [customThemeHexInput, setCustomThemeHexInput] = useState(customThemeColor);
  const [customIconHexInput, setCustomIconHexInput] = useState(customIconColor);
  const [iconsExpanded, setIconsExpanded] = useState(true);
  const [copiedHex, setCopiedHex] = useState<'theme' | 'icon' | null>(null);
  const copyTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setCustomThemeHexInput(customThemeColor);
  }, [customThemeColor]);

  useEffect(() => {
    setCustomIconHexInput(customIconColor);
  }, [customIconColor]);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
    };
  }, []);

  const effectiveMode = resolveEffectiveThemeMode(themeMode);

  const handleCopyHex = async (kind: 'theme' | 'icon', value: string) => {
    const clean = (normalizeHexColor(value) ?? value).toUpperCase();
    try {
      await navigator.clipboard.writeText(clean);
      setCopiedHex(kind);
      if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
      copyTimerRef.current = window.setTimeout(() => {
        setCopiedHex(null);
        copyTimerRef.current = null;
      }, 1500);
    } catch {
      // Ignore clipboard restriction
    }
  };

  const themeNames: Record<ThemeId, string> = {
    obsidian: t.colorObsidian,
    slate: t.colorSlate,
    navy: t.colorNavy,
    blue: t.colorBlue,
    cyan: t.colorCyan,
    indigo: t.colorIndigo,
    purple: t.colorPurple,
    pink: t.colorPink,
    red: t.colorRed,
    orange: t.colorOrange,
    yellow: t.colorYellow,
    emerald: t.colorEmerald,
    grass: t.colorGrass,
    lime: t.colorLime,
    custom: t.customThemeButton,
  };

  const iconChoices: Array<{ id: AppIconId; label: string; bg: string; fg: string }> = [
    {
      id: 'match-theme',
      label: t.appIconMatchTheme,
      ...resolveAppIconColors('match-theme', themeId, themeMode, customThemeColor, customIconColor),
    },
    { id: 'obsidian', label: t.appIconDarkMono, bg: '#111114', fg: '#fafafa' },
    { id: 'obsidian-light', label: t.appIconLightMono, bg: '#fafafa', fg: '#111114' },
    ...COLOR_THEMES.filter((ct) => ct.id !== 'obsidian').map((ct) => ({
      id: ct.id as AppIconId,
      label: themeNames[ct.id],
      bg: ct.swatch,
      fg: getContrastingForeground(ct.swatch),
    })),
    {
      id: 'custom',
      label: t.appIconCustom,
      bg: normalizeHexColor(customIconColor) ?? '#2563eb',
      fg: getContrastingForeground(normalizeHexColor(customIconColor) ?? '#2563eb'),
    },
  ];

  const previewPadding =
    listDensity === 'compact' ? 'py-1.5' : listDensity === 'spacious' ? 'py-3.5' : 'py-2.5';

  return (
    <div className="space-y-8">
      {/* Live Mini Task Preview */}
      <section
        aria-label={t.appearancePreviewTitle}
        data-testid="appearance-live-preview"
        className="rounded-xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden"
      >
        <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-2">
          <span className="text-[11px] font-semibold text-[var(--text-muted)]">
            {t.appearancePreviewTitle}
          </span>
          <button
            type="button"
            data-testid="appearance-reset-btn"
            onClick={onResetAppearance}
            className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--canvas)] px-2 py-0.5 text-[11px] font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] transition-colors"
          >
            <RotateCcw className="h-3 w-3" />
            <span>{t.resetTabDefaultsButton}</span>
          </button>
        </div>
        <div className="divide-y divide-[var(--border)]">
          <div className={`flex items-center justify-between gap-3 px-4 ${previewPadding}`}>
            <div className="flex items-center gap-2.5 min-w-0">
              <span
                className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border"
                style={{ borderColor: 'var(--border-strong)' }}
              />
              <div className="min-w-0">
                <p className="text-sm font-medium text-[var(--text-primary)] truncate">
                  {t.appearancePreviewTaskActive}
                </p>
                <p className="text-[11px] text-[var(--accent)] font-medium">
                  {t.today} · 14:30 · #design
                </p>
              </div>
            </div>
            <Star className="h-3.5 w-3.5 text-amber-500 fill-current shrink-0" />
          </div>
          <div className={`flex items-center gap-2.5 px-4 ${previewPadding}`}>
            <span
              className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full"
              style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-fg)' }}
            >
              <Check className="h-2.5 w-2.5 stroke-[3]" />
            </span>
            <p className="text-sm line-through text-[var(--text-muted)] truncate">
              {t.appearancePreviewTaskDone}
            </p>
          </div>
        </div>
      </section>

      {/* Light / Dark / System Mode */}
      <section aria-label={t.appearanceModeTitle} data-setting-id="appearance-mode">
        <div className="mb-3">
          <h3 className="font-display text-xs font-semibold text-[var(--text-muted)]">
            {t.appearanceModeTitle}
          </h3>
        </div>
        <div className="grid grid-cols-3 gap-2.5">
          {(
            [
              ['light', Sun, t.lightMode],
              ['dark', Moon, t.darkMode],
              ['system', Monitor, t.systemMode],
            ] as const
          ).map(([mode, Icon, label]) => {
            const active = themeMode === mode;
            return (
              <button
                key={mode}
                type="button"
                onClick={() => onChangeMode(mode)}
                aria-pressed={active}
                className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors ${
                  active
                    ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text-primary)]'
                    : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{label}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* List Density & Font Family */}
      <section
        aria-label={t.appearanceTypographyTitle}
        data-setting-id="appearance-density-font"
        className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 space-y-4"
      >
        <div className="flex items-center gap-2">
          <Type className="h-4 w-4 text-[var(--accent)]" />
          <h3 className="font-display text-xs font-semibold text-[var(--text-primary)]">
            {t.appearanceTypographyTitle}
          </h3>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium text-[var(--text-secondary)]">
            {t.appearanceDensityLabel}
          </p>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                ['compact', t.appearanceDensityCompact],
                ['comfortable', t.appearanceDensityComfortable],
                ['spacious', t.appearanceDensitySpacious],
              ] as const
            ).map(([densityId, label]) => (
              <button
                key={densityId}
                type="button"
                data-testid={`density-${densityId}`}
                aria-pressed={listDensity === densityId}
                onClick={() => onChangeListDensity(densityId)}
                className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                  listDensity === densityId
                    ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text-primary)]'
                    : 'border-[var(--border)] bg-[var(--canvas)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2 border-t border-[var(--border)] pt-3">
          <p className="text-xs font-medium text-[var(--text-secondary)]">
            {t.appearanceFontLabel}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {(
              [
                ['system', t.appearanceFontSystem],
                ['sans', t.appearanceFontSans],
                ['mono', t.appearanceFontMono],
                ['dyslexic', t.appearanceFontDyslexic],
              ] as const
            ).map(([fontId, label]) => (
              <button
                key={fontId}
                type="button"
                data-testid={`font-${fontId}`}
                aria-pressed={fontFamily === fontId}
                onClick={() => onChangeFontFamily(fontId)}
                className={`rounded-lg border px-2.5 py-2 text-xs font-medium transition-colors ${
                  fontFamily === fontId
                    ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text-primary)]'
                    : 'border-[var(--border)] bg-[var(--canvas)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Color Theme Palette */}
      <section aria-label={t.colorThemeTitle} data-setting-id="appearance-theme">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="font-display text-xs font-semibold text-[var(--text-muted)]">
            {t.colorThemeTitle}
          </h3>
          <span className="font-mono-tabular text-[11px] text-[var(--text-muted)]">
            {COLOR_THEMES.length + 1} · {t.customThemeButton}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          {COLOR_THEMES.map((theme) => {
            const active = themeId === theme.id;
            const swatch = effectiveMode === 'dark' ? theme.swatchDark : theme.swatch;
            return (
              <button
                key={theme.id}
                type="button"
                onClick={() => onChangeTheme(theme.id)}
                aria-pressed={active}
                className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-start transition-colors ${
                  active
                    ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                    : 'border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-hover)]'
                }`}
              >
                <span className="flex items-center gap-2 min-w-0">
                  <span
                    className="h-4 w-4 rounded-full shrink-0 border border-black/15 dark:border-white/20"
                    style={{ backgroundColor: swatch }}
                  />
                  <span className="truncate text-xs font-medium text-[var(--text-primary)]">
                    {themeNames[theme.id]}
                  </span>
                </span>
                {active && <Check className="h-3.5 w-3.5 text-[var(--accent)] shrink-0" />}
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => onChangeTheme('custom')}
            aria-pressed={themeId === 'custom'}
            className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-start transition-colors ${
              themeId === 'custom'
                ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                : 'border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-hover)]'
            }`}
          >
            <span className="flex items-center gap-2 min-w-0">
              <span
                className="flex h-4 w-4 items-center justify-center rounded-full shrink-0 border border-black/15 dark:border-white/20"
                style={{ backgroundColor: customThemeColor }}
              >
                <Sparkles
                  className="h-2.5 w-2.5"
                  style={{ color: getContrastingForeground(customThemeColor) }}
                />
              </span>
              <span className="truncate text-xs font-medium text-[var(--text-primary)]">
                {t.customThemeButton}
              </span>
            </span>
            {themeId === 'custom' && (
              <Check className="h-3.5 w-3.5 text-[var(--accent)] shrink-0" />
            )}
          </button>
        </div>

        {/* Custom HEX Theme Creator + Recent Swatches */}
        <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-[var(--text-primary)]">
                {t.customThemeHexTitle}
              </p>
              <p className="mt-0.5 text-xs text-[var(--text-muted)]">{t.customThemeHexHint}</p>
            </div>
            <div className="flex items-center gap-2">
              <label className="relative flex h-9 w-9 cursor-pointer items-center justify-center overflow-hidden rounded-lg border border-[var(--border-strong)] shadow-xs">
                <input
                  type="color"
                  aria-label={t.selectColorLabel}
                  value={normalizeHexColor(customThemeColor) ?? '#2563eb'}
                  onChange={(e) => {
                    const hex = e.target.value;
                    setCustomThemeHexInput(hex);
                    onChangeCustomThemeColor(hex);
                  }}
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                />
                <span
                  className="flex h-full w-full items-center justify-center"
                  style={{ backgroundColor: customThemeColor }}
                >
                  <Pipette
                    className="h-3.5 w-3.5"
                    style={{ color: getContrastingForeground(customThemeColor) }}
                  />
                </span>
              </label>

              <input
                type="text"
                value={customThemeHexInput}
                onChange={(e) => {
                  const val = e.target.value;
                  setCustomThemeHexInput(val);
                  const norm = normalizeHexColor(val);
                  if (norm) onChangeCustomThemeColor(norm);
                }}
                onBlur={() => {
                  const norm = normalizeHexColor(customThemeHexInput);
                  if (norm) {
                    setCustomThemeHexInput(norm);
                    onChangeCustomThemeColor(norm);
                  } else {
                    setCustomThemeHexInput(customThemeColor);
                  }
                }}
                placeholder="#2563eb"
                aria-label={t.customColorHexLabel}
                maxLength={7}
                className="font-mono-tabular w-24 rounded-lg border border-[var(--border)] bg-[var(--canvas)] px-2.5 py-1.5 text-xs uppercase text-[var(--text-primary)] focus:border-[var(--accent)]"
              />

              <button
                type="button"
                data-testid="copy-theme-hex-btn"
                onClick={() => void handleCopyHex('theme', customThemeColor)}
                aria-label={t.docsCopyButton}
                title={t.docsCopyButton}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--canvas)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] transition-colors"
              >
                {copiedHex === 'theme' ? (
                  <Check className="h-3.5 w-3.5 text-emerald-500" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
          </div>

          {recentCustomColors.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border)] pt-2.5">
              <span className="text-[11px] font-medium text-[var(--text-muted)]">
                {t.appearanceRecentColorsLabel}:
              </span>
              {recentCustomColors.map((hex) => (
                <button
                  key={hex}
                  type="button"
                  onClick={() => {
                    setCustomThemeHexInput(hex);
                    onChangeCustomThemeColor(hex);
                  }}
                  title={hex.toUpperCase()}
                  aria-label={hex.toUpperCase()}
                  className="h-6 w-6 rounded-full border border-black/20 dark:border-white/25 transition-transform hover:scale-110"
                  style={{ backgroundColor: hex }}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* App Icon Customization */}
      <section aria-label={t.appIconSectionTitle} data-setting-id="appearance-icon">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            aria-expanded={iconsExpanded}
            onClick={() => setIconsExpanded((prev) => !prev)}
            className="flex items-start gap-2 text-start group"
          >
            {iconsExpanded ? (
              <ChevronDown className="mt-0.5 h-3.5 w-3.5 text-[var(--text-muted)]" />
            ) : (
              <ChevronRight className="mt-0.5 h-3.5 w-3.5 text-[var(--text-muted)]" />
            )}
            <div>
              <h3 className="font-display text-xs font-semibold text-[var(--text-muted)] group-hover:text-[var(--text-primary)] transition-colors">
                {t.appIconSectionTitle}
              </h3>
              <p className="mt-0.5 text-xs text-[var(--text-muted)]">{t.appIconSectionDesc}</p>
            </div>
          </button>
          <div className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5">
            <BrandMark className="h-6 w-6" />
            <span className="font-mono-tabular text-[11px] font-medium text-[var(--text-secondary)]">
              Agendamea
            </span>
          </div>
        </div>

        {iconsExpanded && (
          <>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
              {iconChoices.map((choice) => {
                const active = appIconId === choice.id;
                return (
                  <button
                    key={choice.id}
                    type="button"
                    onClick={() => onChangeAppIcon(choice.id)}
                    aria-pressed={active}
                    className={`flex flex-col items-center gap-2 rounded-xl border px-2 py-2.5 text-center transition-colors ${
                      active
                        ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                        : 'border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-hover)]'
                    }`}
                  >
                    <BrandMark className="h-8 w-8" bgColor={choice.bg} fgColor={choice.fg} />
                    <span className="w-full truncate text-[11px] font-medium text-[var(--text-primary)]">
                      {choice.label}
                    </span>
                  </button>
                );
              })}
            </div>

            {appIconId === 'custom' && (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3.5">
                <span className="text-xs font-medium text-[var(--text-secondary)]">
                  {t.customColorHexLabel}
                </span>
                <div className="flex items-center gap-2">
                  <label className="relative flex h-8 w-8 cursor-pointer items-center justify-center overflow-hidden rounded-lg border border-[var(--border-strong)]">
                    <input
                      type="color"
                      aria-label={t.customColorHexLabel}
                      value={normalizeHexColor(customIconColor) ?? '#2563eb'}
                      onChange={(e) => {
                        const hex = e.target.value;
                        setCustomIconHexInput(hex);
                        onChangeCustomIconColor(hex);
                      }}
                      className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                    />
                    <span className="h-full w-full" style={{ backgroundColor: customIconColor }} />
                  </label>
                  <input
                    type="text"
                    value={customIconHexInput}
                    onChange={(e) => {
                      const val = e.target.value;
                      setCustomIconHexInput(val);
                      const norm = normalizeHexColor(val);
                      if (norm) onChangeCustomIconColor(norm);
                    }}
                    onBlur={() => {
                      const norm = normalizeHexColor(customIconHexInput);
                      if (norm) {
                        setCustomIconHexInput(norm);
                        onChangeCustomIconColor(norm);
                      } else {
                        setCustomIconHexInput(customIconColor);
                      }
                    }}
                    aria-label={t.customColorHexLabel}
                    maxLength={7}
                    className="font-mono-tabular w-24 rounded-lg border border-[var(--border)] bg-[var(--canvas)] px-2.5 py-1 text-xs uppercase text-[var(--text-primary)] focus:border-[var(--accent)]"
                  />
                  <button
                    type="button"
                    data-testid="copy-icon-hex-btn"
                    onClick={() => void handleCopyHex('icon', customIconColor)}
                    aria-label={t.docsCopyButton}
                    title={t.docsCopyButton}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--canvas)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] transition-colors"
                  >
                    {copiedHex === 'icon' ? (
                      <Check className="h-3.5 w-3.5 text-emerald-500" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
});
