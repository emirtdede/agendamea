import { ArrowLeft, ArrowUpRight, Check, Copy, Printer, Search, X } from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { OPEN_SOURCE_COMPONENTS, OPEN_SOURCE_GROUPS } from '../data/openSourceLicenses';
import { useI18n } from '../i18n/I18nContext';
import type { LegalDocId } from '../i18n/translations';
import { matchesLocaleQuery } from '../utils/todoLogic';

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
            className="font-medium text-[var(--text-primary)] underline decoration-[var(--border-strong)] underline-offset-4 ag-hover-glow"
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
          className="font-medium text-[var(--text-primary)] underline decoration-[var(--border-strong)] underline-offset-4 ag-hover-glow"
        >
          {part}
        </a>
      );
    }
    return <React.Fragment key={`txt-${startOffset}`}>{part}</React.Fragment>;
  });
}

function stripLeadingIndex(heading: string): string {
  return heading.replace(/^\d+\.\s*/, '').trim();
}

function isReferenceLine(paragraph: string): boolean {
  const hasLinkOrEmail =
    paragraph.includes('https://') || /[a-zA-Z0-9._%+-]+@vellium\.dev/.test(paragraph);
  return hasLinkOrEmail && (paragraph.includes(' · ') || paragraph.includes(' / '));
}

const FALLBACK_EMAIL_ROLES: Record<string, string> = {
  'support@vellium.dev': 'Technical support & help',
  'contact@vellium.dev': 'General inquiries & partnerships',
  'privacy@vellium.dev': 'Privacy, GDPR & data requests',
  'legal@vellium.dev': 'Legal & licensing inquiries',
  'security@vellium.dev': 'Security vulnerability reports',
  'billing@vellium.dev': 'Billing & enterprise inquiries',
};

function parseReferenceEntry(entry: string): { label: string | null; value: string } {
  const trimmed = entry.trim();
  const bareAddr = trimmed.match(/^([a-zA-Z0-9._%+-]+@vellium\.dev)$/i)?.[1];
  if (bareAddr) {
    const addr = bareAddr.toLowerCase();
    return { label: FALLBACK_EMAIL_ROLES[addr] ?? null, value: bareAddr };
  }
  const sepIdx = trimmed.search(/[:：՝]\s*/);
  if (sepIdx > 0) {
    const rawLabel = trimmed.slice(0, sepIdx).trim();
    const rawValue = trimmed
      .slice(sepIdx)
      .replace(/^[:：՝]\s*/, '')
      .trim();
    if (rawValue && !rawLabel.startsWith('http')) {
      return { label: rawLabel, value: rawValue };
    }
  }
  return { label: null, value: trimmed };
}

export function LegalDocumentView({ docId, onBack }: LegalDocumentViewProps) {
  const { t, legalDocs } = useI18n();
  const doc = legalDocs[docId];
  const [copied, setCopied] = useState(false);
  const [libFilter, setLibFilter] = useState('');
  const timerRef = useRef<number | null>(null);
  const sectionRefs = useRef<Array<HTMLElement | null>>([]);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, []);

  const filteredOpenSourceGroups = useMemo(() => {
    if (docId !== 'opensource') return [];
    const q = libFilter.trim();
    return OPEN_SOURCE_GROUPS.map((group) => ({
      ...group,
      title: String(t[group.titleKey]),
      items: q
        ? group.items.filter(
            (item) =>
              matchesLocaleQuery(item.name, q) ||
              matchesLocaleQuery(item.license, q) ||
              matchesLocaleQuery(item.version, q),
          )
        : group.items,
    })).filter((g) => g.items.length > 0);
  }, [docId, libFilter, t]);

  const plainText = useMemo(() => {
    const out: string[] = [doc.title, doc.subtitle, ''];
    if (docId === 'opensource') {
      const firstSec = doc.sections[0];
      if (firstSec) {
        out.push(firstSec.heading);
        for (const p of firstSec.paragraphs) out.push(p);
        out.push('');
      }
      const secondSec = doc.sections[1];
      if (secondSec) {
        out.push(secondSec.heading);
        for (const group of OPEN_SOURCE_GROUPS) {
          out.push('', String(t[group.titleKey]));
          for (const item of group.items) {
            out.push(`- ${item.name} (${item.version}) [${item.license}] - ${item.url}`);
          }
        }
      }
      return out.join('\n').trim();
    }
    for (const sec of doc.sections) {
      out.push(sec.heading);
      for (const p of sec.paragraphs) {
        out.push(p);
      }
      out.push('');
    }
    return out.join('\n').trim();
  }, [doc, docId, t]);

  const handleCopyDoc = async () => {
    let copiedOk = false;
    const copyWithExecCommand = (): boolean => {
      try {
        const textarea = document.createElement('textarea');
        textarea.value = plainText;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.top = '0';
        textarea.style.left = '0';
        textarea.style.opacity = '0';
        textarea.style.pointerEvents = 'none';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        textarea.setSelectionRange(0, plainText.length);
        const result = document.execCommand('copy');
        document.body.removeChild(textarea);
        return result;
      } catch {
        return false;
      }
    };

    if (
      window.isSecureContext &&
      navigator.clipboard &&
      typeof navigator.clipboard.writeText === 'function'
    ) {
      try {
        await navigator.clipboard.writeText(plainText);
        copiedOk = true;
      } catch {
        copiedOk = copyWithExecCommand();
      }
    } else {
      copiedOk = copyWithExecCommand();
    }

    if (copiedOk) {
      setCopied(true);
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        setCopied(false);
        timerRef.current = null;
      }, 4000);
    }
  };

  const scrollToSection = (index: number) => {
    const target = sectionRefs.current[index];
    if (target && typeof target.scrollIntoView === 'function') {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div data-testid="legal-document-view" className="space-y-4 pb-10 animate-tab-enter">
      {/* Always-Visible Top Navigation & Quick Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <button
          type="button"
          data-testid="legal-doc-back-btn"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)]/80 px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] ag-hover-card-glow transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5 rtl:rotate-180" />
          <span>{t.backToSettingsButton}</span>
        </button>

        <div className="flex items-center gap-3">
          <button
            type="button"
            data-testid="legal-copy-btn"
            onClick={() => void handleCopyDoc()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)]/80 px-2.5 py-1.5 text-xs font-medium text-[var(--text-secondary)] ag-hover-card-glow hover:text-[var(--text-primary)]"
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            <span>{copied ? t.docsCopiedLabel : t.docsCopyButton}</span>
          </button>
          <button
            type="button"
            data-testid="legal-print-btn"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)]/80 px-2.5 py-1.5 text-xs font-medium text-[var(--text-secondary)] ag-hover-card-glow hover:text-[var(--text-primary)]"
          >
            <Printer className="h-3.5 w-3.5" />
            <span>{t.legalPrintButton}</span>
          </button>
        </div>
      </div>

      {/* Single Clean Document Card Container Matching Settings Card Proportions */}
      <article
        data-testid="legal-document-card"
        className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/75 p-6 sm:p-7 space-y-8 print:border-0 print:bg-transparent print:p-0 print:space-y-6"
      >
        <header className="space-y-4 border-b border-[var(--border)] pb-6">
          <span className="inline-block text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
            {t.settingsTabLegal}
          </span>

          <div className="space-y-2">
            <h2 className="font-display text-[22px] sm:text-[26px] font-bold leading-[1.2] tracking-tight text-[var(--text-primary)]">
              {doc.title}
            </h2>
            <p className="text-xs leading-relaxed text-[var(--text-muted)]">{doc.subtitle}</p>
          </div>

          {/* Full Non-Truncated Numbered Section Index */}
          {doc.sections.length > 1 && (
            <nav
              aria-label={doc.title}
              className="flex flex-col gap-1.5 pt-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-6 sm:gap-y-2 print:hidden"
            >
              {doc.sections.map((section, idx) => {
                const num = String(idx + 1).padStart(2, '0');
                return (
                  <button
                    key={section.heading}
                    type="button"
                    onClick={() => scrollToSection(idx)}
                    className="inline-flex items-baseline gap-2 text-start text-xs text-[var(--text-secondary)] ag-hover-glow hover:text-[var(--text-primary)]"
                  >
                    <span className="font-mono-tabular text-[11px] text-[var(--text-muted)] shrink-0">
                      {num}
                    </span>
                    <span>{stripLeadingIndex(section.heading)}</span>
                  </button>
                );
              })}
            </nav>
          )}
        </header>

        {/* Sections with Editorial Hairline Rhythm & High-Readability Prose */}
        <div className="divide-y divide-[var(--border)]/75">
          {doc.sections.map((section, idx) => {
            const num = String(idx + 1).padStart(2, '0');
            const isOpenSourceInventorySection = docId === 'opensource' && idx === 1;
            return (
              <section
                key={section.heading}
                ref={(el) => {
                  sectionRefs.current[idx] = el;
                }}
                className="py-7 first:pt-0 last:pb-0 space-y-4 scroll-mt-6"
              >
                <div className="flex items-baseline gap-3">
                  <span className="font-mono-tabular text-xs font-medium text-[var(--text-muted)] shrink-0">
                    {num}
                  </span>
                  <h3 className="font-display text-[16px] font-semibold tracking-tight text-[var(--text-primary)]">
                    {stripLeadingIndex(section.heading)}
                  </h3>
                </div>

                {isOpenSourceInventorySection ? (
                  <div data-testid="legal-opensource-directory" className="space-y-6 ps-7">
                    {/* Instant Filter Bar + Component Count */}
                    <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
                      <div className="relative flex-1 min-w-[200px] max-w-xs">
                        <Search className="pointer-events-none absolute start-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]" />
                        <input
                          type="text"
                          data-testid="legal-opensource-search"
                          value={libFilter}
                          onChange={(e) => setLibFilter(e.target.value)}
                          placeholder={t.searchPlaceholder}
                          aria-label={t.searchPlaceholder}
                          className="h-8 w-full rounded-lg border border-[var(--border)] bg-transparent ps-8 pe-7 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--text-secondary)]"
                        />
                        {libFilter && (
                          <button
                            type="button"
                            onClick={() => setLibFilter('')}
                            aria-label={t.clearSearch}
                            className="absolute end-1.5 top-1/2 -translate-y-1/2 p-0.5 text-[var(--text-muted)] ag-hover-glow"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                      <span className="font-mono-tabular text-[11px] text-[var(--text-muted)]">
                        {OPEN_SOURCE_COMPONENTS.length} · MIT / Apache-2.0 / ISC / BSD / CC0
                      </span>
                    </div>

                    {filteredOpenSourceGroups.length === 0 ? (
                      <p className="py-4 text-xs text-[var(--text-muted)]">
                        {t.cmdPaletteNoResults}
                      </p>
                    ) : (
                      <div className="space-y-6">
                        {filteredOpenSourceGroups.map((group) => (
                          <div key={group.id} className="space-y-2">
                            <h4 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                              {group.title}
                            </h4>
                            <div className="border-y border-[var(--border)]/80 divide-y divide-[var(--border)]/60">
                              {group.items.map((item) => (
                                <a
                                  key={`${group.id}-${item.name}`}
                                  href={item.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="group flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5 text-start ag-hover-glow"
                                >
                                  <span className="flex items-baseline gap-2.5 min-w-0">
                                    <span className="text-[13.5px] font-medium text-[var(--text-primary)]">
                                      {item.name}
                                    </span>
                                    <span className="font-mono-tabular text-[11.5px] text-[var(--text-muted)]">
                                      {item.version}
                                    </span>
                                  </span>
                                  <span className="inline-flex items-center gap-1.5 font-mono-tabular text-[11.5px] text-[var(--text-secondary)] shrink-0">
                                    <span>{item.license}</span>
                                    <ArrowUpRight className="h-3 w-3 text-[var(--text-muted)] transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 print:hidden" />
                                  </span>
                                </a>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3.5 ps-7">
                    {section.paragraphs.map((paragraph) => {
                      if (isReferenceLine(paragraph)) {
                        const splitter = paragraph.includes(' · ') ? ' · ' : ' / ';
                        const entries = paragraph
                          .split(splitter)
                          .map((part) => part.trim())
                          .filter(Boolean);
                        const hasEmailList = entries.some((e) => e.includes('@vellium.dev'));
                        return (
                          <dl
                            key={`${section.heading}-${paragraph.slice(0, 48)}`}
                            className="border-y border-[var(--border)]/70 divide-y divide-[var(--border)]/50"
                          >
                            {entries.map((entry) => {
                              const { label, value } = parseReferenceEntry(entry);
                              const isGenericPrefix =
                                hasEmailList &&
                                value.toLowerCase() === 'support@vellium.dev' &&
                                entries.length > 2 &&
                                entries.slice(1).every((item) => !/[:：՝]/.test(item));
                              const displayLabel = isGenericPrefix
                                ? FALLBACK_EMAIL_ROLES['support@vellium.dev']
                                : label;
                              return (
                                <div
                                  key={`${section.heading}-ref-${entry.slice(0, 36)}`}
                                  className="flex flex-col gap-0.5 py-2.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6"
                                >
                                  {displayLabel ? (
                                    <dt className="text-[12.5px] text-[var(--text-muted)]">
                                      {displayLabel}
                                    </dt>
                                  ) : null}
                                  <dd className="text-[13px] leading-[1.6] text-[var(--text-primary)] break-words sm:text-end">
                                    {renderLinkedParagraph(value)}
                                  </dd>
                                </div>
                              );
                            })}
                          </dl>
                        );
                      }
                      return (
                        <p
                          key={`${section.heading}-${paragraph.slice(0, 48)}`}
                          className="text-[14.5px] leading-[1.85] text-[var(--text-secondary)]"
                        >
                          {renderLinkedParagraph(paragraph)}
                        </p>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
        </div>

        {/* Bottom Return Button for Long Documents */}
        <div className="border-t border-[var(--border)]/75 pt-5 print:hidden">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--text-secondary)] ag-hover-glow hover:text-[var(--text-primary)]"
          >
            <ArrowLeft className="h-3.5 w-3.5 rtl:rotate-180" />
            <span>{t.backToSettingsButton}</span>
          </button>
        </div>
      </article>
    </div>
  );
}
