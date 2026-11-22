import React, { useState } from 'react';
import { Check, ChevronDown, Copy, Monitor, Moon, Palette, Sun } from 'lucide-react';
import { useI18n } from '../../i18n/I18nContext';
import type { AppIconId, ThemeId, ThemeMode } from '../../types';
import {
  COLOR_THEMES,
  resolveAppIconColors,
  resolveEffectiveThemeMode,
} from '../../utils/themes';
import { BrandMark } from '../BrandMark';
import { ColorSpectrumPicker } from '../ColorSpectrumPicker';

export interface AppearanceSettingsTabProps {
  themeMode: ThemeMode;
  themeId: ThemeId;
  customThemeColor: string;
  appIconId: AppIconId;
  customIconColor: string;
  onChangeMode: (mode: ThemeMode) => void;
  onChangeTheme: (id: ThemeId) => void;
  onChangeCustomThemeColor: (hex: string) => void;
  onChangeAppIcon: (id: AppIconId) => void;
  onChangeCustomIconColor: (hex: string) => void;
}

export const AppearanceSettingsTab = React.memo(function AppearanceSettingsTab({
  themeMode,
  themeId,
  customThemeColor,
  appIconId,
  customIconColor,
  onChangeMode,
  onChangeTheme,
  onChangeCustomThemeColor,
  onChangeAppIcon,
  onChangeCustomIconColor,
}: AppearanceSettingsTabProps) {
  const { t, getThemeDisplayName } = useI18n();
  const [isAppIconOpen, setIsAppIconOpen] = useState(true);
  const [copiedHexTarget, setCopiedHexTarget] = useState<'theme' | 'icon' | null>(null);

  const effectiveMode = resolveEffectiveThemeMode(themeMode);
  const activeThemeItem = COLOR_THEMES.find((item) => item.id === themeId);
  const activeThemeHex = (
    themeId === 'custom'
      ? customThemeColor
      : effectiveMode === 'dark'
        ? activeThemeItem?.swatchDark ?? '#fafafa'
        : activeThemeItem?.swatch ?? '#18181b'
  ).toUpperCase();

  const activeIconColors = resolveAppIconColors(
    appIconId,
    themeId,
    themeMode,
    customThemeColor,
    customIconColor,
  );
  const activeIconHex = activeIconColors.bg.toUpperCase();

  const handleCopyHex = async (target: 'theme' | 'icon', hex: string) => {
    try {
      await navigator.clipboard.writeText(hex);
      setCopiedHexTarget(target);
      window.setTimeout(() => {
        setCopiedHexTarget((prev) => (prev === target ? null : prev));
      }, 1800);
    } catch {
      // Ignore clipboard restrictions
    }
  };
  const activeIconLabel =
    appIconId === 'match-theme'
      ? t.appIconMatchTheme
      : appIconId === 'obsidian'
        ? t.appIconDarkMono
        : appIconId === 'obsidian-light'
          ? t.appIconLightMono
          : appIconId === 'custom'
            ? `${t.appIconCustom} (${customIconColor.toUpperCase()})`
            : (() => {
                const matched = COLOR_THEMES.find((item) => item.id === appIconId);
                return matched
                  ? getThemeDisplayName(matched.id, matched.name)
                  : t.appIconMatchTheme;
              })();

  return (
    <>
      {/* Appearance Mode (Light / Dark / System Auto-Follow) */}
      <section aria-label={t.appearanceModeTitle} className="space-y-2.5">
        <h3 className="font-display text-xs font-semibold text-[var(--text-muted)]">
          {t.appearanceModeTitle}
        </h3>
        <div className="grid grid-cols-3 gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1.5">
          <button
            type="button"
            data-testid="theme-mode-light"
            onClick={() => onChangeMode('light')}
            aria-pressed={themeMode === 'light'}
            className={`flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium transition-colors whitespace-nowrap ${
              themeMode === 'light'
                ? 'bg-[var(--accent-soft)] text-[var(--text-primary)] border border-[var(--accent)]/40'
                : 'text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Sun className="h-4 w-4" />
            <span>{t.lightMode}</span>
          </button>
          <button
            type="button"
            data-testid="theme-mode-dark"
            onClick={() => onChangeMode('dark')}
            aria-pressed={themeMode === 'dark'}
            className={`flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium transition-colors whitespace-nowrap ${
              themeMode === 'dark'
                ? 'bg-[var(--accent-soft)] text-[var(--text-primary)] border border-[var(--accent)]/40'
                : 'text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Moon className="h-4 w-4" />
            <span>{t.darkMode}</span>
          </button>
          <button
            type="button"
            data-testid="theme-mode-system"
            onClick={() => onChangeMode('system')}
            aria-pressed={themeMode === 'system'}
            className={`flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium transition-colors whitespace-nowrap ${
              themeMode === 'system'
                ? 'bg-[var(--accent-soft)] text-[var(--text-primary)] border border-[var(--accent)]/40'
                : 'text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Monitor className="h-4 w-4" />
            <span>{t.systemMode}</span>
          </button>
        </div>
      </section>

      {/* 14 Built-in Color Themes + Custom HEX Theme */}
      <section aria-label={t.colorThemeTitle} className="space-y-2.5">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-xs font-semibold text-[var(--text-muted)]">
            {t.colorThemeTitle}
          </h3>
          <button
            type="button"
            data-testid="copy-theme-hex-btn"
            onClick={() => void handleCopyHex('theme', activeThemeHex)}
            title={`${t.docsCopyButton}: ${activeThemeHex}`}
            className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 font-mono-tabular text-xs text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
          >
            {copiedHexTarget === 'theme' ? (
              <>
                <Check className="h-3 w-3 text-emerald-500" />
                <span className="text-emerald-500 font-sans text-[11px] font-medium">
                  {t.docsCopiedLabel}
                </span>
              </>
            ) : (
              <>
                <span>{activeThemeHex}</span>
                <Copy className="h-3 w-3 opacity-65" />
              </>
            )}
          </button>
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 space-y-3.5">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {COLOR_THEMES.map((theme) => {
              const isSelected = theme.id === themeId;
              const effectiveMode = resolveEffectiveThemeMode(themeMode);
              const swatch = effectiveMode === 'dark' ? theme.swatchDark : theme.swatch;
              return (
                <button
                  key={theme.id}
                  type="button"
                  onClick={() => onChangeTheme(theme.id)}
                  aria-pressed={isSelected}
                  className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-[13px] font-medium transition-colors ${
                    isSelected
                      ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text-primary)]'
                      : 'border-[var(--border)] bg-[var(--canvas)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <span
                      aria-hidden="true"
                      className="h-3.5 w-3.5 shrink-0 rounded-full border border-black/15"
                      style={{ backgroundColor: swatch }}
                    />
                    <span className="truncate whitespace-nowrap">
                      {getThemeDisplayName(theme.id, theme.name)}
                    </span>
                  </span>
                  {isSelected && <Check className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />}
                </button>
              );
            })}

            {/* Custom HEX Color Theme Slot */}
            <button
              type="button"
              data-testid="custom-theme-button"
              onClick={() => onChangeTheme('custom')}
              aria-pressed={themeId === 'custom'}
              className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-[13px] font-medium transition-colors ${
                themeId === 'custom'
                  ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text-primary)]'
                  : 'border-dashed border-[var(--border-strong)] bg-[var(--canvas)] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]'
              }`}
            >
              <span className="flex items-center gap-2 min-w-0">
                {themeId === 'custom' ? (
                  <span
                    aria-hidden="true"
                    className="h-3.5 w-3.5 shrink-0 rounded-full border border-black/15"
                    style={{ backgroundColor: customThemeColor }}
                  />
                ) : (
                  <span
                    aria-hidden="true"
                    className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[var(--accent)]"
                  >
                    <Palette className="h-3.5 w-3.5" />
                  </span>
                )}
                <span className="truncate whitespace-nowrap">
                  {themeId === 'custom' ? customThemeColor.toUpperCase() : t.customThemeButton}
                </span>
              </span>
              {themeId === 'custom' && (
                <Check className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />
              )}
            </button>
          </div>

          {themeId === 'custom' && (
            <div
              data-testid="custom-theme-editor"
              className="animate-tab-enter rounded-xl border border-[var(--border)] bg-[var(--canvas)] p-3.5 space-y-2.5"
            >
              <div className="min-w-0">
                <p className="text-xs font-semibold text-[var(--text-primary)]">
                  {t.customThemeHexTitle}
                </p>
                <p className="text-[11px] text-[var(--text-muted)]">{t.customThemeHexHint}</p>
              </div>
              <ColorSpectrumPicker
                value={customThemeColor}
                onChange={onChangeCustomThemeColor}
                hexInputLabel={t.customColorHexLabel}
                hexInputTestId="custom-theme-hex-input"
              />
            </div>
          )}
        </div>
      </section>

      {/* Unified Dynamic System-Wide App Icon Selector (Expanded by Default) */}
      <section aria-label={t.appIconSectionTitle} className="space-y-2.5">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-xs font-semibold text-[var(--text-muted)]">
            {t.appIconSectionTitle}
          </h3>
          <button
            type="button"
            data-testid="copy-icon-hex-btn"
            onClick={() => void handleCopyHex('icon', activeIconHex)}
            title={`${t.docsCopyButton}: ${activeIconHex}`}
            className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 font-mono-tabular text-xs text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
          >
            {copiedHexTarget === 'icon' ? (
              <>
                <Check className="h-3 w-3 text-emerald-500" />
                <span className="text-emerald-500 font-sans text-[11px] font-medium">
                  {t.docsCopiedLabel}
                </span>
              </>
            ) : (
              <>
                <span>{activeIconHex}</span>
                <Copy className="h-3 w-3 opacity-65" />
              </>
            )}
          </button>
        </div>

        <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
          <button
            type="button"
            data-testid="app-icon-toggle-btn"
            onClick={() => setIsAppIconOpen((prev) => !prev)}
            aria-expanded={isAppIconOpen}
            className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-[var(--surface-hover)]/60 transition-colors"
          >
            <div className="flex items-center gap-3 min-w-0">
              <BrandMark
                className="h-8 w-8 shrink-0"
                bgColor={activeIconColors.bg}
                fgColor={activeIconColors.fg}
                borderColor={activeIconColors.border}
              />
              <div className="min-w-0">
                <p className="text-sm font-medium text-[var(--text-primary)] truncate">
                  {activeIconLabel}
                </p>
                <p className="text-xs text-[var(--text-muted)] truncate">{t.appIconSectionDesc}</p>
              </div>
            </div>
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--canvas)] text-[var(--text-secondary)] shrink-0">
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform ${isAppIconOpen ? 'rotate-180' : ''}`}
              />
            </span>
          </button>

          {isAppIconOpen && (
            <div
              data-testid="app-icon-panel"
              className="animate-tab-enter border-t border-[var(--border)] bg-[var(--surface)] p-4 space-y-3.5"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {(
                  [
                    { id: 'match-theme' as AppIconId, label: t.appIconMatchTheme },
                    { id: 'obsidian-light' as AppIconId, label: t.appIconLightMono },
                  ] as const
                ).map((opt) => {
                  const selected = appIconId === opt.id;
                  const previewColors = resolveAppIconColors(
                    opt.id,
                    themeId,
                    themeMode,
                    customThemeColor,
                    customIconColor,
                  );
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      data-testid={`app-icon-${opt.id}`}
                      aria-pressed={selected}
                      onClick={() => onChangeAppIcon(opt.id)}
                      className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-[13px] font-medium transition-colors ${
                        selected
                          ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text-primary)]'
                          : 'border-[var(--border)] bg-[var(--canvas)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <BrandMark
                          className="h-4 w-4 rounded-[5px] shrink-0"
                          bgColor={previewColors.bg}
                          fgColor={previewColors.fg}
                          borderColor={previewColors.border}
                        />
                        <span className="truncate whitespace-nowrap">{opt.label}</span>
                      </span>
                      {selected && <Check className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />}
                    </button>
                  );
                })}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {COLOR_THEMES.map((item) => {
                  const selected = appIconId === item.id;
                  const previewColors = resolveAppIconColors(
                    item.id,
                    themeId,
                    themeMode,
                    customThemeColor,
                    customIconColor,
                  );
                  const label = getThemeDisplayName(item.id, item.name);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      data-testid={`app-icon-${item.id}`}
                      aria-pressed={selected}
                      onClick={() => onChangeAppIcon(item.id)}
                      className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-[13px] font-medium transition-colors ${
                        selected
                          ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text-primary)]'
                          : 'border-[var(--border)] bg-[var(--canvas)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <BrandMark
                          className="h-4 w-4 rounded-[5px] shrink-0"
                          bgColor={previewColors.bg}
                          fgColor={previewColors.fg}
                          borderColor={previewColors.border}
                        />
                        <span className="truncate whitespace-nowrap">{label}</span>
                      </span>
                      {selected && <Check className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />}
                    </button>
                  );
                })}

                <button
                  type="button"
                  data-testid="app-icon-custom"
                  aria-pressed={appIconId === 'custom'}
                  onClick={() => onChangeAppIcon('custom')}
                  className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-[13px] font-medium transition-colors ${
                    appIconId === 'custom'
                      ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text-primary)]'
                      : 'border-dashed border-[var(--border-strong)] bg-[var(--canvas)] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <span className="flex items-center gap-2 min-w-0">
                    {appIconId === 'custom' ? (
                      <BrandMark
                        className="h-4 w-4 rounded-[5px] shrink-0"
                        bgColor={activeIconColors.bg}
                        fgColor={activeIconColors.fg}
                        borderColor={activeIconColors.border}
                      />
                    ) : (
                      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[var(--accent)]">
                        <Palette className="h-3.5 w-3.5" />
                      </span>
                    )}
                    <span className="truncate whitespace-nowrap">
                      {appIconId === 'custom' ? customIconColor.toUpperCase() : t.appIconCustom}
                    </span>
                  </span>
                  {appIconId === 'custom' && (
                    <Check className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />
                  )}
                </button>
              </div>

              {appIconId === 'custom' && (
                <div
                  data-testid="custom-icon-editor"
                  className="animate-tab-enter rounded-xl border border-[var(--border)] bg-[var(--canvas)] p-3.5 space-y-2.5"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-[var(--text-primary)]">
                      {t.appIconCustom} (HEX)
                    </p>
                    <p className="text-[11px] text-[var(--text-muted)]">{t.customThemeHexHint}</p>
                  </div>
                  <ColorSpectrumPicker
                    value={customIconColor}
                    onChange={onChangeCustomIconColor}
                    hexInputLabel={`${t.appIconCustom} (HEX)`}
                    hexInputTestId="custom-icon-hex-input"
                    previewNode={
                      <BrandMark
                        className="h-8 w-8 shrink-0"
                        bgColor={activeIconColors.bg}
                        fgColor={activeIconColors.fg}
                        borderColor={activeIconColors.border}
                      />
                    }
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </section>
    </>
  );
});
