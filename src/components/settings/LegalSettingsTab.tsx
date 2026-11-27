import { ChevronRight } from 'lucide-react';
import React from 'react';
import { useI18n } from '../../i18n/I18nContext';
import type { LegalDocId } from '../../i18n/translations';

interface LegalSettingsTabProps {
  onOpenLegalDoc: (doc: LegalDocId) => void;
}

export const LegalSettingsTab = React.memo(function LegalSettingsTab({
  onOpenLegalDoc,
}: LegalSettingsTabProps) {
  const { t } = useI18n();

  const docs: Array<{ id: LegalDocId; title: string; desc: string }> = [
    { id: 'privacy', title: t.legalPrivacyTitle, desc: t.legalPrivacySummary },
    { id: 'terms', title: t.legalTermsTitle, desc: t.legalTermsSummary },
    { id: 'gdpr', title: t.legalKvkkGdprTitle, desc: t.legalGdprSummary },
    { id: 'opensource', title: t.legalOpenSourceTitle, desc: t.legalOpenSourceSummary },
    { id: 'accessibility', title: t.legalAccessibilityTitle, desc: t.legalAccessibilitySummary },
  ];

  return (
    <nav
      aria-label={t.legalSectionTitle}
      className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/75 px-4 sm:px-5 divide-y divide-[var(--border)]/70"
    >
      {docs.map((item, idx) => (
        <button
          key={item.id}
          type="button"
          data-testid={`legal-doc-row-${item.id}`}
          onClick={() => onOpenLegalDoc(item.id)}
          className="group flex w-full items-center justify-between gap-4 py-3 text-start transition-colors ag-hover-glow"
        >
          <div className="flex items-baseline gap-3 min-w-0">
            <span className="font-mono-tabular text-[11px] text-[var(--text-muted)] shrink-0">
              {String(idx + 1).padStart(2, '0')}
            </span>
            <div className="min-w-0">
              <span className="block text-[13.5px] font-medium text-[var(--text-primary)]">
                {item.title}
              </span>
              <span className="mt-0.5 block text-xs text-[var(--text-muted)]">{item.desc}</span>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-[var(--text-muted)] transition-transform group-hover:translate-x-0.5 shrink-0 rtl:rotate-180" />
        </button>
      ))}
    </nav>
  );
});
