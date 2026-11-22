import React from 'react';
import { Contrast, Minus, Plus } from 'lucide-react';
import { useI18n } from '../../i18n/I18nContext';
import { ZOOM_PRESETS } from '../../utils/themes';

export interface AccessibilitySettingsTabProps {
  zoomPercent: number;
  highContrast: boolean;
  reducedMotion: boolean;
  onChangeZoomPercent: (zoom: number) => void;
  onToggleHighContrast: (enabled: boolean) => void;
  onToggleReducedMotion: (enabled: boolean) => void;
}

export const AccessibilitySettingsTab = React.memo(function AccessibilitySettingsTab({
  zoomPercent,
  highContrast,
  reducedMotion,
  onChangeZoomPercent,
  onToggleHighContrast,
  onToggleReducedMotion,
}: AccessibilitySettingsTabProps) {
  const { t } = useI18n();

  return (
    <section aria-label={t.accessibilitySectionTitle} className="space-y-3">
      <div className="divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
        {/* Zoom Percentage */}
        <div className="space-y-3 px-4 py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-[var(--text-primary)]">{t.zoomLevelTitle}</p>
              <p className="text-xs text-[var(--text-muted)]">{t.zoomLevelDesc}</p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                data-testid="zoom-decrease-btn"
                disabled={zoomPercent <= ZOOM_PRESETS[0]}
                aria-label="-"
                onClick={() => {
                  const idx = ZOOM_PRESETS.indexOf(
                    zoomPercent as (typeof ZOOM_PRESETS)[number],
                  );
                  if (idx > 0) onChangeZoomPercent(ZOOM_PRESETS[idx - 1]);
                }}
                className="flex h-7 w-7 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--canvas)] text-[var(--text-primary)] hover:bg-[var(--surface-hover)] disabled:opacity-40 transition-colors"
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <span
                data-testid="zoom-percent-value"
                className="min-w-[46px] text-center font-mono-tabular text-xs font-semibold text-[var(--text-primary)]"
              >
                {zoomPercent}%
              </span>
              <button
                type="button"
                data-testid="zoom-increase-btn"
                disabled={zoomPercent >= ZOOM_PRESETS[ZOOM_PRESETS.length - 1]}
                aria-label="+"
                onClick={() => {
                  const idx = ZOOM_PRESETS.indexOf(
                    zoomPercent as (typeof ZOOM_PRESETS)[number],
                  );
                  if (idx >= 0 && idx < ZOOM_PRESETS.length - 1) {
                    onChangeZoomPercent(ZOOM_PRESETS[idx + 1]);
                  }
                }}
                className="flex h-7 w-7 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--canvas)] text-[var(--text-primary)] hover:bg-[var(--surface-hover)] disabled:opacity-40 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {ZOOM_PRESETS.map((preset) => {
              const active = zoomPercent === preset;
              return (
                <button
                  key={preset}
                  type="button"
                  data-testid={`zoom-preset-${preset}`}
                  onClick={() => onChangeZoomPercent(preset)}
                  className={`rounded-md border px-2.5 py-1 font-mono-tabular text-xs font-medium transition-colors whitespace-nowrap ${
                    active
                      ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-fg)]'
                      : 'border-[var(--border)] bg-[var(--canvas)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {preset}%
                </button>
              );
            })}
            {zoomPercent !== 100 && (
              <button
                type="button"
                onClick={() => onChangeZoomPercent(100)}
                className="ms-auto rounded-md border border-[var(--border)] bg-[var(--canvas)] px-2.5 py-1 text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors whitespace-nowrap"
              >
                {t.zoomResetButton}
              </button>
            )}
          </div>
        </div>

        {/* High Contrast */}
        <div className="flex items-center justify-between gap-4 px-4 py-3.5">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-sm font-medium text-[var(--text-primary)]">
              <Contrast className="h-3.5 w-3.5 text-[var(--accent)] shrink-0" />
              <span>{t.highContrastTitle}</span>
            </p>
            <p className="text-xs text-[var(--text-muted)]">{t.highContrastDesc}</p>
          </div>
          <button
            type="button"
            role="switch"
            data-testid="toggle-high-contrast"
            aria-checked={highContrast}
            onClick={() => onToggleHighContrast(!highContrast)}
            className={`inline-flex items-center rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              highContrast
                ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text-primary)]'
                : 'border-[var(--border)] bg-[var(--canvas)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]'
            }`}
          >
            {highContrast ? t.enabledBadge : t.disabledBadge}
          </button>
        </div>

        {/* Reduced Motion */}
        <div className="flex items-center justify-between gap-4 px-4 py-3.5">
          <div className="min-w-0">
            <p className="text-sm font-medium text-[var(--text-primary)]">
              {t.reducedMotionTitle}
            </p>
            <p className="text-xs text-[var(--text-muted)]">{t.reducedMotionDesc}</p>
          </div>
          <button
            type="button"
            role="switch"
            data-testid="toggle-reduced-motion"
            aria-checked={reducedMotion}
            onClick={() => onToggleReducedMotion(!reducedMotion)}
            className={`inline-flex items-center rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              reducedMotion
                ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text-primary)]'
                : 'border-[var(--border)] bg-[var(--canvas)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]'
            }`}
          >
            {reducedMotion ? t.enabledBadge : t.disabledBadge}
          </button>
        </div>
      </div>
    </section>
  );
});
