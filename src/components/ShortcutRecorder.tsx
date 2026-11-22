import React, { useEffect, useRef, useState } from 'react';
import { Keyboard, RotateCcw } from 'lucide-react';
import {
  eventToShortcutString,
  formatShortcutDisplay,
  toElectronAccelerator,
} from '../utils/shortcuts';

export interface ShortcutRecorderProps {
  value: string;
  defaultValue: string;
  onChange: (nextShortcut: string) => void;
  requireModifier?: boolean;
  electronFormat?: boolean;
  recordPrompt: string;
  resetLabel?: string;
  modifierHint?: string;
  disabled?: boolean;
  testId?: string;
}

export const ShortcutRecorder: React.FC<ShortcutRecorderProps> = ({
  value,
  defaultValue,
  onChange,
  requireModifier = false,
  electronFormat = false,
  recordPrompt,
  resetLabel = 'Reset',
  modifierHint,
  disabled = false,
  testId,
}) => {
  const [recording, setRecording] = useState(false);
  const [hintError, setHintError] = useState<string | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!recording) return;
    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (e.key === 'Escape') {
        setRecording(false);
        setHintError(null);
        return;
      }

      const captured = eventToShortcutString(e, { requireModifier });
      if (!captured) {
        // Ignore lone modifier presses; show hint only if a non-modifier was pressed without modifier
        if (!['Control', 'Shift', 'Alt', 'Meta'].includes(e.key) && requireModifier && modifierHint) {
          setHintError(modifierHint);
        }
        return;
      }

      setHintError(null);
      setRecording(false);
      onChange(electronFormat ? toElectronAccelerator(captured) : captured);
    };

    const onBlur = () => {
      setRecording(false);
      setHintError(null);
    };

    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('blur', onBlur);
    };
  }, [electronFormat, modifierHint, onChange, recording, requireModifier]);

  const isCustom =
    formatShortcutDisplay(value || defaultValue) !== formatShortcutDisplay(defaultValue);

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="inline-flex items-center gap-1.5">
        <button
          ref={btnRef}
          type="button"
          data-testid={testId}
          disabled={disabled}
          onClick={() => {
            setHintError(null);
            setRecording((prev) => !prev);
          }}
          className={`inline-flex min-w-[116px] items-center justify-center gap-1.5 rounded-lg border px-2.5 py-1.5 font-mono-tabular text-[11px] font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
            recording
              ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)] ring-2 ring-[var(--accent)]/25'
              : 'border-[var(--border)] bg-[var(--canvas)] text-[var(--text-primary)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)]'
          }`}
        >
          <Keyboard className="h-3 w-3 shrink-0 opacity-75" />
          <span className="truncate">
            {recording ? recordPrompt : formatShortcutDisplay(value || defaultValue)}
          </span>
        </button>
        {isCustom && !recording && (
          <button
            type="button"
            disabled={disabled}
            title={resetLabel}
            aria-label={resetLabel}
            data-testid={testId ? `${testId}-reset` : undefined}
            onClick={() => {
              setHintError(null);
              onChange(electronFormat ? toElectronAccelerator(defaultValue) : defaultValue);
            }}
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--canvas)] text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] disabled:opacity-40"
          >
            <RotateCcw className="h-3 w-3" />
          </button>
        )}
      </div>
      {hintError && (
        <span className="text-[10px] font-medium text-amber-600 dark:text-amber-400">
          {hintError}
        </span>
      )}
    </div>
  );
};
