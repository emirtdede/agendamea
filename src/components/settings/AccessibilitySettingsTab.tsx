import { Contrast, Eye, Focus, Minus, Plus, RotateCcw, Sparkles, ZoomIn } from 'lucide-react';
import React from 'react';
import { useI18n } from '../../i18n/I18nContext';
import { getNextZoomPreset, getPrevZoomPreset, ZOOM_PRESETS } from '../../utils/themes';
import { ToggleSwitch } from '../ToggleSwitch';
import { SettingsTabHeader } from './SettingsTabHeader';

interface AccessibilitySettingsTabProps {
  zoomPercent: number;
  highContrast: boolean;
  reducedMotion: boolean;
  colorBlindShapes: boolean;
  strongFocusRing: boolean;
  onChangeZoomPercent: (zoom: number) => void;
  onToggleHighContrast: (enabled: boolean) => void;
  onToggleReducedMotion: (enabled: boolean) => void;
  onToggleColorBlindShapes: (enabled: boolean) => void;
  onToggleStrongFocusRing: (enabled: boolean) => void;
  onResetAccessibility: () => void;
}

export const AccessibilitySettingsTab = React.memo(function AccessibilitySettingsTab({
  zoomPercent,
  highContrast,
  reducedMotion,
  colorBlindShapes,
  strongFocusRing,
  onChangeZoomPercent,
  onToggleHighContrast,
  onToggleReducedMotion,
  onToggleColorBlindShapes,
  onToggleStrongFocusRing,
  onResetAccessibility,
}: AccessibilitySettingsTabProps) {
  const { t } = useI18n();

  const toggleRows = [
    {
      id: 'high-contrast',
      icon: Contrast,
      title: t.highContrastTitle,
      desc: t.highContrastDesc,
      checked: highContrast,
      onChange: onToggleHighContrast,
    },
    {
      id: 'reduced-motion',
      icon: Sparkles,
      title: t.reducedMotionTitle,
      desc: t.reducedMotionDesc,
      checked: reducedMotion,
      onChange: onToggleReducedMotion,
    },
    {
      id: 'colorblind-shapes',
      icon: Eye,
      title: t.accessibilityColorBlindTitle,
      desc: t.accessibilityColorBlindDesc,
      checked: colorBlindShapes,
      onChange: onToggleColorBlindShapes,
    },
    {
      id: 'strong-focus',
      icon: Focus,
      title: t.accessibilityStrongFocusTitle,
      desc: t.accessibilityStrongFocusDesc,
      checked: strongFocusRing,
      onChange: onToggleStrongFocusRing,
    },
  ];

  return (
    <div className="space-y-6">
      <SettingsTabHeader
        subtitle={t.accessibilitySectionSubtitle}
        onReset={onResetAccessibility}
        resetTestId="a11y-reset-btn"
      />

      {/* Interface Zoom / Scale Card */}
      <section
        aria-label={t.zoomLevelTitle}
        data-setting-id="a11y-zoom"
        className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-2.5 min-w-0">
            <ZoomIn className="h-4 w-4 text-[var(--accent)] mt-0.5 shrink-0" />
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                {t.zoomLevelTitle}
              </h3>
              <p className="mt-0.5 text-xs text-[var(--text-muted)]">{t.zoomLevelDesc}</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onChangeZoomPercent(getPrevZoomPreset(zoomPercent))}
              disabled={zoomPercent <= (ZOOM_PRESETS[0] ?? 80)}
              aria-label={t.accessibilityZoomDecrease}
              title={t.accessibilityZoomDecrease}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--canvas)] text-[var(--text-primary)] hover:bg-[var(--surface-hover)] disabled:opacity-40 transition-colors"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <span className="font-mono-tabular min-w-[3.5rem] text-center text-sm font-semibold text-[var(--text-primary)]">
              {zoomPercent}%
            </span>
            <button
              type="button"
              onClick={() => onChangeZoomPercent(getNextZoomPreset(zoomPercent))}
              disabled={zoomPercent >= (ZOOM_PRESETS[ZOOM_PRESETS.length - 1] ?? 130)}
              aria-label={t.accessibilityZoomIncrease}
              title={t.accessibilityZoomIncrease}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--canvas)] text-[var(--text-primary)] hover:bg-[var(--surface-hover)] disabled:opacity-40 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
            {zoomPercent !== 100 && (
              <button
                type="button"
                onClick={() => onChangeZoomPercent(100)}
                className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--canvas)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] transition-colors"
              >
                <RotateCcw className="h-3 w-3" />
                <span>{t.zoomResetButton}</span>
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
          {ZOOM_PRESETS.map((preset) => {
            const active = zoomPercent === preset;
            return (
              <button
                key={preset}
                type="button"
                onClick={() => onChangeZoomPercent(preset)}
                aria-pressed={active}
                className={`font-mono-tabular rounded-lg border py-1.5 text-xs font-medium transition-colors ${
                  active
                    ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text-primary)] font-semibold'
                    : 'border-[var(--border)] bg-[var(--canvas)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]'
                }`}
              >
                {preset}%
              </button>
            );
          })}
        </div>
      </section>

      {/* Contrast, Motion, Colorblind Shapes & Focus Ring Switches */}
      <div
        data-setting-id="a11y-contrast"
        className="divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]"
      >
        {toggleRows.map((row) => {
          const Icon = row.icon;
          return (
            <div key={row.id} className="flex items-center justify-between gap-4 px-4 py-3.5">
              <div className="flex items-start gap-2.5 min-w-0">
                <Icon className="h-4 w-4 text-[var(--text-muted)] mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[var(--text-primary)]">{row.title}</p>
                  <p className="mt-0.5 text-xs text-[var(--text-muted)]">{row.desc}</p>
                </div>
              </div>
              <ToggleSwitch
                checked={row.checked}
                onChange={row.onChange}
                label={row.title}
                testId={`a11y-toggle-${row.id}`}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
});
