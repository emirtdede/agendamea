import { useI18n } from '../../i18n/I18nContext';
import type { AppIconId, ThemeId, ThemeMode } from '../../types';
import { type COLOR_THEMES, resolveAppIconColors } from '../../utils/themes';
import { BrandMark } from '../BrandMark';
import { ColorSpectrumPicker } from '../ColorSpectrumPicker';

interface WelcomeIconStepProps {
  appIconId: AppIconId;
  themeId: ThemeId;
  themeMode: ThemeMode;
  customThemeColor: string;
  customIconColor: string;
  activeIconColors: { bg: string; fg: string };
  featuredThemes: Array<(typeof COLOR_THEMES)[number]>;
  onChangeAppIcon: (id: AppIconId) => void;
  onChangeCustomIconColor: (hex: string) => void;
}

export function WelcomeIconStep({
  appIconId,
  themeId,
  themeMode,
  customThemeColor,
  customIconColor,
  activeIconColors,
  featuredThemes,
  onChangeAppIcon,
  onChangeCustomIconColor,
}: WelcomeIconStepProps) {
  const { t, getThemeDisplayName } = useI18n();

  return (
    <div className="flex flex-1 flex-col justify-between" data-testid="welcome-icon-step">
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
                onClick={() => onChangeAppIcon(modeOpt.id)}
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

      <div className="flex flex-wrap items-center justify-between gap-2">
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
              onClick={() => onChangeAppIcon(item.id)}
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

      <div className="border-t border-[var(--border)] pt-4">
        <ColorSpectrumPicker
          value={customIconColor}
          onChange={(hex) => {
            if (appIconId !== 'custom') onChangeAppIcon('custom');
            onChangeCustomIconColor(hex);
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
  );
}
