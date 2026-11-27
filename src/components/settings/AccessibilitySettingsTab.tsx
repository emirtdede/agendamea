import { Accessibility, Eye, Minus, Plus } from 'lucide-react';
import React from 'react';
import { useI18n } from '../../i18n/I18nContext';
import type { FontScalePreset } from '../../types';
import { getNextZoomPreset, getPrevZoomPreset, ZOOM_PRESETS } from '../../utils/themes';
import { InfoTooltip } from '../InfoTooltip';
import { SelectField } from '../SelectField';
import { ToggleSwitch } from '../ToggleSwitch';
import { SettingsAdvancedSection } from './SettingsAdvancedSection';
import { SettingsTabHeader } from './SettingsTabHeader';

interface AccessibilitySettingsTabProps {
  zoomPercent: number;
  fontScale?: FontScalePreset;
  highContrast: boolean;
  reducedMotion: boolean;
  readableSpacing?: boolean;
  colorBlindShapes: boolean;
  strongFocusRing: boolean;
  revealSettingId?: string;
  onChangeZoomPercent: (zoom: number) => void;
  onChangeFontScale?: (scale: FontScalePreset) => void;
  onToggleHighContrast: (enabled: boolean) => void;
  onToggleReducedMotion: (enabled: boolean) => void;
  onToggleReadableSpacing?: (enabled: boolean) => void;
  onToggleColorBlindShapes: (enabled: boolean) => void;
  onToggleStrongFocusRing: (enabled: boolean) => void;
  onResetAccessibility: () => void;
}

export const AccessibilitySettingsTab = React.memo(function AccessibilitySettingsTab({
  zoomPercent,
  fontScale = 'normal',
  highContrast,
  reducedMotion,
  readableSpacing = false,
  colorBlindShapes,
  strongFocusRing,
  revealSettingId,
  onChangeZoomPercent,
  onChangeFontScale,
  onToggleHighContrast,
  onToggleReducedMotion,
  onToggleReadableSpacing,
  onToggleColorBlindShapes,
  onToggleStrongFocusRing,
  onResetAccessibility,
}: AccessibilitySettingsTabProps) {
  const { t } = useI18n();

  const primaryToggleRows = [
    {
      id: 'high-contrast',
      settingId: 'a11y-contrast',
      title: t.highContrastTitle,
      desc: t.highContrastDesc,
      tooltip: t.a11yHighContrastTooltip,
      checked: highContrast,
      onChange: onToggleHighContrast,
    },
    {
      id: 'strong-focus',
      settingId: undefined,
      title: t.accessibilityStrongFocusTitle,
      desc: t.accessibilityStrongFocusDesc,
      tooltip: t.a11yStrongFocusTooltip,
      checked: strongFocusRing,
      onChange: onToggleStrongFocusRing,
    },
    {
      id: 'readable-spacing',
      settingId: 'a11y-readable-spacing',
      title: t.a11yReadableSpacingTitle,
      desc: t.a11yReadableSpacingDesc,
      tooltip: t.a11yReadableSpacingTooltip,
      checked: readableSpacing,
      onChange: onToggleReadableSpacing ?? (() => undefined),
    },
    {
      id: 'reduced-motion',
      settingId: undefined,
      title: t.reducedMotionTitle,
      desc: t.reducedMotionDesc,
      tooltip: t.a11yReducedMotionTooltip,
      checked: reducedMotion,
      onChange: onToggleReducedMotion,
    },
  ];

  const forceAdvancedOpen = revealSettingId === 'a11y-colorblind';

  return (
    <div className="space-y-5 pb-4 animate-tab-enter">
      <SettingsTabHeader
        subtitle={t.accessibilitySectionSubtitle}
        onReset={onResetAccessibility}
        resetTestId="a11y-reset-btn"
      />

      <div className="space-y-2.5">
        <div className="flex items-center gap-2">
          <Accessibility className="h-3.5 w-3.5 text-[var(--text-muted)]" />
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
            {t.accessibilitySectionTitle}
          </h3>
        </div>

        {/* Single Power Pilot Accessibility Card */}
        <section
          aria-label={t.a11yCardTitle}
          className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/75 divide-y divide-[var(--border)]/70"
        >
          {/* Card Header */}
          <div className="flex items-center gap-3 p-4">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface-subtle)] text-[var(--text-primary)]">
              <Accessibility className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h4 className="text-[13.5px] font-semibold text-[var(--text-primary)]">
                {t.a11yCardTitle}
              </h4>
              <p className="mt-0.5 text-xs text-[var(--text-muted)]">{t.a11yCardSubtitle}</p>
            </div>
          </div>

          {/* Row 1: Interface Zoom Percent (- / Select / + / Reset) */}
          <div
            data-setting-id="a11y-zoom"
            className="flex flex-wrap items-center justify-between gap-4 p-4"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <p className="text-[13.5px] font-medium text-[var(--text-primary)]">
                  {t.zoomLevelTitle}
                </p>
                <InfoTooltip text={t.a11yZoomTooltip} testId="a11y-zoom-info" />
              </div>
              <p className="mt-0.5 text-xs text-[var(--text-muted)]">{t.zoomLevelDesc}</p>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => onChangeZoomPercent(getPrevZoomPreset(zoomPercent))}
                disabled={zoomPercent <= (ZOOM_PRESETS[0] ?? 80)}
                aria-label={t.accessibilityZoomDecrease}
                title={t.accessibilityZoomDecrease}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface-subtle)] text-[var(--text-primary)] ag-hover-card-glow disabled:opacity-35 transition"
              >
                <Minus className="h-3.5 w-3.5" />
              </button>

              <SelectField
                data-testid="a11y-zoom-select"
                aria-label={t.zoomLevelTitle}
                value={zoomPercent}
                onChange={(e) => onChangeZoomPercent(Number(e.target.value))}
                wrapperClassName="w-28"
                selectClassName="h-8 ps-3 pe-7 font-mono-tabular font-semibold"
              >
                {ZOOM_PRESETS.map((preset) => (
                  <option key={preset} value={preset}>
                    {preset}%
                  </option>
                ))}
              </SelectField>

              <button
                type="button"
                onClick={() => onChangeZoomPercent(getNextZoomPreset(zoomPercent))}
                disabled={zoomPercent >= (ZOOM_PRESETS[ZOOM_PRESETS.length - 1] ?? 150)}
                aria-label={t.accessibilityZoomIncrease}
                title={t.accessibilityZoomIncrease}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface-subtle)] text-[var(--text-primary)] ag-hover-card-glow disabled:opacity-35 transition"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>

              <button
                type="button"
                data-testid="a11y-zoom-reset-btn"
                onClick={() => onChangeZoomPercent(100)}
                disabled={zoomPercent === 100}
                className="inline-flex h-8 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface-subtle)] px-2.5 text-xs font-medium text-[var(--text-primary)] ag-hover-card-glow disabled:opacity-40 transition"
              >
                {t.zoomResetButton}
              </button>
            </div>
          </div>

          {/* Row 2: Font Size Scale */}
          <div
            data-setting-id="a11y-font-scale"
            className="flex flex-wrap items-center justify-between gap-4 p-4"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <label
                  htmlFor="a11y-font-scale-select"
                  className="text-[13.5px] font-medium text-[var(--text-primary)]"
                >
                  {t.a11yFontScaleTitle}
                </label>
                <InfoTooltip text={t.a11yFontScaleTooltip} testId="a11y-font-scale-info" />
              </div>
              <p className="mt-0.5 text-xs text-[var(--text-muted)]">{t.a11yFontScaleDesc}</p>
            </div>

            <SelectField
              id="a11y-font-scale-select"
              data-testid="a11y-font-scale-select"
              value={fontScale}
              onChange={(e) => onChangeFontScale?.(e.target.value as FontScalePreset)}
              wrapperClassName="w-40 shrink-0"
              selectClassName="h-8"
            >
              <option value="small">{t.a11yFontScaleSmall}</option>
              <option value="normal">{t.a11yFontScaleNormal}</option>
              <option value="large">{t.a11yFontScaleLarge}</option>
              <option value="xlarge">{t.a11yFontScaleXLarge}</option>
            </SelectField>
          </div>

          {/* Rows 3-6: High Contrast, Focus Ring, Readable Spacing, Reduced Motion */}
          {primaryToggleRows.map((row) => (
            <div
              key={row.id}
              data-setting-id={row.settingId}
              className="flex items-center justify-between gap-4 p-4"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="text-[13.5px] font-medium text-[var(--text-primary)]">
                    {row.title}
                  </p>
                  <InfoTooltip text={row.tooltip} testId={`a11y-info-${row.id}`} />
                </div>
                <p className="mt-0.5 text-xs text-[var(--text-muted)]">{row.desc}</p>
              </div>
              <ToggleSwitch
                checked={row.checked}
                onChange={row.onChange}
                label={row.title}
                testId={`a11y-toggle-${row.id}`}
              />
            </div>
          ))}
        </section>
      </div>

      {/* Advanced Accessibility Settings (Colorblind Priority Shapes) */}
      <SettingsAdvancedSection
        forceOpen={forceAdvancedOpen}
        testId="a11y-advanced-section"
        toggleTestId="a11y-advanced-toggle"
      >
        <div
          data-setting-id="a11y-colorblind"
          className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/75 p-4 flex items-center justify-between gap-4"
        >
          <div className="flex items-start gap-2.5 min-w-0 flex-1">
            <Eye className="h-4 w-4 text-[var(--text-muted)] mt-0.5 shrink-0" />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="text-[13.5px] font-medium text-[var(--text-primary)]">
                  {t.accessibilityColorBlindTitle}
                </p>
                <InfoTooltip text={t.a11yColorBlindTooltip} testId="a11y-info-colorblind" />
              </div>
              <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                {t.accessibilityColorBlindDesc}
              </p>
            </div>
          </div>
          <ToggleSwitch
            checked={colorBlindShapes}
            onChange={onToggleColorBlindShapes}
            label={t.accessibilityColorBlindTitle}
            testId="a11y-toggle-colorblind-shapes"
          />
        </div>
      </SettingsAdvancedSection>
    </div>
  );
});
