import { Database, RefreshCw } from 'lucide-react';
import React, { useMemo } from 'react';
import { useI18n } from '../../../i18n/I18nContext';
import type { AiStatusPayload, AiTierId } from '../../../types';
import { SelectField } from '../../SelectField';
import { formatBytes } from './aiUtils';

interface TierSelectorSectionProps {
  status: AiStatusPayload | null;
  selectedTier: AiTierId;
  externalModel: string;
  externalBaseUrl: string;
  detectedExternalModels: string[];
  isExternalTierSelected: boolean;
  rescanning: boolean;
  onSelectTier: (tierId: AiTierId) => void;
  onChangeExternalModelDraft: (modelName: string) => void;
  onCommitExternalModel: (modelName: string) => void;
  onChangeExternalBaseUrlDraft: (url: string) => void;
  onCommitExternalBaseUrl: (url: string) => void;
  onRescanExternal: () => void;
}

export const TierSelectorSection = React.memo(function TierSelectorSection({
  status,
  selectedTier,
  externalModel,
  externalBaseUrl,
  detectedExternalModels,
  isExternalTierSelected,
  rescanning,
  onSelectTier,
  onChangeExternalModelDraft,
  onCommitExternalModel,
  onChangeExternalBaseUrlDraft,
  onCommitExternalBaseUrl,
  onRescanExternal,
}: TierSelectorSectionProps) {
  const { t } = useI18n();

  const tierCards = useMemo(
    () => [
      { id: 'tier-light' as const, title: t.aiTierLightTitle, desc: t.aiTierLightDesc },
      { id: 'tier-medium' as const, title: t.aiTierMediumTitle, desc: t.aiTierMediumDesc },
      { id: 'tier-strong' as const, title: t.aiTierStrongTitle, desc: t.aiTierStrongDesc },
    ],
    [
      t.aiTierLightTitle,
      t.aiTierLightDesc,
      t.aiTierMediumTitle,
      t.aiTierMediumDesc,
      t.aiTierStrongTitle,
      t.aiTierStrongDesc,
    ],
  );

  const externalDetected = Boolean(
    status?.recommendation.externalOllama.detected ||
      status?.recommendation.externalLmStudio.detected,
  );

  return (
    <section
      className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/75 p-4 sm:p-5 space-y-4"
      data-testid="ai-tier-selector"
    >
      <div className="grid grid-cols-1 border-y border-[var(--border)] divide-y divide-[var(--border)] sm:grid-cols-3 sm:divide-y-0 sm:divide-x">
        {tierCards.map((card) => {
          const tierMeta = status?.recommendation.tiers.find((item) => item.id === card.id);
          const isSelected = selectedTier === card.id;
          const isRecommended = status?.recommendation.recommendedTier === card.id;
          return (
            <button
              key={card.id}
              type="button"
              data-testid={`ai-tier-${card.id}`}
              onClick={() => onSelectTier(card.id)}
              className={`relative flex flex-col items-start gap-1.5 px-3.5 py-3.5 text-start transition-colors ${
                isSelected ? 'bg-[var(--surface)]/70' : 'bg-transparent ag-hover-glow'
              }`}
            >
              <span
                aria-hidden="true"
                className={`absolute inset-x-0 top-0 h-[1.5px] transition-opacity ${
                  isSelected ? 'bg-[var(--text-primary)] opacity-100' : 'opacity-0'
                }`}
              />
              <span
                className={`w-full text-[13px] font-semibold leading-snug ${
                  isSelected ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'
                }`}
              >
                {card.title}
              </span>
              <p className="text-[11.5px] leading-relaxed text-[var(--text-muted)]">{card.desc}</p>
              <div className="mt-auto flex w-full flex-wrap items-baseline justify-between gap-1.5 pt-2">
                <span className="font-mono-tabular text-[11px] text-[var(--text-secondary)] whitespace-nowrap">
                  {tierMeta ? formatBytes(tierMeta.totalBytes) : ''}
                </span>
                {isRecommended && (
                  <span
                    data-testid="ai-recommended-badge"
                    className="text-[10.5px] font-medium text-[var(--text-muted)]"
                  >
                    {t.aiTierRecommendedBadge}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* External Ollama / LM Studio Row */}
      <div className="pt-1">
        <button
          type="button"
          data-testid="ai-tier-external-ollama"
          onClick={() =>
            onSelectTier(
              status?.recommendation.externalLmStudio.detected &&
                !status?.recommendation.externalOllama.detected
                ? 'external-lmstudio'
                : 'external-ollama',
            )
          }
          className="flex w-full items-center justify-between gap-3 py-1 text-start ag-hover-glow"
        >
          <div className="min-w-0 space-y-0.5">
            <div className="flex flex-wrap items-center gap-2">
              <Database className="h-3.5 w-3.5 text-[var(--text-muted)] shrink-0" />
              <span
                className={`text-[13px] font-medium ${
                  isExternalTierSelected
                    ? 'text-[var(--text-primary)]'
                    : 'text-[var(--text-secondary)]'
                }`}
              >
                {t.aiExternalOllamaTitle}
              </span>
              {externalDetected && (
                <span className="text-[11px] font-medium text-[var(--text-muted)]">
                  · {t.aiExternalDetectedBadge}
                </span>
              )}
            </div>
            <p className="text-xs text-[var(--text-muted)] ps-5.5">{t.aiExternalOllamaDesc}</p>
          </div>
          {isExternalTierSelected && (
            <span className="text-[11px] font-medium text-[var(--text-primary)] shrink-0">
              {t.cmdPaletteActiveBadge}
            </span>
          )}
        </button>

        {isExternalTierSelected && (
          <div
            data-testid="ai-external-model-panel"
            className="animate-accordion mt-3 ps-5.5 space-y-2.5"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-[var(--text-muted)]">{t.aiExternalModelLabel}:</span>
              {detectedExternalModels.length > 0 ? (
                <SelectField
                  data-testid="ai-external-model-select"
                  value={externalModel}
                  onChange={(e) => onCommitExternalModel(e.target.value)}
                  wrapperClassName="min-w-[200px] flex-1 sm:max-w-[280px]"
                >
                  <option value="">{t.aiExternalModelAutoOption}</option>
                  {detectedExternalModels.map((modelName) => (
                    <option key={modelName} value={modelName}>
                      {modelName}
                    </option>
                  ))}
                </SelectField>
              ) : (
                <input
                  type="text"
                  data-testid="ai-external-model-input"
                  value={externalModel}
                  onChange={(e) => onChangeExternalModelDraft(e.target.value)}
                  onBlur={(e) => onCommitExternalModel(e.target.value)}
                  placeholder={t.aiExternalModelCustomPlaceholder}
                  className="min-w-[200px] flex-1 rounded-lg border border-[var(--border)] bg-transparent px-2.5 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--text-secondary)] sm:max-w-[280px]"
                />
              )}
              <button
                type="button"
                data-testid="ai-external-rescan-btn"
                disabled={rescanning}
                onClick={onRescanExternal}
                className="inline-flex items-center gap-1 text-xs font-medium text-[var(--text-muted)] ag-hover-glow hover:text-[var(--text-primary)] disabled:opacity-45"
              >
                <RefreshCw className={`h-3 w-3 ${rescanning ? 'animate-spin' : ''}`} />
                <span>{t.aiHardwareRescanButton}</span>
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-[var(--text-muted)]">{t.aiExternalBaseUrlLabel}:</span>
              <input
                type="url"
                data-testid="ai-external-baseurl-input"
                value={externalBaseUrl}
                onChange={(e) => onChangeExternalBaseUrlDraft(e.target.value)}
                onBlur={(e) => onCommitExternalBaseUrl(e.target.value)}
                placeholder="http://127.0.0.1:11434"
                className="min-w-[220px] flex-1 rounded-lg border border-[var(--border)] bg-transparent px-2.5 py-1.5 font-mono-tabular text-xs text-[var(--text-primary)] outline-none focus:border-[var(--text-secondary)] sm:max-w-[320px]"
              />
            </div>
            {detectedExternalModels.length === 0 && (
              <p className="text-xs text-[var(--text-muted)]">{t.aiExternalOfflineHint}</p>
            )}
          </div>
        )}
      </div>
    </section>
  );
});
