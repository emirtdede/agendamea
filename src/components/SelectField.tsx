import { ChevronDown } from 'lucide-react';
import React from 'react';

export interface SelectFieldProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  wrapperClassName?: string;
  selectClassName?: string;
  chevronClassName?: string;
  children: React.ReactNode;
}

/**
 * Unified accessible dropdown with consistent spacing between the label
 * and the right-aligned chevron icon (prevents native select arrows from
 * sticking to the right border across Windows Chromium / Electron).
 */
export const SelectField = React.forwardRef<HTMLSelectElement, SelectFieldProps>(
  function SelectField(
    {
      wrapperClassName = '',
      selectClassName = '',
      chevronClassName = '',
      className = '',
      children,
      ...rest
    },
    ref,
  ) {
    return (
      <div className={`relative inline-flex items-center ${wrapperClassName}`}>
        <select
          ref={ref}
          {...rest}
          className={`w-full appearance-none rounded-lg border border-[var(--border)] bg-[var(--canvas)] py-1.5 ps-3 pe-8 text-xs text-[var(--text-primary)] outline-none transition-colors hover:border-[var(--border-strong)] focus:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50 ${selectClassName} ${className}`}
        >
          {children}
        </select>
        <ChevronDown
          aria-hidden="true"
          className={`pointer-events-none absolute end-2.5 h-3.5 w-3.5 text-[var(--text-muted)] ${chevronClassName}`}
        />
      </div>
    );
  },
);
