import { Palette } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useI18n } from '../i18n/I18nContext';
import { CATEGORY_COLORS, isValidHexColor, normalizeHexColor } from '../utils/themes';
import { ColorSpectrumPicker } from './ColorSpectrumPicker';

interface CategoryColorPickerProps {
  value: string;
  onChange: (hex: string) => void;
  ariaLabel: string;
}

export function CategoryColorPicker({
  value,
  onChange,
  ariaLabel,
}: CategoryColorPickerProps) {
  const { t, getCategoryColorDisplayName } = useI18n();
  const [hexDraft, setHexDraft] = useState(value.toUpperCase());
  const [isEditingHex, setIsEditingHex] = useState(false);
  const [showSpectrum, setShowSpectrum] = useState(false);

  useEffect(() => {
    if (!isEditingHex) {
      setHexDraft(value.toUpperCase());
    }
  }, [value, isEditingHex]);

  const safePickerValue = isValidHexColor(value) ? value : '#2563eb';

  const handleHexInputChange = (raw: string) => {
    const cleaned = raw.replace(/[^#0-9a-fA-F]/g, '').slice(0, 7);
    setHexDraft(cleaned.toUpperCase());
    const withoutHash = cleaned.startsWith('#') ? cleaned.slice(1) : cleaned;
    if (withoutHash.length === 6) {
      const normalized = normalizeHexColor(cleaned);
      if (normalized) {
        onChange(normalized);
      }
    }
  };

  const handleHexBlur = () => {
    setIsEditingHex(false);
    const normalized = normalizeHexColor(hexDraft);
    if (normalized) {
      onChange(normalized);
      setHexDraft(normalized.toUpperCase());
    } else {
      setHexDraft(safePickerValue.toUpperCase());
    }
  };

  const handleDirectSelect = (hex: string) => {
    const lower = hex.toLowerCase();
    onChange(lower);
    setHexDraft(lower.toUpperCase());
  };

  return (
    <div className="space-y-2">
      {/* 8 Most-Used Primary, Secondary & White Swatches */}
      <div
        className="grid grid-cols-8 gap-1.5"
        role="radiogroup"
        aria-label={ariaLabel}
      >
        {CATEGORY_COLORS.map(({ hex, name }) => {
          const isSelected = value.toLowerCase() === hex.toLowerCase();
          const localizedColorName = getCategoryColorDisplayName(hex, name);
          return (
            <button
              key={hex}
              type="button"
              role="radio"
              aria-checked={isSelected}
              aria-label={`${t.selectColorLabel}: ${localizedColorName}`}
              title={localizedColorName}
              onClick={() => handleDirectSelect(hex)}
              className={`h-5 w-5 rounded-full border border-black/20 dark:border-white/25 transition-transform ${
                isSelected
                  ? 'scale-110 ring-2 ring-offset-1 ring-[var(--text-primary)] ring-offset-[var(--surface-subtle)]'
                  : 'hover:scale-105'
              }`}
              style={{ backgroundColor: hex }}
            />
          );
        })}
      </div>

      {/* Custom In-App Visual Spectrum Toggle + Balanced Hex Input (Replaces misaligned native OS color popup) */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setShowSpectrum((prev) => !prev)}
          aria-expanded={showSpectrum}
          aria-label={t.customColorTitle}
          title={t.customColorTitle}
          data-testid="category-color-spectrum-toggle"
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md border transition-colors ${
            showSpectrum
              ? 'border-[var(--accent)] ring-2 ring-[var(--accent-ring)]'
              : 'border-[var(--border-strong)] hover:brightness-110'
          }`}
          style={{ backgroundColor: safePickerValue }}
        >
          <Palette className="h-3.5 w-3.5 text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.65)]" />
        </button>
        <input
          type="text"
          value={hexDraft}
          onFocus={() => setIsEditingHex(true)}
          onChange={(e) => handleHexInputChange(e.target.value)}
          onBlur={handleHexBlur}
          placeholder="#2563EB"
          maxLength={7}
          spellCheck={false}
          aria-label={t.customColorHexLabel}
          className="h-7 flex-1 min-w-0 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 font-mono-tabular text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] transition-colors focus:border-[var(--border-strong)] focus:outline-none"
        />
      </div>

      {showSpectrum && (
        <div
          className="animate-modal-pop rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2.5"
          data-testid="category-color-spectrum-panel"
        >
          <ColorSpectrumPicker
            value={safePickerValue}
            onChange={handleDirectSelect}
            hexInputLabel={t.customColorHexLabel}
            compact
            hideFooter
            paletteHeightClass="h-[88px]"
          />
        </div>
      )}
    </div>
  );
}
