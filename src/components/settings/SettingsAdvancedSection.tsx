import { ChevronDown, SlidersHorizontal } from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { useI18n } from '../../i18n/I18nContext';

interface SettingsAdvancedSectionProps {
  children: ReactNode;
  forceOpen?: boolean;
  defaultOpen?: boolean;
  title?: string;
  description?: string;
  testId?: string;
  toggleTestId?: string;
}

export function SettingsAdvancedSection({
  children,
  forceOpen = false,
  defaultOpen = false,
  title,
  description,
  testId,
  toggleTestId,
}: SettingsAdvancedSectionProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(defaultOpen || forceOpen);

  useEffect(() => {
    if (forceOpen) {
      setOpen(true);
    }
  }, [forceOpen]);

  return (
    <div data-testid={testId} className="space-y-3 pt-1">
      <button
        type="button"
        data-testid={toggleTestId}
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className="ag-hover-card-glow flex w-full items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)]/55 px-4 py-3 text-left transition"
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <SlidersHorizontal
            className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]"
            aria-hidden="true"
          />
          <span className="min-w-0">
            <span className="block text-[12.5px] font-medium text-[var(--text-primary)]">
              {title || (open ? t.hideAdvancedSettings : t.showAdvancedSettings)}
            </span>
            {description && (
              <span className="mt-0.5 block text-[11px] text-[var(--text-muted)]">
                {description}
              </span>
            )}
          </span>
        </span>
        <span className="inline-flex shrink-0 items-center gap-1.5 text-[11.5px] font-medium text-[var(--text-muted)]">
          <span>{open ? t.hideAdvancedShort : t.showAdvancedShort}</span>
          <ChevronDown
            className={`h-4 w-4 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
            aria-hidden="true"
          />
        </span>
      </button>

      {open && <div className="animate-accordion space-y-4">{children}</div>}
    </div>
  );
}
