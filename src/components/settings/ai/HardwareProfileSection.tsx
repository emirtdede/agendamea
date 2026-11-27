import { Check, RefreshCw, X } from 'lucide-react';
import React from 'react';
import { useI18n } from '../../../i18n/I18nContext';
import type { AiStatusPayload } from '../../../types';
import { formatBytes } from './aiUtils';

interface HardwareProfileSectionProps {
  status: AiStatusPayload | null;
  loading: boolean;
  rescanning: boolean;
  reindexing: boolean;
  reindexNotice: string | null;
  onRescan: () => void;
  onReindexRag: () => void;
  onDismissReindexNotice: () => void;
}

export const HardwareProfileSection = React.memo(function HardwareProfileSection({
  status,
  loading,
  rescanning,
  reindexing,
  reindexNotice,
  onRescan,
  onReindexRag,
  onDismissReindexNotice,
}: HardwareProfileSectionProps) {
  const { t } = useI18n();

  return (
    <section
      aria-label={t.aiHardwareCardTitle}
      data-testid="ai-hardware-card"
      className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/75 p-4 sm:p-5 space-y-3"
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
          {t.aiHardwareCardTitle}
        </h3>
        <button
          type="button"
          data-testid="ai-rescan-hardware-btn"
          disabled={rescanning || loading}
          onClick={onRescan}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--text-muted)] ag-hover-glow hover:text-[var(--text-primary)] disabled:opacity-45"
        >
          <RefreshCw className={`h-3 w-3 ${rescanning ? 'animate-spin' : ''}`} />
          <span>{t.aiHardwareRescanButton}</span>
        </button>
      </div>

      {status ? (
        <div className="grid grid-cols-2 border-y border-[var(--border)] divide-y divide-[var(--border)] sm:grid-cols-4 sm:divide-y-0 sm:divide-x">
          <div className="py-3 pe-3 sm:ps-0">
            <p className="text-[10.5px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
              {t.aiHardwareGpuVramLabel}
            </p>
            <p
              className="mt-1 truncate font-mono-tabular text-[13px] font-semibold text-[var(--text-primary)]"
              title={status.hardware.gpuName}
            >
              {status.hardware.vramGb > 0
                ? `${status.hardware.vramGb} GB`
                : t.aiHardwareIgpuCpuLabel}
            </p>
            <p className="mt-0.5 truncate text-[11px] text-[var(--text-muted)]">
              {status.hardware.gpuName}
            </p>
          </div>

          <div className="py-3 ps-3 sm:px-3.5">
            <p className="text-[10.5px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
              RAM
            </p>
            <p className="mt-1 font-mono-tabular text-[13px] font-semibold text-[var(--text-primary)]">
              {status.hardware.ramGb} GB
            </p>
            <p className="mt-0.5 font-mono-tabular text-[11px] text-[var(--text-muted)]">
              {status.hardware.cpuCores} CPU
            </p>
          </div>

          <div className="py-3 pe-3 sm:px-3.5">
            <p className="text-[10.5px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
              {t.aiHardwareDiskLabel}
            </p>
            <p className="mt-1 font-mono-tabular text-[13px] font-semibold text-[var(--text-primary)]">
              {status.hardware.freeDiskGb !== null ? `${status.hardware.freeDiskGb} GB` : '-'}
            </p>
            {status.installedDiskBytes > 0 && (
              <p className="mt-0.5 font-mono-tabular text-[11px] text-[var(--text-muted)]">
                {formatBytes(status.installedDiskBytes)}
              </p>
            )}
          </div>

          <div className="py-3 ps-3 sm:pe-0 sm:ps-3.5">
            <p className="text-[10.5px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
              {t.aiRagChunksLabel}
            </p>
            {status.ragIndexedChunks > 0 && (
              <p className="mt-1 font-mono-tabular text-[13px] font-semibold text-[var(--text-primary)]">
                {status.ragIndexedChunks}
              </p>
            )}
            <button
              type="button"
              data-testid="ai-rag-reindex-btn"
              disabled={reindexing}
              onClick={onReindexRag}
              className="mt-1 text-xs font-medium text-[var(--text-secondary)] underline decoration-[var(--border-strong)] underline-offset-4 ag-hover-glow hover:text-[var(--text-primary)] disabled:opacity-45"
            >
              {t.aiRagReindexButton}
            </button>
          </div>
        </div>
      ) : (
        <div
          data-testid="ai-hardware-skeleton"
          className="grid grid-cols-2 border-y border-[var(--border)] sm:grid-cols-4 animate-pulse"
        >
          {[0, 1, 2, 3].map((idx) => (
            <div key={idx} className="px-3 py-3 space-y-1.5">
              <div className="h-2.5 w-14 rounded bg-[var(--surface-subtle)]" />
              <div className="h-3.5 w-16 rounded bg-[var(--surface-subtle)]" />
              <div className="h-2.5 w-20 rounded bg-[var(--surface-subtle)]" />
            </div>
          ))}
        </div>
      )}

      {reindexNotice && (
        <div
          role="status"
          data-testid="ai-rag-reindex-status"
          className="flex items-center justify-between gap-2 text-xs text-[var(--text-secondary)] animate-fade-in"
        >
          <div className="flex min-w-0 items-center gap-1.5">
            <Check className="h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0 break-words">{reindexNotice}</span>
          </div>
          <button
            type="button"
            onClick={onDismissReindexNotice}
            aria-label={t.closeMenu}
            className="shrink-0 p-0.5 text-[var(--text-muted)] ag-hover-glow hover:text-[var(--text-primary)]"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </section>
  );
});
