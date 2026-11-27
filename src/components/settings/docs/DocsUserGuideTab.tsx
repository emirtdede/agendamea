import { Calendar, Mic, Sparkles, Tag } from 'lucide-react';
import React, { useMemo, useState } from 'react';
import { useI18n } from '../../../i18n/I18nContext';
import { matchesLocaleQuery } from '../../../utils/todoLogic';

interface ParsedPlaygroundResult {
  title: string;
  dueToken: string | null;
  dueTime: string | null;
  priority: 'high' | 'low' | 'normal';
  important: boolean;
  pinned: boolean;
  tags: string[];
  category: string | null;
}

function parseQuickAddPreview(raw: string): ParsedPlaygroundResult {
  const tokens = raw.trim().split(/\s+/).filter(Boolean);
  const titleParts: string[] = [];
  let dueToken: string | null = null;
  let dueTime: string | null = null;
  let priority: 'high' | 'low' | 'normal' = 'normal';
  let important = false;
  let pinned = false;
  const tags: string[] = [];
  let category: string | null = null;

  for (const tok of tokens) {
    if (tok === '!' || tok.toLowerCase() === '!high') {
      priority = 'high';
    } else if (tok.toLowerCase() === '!low') {
      priority = 'low';
    } else if (tok === '*') {
      important = true;
    } else if (tok === '^') {
      pinned = true;
    } else if (tok.startsWith('@') && tok.length > 1) {
      dueToken = tok.slice(1);
    } else if (/^([01]\d|2[0-3]):[0-5]\d$/.test(tok)) {
      dueTime = tok;
    } else if (tok.startsWith('#') && tok.length > 1) {
      tags.push(tok.slice(1));
    } else if (tok.startsWith('/') && tok.length > 1) {
      category = tok.slice(1);
    } else {
      titleParts.push(tok);
    }
  }
  return {
    title: titleParts.join(' '),
    dueToken,
    dueTime,
    priority,
    important,
    pinned,
    tags,
    category,
  };
}

export const DocsUserGuideTab = React.memo(function DocsUserGuideTab({
  searchQuery,
}: {
  searchQuery: string;
}) {
  const { t } = useI18n();
  const [sampleInput, setSampleInput] = useState(() => t.guidePlaygroundSample);

  const parsed = useMemo(() => parseQuickAddPreview(sampleInput), [sampleInput]);

  const syntaxTokens = useMemo(
    () => [
      { token: '@today / @tomorrow', desc: t.docsSyntaxDateDesc },
      { token: '@2026-12-01..2026-12-05', desc: t.docsSyntaxRangeDesc },
      { token: '14:30', desc: t.docsSyntaxTimeDesc },
      { token: '!', desc: t.docsSyntaxPriorityDesc },
      { token: '*', desc: t.docsSyntaxImportantDesc },
      { token: '^', desc: t.docsSyntaxPinnedDesc },
      { token: '#tag', desc: t.docsSyntaxTagDesc },
      { token: '/Category', desc: t.docsSyntaxCategoryDesc },
    ],
    [
      t.docsSyntaxCategoryDesc,
      t.docsSyntaxDateDesc,
      t.docsSyntaxImportantDesc,
      t.docsSyntaxPinnedDesc,
      t.docsSyntaxPriorityDesc,
      t.docsSyntaxRangeDesc,
      t.docsSyntaxTagDesc,
      t.docsSyntaxTimeDesc,
    ],
  );

  const voiceExamples = useMemo(
    () => [
      { label: t.docsVoiceExCreateLabel, cmd: t.docsVoiceExCreateCmd },
      { label: t.docsVoiceExCompleteLabel, cmd: t.docsVoiceExCompleteCmd },
      { label: t.docsVoiceExQueryLabel, cmd: t.docsVoiceExQueryCmd },
      { label: t.docsVoiceExDeleteLabel, cmd: t.docsVoiceExDeleteCmd },
    ],
    [
      t.docsVoiceExCompleteCmd,
      t.docsVoiceExCompleteLabel,
      t.docsVoiceExCreateCmd,
      t.docsVoiceExCreateLabel,
      t.docsVoiceExDeleteCmd,
      t.docsVoiceExDeleteLabel,
      t.docsVoiceExQueryCmd,
      t.docsVoiceExQueryLabel,
    ],
  );

  const q = searchQuery.trim();
  const filteredTokens = q
    ? syntaxTokens.filter(
        (item) => matchesLocaleQuery(item.token, q) || matchesLocaleQuery(item.desc, q),
      )
    : syntaxTokens;

  return (
    <div className="space-y-5" data-testid="docs-tab-guide">
      {/* Interactive Quick Add / Natural-Language Playground Card */}
      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/75 p-5 sm:px-6 space-y-3.5">
        <div className="flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 text-[var(--text-muted)]" />
          <h4 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
            {t.docsPlaygroundTitle}
          </h4>
        </div>
        <p className="text-xs leading-relaxed text-[var(--text-muted)]">{t.docsPlaygroundDesc}</p>

        <input
          type="text"
          data-testid="docs-playground-input"
          value={sampleInput}
          onChange={(e) => setSampleInput(e.target.value)}
          aria-label={t.docsPlaygroundTitle}
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--canvas)]/60 px-3 py-2 font-mono-tabular text-xs text-[var(--text-primary)] focus:border-[var(--text-secondary)]"
        />

        {/* Preset Quick Examples (Borderless Mono Links) */}
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          {[t.guidePlaygroundPreset1, t.guidePlaygroundPreset2, t.guidePlaygroundPreset3].map(
            (preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setSampleInput(preset)}
                className="font-mono-tabular text-[11px] text-[var(--text-muted)] underline decoration-[var(--border)] underline-offset-4 ag-hover-glow hover:text-[var(--text-primary)]"
              >
                {preset}
              </button>
            ),
          )}
        </div>

        {/* Live Parsed Output Preview */}
        <div
          data-testid="docs-playground-output"
          className="rounded-lg border border-[var(--border)]/70 bg-[var(--canvas)]/55 px-3.5 py-2.5 space-y-1.5"
        >
          <p className="text-xs font-semibold text-[var(--text-primary)]">
            {parsed.title || t.docsPlaygroundEmptyTitle}
          </p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--text-secondary)]">
            {parsed.category && (
              <span className="font-mono-tabular font-medium text-[var(--text-primary)]">
                /{parsed.category}
              </span>
            )}
            {parsed.dueToken && (
              <span className="inline-flex items-center gap-1 font-mono-tabular">
                <Calendar className="h-3 w-3 text-[var(--text-muted)]" />
                {parsed.dueToken}
                {parsed.dueTime ? ` · ${parsed.dueTime}` : ''}
              </span>
            )}
            {!parsed.dueToken && parsed.dueTime && (
              <span className="font-mono-tabular">{parsed.dueTime}</span>
            )}
            {parsed.priority !== 'normal' && (
              <span className="font-medium text-[var(--text-primary)]">
                {parsed.priority === 'high' ? t.priorityHigh : t.priorityLow}
              </span>
            )}
            {parsed.important && <span className="font-medium">* {t.important}</span>}
            {parsed.pinned && <span className="font-medium">^ {t.pinLabel}</span>}
            {parsed.tags.map((tag) => (
              <span key={tag} className="inline-flex items-center gap-1 font-mono-tabular">
                <Tag className="h-2.5 w-2.5 text-[var(--text-muted)]" />#{tag}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Syntax Reference & Voice Dictation Examples Card */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/75 divide-y divide-[var(--border)]/70">
        {/* Syntax Reference List */}
        <section className="p-5 sm:px-6 space-y-3">
          <h4 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
            {t.docsSyntaxTableTitle}
          </h4>
          <div className="divide-y divide-[var(--border)]/60">
            {filteredTokens.map((item) => (
              <div
                key={item.token}
                className="flex flex-col gap-1 py-2.5 first:pt-1 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
              >
                <code className="font-mono-tabular text-[12px] font-medium text-[var(--text-primary)]">
                  {item.token}
                </code>
                <span className="text-xs text-[var(--text-muted)]">{item.desc}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Voice Dictation Examples */}
        <section className="p-5 sm:px-6 space-y-3">
          <div className="flex items-center gap-2">
            <Mic className="h-3.5 w-3.5 text-[var(--text-muted)]" />
            <h4 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
              {t.docsVoiceExamplesTitle}
            </h4>
          </div>
          <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 pt-1">
            {voiceExamples.map((ex) => (
              <div key={ex.label} className="space-y-0.5">
                <p className="text-[11px] font-medium text-[var(--text-muted)]">{ex.label}</p>
                <p className="text-xs italic text-[var(--text-primary)]">"{ex.cmd}"</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
});
