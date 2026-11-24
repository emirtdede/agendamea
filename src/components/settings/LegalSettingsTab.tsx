import { ChevronRight, FileText } from 'lucide-react';
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
    <div className="space-y-4">
      <section aria-label={t.legalSectionTitle} className="space-y-3">
        <p className="text-xs leading-relaxed text-[var(--text-muted)]">{t.legalSectionSubtitle}</p>
        <div className="divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
          {docs.map((item) => (
            <button
              key={item.id}
              type="button"
              data-testid={`legal-doc-row-${item.id}`}
              onClick={() => onOpenLegalDoc(item.id)}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-start transition-colors hover:bg-[var(--surface-hover)]"
            >
              <div className="flex items-start gap-2.5 min-w-0">
                <FileText className="h-4 w-4 text-[var(--text-muted)] shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <span className="block text-sm font-medium text-[var(--text-primary)]">
                    {item.title}
                  </span>
                  <span className="mt-0.5 block text-xs text-[var(--text-muted)]">{item.desc}</span>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-[var(--text-muted)] shrink-0 rtl:rotate-180" />
            </button>
          ))}
        </div>
      </section>
    </div>
  );
});
