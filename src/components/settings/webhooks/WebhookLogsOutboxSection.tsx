import { ChevronDown, ChevronRight, RefreshCw, RotateCcw, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useI18n } from '../../../i18n/I18nContext';
import type { WebhookLogEntry, WebhookOutboxEntry } from '../../../types';

interface WebhookLogsOutboxSectionProps {
  logs: WebhookLogEntry[];
  pendingOrDeadOutbox: WebhookOutboxEntry[];
  isLoadingLogs: boolean;
  replayingId: string | null;
  onRefresh: () => Promise<void>;
  onClearLogs: () => Promise<void>;
  onReplayOutbox: (id: string) => Promise<void>;
}

export function WebhookLogsOutboxSection({
  logs,
  pendingOrDeadOutbox,
  isLoadingLogs,
  replayingId,
  onRefresh,
  onClearLogs,
  onReplayOutbox,
}: WebhookLogsOutboxSectionProps) {
  const { t } = useI18n();
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  return (
    <div className="p-4 space-y-3" data-testid="docs-webhook-logs-panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold text-[var(--text-primary)]">
          {t.webhookLogsTitle}
        </span>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            disabled={isLoadingLogs}
            onClick={() => void onRefresh()}
            className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--canvas)] px-2 py-1 text-[11px] font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)] disabled:opacity-45 transition-colors"
          >
            <RefreshCw
              className={`h-3 w-3 text-[var(--accent)] ${isLoadingLogs ? 'animate-spin' : ''}`}
            />
            <span>{t.webhookLogsRefreshBtn}</span>
          </button>
          {logs.length > 0 && (
            <button
              type="button"
              onClick={() => void onClearLogs()}
              className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--canvas)] px-2 py-1 text-[11px] font-medium text-[var(--text-muted)] hover:text-red-500 transition-colors"
            >
              <Trash2 className="h-3 w-3" />
              <span>{t.webhookLogsClearBtn}</span>
            </button>
          )}
        </div>
      </div>

      {pendingOrDeadOutbox.length > 0 && (
        <div className="space-y-1.5 rounded-lg border border-amber-500/30 bg-amber-500/5 p-2.5">
          <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-300">
            {`${t.webhookOutboxTitle} (${pendingOrDeadOutbox.length})`}
          </p>
          <div className="divide-y divide-[var(--border)]/60">
            {pendingOrDeadOutbox.slice(0, 8).map((item) => (
              <div
                key={item.id}
                className="flex items-start justify-between gap-2 py-1.5 text-[11px]"
              >
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="font-mono-tabular font-semibold text-[var(--text-primary)]">
                      {item.event}
                    </span>
                    <span className="font-mono-tabular text-[var(--text-muted)] break-all">
                      {item.targetUrl}
                    </span>
                  </div>
                  <p className="break-words text-red-600 dark:text-red-400">
                    {`HTTP ${item.lastStatusCode ?? '-'} · x${item.attempts}/${item.maxAttempts}${item.lastError ? ` · ${item.lastError}` : ''}`}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={replayingId === item.id}
                  onClick={() => void onReplayOutbox(item.id)}
                  className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-0.5 text-[11px] font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)] disabled:opacity-45 shrink-0"
                >
                  <RotateCcw className="h-3 w-3 text-[var(--accent)]" />
                  <span>{t.webhookReplayBtn}</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {logs.length === 0 ? (
        <p className="text-xs text-[var(--text-muted)]">{t.webhookLogsEmpty}</p>
      ) : (
        <div className="max-h-64 overflow-y-auto divide-y divide-[var(--border)] rounded-lg border border-[var(--border)] bg-[var(--canvas)]">
          {logs.map((entry) => {
            const isOpen = expandedLogId === entry.id;
            return (
              <div key={entry.id}>
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => setExpandedLogId((prev) => (prev === entry.id ? null : entry.id))}
                  className="flex w-full flex-wrap items-center justify-between gap-2 px-3 py-2 text-start text-[11px] hover:bg-[var(--surface-hover)]/60 transition-colors"
                >
                  <div className="min-w-0 flex-1 flex flex-wrap items-center gap-1.5">
                    {isOpen ? (
                      <ChevronDown className="h-3 w-3 text-[var(--text-muted)] shrink-0" />
                    ) : (
                      <ChevronRight className="h-3 w-3 text-[var(--text-muted)] shrink-0" />
                    )}
                    <span
                      className={`rounded px-1.5 py-0.5 font-mono-tabular text-[10px] font-semibold ${
                        entry.ok
                          ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                          : 'bg-red-500/15 text-red-600 dark:text-red-400'
                      }`}
                    >
                      {entry.ok
                        ? `HTTP ${entry.statusCode ?? 200}`
                        : `ERR ${entry.statusCode ?? '-'}`}
                    </span>
                    <span
                      lang="en"
                      title={entry.direction}
                      className="rounded bg-[var(--surface)] px-1.5 py-0.5 font-mono-tabular text-[10px] font-medium uppercase text-[var(--text-muted)]"
                    >
                      {entry.direction === 'incoming' ? 'IN' : 'OUT'}
                    </span>
                    <span className="font-mono-tabular font-semibold text-[var(--text-primary)]">
                      {entry.event}
                    </span>
                    <span
                      title={entry.targetUrl}
                      className="min-w-0 max-w-full sm:max-w-[240px] font-mono-tabular text-[var(--text-muted)] truncate"
                    >
                      {entry.targetUrl}
                    </span>
                  </div>
                  <span className="font-mono-tabular text-[10px] text-[var(--text-muted)] shrink-0">
                    {`${entry.latencyMs}ms · x${entry.attempts}`}
                  </span>
                </button>
                {isOpen && (
                  <div className="border-t border-[var(--border)]/60 bg-[var(--surface)] px-4 py-2.5 font-mono-tabular text-[10.5px] text-[var(--text-secondary)] space-y-1">
                    <div>
                      <span className="text-[var(--text-muted)]">ID: </span>
                      {entry.id}
                    </div>
                    <div className="break-all">
                      <span className="text-[var(--text-muted)]">URL: </span>
                      {entry.targetUrl || '-'}
                    </div>
                    <div>
                      <span className="text-[var(--text-muted)]">{t.dueTimeLabel}: </span>
                      {entry.createdAt}
                    </div>
                    {entry.error && (
                      <div className="break-words text-red-600 dark:text-red-400">
                        <span>{t.docsMcpClientErrorBadge}: </span>
                        {entry.error}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
