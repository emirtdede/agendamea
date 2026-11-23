import React, { useMemo } from 'react';
import { ChevronRight, FileText, Scale, Shield } from 'lucide-react';
import { useI18n } from '../../i18n/I18nContext';
import type { LegalDocId } from '../../i18n/translations';

export interface LegalSettingsTabProps {
  onOpenLegalDoc: (docId: LegalDocId) => void;
}

export const LegalSettingsTab = React.memo(function LegalSettingsTab({
  onOpenLegalDoc,
}: LegalSettingsTabProps) {
  const { t } = useI18n();

  const legalItems = useMemo<Array<{ id: LegalDocId; title: string; Icon: typeof Shield }>>(
    () => [
      { id: 'privacy', title: t.legalPrivacyTitle, Icon: Shield },
      { id: 'terms', title: t.legalTermsTitle, Icon: Scale },
      { id: 'gdpr', title: t.legalKvkkGdprTitle, Icon: FileText },
      { id: 'opensource', title: t.legalOpenSourceTitle, Icon: FileText },
      { id: 'accessibility', title: t.legalAccessibilityTitle, Icon: Shield },
    ],
    [
      t.legalPrivacyTitle,
      t.legalTermsTitle,
      t.legalKvkkGdprTitle,
      t.legalOpenSourceTitle,
      t.legalAccessibilityTitle,
    ],
  );

  return (
    <section
      aria-label={t.legalSectionTitle}
      data-testid="settings-legal-section"
      className="space-y-3"
    >
      <div>
        <h3 className="font-display text-xs font-semibold text-[var(--text-muted)]">
          {t.legalSectionTitle}
        </h3>
        <p className="mt-0.5 text-xs text-[var(--text-muted)]">{t.legalSectionSubtitle}</p>
      </div>

      <div className="divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
        {legalItems.map(({ id, title, Icon }) => (
          <button
            key={id}
            type="button"
            data-testid={`legal-doc-btn-${id}`}
            onClick={() => onOpenLegalDoc(id)}
            className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors"
          >
            <span className="flex items-center gap-2.5 min-w-0">
              <Icon className="h-4 w-4 text-[var(--accent)] shrink-0" />
              <span className="truncate">{title}</span>
            </span>
            <ChevronRight className="h-4 w-4 text-[var(--text-muted)] shrink-0" />
          </button>
        ))}
      </div>
    </section>
  );
});
