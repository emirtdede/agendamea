import { Check, Download, FolderOpen, Trash2, X } from 'lucide-react';
import React, { useEffect, useRef } from 'react';
import { useI18n } from '../../../i18n/I18nContext';
import type { AiStatusPayload } from '../../../types';
import { formatBytes } from './aiUtils';

interface ModelCatalogSectionProps {
  status: AiStatusPayload | null;
  busyModelId: string | null;
  onDownloadModel: (modelId: string) => void;
  onActivateModel?: (modelId: string) => void;
  onCancelDownload: (modelId: string) => void;
  onDeleteModel: (modelId: string) => void;
  onDeleteAll: () => void;
}

export const ModelCatalogSection = React.memo(function ModelCatalogSection({
  status,
  busyModelId,
  onDownloadModel,
  onActivateModel,
  onCancelDownload,
  onDeleteModel,
  onDeleteAll,
}: ModelCatalogSectionProps) {
  const { t } = useI18n();
  const hasDesktopBridge =
    typeof window !== 'undefined' && Boolean(window.agendameaWindow?.openModelsFolder);
  const speedTrackerRef = useRef<Map<string, { at: number; bytes: number; bps: number }>>(
    new Map(),
  );

  useEffect(() => {
    if (!status) return;
    const now = Date.now();
    for (const m of status.models) {
      if (m.downloading && m.progress) {
        const prev = speedTrackerRef.current.get(m.id);
        if (!prev) {
          speedTrackerRef.current.set(m.id, { at: now, bytes: m.progress.receivedBytes, bps: 0 });
        } else {
          const dtSec = (now - prev.at) / 1000;
          if (dtSec >= 0.4) {
            const deltaBytes = Math.max(0, m.progress.receivedBytes - prev.bytes);
            const instantBps = deltaBytes / dtSec;
            const smoothed = prev.bps > 0 ? prev.bps * 0.6 + instantBps * 0.4 : instantBps;
            speedTrackerRef.current.set(m.id, {
              at: now,
              bytes: m.progress.receivedBytes,
              bps: smoothed,
            });
          }
        }
      } else {
        speedTrackerRef.current.delete(m.id);
      }
    }
  }, [status]);

  return (
    <section
      aria-label={t.aiModelsSectionTitle}
      data-setting-id="ai-models"
      className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/75 p-4 sm:p-5 space-y-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
          {t.aiModelsSectionTitle}
        </h3>
        <div className="flex items-center gap-4">
          {hasDesktopBridge && (
            <button
              type="button"
              data-testid="ai-open-models-folder-btn"
              onClick={() => void window.agendameaWindow?.openModelsFolder?.()}
              className="inline-flex items-center gap-1 text-xs font-medium text-[var(--text-muted)] ag-hover-glow hover:text-[var(--text-primary)]"
            >
              <FolderOpen className="h-3.5 w-3.5" />
              <span>{t.aiOpenModelsFolderButton}</span>
            </button>
          )}
          {status && status.installedDiskBytes > 0 && (
            <button
              type="button"
              data-testid="ai-delete-all-models-btn"
              disabled={busyModelId !== null}
              onClick={onDeleteAll}
              className="inline-flex items-center gap-1 text-xs font-medium text-[var(--text-muted)] ag-hover-danger-glow hover:text-red-500 disabled:opacity-45"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>{t.aiDeleteAllModelsButton}</span>
            </button>
          )}
        </div>
      </div>

      <div className="border-y border-[var(--border)] divide-y divide-[var(--border)]/75">
        {!status ? (
          <div
            data-testid="ai-models-skeleton"
            className="divide-y divide-[var(--border)]/75 animate-pulse"
          >
            {[0, 1, 2, 3, 4].map((idx) => (
              <div key={idx} className="flex items-center justify-between gap-3 py-3">
                <div className="flex items-center gap-2">
                  <div className="h-3.5 w-32 rounded bg-[var(--surface-subtle)]" />
                  <div className="h-3 w-20 rounded bg-[var(--surface-subtle)]" />
                </div>
                <div className="h-6 w-14 rounded bg-[var(--surface-subtle)]" />
              </div>
            ))}
          </div>
        ) : (
          status.models.map((m) => {
            const isActiveForRole = Boolean(
              m.present &&
                ((m.role === 'stt' && status.settings.aiSttModelId === m.id) ||
                  (m.role === 'llm' &&
                    !status.settings.aiUseExternalOllama &&
                    status.settings.aiLlmModelId === m.id) ||
                  (m.role === 'embed' && status.settings.aiEmbedModelId === m.id)),
            );
            return (
              <div
                key={m.id}
                data-testid={`ai-model-row-${m.id}`}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
                    <span className="text-[13px] font-medium text-[var(--text-primary)]">
                      {m.label}
                    </span>
                    <span
                      lang="en"
                      className="font-mono-tabular text-[11px] uppercase text-[var(--text-muted)]"
                    >
                      {m.role} · {m.license}
                    </span>
                    <span className="font-mono-tabular text-[11px] text-[var(--text-muted)]">
                      {formatBytes(m.expectedBytes)}
                    </span>
                    {isActiveForRole ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--text-primary)]">
                        <Check className="h-3 w-3" />
                        <span>{t.cmdPaletteActiveBadge}</span>
                      </span>
                    ) : (
                      m.verified && (
                        <span className="inline-flex items-center gap-1 text-[11px] text-[var(--text-secondary)]">
                          <Check className="h-3 w-3" />
                          <span>{t.aiModelInstalledBadge}</span>
                        </span>
                      )
                    )}
                    {m.fitsHardware === false && (
                      <span
                        data-testid={`ai-model-hw-warn-${m.id}`}
                        title={m.warningCode || t.aiHardwareMemoryWarningBadge}
                        className="font-mono-tabular text-[10.5px] text-[var(--text-muted)]"
                      >
                        · {t.aiHardwareMemoryWarningBadge}
                      </span>
                    )}
                  </div>
                  {m.downloading && m.progress && (
                    <div className="mt-1.5 w-full max-w-xs space-y-1">
                      <div className="h-1 w-full overflow-hidden rounded-full bg-[var(--surface-subtle)]">
                        <div
                          className="h-full bg-[var(--accent)] transition-all"
                          style={{ width: `${m.progress.percent}%` }}
                        />
                      </div>
                      <p className="font-mono-tabular text-[10.5px] text-[var(--text-muted)]">
                        {t.aiModelDownloadingLabel} {m.progress.percent}% (
                        {formatBytes(m.progress.receivedBytes)} /{' '}
                        {formatBytes(m.progress.totalBytes)}){(() => {
                          const tr = speedTrackerRef.current.get(m.id);
                          if (!tr || tr.bps < 1024) return '';
                          const mbps = (tr.bps / (1024 * 1024)).toFixed(1);
                          const remBytes = Math.max(
                            0,
                            m.progress.totalBytes - m.progress.receivedBytes,
                          );
                          const etaSec = Math.ceil(remBytes / tr.bps);
                          const etaStr =
                            etaSec >= 60
                              ? `${Math.floor(etaSec / 60)}m ${etaSec % 60}s`
                              : `${etaSec}s`;
                          return ` · ${mbps} MB/s · ~${etaStr}`;
                        })()}
                      </p>
                    </div>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-3">
                  {m.downloading ? (
                    <button
                      type="button"
                      data-testid={`ai-model-cancel-${m.id}`}
                      onClick={() => onCancelDownload(m.id)}
                      className="inline-flex items-center gap-1 text-xs font-medium text-[var(--text-secondary)] ag-hover-glow hover:text-[var(--text-primary)]"
                    >
                      <X className="h-3.5 w-3.5" />
                      <span>{t.aiModelCancelButton}</span>
                    </button>
                  ) : m.present ? (
                    <>
                      {!isActiveForRole && onActivateModel && (
                        <button
                          type="button"
                          data-testid={`ai-model-activate-${m.id}`}
                          disabled={busyModelId === m.id}
                          onClick={() => onActivateModel(m.id)}
                          className="text-xs font-medium text-[var(--text-primary)] ag-hover-glow disabled:opacity-45"
                        >
                          {t.aiModelActivateButton}
                        </button>
                      )}
                      <button
                        type="button"
                        data-testid={`ai-model-delete-${m.id}`}
                        disabled={busyModelId === m.id}
                        onClick={() => onDeleteModel(m.id)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-[var(--text-muted)] ag-hover-danger-glow hover:text-red-500 disabled:opacity-45"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span>{t.aiModelDeleteButton}</span>
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      data-testid={`ai-model-download-${m.id}`}
                      disabled={busyModelId === m.id}
                      onClick={() => onDownloadModel(m.id)}
                      className="inline-flex items-center gap-1 text-xs font-medium text-[var(--text-secondary)] ag-hover-glow hover:text-[var(--text-primary)] disabled:opacity-45"
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span>{t.aiModelDownloadButton}</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
});
