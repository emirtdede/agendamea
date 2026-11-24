import { ArrowLeft, Check, Copy, Printer, ShieldCheck } from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../i18n/I18nContext';
import type { LegalDocId } from '../i18n/translations';

interface LegalDocumentViewProps {
  docId: LegalDocId;
  onBack: () => void;
}

const LINKIFY_RE = /(https:\/\/[^\s)]+|[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;

function renderLinkedParagraph(text: string): React.ReactNode {
  const parts = text.split(LINKIFY_RE);
  if (parts.length <= 1) return text;
  let offset = 0;
  return parts.map((part) => {
    const startOffset = offset;
    offset += part.length;
    if (part.startsWith('https://')) {
      const cleanUrl = part.replace(/[.,;]+$/, '');
      const trailing = part.slice(cleanUrl.length);
      return (
        <React.Fragment key={`url-${startOffset}-${cleanUrl}`}>
          <a
            href={cleanUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="underline decoration-[var(--accent)]/60 underline-offset-2 text-[var(--accent)] hover:opacity-80"
          >
            {cleanUrl}
          </a>
          {trailing}
        </React.Fragment>
      );
    }
    if (/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(part)) {
      return (
        <a
          key={`mail-${startOffset}-${part}`}
          href={`mailto:${part}`}
          className="underline decoration-[var(--accent)]/60 underline-offset-2 text-[var(--accent)] hover:opacity-80"
        >
          {part}
        </a>
      );
    }
    return <React.Fragment key={`txt-${startOffset}`}>{part}</React.Fragment>;
  });
}

export function LegalDocumentView({ docId, onBack }: LegalDocumentViewProps) {
  const { t, legalDocs } = useI18n();
  const doc = legalDocs[docId];
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, []);

  const plainText = useMemo(() => {
    const out: string[] = [doc.title, doc.subtitle, ''];
    for (const sec of doc.sections) {
      out.push(sec.heading);
      for (const p of sec.paragraphs) {
        out.push(p);
      }
      out.push('');
    }
    return out.join('\n').trim();
  }, [doc]);

  const handleCopyDoc = async () => {
    try {
      await navigator.clipboard.writeText(plainText);
      setCopied(true);
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        setCopied(false);
        timerRef.current = null;
      }, 1800);
    } catch {
      // Ignore clipboard restriction
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5 rtl:rotate-180" />
          <span>{t.backToSettingsButton}</span>
        </button>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            data-testid="legal-copy-btn"
            onClick={() => void handleCopyDoc()}
            className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] transition-colors"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-emerald-500" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
            <span>{copied ? t.docsCopiedLabel : t.docsCopyButton}</span>
          </button>
          <button
            type="button"
            data-testid="legal-print-btn"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] transition-colors"
          >
            <Printer className="h-3.5 w-3.5" />
            <span>{t.legalPrintButton}</span>
          </button>
        </div>
      </div>

      <article className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 sm:p-8 space-y-6">
        <header className="border-b border-[var(--border)] pb-5">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-[var(--accent-soft)] px-2.5 py-1 text-[11px] font-medium text-[var(--accent)]">
            <ShieldCheck className="h-3.5 w-3.5" />
            <span>{t.legalComplianceBadge}</span>
          </div>
          <h2 className="mt-3 font-display text-2xl font-bold tracking-tight text-[var(--text-primary)]">
            {doc.title}
          </h2>
          <p className="mt-1 text-xs text-[var(--text-muted)]">{doc.subtitle}</p>
        </header>

        <div className="space-y-6">
          {doc.sections.map((section) => (
            <section key={section.heading} className="space-y-2.5">
              <h3 className="font-display text-sm font-semibold text-[var(--text-primary)]">
                {section.heading}
              </h3>
              {section.paragraphs.map((paragraph) => (
                <p
                  key={`${section.heading}-${paragraph.slice(0, 48)}`}
                  className="text-sm leading-relaxed text-[var(--text-secondary)]"
                >
                  {renderLinkedParagraph(paragraph)}
                </p>
              ))}
            </section>
          ))}
        </div>
      </article>
    </div>
  );
}
