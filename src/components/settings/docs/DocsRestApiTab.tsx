import { Check, Copy, Server } from 'lucide-react';
import React, { useMemo, useState } from 'react';
import { useI18n } from '../../../i18n/I18nContext';
import { matchesLocaleQuery } from '../../../utils/todoLogic';

interface DocsRestApiTabProps {
  searchQuery: string;
  runtimePort: number;
  copiedKey: string | null;
  onCopy: (key: string, text: string) => void;
}

export const DocsRestApiTab = React.memo(function DocsRestApiTab({
  searchQuery,
  runtimePort,
  copiedKey,
  onCopy,
}: DocsRestApiTabProps) {
  const { t } = useI18n();
  const [shellKind, setShellKind] = useState<'curl' | 'powershell'>('curl');
  const baseUrl = `http://127.0.0.1:${runtimePort}`;

  const endpoints = useMemo(
    () => [
      { method: 'GET', path: '/api/bootstrap', desc: t.docsApiBootstrapDesc },
      { method: 'POST', path: '/api/todos', desc: t.docsApiCreateTodoDesc },
      { method: 'PATCH', path: '/api/todos/:id', desc: t.docsApiUpdateTodoDesc },
      { method: 'DELETE', path: '/api/todos/:id', desc: t.docsApiDeleteTodoDesc },
      { method: 'GET', path: '/api/export?format=json|csv|md|ics', desc: t.docsApiExportDesc },
      { method: 'POST', path: '/api/import', desc: t.docsApiImportDesc },
      { method: 'GET', path: '/api/events', desc: t.docsApiSseDesc },
      { method: 'POST', path: '/api/mcp', desc: t.docsApiMcpDesc },
      { method: 'POST', path: '/api/webhook/incoming', desc: t.docsApiWebhookInDesc },
      { method: 'POST', path: '/api/ai/rag/search', desc: t.docsApiRagDesc },
      { method: 'GET', path: '/api/system/info', desc: t.docsApiSystemInfoDesc },
    ],
    [
      t.docsApiBootstrapDesc,
      t.docsApiCreateTodoDesc,
      t.docsApiDeleteTodoDesc,
      t.docsApiExportDesc,
      t.docsApiImportDesc,
      t.docsApiMcpDesc,
      t.docsApiRagDesc,
      t.docsApiSseDesc,
      t.docsApiSystemInfoDesc,
      t.docsApiUpdateTodoDesc,
      t.docsApiWebhookInDesc,
    ],
  );

  const q = searchQuery.trim();
  const filtered = q
    ? endpoints.filter(
        (ep) =>
          matchesLocaleQuery(ep.path, q) ||
          matchesLocaleQuery(ep.method, q) ||
          matchesLocaleQuery(ep.desc, q),
      )
    : endpoints;

  const snippet =
    shellKind === 'curl'
      ? `curl -X POST "${baseUrl}/api/todos" \\\n  -H "Content-Type: application/json" \\\n  -d '{"title":"Review roadmap","priority":"high","dueDate":"2026-12-01"}'`
      : `Invoke-RestMethod -Method Post -Uri "${baseUrl}/api/todos" \`\n  -ContentType "application/json" \`\n  -Body '{"title":"Review roadmap","priority":"high","dueDate":"2026-12-01"}'`;

  return (
    <div className="space-y-5" data-testid="docs-tab-api">
      {/* Card 1: REST API Overview & Copyable Snippet */}
      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/75 p-4 sm:p-5 space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Server className="h-3.5 w-3.5 text-[var(--text-muted)]" />
            <h4 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
              {t.docsApiSectionTitle}
            </h4>
          </div>
          <code className="font-mono-tabular text-xs text-[var(--text-secondary)]">{baseUrl}</code>
        </div>
        <p className="text-xs leading-relaxed text-[var(--text-muted)]">{t.docsApiSectionDesc}</p>

        {/* Live Copyable Snippet */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between gap-2 border-b border-[var(--border)]/70 pb-1.5">
            <div className="inline-flex items-center gap-4 text-xs">
              <button
                type="button"
                onClick={() => setShellKind('curl')}
                className={`-mb-1.5 border-b-2 pb-1.5 font-medium transition-colors ${
                  shellKind === 'curl'
                    ? 'border-[var(--text-primary)] text-[var(--text-primary)]'
                    : 'border-transparent text-[var(--text-muted)] ag-hover-glow hover:text-[var(--text-primary)]'
                }`}
              >
                cURL
              </button>
              <button
                type="button"
                onClick={() => setShellKind('powershell')}
                className={`-mb-1.5 border-b-2 pb-1.5 font-medium transition-colors ${
                  shellKind === 'powershell'
                    ? 'border-[var(--text-primary)] text-[var(--text-primary)]'
                    : 'border-transparent text-[var(--text-muted)] ag-hover-glow hover:text-[var(--text-primary)]'
                }`}
              >
                PowerShell
              </button>
            </div>
            <button
              type="button"
              onClick={() => onCopy(`api-${shellKind}`, snippet)}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--text-secondary)] ag-hover-glow hover:text-[var(--text-primary)]"
            >
              {copiedKey === `api-${shellKind}` ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                <Copy className="h-3.5 w-3.5 text-[var(--text-muted)]" />
              )}
              <span>{copiedKey === `api-${shellKind}` ? t.docsCopiedLabel : t.docsCopyButton}</span>
            </button>
          </div>
          <pre className="overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--canvas)]/60 p-3 font-mono-tabular text-[11px] text-[var(--text-secondary)]">
            {snippet}
          </pre>
        </div>
      </section>

      {/* Card 2: Endpoints Reference Directory */}
      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/75 px-4 sm:px-5 divide-y divide-[var(--border)]/70">
        {filtered.map((ep) => (
          <div
            key={`${ep.method}-${ep.path}`}
            className="flex flex-col gap-1.5 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
          >
            <div className="flex items-center gap-2.5 shrink-0">
              <span className="inline-flex w-12 shrink-0 font-mono-tabular text-[10.5px] font-semibold text-[var(--text-muted)]">
                {ep.method}
              </span>
              <code className="font-mono-tabular text-[12px] font-medium text-[var(--text-primary)] whitespace-nowrap">
                {ep.path}
              </code>
            </div>
            <span className="text-[11px] text-[var(--text-muted)] sm:text-end">{ep.desc}</span>
          </div>
        ))}
      </section>
    </div>
  );
});
