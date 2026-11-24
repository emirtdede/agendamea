import { Database, RefreshCw, Sparkles } from 'lucide-react';
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

  return (
    <section className="space-y-2.5" data-testid="ai-tier-selector">
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
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
              className={`flex flex-col items-start gap-1.5 rounded-xl border p-3.5 text-start transition-all ${
                isSelected
                  ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                  : 'border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-hover)]'
              }`}
            >
              <span className="w-full text-xs font-semibold leading-snug text-[var(--text-primary)]">
                {card.title}
              </span>
              <p className="text-[11px] leading-snug text-[var(--text-muted)]">{card.desc}</p>
              <div className="mt-auto flex w-full flex-wrap items-center justify-between gap-1.5 pt-1.5">
                <span className="font-mono-tabular text-[10.5px] text-[var(--text-secondary)] whitespace-nowrap">
                  {tierMeta ? formatBytes(tierMeta.totalBytes) : ''}
                </span>
                {isRecommended && (
                  <span
                    data-testid="ai-recommended-badge"
                    className="inline-flex max-w-full items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400"
                  >
                    <Sparkles className="h-2.5 w-2.5 shrink-0" />
                    <span className="truncate">{t.aiTierRecommendedBadge}</span>
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* External Ollama / LM Studio Zero-Download Card + Model Picker */}
      <div
        className={`rounded-xl border transition-all ${
          isExternalTierSelected
            ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
            : 'border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-hover)]'
        }`}
      >
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
          className="flex w-full items-center justify-between gap-3 p-3.5 text-start"
        >
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Database className="h-3.5 w-3.5 text-[var(--accent)]" />
              <span className="text-xs font-semibold text-[var(--text-primary)]">
                {t.aiExternalOllamaTitle}
              </span>
              {(status?.recommendation.externalOllama.detected ||
                status?.recommendation.externalLmStudio.detected) && (
                <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                  {t.aiExternalDetectedBadge}
                </span>
              )}
            </div>
            <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">{t.aiExternalOllamaDesc}</p>
          </div>
        </button>

        {isExternalTierSelected && (
          <div
            data-testid="ai-external-model-panel"
            className="animate-accordion border-t border-[var(--border)]/70 px-3.5 py-3 space-y-2.5"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-medium text-[var(--text-secondary)]">
                {t.aiExternalModelLabel}:
              </span>
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
                  className="min-w-[200px] flex-1 rounded-lg border border-[var(--border)] bg-[var(--canvas)] px-2.5 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent)] sm:max-w-[280px]"
                />
              )}
              <button
                type="button"
                data-testid="ai-external-rescan-btn"
                disabled={rescanning}
                onClick={onRescanExternal}
                className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--canvas)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-hover)] disabled:opacity-50"
              >
                <RefreshCw className={`h-3 w-3 ${rescanning ? 'animate-spin' : ''}`} />
                <span>{t.aiHardwareRescanButton}</span>
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-medium text-[var(--text-secondary)]">
                {t.aiExternalBaseUrlLabel}:
              </span>
              <input
                type="url"
                data-testid="ai-external-baseurl-input"
                value={externalBaseUrl}
                onChange={(e) => onChangeExternalBaseUrlDraft(e.target.value)}
                onBlur={(e) => onCommitExternalBaseUrl(e.target.value)}
                placeholder="http://127.0.0.1:11434"
                className="min-w-[220px] flex-1 rounded-lg border border-[var(--border)] bg-[var(--canvas)] px-2.5 py-1.5 font-mono-tabular text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent)] sm:max-w-[320px]"
              />
            </div>
            {detectedExternalModels.length === 0 && (
              <p className="text-[11px] text-[var(--text-muted)]">{t.aiExternalOfflineHint}</p>
            )}
          </div>
        )}
      </div>
    </section>
  );
});
