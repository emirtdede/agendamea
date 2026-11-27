import {
  BookOpenText,
  CheckCircle2,
  Columns3,
  Command,
  HelpCircle,
  Mic,
  Search,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import React, { useMemo, useRef, useState } from 'react';
import { useI18n } from '../../i18n/I18nContext';
import type { SettingsTabId } from '../../types';
import { matchesLocaleQuery } from '../../utils/todoLogic';
import { DocsUserGuideTab } from './docs/DocsUserGuideTab';

interface UserGuideSettingsTabProps {
  onOpenSettingsTab?: (tab: SettingsTabId) => void;
  onOpenWelcomeWizard?: () => void;
}

export const UserGuideSettingsTab = React.memo(function UserGuideSettingsTab({
  onOpenSettingsTab,
  onOpenWelcomeWizard,
}: UserGuideSettingsTabProps) {
  const { t } = useI18n();
  const [searchQuery, setSearchQuery] = useState('');
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  const guideSections = useMemo(
    () => [
      {
        id: 'quickstart',
        num: '01',
        icon: CheckCircle2,
        title: t.guideSecQuickStartTitle,
        summary: t.guideSecQuickStartDesc,
        steps: [t.guideSecQuickStartStep1, t.guideSecQuickStartStep2, t.guideSecQuickStartStep3],
      },
      {
        id: 'views',
        num: '02',
        icon: Columns3,
        title: t.guideSecViewsTitle,
        summary: t.guideSecViewsDesc,
        steps: [t.guideSecViewsStep1, t.guideSecViewsStep2, t.guideSecViewsStep3],
      },
      {
        id: 'search',
        num: '03',
        icon: Command,
        title: t.guideSecCommandTitle,
        summary: t.guideSecCommandDesc,
        steps: [t.guideSecCommandStep1, t.guideSecCommandStep2, t.guideSecCommandStep3],
      },
      {
        id: 'ai',
        num: '04',
        icon: Mic,
        title: t.guideSecAiTitle,
        summary: t.guideSecAiDesc,
        steps: [t.guideSecAiStep1, t.guideSecAiStep2, t.guideSecAiStep3],
        actionTab: 'ai' as SettingsTabId,
        actionLabel: t.guideSecAiOpenButton,
      },
      {
        id: 'privacy',
        num: '05',
        icon: ShieldCheck,
        title: t.guideSecPrivacyTitle,
        summary: t.guideSecPrivacyDesc,
        steps: [t.guideSecPrivacyStep1, t.guideSecPrivacyStep2, t.guideSecPrivacyStep3],
        actionTab: 'data' as SettingsTabId,
        actionLabel: t.guideSecPrivacyOpenButton,
      },
    ],
    [t],
  );

  const faqItems = useMemo(
    () => [
      { q: t.guideFaqQ1, a: t.guideFaqA1 },
      { q: t.guideFaqQ2, a: t.guideFaqA2 },
      { q: t.guideFaqQ3, a: t.guideFaqA3 },
      { q: t.guideFaqQ4, a: t.guideFaqA4 },
    ],
    [t],
  );

  const q = searchQuery.trim();
  const visibleSections = useMemo(() => {
    if (!q) return guideSections;
    return guideSections.filter(
      (sec) =>
        matchesLocaleQuery(sec.title, q) ||
        matchesLocaleQuery(sec.summary, q) ||
        sec.steps.some((st) => matchesLocaleQuery(st, q)),
    );
  }, [guideSections, q]);

  const visibleFaqs = useMemo(() => {
    if (!q) return faqItems;
    return faqItems.filter((f) => matchesLocaleQuery(f.q, q) || matchesLocaleQuery(f.a, q));
  }, [faqItems, q]);

  const jumpTo = (id: string) => {
    const node = sectionRefs.current[id];
    if (node && typeof node.scrollIntoView === 'function') {
      node.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div
      data-setting-id="user-guide-main"
      data-testid="user-guide-page"
      className="space-y-5 pb-6 animate-tab-enter"
    >
      {/* Card 1: Intro Header, Topic Search & Quick-Jump Index */}
      <header className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/75 p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1.5 min-w-0 flex-1">
            <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
              <BookOpenText className="h-3.5 w-3.5" />
              <span>{t.settingsTabUserGuide}</span>
            </div>
            <h2 className="font-display text-xl font-bold tracking-tight text-[var(--text-primary)]">
              {t.guideHeroTitle}
            </h2>
            <p className="text-[13.5px] leading-relaxed text-[var(--text-secondary)]">
              {t.guideHeroDesc}
            </p>
          </div>

          {onOpenWelcomeWizard && (
            <button
              type="button"
              data-testid="guide-open-wizard-btn"
              onClick={onOpenWelcomeWizard}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-subtle)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] ag-hover-card-glow shrink-0"
            >
              <Sparkles className="h-3.5 w-3.5 text-[var(--text-muted)]" />
              <span>{t.welcomeReplayButton}</span>
            </button>
          )}
        </div>

        {/* Instant Guide Topic Search */}
        <div className="relative">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            type="text"
            data-testid="user-guide-search-input"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t.guideSearchPlaceholder}
            aria-label={t.guideSearchPlaceholder}
            className="h-9 w-full rounded-lg border border-[var(--border)] bg-[var(--canvas)]/60 ps-9 pe-8 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--text-secondary)]"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              aria-label={t.clearSearch}
              className="absolute end-2 top-1/2 -translate-y-1/2 p-0.5 text-[var(--text-muted)] ag-hover-glow"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Numbered Quick-Jump Topic Links */}
        {!q && (
          <nav
            aria-label={t.settingsTabUserGuide}
            className="flex flex-wrap items-center gap-x-5 gap-y-1.5 border-t border-[var(--border)]/70 pt-3"
          >
            {guideSections.map((sec) => (
              <button
                key={sec.id}
                type="button"
                onClick={() => jumpTo(sec.id)}
                className="inline-flex items-center gap-1.5 text-xs text-[var(--text-secondary)] ag-hover-glow hover:text-[var(--text-primary)]"
              >
                <span className="font-mono-tabular text-[11px] font-medium text-[var(--text-muted)]">
                  {sec.num}
                </span>
                <span>{sec.title}</span>
              </button>
            ))}
          </nav>
        )}
      </header>

      {/* Empty Search Feedback */}
      {q.length > 0 && visibleSections.length === 0 && visibleFaqs.length === 0 && (
        <div
          data-testid="user-guide-no-results"
          className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/75 py-8 text-center text-xs text-[var(--text-muted)]"
        >
          {t.cmdPaletteNoResults}
        </div>
      )}

      {/* Card 2: Main Numbered Guide Sections */}
      {visibleSections.length > 0 && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/75 px-5 sm:px-6 divide-y divide-[var(--border)]/70">
          {visibleSections.map((sec) => {
            const Icon = sec.icon;
            return (
              <section
                key={sec.id}
                ref={(el) => {
                  sectionRefs.current[sec.id] = el;
                }}
                className="py-5 space-y-3 scroll-mt-6"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="font-mono-tabular text-xs font-medium text-[var(--text-muted)] shrink-0">
                      {sec.num}
                    </span>
                    <Icon className="h-4 w-4 text-[var(--text-muted)] shrink-0" />
                    <h3 className="font-display text-[15.5px] font-semibold tracking-tight text-[var(--text-primary)]">
                      {sec.title}
                    </h3>
                  </div>

                  {sec.actionTab && sec.actionLabel && onOpenSettingsTab && (
                    <button
                      type="button"
                      onClick={() => onOpenSettingsTab(sec.actionTab)}
                      className="text-xs font-medium text-[var(--text-secondary)] underline decoration-[var(--border-strong)] underline-offset-4 ag-hover-glow hover:text-[var(--text-primary)] shrink-0"
                    >
                      {sec.actionLabel}
                    </button>
                  )}
                </div>

                <p className="text-[13.5px] leading-relaxed text-[var(--text-secondary)] ps-7">
                  {sec.summary}
                </p>

                <ul className="space-y-2 ps-7">
                  {sec.steps.map((step) => (
                    <li
                      key={`${sec.id}-${step.slice(0, 32)}`}
                      className="flex items-start gap-2.5 text-[13.5px] leading-[1.7] text-[var(--text-primary)]/90"
                    >
                      <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[var(--text-muted)]" />
                      <span>{step}</span>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      {/* Card 3: Interactive Quick-Add & Voice Examples Sandbox */}
      <DocsUserGuideTab searchQuery={searchQuery} />

      {/* Card 4: Clear Everyday FAQ */}
      {visibleFaqs.length > 0 && (
        <section
          aria-label={t.guideFaqTitle}
          className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/75 p-5 sm:px-6 space-y-3"
        >
          <div className="flex items-center gap-2">
            <HelpCircle className="h-4 w-4 text-[var(--text-muted)]" />
            <h3 className="font-display text-[15.5px] font-semibold tracking-tight text-[var(--text-primary)]">
              {t.guideFaqTitle}
            </h3>
          </div>
          <div className="divide-y divide-[var(--border)]/70">
            {visibleFaqs.map((item) => (
              <div key={item.q} className="py-3.5 first:pt-1 last:pb-0 space-y-1">
                <h4 className="text-[13.5px] font-semibold text-[var(--text-primary)]">{item.q}</h4>
                <p className="text-[13px] leading-[1.75] text-[var(--text-secondary)]">{item.a}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
});
