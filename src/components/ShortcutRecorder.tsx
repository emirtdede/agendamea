import { Keyboard, RotateCcw, X } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { useI18n } from '../i18n/I18nContext';
import {
  eventToShortcutString,
  formatShortcutDisplay,
  normalizeShortcutString,
  toElectronAccelerator,
} from '../utils/shortcuts';

interface ShortcutRecorderProps {
  value: string;
  defaultValue: string;
  requireModifier?: boolean;
  electronFormat?: boolean;
  disabled?: boolean;
  allowClear?: boolean;
  hasConflict?: boolean;
  testId?: string;
  onChange: (nextShortcut: string) => void;
}

export const ShortcutRecorder = React.memo(function ShortcutRecorder({
  value,
  defaultValue,
  requireModifier = false,
  electronFormat = false,
  disabled = false,
  allowClear = false,
  hasConflict = false,
  testId,
  onChange,
}: ShortcutRecorderProps) {
  const { t } = useI18n();
  const [recording, setRecording] = useState(false);

  useEffect(() => {
    if (!recording) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (e.key === 'Escape' && !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey) {
        setRecording(false);
        return;
      }

      const recorded = eventToShortcutString(e, { requireModifier });
      if (!recorded) return;

      const finalVal = electronFormat ? toElectronAccelerator(recorded) : recorded;
      setRecording(false);
      onChange(finalVal);
    };

    const handleMouseDown = () => {
      setRecording(false);
    };

    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('mousedown', handleMouseDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('mousedown', handleMouseDown, true);
    };
  }, [recording, requireModifier, electronFormat, onChange]);

  const isDisabledBinding = !value || value.trim() === '';
  const isCustom = normalizeShortcutString(value) !== normalizeShortcutString(defaultValue);

  return (
    <div className="inline-flex items-center gap-1.5">
      <button
        type="button"
        disabled={disabled}
        data-testid={testId}
        onClick={(e) => {
          e.stopPropagation();
          setRecording((prev) => !prev);
        }}
        title={t.shortcutRequireModifierHint}
        className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 font-mono-tabular text-[11px] font-medium transition-colors whitespace-nowrap disabled:opacity-45 ${
          recording
            ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-fg)] animate-pulse'
            : hasConflict
              ? 'border-amber-500/60 bg-amber-500/15 text-amber-700 dark:text-amber-300'
              : 'border-[var(--border)] bg-[var(--canvas)] text-[var(--text-primary)] hover:border-[var(--accent)] hover:bg-[var(--surface-hover)]'
        }`}
      >
        <Keyboard className="h-3 w-3 shrink-0 opacity-75" />
        <span>
          {recording
            ? t.shortcutRecordPrompt
            : isDisabledBinding
              ? t.shortcutsUnboundLabel
              : formatShortcutDisplay(value)}
        </span>
      </button>

      {allowClear && !isDisabledBinding && !recording && !disabled && (
        <button
          type="button"
          data-testid={testId ? `${testId}-clear` : undefined}
          onClick={() => onChange('')}
          title={t.shortcutsClearBindingButton}
          aria-label={t.shortcutsClearBindingButton}
          className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--canvas)] text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-red-500"
        >
          <X className="h-3 w-3" />
        </button>
      )}

      {isCustom && !recording && !disabled && (
        <button
          type="button"
          onClick={() => onChange(defaultValue)}
          title={t.shortcutResetDefaults}
          aria-label={t.shortcutResetDefaults}
          className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--canvas)] text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
        >
          <RotateCcw className="h-3 w-3" />
        </button>
      )}
    </div>
  );
});
