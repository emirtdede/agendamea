import React from 'react';

export interface ToggleSwitchProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
  size?: 'sm' | 'md';
  testId?: string;
  id?: string;
}

export const ToggleSwitch = React.memo(function ToggleSwitch({
  checked,
  onChange,
  label,
  disabled = false,
  size = 'md',
  testId,
  id,
}: ToggleSwitchProps) {
  const isSm = size === 'sm';
  const trackClass = isSm ? 'h-4 w-7' : 'h-5 w-9';
  const thumbClass = isSm ? 'h-3 w-3' : 'h-3.5 w-3.5';
  const translateClass = checked
    ? isSm
      ? 'translate-x-3.5 rtl:-translate-x-3.5'
      : 'translate-x-4.5 rtl:-translate-x-4.5'
    : 'translate-x-0.5 rtl:-translate-x-0.5';

  return (
    <button
      type="button"
      id={id}
      role="switch"
      data-testid={testId}
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => {
        if (!disabled) onChange(!checked);
      }}
      className={`relative inline-flex ${trackClass} shrink-0 items-center rounded-full transition-colors disabled:opacity-45 disabled:cursor-not-allowed ${
        checked ? 'bg-[var(--accent)]' : 'bg-[var(--border-strong)]'
      }`}
    >
      <span
        aria-hidden="true"
        className={`inline-block ${thumbClass} transform rounded-full bg-[var(--surface)] shadow-sm transition-transform ${translateClass}`}
      />
    </button>
  );
});
