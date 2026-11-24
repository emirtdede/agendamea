import { Check, Monitor, Moon, Palette, Sun } from 'lucide-react';
import { useI18n } from '../../i18n/I18nContext';
import type { ThemeId, ThemeMode } from '../../types';
import { type COLOR_THEMES, getContrastingForeground } from '../../utils/themes';
import { ColorSpectrumPicker } from '../ColorSpectrumPicker';

interface WelcomeThemeStepProps {
  themeMode: ThemeMode;
  effectiveMode: 'light' | 'dark';
  themeId: ThemeId;
  customThemeColor: string;
  featuredThemes: Array<(typeof COLOR_THEMES)[number]>;
  onChangeMode: (mode: ThemeMode) => void;
  onChangeTheme: (id: ThemeId) => void;
  onChangeCustomThemeColor: (hex: string) => void;
}

export function WelcomeThemeStep({
  themeMode,
  effectiveMode,
  themeId,
  customThemeColor,
  featuredThemes,
  onChangeMode,
  onChangeTheme,
  onChangeCustomThemeColor,
}: WelcomeThemeStepProps) {
  const { t, getThemeDisplayName } = useI18n();

  return (
    <div className="flex flex-1 flex-col justify-between" data-testid="welcome-custom-theme-panel">
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

      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs font-medium text-[var(--text-secondary)] shrink-0">
          {t.colorThemeTitle}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          {featuredThemes.map((item) => {
            const selected = item.id === themeId;
            const colorHex = effectiveMode === 'dark' ? item.dark.accent : item.light.accent;
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
                      color: effectiveMode === 'dark' ? item.dark.accentFg : item.light.accentFg,
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

      <div className="border-t border-[var(--border)] pt-4">
        <ColorSpectrumPicker
          value={customThemeColor}
          onChange={(hex) => {
            if (themeId !== 'custom') onChangeTheme('custom');
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
  );
}
