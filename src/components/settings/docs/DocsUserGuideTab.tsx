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
  const [sampleInput, setSampleInput] = useState(
    'Prepare quarterly deck @tomorrow 14:30 ! * #finance /Work',
  );

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
      {/* Interactive Quick Add / CLI Natural-Language Playground */}
      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-[var(--accent)]" />
          <h4 className="font-display text-xs font-semibold text-[var(--text-primary)]">
            {t.docsPlaygroundTitle}
          </h4>
        </div>
        <p className="text-xs text-[var(--text-muted)]">{t.docsPlaygroundDesc}</p>

        <input
          type="text"
          data-testid="docs-playground-input"
          value={sampleInput}
          onChange={(e) => setSampleInput(e.target.value)}
          aria-label={t.docsPlaygroundTitle}
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--canvas)] px-3 py-2 font-mono-tabular text-xs text-[var(--text-primary)] focus:border-[var(--accent)]"
        />

        {/* Preset Quick Chips */}
        <div className="flex flex-wrap gap-1.5">
          {[
            'Pay invoice @today 17:00 ! #bills /Finance',
            'Sprint planning @2026-12-01..2026-12-03 ^ * #team /Work',
            'Buy coffee beans @tomorrow #home',
          ].map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => setSampleInput(preset)}
              className="rounded-md border border-[var(--border)] bg-[var(--canvas)] px-2 py-1 font-mono-tabular text-[10.5px] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--text-primary)] transition-colors"
            >
              {preset}
            </button>
          ))}
        </div>

        {/* Live Parsed Output Card */}
        <div
          data-testid="docs-playground-output"
          className="rounded-lg border border-[var(--border)] bg-[var(--canvas)] p-3 space-y-2"
        >
          <p className="text-xs font-semibold text-[var(--text-primary)]">
            {parsed.title || t.docsPlaygroundEmptyTitle}
          </p>
          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
            {parsed.category && (
              <span className="rounded-md bg-[var(--accent-soft)] px-2 py-0.5 font-medium text-[var(--accent)]">
                /{parsed.category}
              </span>
            )}
            {parsed.dueToken && (
              <span className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-0.5 font-mono-tabular text-[var(--text-secondary)]">
                <Calendar className="h-3 w-3 text-[var(--accent)]" />
                {parsed.dueToken}
                {parsed.dueTime ? ` · ${parsed.dueTime}` : ''}
              </span>
            )}
            {!parsed.dueToken && parsed.dueTime && (
              <span className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-0.5 font-mono-tabular text-[var(--text-secondary)]">
                {parsed.dueTime}
              </span>
            )}
            {parsed.priority !== 'normal' && (
              <span
                className={`rounded-md px-2 py-0.5 font-semibold ${
                  parsed.priority === 'high'
                    ? 'bg-red-500/15 text-red-600 dark:text-red-400'
                    : 'bg-[var(--surface-subtle)] text-[var(--text-muted)]'
                }`}
              >
                {parsed.priority === 'high' ? t.priorityHigh : t.priorityLow}
              </span>
            )}
            {parsed.important && (
              <span className="rounded-md bg-amber-500/15 px-2 py-0.5 font-medium text-amber-600 dark:text-amber-400">
                * {t.important}
              </span>
            )}
            {parsed.pinned && (
              <span className="rounded-md bg-[var(--surface-subtle)] px-2 py-0.5 font-medium text-[var(--text-secondary)]">
                ^ {t.pinLabel}
              </span>
            )}
            {parsed.tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-0.5 text-[var(--text-secondary)]"
              >
                <Tag className="h-2.5 w-2.5" />#{tag}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Syntax Reference Grid */}
      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
        <div className="border-b border-[var(--border)] px-4 py-2.5">
          <h4 className="font-display text-xs font-semibold text-[var(--text-primary)]">
            {t.docsSyntaxTableTitle}
          </h4>
        </div>
        <div className="divide-y divide-[var(--border)]">
          {filteredTokens.map((item) => (
            <div
              key={item.token}
              className="flex flex-col gap-1 px-4 py-2 sm:flex-row sm:items-center sm:justify-between"
            >
              <code className="font-mono-tabular text-[11.5px] font-semibold text-[var(--accent)]">
                {item.token}
              </code>
              <span className="text-xs text-[var(--text-muted)]">{item.desc}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Voice Dictation Examples */}
      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 space-y-2.5">
        <div className="flex items-center gap-2">
          <Mic className="h-4 w-4 text-[var(--accent)]" />
          <h4 className="font-display text-xs font-semibold text-[var(--text-primary)]">
            {t.docsVoiceExamplesTitle}
          </h4>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {voiceExamples.map((ex) => (
            <div
              key={ex.label}
              className="rounded-lg border border-[var(--border)] bg-[var(--canvas)] px-3 py-2"
            >
              <p className="text-[11px] font-semibold text-[var(--text-secondary)]">{ex.label}</p>
              <p className="mt-0.5 text-xs italic text-[var(--text-primary)]">"{ex.cmd}"</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
});
