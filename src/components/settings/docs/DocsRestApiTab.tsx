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
      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Server className="h-4 w-4 text-[var(--accent)]" />
            <h4 className="font-display text-xs font-semibold text-[var(--text-primary)]">
              {t.docsApiSectionTitle}
            </h4>
          </div>
          <code className="rounded-md border border-[var(--border)] bg-[var(--canvas)] px-2.5 py-1 font-mono-tabular text-[11px] font-semibold text-[var(--accent)]">
            {baseUrl}
          </code>
        </div>
        <p className="text-xs text-[var(--text-muted)]">{t.docsApiSectionDesc}</p>

        {/* Live Copyable Snippet */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="inline-flex rounded-lg border border-[var(--border)] bg-[var(--canvas)] p-0.5 text-[11px]">
              <button
                type="button"
                onClick={() => setShellKind('curl')}
                className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                  shellKind === 'curl'
                    ? 'bg-[var(--accent)] text-[var(--accent-fg)]'
                    : 'text-[var(--text-secondary)]'
                }`}
              >
                cURL
              </button>
              <button
                type="button"
                onClick={() => setShellKind('powershell')}
                className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                  shellKind === 'powershell'
                    ? 'bg-[var(--accent)] text-[var(--accent-fg)]'
                    : 'text-[var(--text-secondary)]'
                }`}
              >
                PowerShell
              </button>
            </div>
            <button
              type="button"
              onClick={() => onCopy(`api-${shellKind}`, snippet)}
              className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--canvas)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)]"
            >
              {copiedKey === `api-${shellKind}` ? (
                <Check className="h-3 w-3 text-emerald-500" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
              <span>{copiedKey === `api-${shellKind}` ? t.docsCopiedLabel : t.docsCopyButton}</span>
            </button>
          </div>
          <pre className="overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--canvas)] p-3 font-mono-tabular text-[11px] text-[var(--text-secondary)]">
            {snippet}
          </pre>
        </div>
      </section>

      {/* Endpoints Reference Table */}
      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
        <div className="divide-y divide-[var(--border)]">
          {filtered.map((ep) => (
            <div
              key={`${ep.method}-${ep.path}`}
              className="flex flex-col gap-1.5 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
            >
              <div className="flex items-center gap-2 shrink-0">
                <span
                  className={`inline-flex w-14 shrink-0 justify-center rounded px-1.5 py-0.5 font-mono-tabular text-[10px] font-bold ${
                    ep.method === 'GET'
                      ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                      : ep.method === 'POST'
                        ? 'bg-sky-500/15 text-sky-600 dark:text-sky-400'
                        : ep.method === 'PATCH'
                          ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                          : 'bg-red-500/15 text-red-600 dark:text-red-400'
                  }`}
                >
                  {ep.method}
                </span>
                <code className="font-mono-tabular text-[11.5px] font-medium text-[var(--text-primary)] whitespace-nowrap">
                  {ep.path}
                </code>
              </div>
              <span className="text-[11px] text-[var(--text-muted)] sm:text-end">{ep.desc}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
});
