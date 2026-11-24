import { CheckCircle2, Cpu, RefreshCw, ShieldCheck, X } from 'lucide-react';
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
    <>
      {/* Privacy Zero-Cloud Banner */}
      <div className="flex items-center gap-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-xs text-emerald-700 dark:text-emerald-300">
        <ShieldCheck className="h-4 w-4 shrink-0" />
        <span>{t.aiPrivacyBadgeText}</span>
      </div>

      {/* Hardware Profile Card (with 1:1 Skeleton while loading) */}
      <section
        aria-label={t.aiHardwareCardTitle}
        data-testid="ai-hardware-card"
        className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 space-y-3"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Cpu className="h-4 w-4 text-[var(--accent)]" />
            <h3 className="font-display text-xs font-semibold text-[var(--text-primary)]">
              {t.aiHardwareCardTitle}
            </h3>
          </div>
          <button
            type="button"
            data-testid="ai-rescan-hardware-btn"
            disabled={rescanning || loading}
            onClick={onRescan}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--canvas)] px-2.5 py-1 text-xs font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-hover)] disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${rescanning ? 'animate-spin' : ''}`} />
            <span>{t.aiHardwareRescanButton}</span>
          </button>
        </div>

        {status ? (
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <div className="rounded-lg border border-[var(--border)] bg-[var(--canvas)] px-3 py-2">
              <p className="text-[10px] font-medium uppercase text-[var(--text-muted)]">
                {t.aiHardwareGpuVramLabel}
              </p>
              <p
                className="mt-0.5 truncate text-xs font-semibold text-[var(--text-primary)]"
                title={status.hardware.gpuName}
              >
                {status.hardware.vramGb > 0
                  ? `${status.hardware.vramGb} GB`
                  : t.aiHardwareIgpuCpuLabel}
              </p>
              <p className="truncate text-[10px] text-[var(--text-muted)]">
                {status.hardware.gpuName}
              </p>
            </div>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--canvas)] px-3 py-2">
              <p className="text-[10px] font-medium uppercase text-[var(--text-muted)]">RAM</p>
              <p className="mt-0.5 text-xs font-semibold text-[var(--text-primary)]">
                {status.hardware.ramGb} GB
              </p>
              <p className="text-[10px] text-[var(--text-muted)] font-mono-tabular">
                {status.hardware.cpuCores} CPU
              </p>
            </div>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--canvas)] px-3 py-2">
              <p className="text-[10px] font-medium uppercase text-[var(--text-muted)]">
                {t.aiHardwareDiskLabel}
              </p>
              <p className="mt-0.5 text-xs font-semibold text-[var(--text-primary)]">
                {status.hardware.freeDiskGb !== null ? `${status.hardware.freeDiskGb} GB` : '-'}
              </p>
              <p className="text-[10px] text-[var(--text-muted)]">
                {formatBytes(status.installedDiskBytes)}
              </p>
            </div>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--canvas)] px-3 py-2">
              <p className="text-[10px] font-medium uppercase text-[var(--text-muted)]">
                {t.aiRagChunksLabel}
              </p>
              <p className="mt-0.5 text-xs font-semibold text-[var(--text-primary)]">
                {status.ragIndexedChunks}
              </p>
              <button
                type="button"
                data-testid="ai-rag-reindex-btn"
                disabled={reindexing}
                onClick={onReindexRag}
                className="mt-0.5 text-[10px] font-medium text-[var(--accent)] hover:underline disabled:opacity-50"
              >
                {t.aiRagReindexButton}
              </button>
            </div>
          </div>
        ) : (
          <div
            data-testid="ai-hardware-skeleton"
            className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 animate-pulse"
          >
            {[0, 1, 2, 3].map((idx) => (
              <div
                key={idx}
                className="rounded-lg border border-[var(--border)] bg-[var(--canvas)] px-3 py-2 space-y-1.5"
              >
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
            className="flex items-center justify-between gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400 animate-fade-in"
          >
            <div className="flex min-w-0 items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0 break-words">{reindexNotice}</span>
            </div>
            <button
              type="button"
              onClick={onDismissReindexNotice}
              aria-label={t.closeMenu}
              className="shrink-0 rounded p-0.5 opacity-75 hover:opacity-100"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </section>
    </>
  );
});
