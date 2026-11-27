import {
  AlertTriangle,
  ArrowRight,
  Check,
  Circle,
  Cpu,
  Download,
  Loader2,
  Sliders,
  Sparkles,
  X,
  Zap,
} from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import { useI18n } from '../../../i18n/I18nContext';
import type {
  AiProfileGroup,
  AiProfilePreset,
  AiSetupState,
  AiStatusPayload,
  AiTierId,
} from '../../../types';
import { InfoTooltip } from '../../InfoTooltip';
import { SelectField } from '../../SelectField';
import { formatBytes } from './aiUtils';

export interface CustomAiModelSelection {
  sttModelId: string;
  llmModelId: string;
  embedModelId: string;
}

interface AiOneClickSetupHeroProps {
  status: AiStatusPayload | null;
  loading: boolean;
  setup: AiSetupState | null;
  selectedProfileId: AiTierId;
  customModels: CustomAiModelSelection;
  isStartingSetup: boolean;
  isWarmingUp: boolean;
  onSelectProfileId: (profileId: AiTierId) => void;
  onChangeCustomModels: (next: CustomAiModelSelection) => void;
  onStartOneClickSetup: (payload: {
    profileId: AiTierId;
    customModels?: CustomAiModelSelection;
  }) => void;
  onCancelSetup: () => void;
  onWarmup: () => void;
  onOpenAdvancedModels: () => void;
}

type ReadyProfileId = AiProfilePreset['id'];

const FALLBACK_PROFILES: readonly AiProfilePreset[] = [
  {
    id: 'cpu-light',
    group: 'cpu',
    legacyTier: 'tier-light',
    minRamGb: 4,
    minVramGb: 0,
    sttModelId: 'whisper-base-q5_1',
    llmModelId: 'qwen3-0.6b-q8_0',
    embedModelId: 'multilingual-e5-small-q8_0',
    totalBytes: 830_779_273,
    recommended: false,
    fitsHardware: true,
    warningCode: null,
  },
  {
    id: 'cpu-balanced',
    group: 'cpu',
    legacyTier: 'tier-light',
    minRamGb: 8,
    minVramGb: 0,
    sttModelId: 'whisper-small-q5_1',
    llmModelId: 'qwen3-1.7b-q8_0',
    embedModelId: 'multilingual-e5-small-q8_0',
    totalBytes: 2_156_136_463,
    recommended: false,
    fitsHardware: true,
    warningCode: null,
  },
  {
    id: 'gpu-very-weak',
    group: 'gpu',
    legacyTier: 'tier-light',
    minRamGb: 4,
    minVramGb: 2,
    sttModelId: 'whisper-base-q5_1',
    llmModelId: 'qwen3-0.6b-q8_0',
    embedModelId: 'multilingual-e5-small-q8_0',
    totalBytes: 830_779_273,
    recommended: false,
    fitsHardware: true,
    warningCode: null,
  },
  {
    id: 'gpu-weak',
    group: 'gpu',
    legacyTier: 'tier-light',
    minRamGb: 8,
    minVramGb: 4,
    sttModelId: 'whisper-small-q5_1',
    llmModelId: 'qwen3-1.7b-q8_0',
    embedModelId: 'multilingual-e5-small-q8_0',
    totalBytes: 2_156_136_463,
    recommended: false,
    fitsHardware: true,
    warningCode: null,
  },
  {
    id: 'gpu-balanced',
    group: 'gpu',
    legacyTier: 'tier-medium',
    minRamGb: 12,
    minVramGb: 6,
    sttModelId: 'whisper-small-q5_1',
    llmModelId: 'qwen3-4b-q4_k_m',
    embedModelId: 'multilingual-e5-small-q8_0',
    totalBytes: 2_818_990_703,
    recommended: false,
    fitsHardware: true,
    warningCode: null,
  },
  {
    id: 'gpu-strong',
    group: 'gpu',
    legacyTier: 'tier-medium',
    minRamGb: 16,
    minVramGb: 8,
    sttModelId: 'whisper-large-v3-turbo-q5_0',
    llmModelId: 'qwen3-4b-q4_k_m',
    embedModelId: 'qwen3-embedding-0.6b-q8_0',
    totalBytes: 3_710_472_043,
    recommended: false,
    fitsHardware: true,
    warningCode: null,
  },
  {
    id: 'gpu-ultra',
    group: 'gpu',
    legacyTier: 'tier-strong',
    minRamGb: 16,
    minVramGb: 12,
    sttModelId: 'whisper-large-v3-turbo-q5_0',
    llmModelId: 'qwen3-8b-q4_k_m',
    embedModelId: 'qwen3-embedding-0.6b-q8_0',
    totalBytes: 6_240_975_275,
    recommended: false,
    fitsHardware: true,
    warningCode: null,
  },
];

function inferGroupFromProfileId(id: AiTierId, fallbackGroup: 'cpu' | 'gpu'): AiProfileGroup {
  if (id === 'custom') return 'custom';
  if (id.startsWith('cpu-')) return 'cpu';
  if (id.startsWith('gpu-')) return 'gpu';
  return fallbackGroup;
}

export const AiOneClickSetupHero = React.memo(function AiOneClickSetupHero({
  status,
  loading,
  setup,
  selectedProfileId,
  customModels,
  isStartingSetup,
  isWarmingUp,
  onSelectProfileId,
  onChangeCustomModels,
  onStartOneClickSetup,
  onCancelSetup,
  onWarmup,
  onOpenAdvancedModels,
}: AiOneClickSetupHeroProps) {
  const { t } = useI18n();

  const detectedGroup: 'cpu' | 'gpu' =
    status?.recommendation?.recommendedProfileGroup ??
    (status?.hardware?.hasDiscreteGpu && (status?.hardware?.vramGb ?? 0) >= 2 ? 'gpu' : 'cpu');

  const [profileGroup, setProfileGroup] = useState<AiProfileGroup>(() =>
    inferGroupFromProfileId(selectedProfileId, detectedGroup),
  );

  // Sync group automatically on initial hardware hydration unless user chose custom
  useEffect(() => {
    if (!status) return;
    if (selectedProfileId === 'custom') {
      setProfileGroup('custom');
    } else if (selectedProfileId.startsWith('cpu-')) {
      setProfileGroup('cpu');
    } else if (selectedProfileId.startsWith('gpu-')) {
      setProfileGroup('gpu');
    } else {
      setProfileGroup(detectedGroup);
    }
  }, [detectedGroup, selectedProfileId, status]);

  const readiness = useMemo(() => {
    if (!status) {
      return {
        dictationReady: false,
        assistantReady: false,
        semanticSearchReady: false,
        fullyReady: false,
      };
    }
    if (status.readiness) return status.readiness;
    const dictationReady = status.models.some((m) => m.role === 'stt' && m.present);
    const hasExternal =
      (status.recommendation?.externalOllama?.models?.length ?? 0) > 0 ||
      (status.recommendation?.externalLmStudio?.models?.length ?? 0) > 0;
    const assistantReady = status.models.some((m) => m.role === 'llm' && m.present) || hasExternal;
    const semanticSearchReady = status.models.some((m) => m.role === 'embed' && m.present);
    return {
      dictationReady,
      assistantReady,
      semanticSearchReady,
      fullyReady: dictationReady && assistantReady,
    };
  }, [status]);

  const profileLabels = useMemo<Record<ReadyProfileId, { title: string; desc: string }>>(
    () => ({
      'cpu-light': { title: t.aiProfileCpuLightTitle, desc: t.aiProfileCpuLightDesc },
      'cpu-balanced': { title: t.aiProfileCpuBalancedTitle, desc: t.aiProfileCpuBalancedDesc },
      'gpu-very-weak': { title: t.aiProfileGpuVeryWeakTitle, desc: t.aiProfileGpuVeryWeakDesc },
      'gpu-weak': { title: t.aiProfileGpuWeakTitle, desc: t.aiProfileGpuWeakDesc },
      'gpu-balanced': { title: t.aiProfileGpuBalancedTitle, desc: t.aiProfileGpuBalancedDesc },
      'gpu-strong': { title: t.aiProfileGpuStrongTitle, desc: t.aiProfileGpuStrongDesc },
      'gpu-ultra': { title: t.aiProfileGpuUltraTitle, desc: t.aiProfileGpuUltraDesc },
    }),
    [
      t.aiProfileCpuBalancedDesc,
      t.aiProfileCpuBalancedTitle,
      t.aiProfileCpuLightDesc,
      t.aiProfileCpuLightTitle,
      t.aiProfileGpuBalancedDesc,
      t.aiProfileGpuBalancedTitle,
      t.aiProfileGpuStrongDesc,
      t.aiProfileGpuStrongTitle,
      t.aiProfileGpuUltraDesc,
      t.aiProfileGpuUltraTitle,
      t.aiProfileGpuVeryWeakDesc,
      t.aiProfileGpuVeryWeakTitle,
      t.aiProfileGpuWeakDesc,
      t.aiProfileGpuWeakTitle,
    ],
  );

  const allProfiles = useMemo(() => {
    const raw =
      status?.recommendation?.profiles && status.recommendation.profiles.length > 0
        ? status.recommendation.profiles
        : FALLBACK_PROFILES;
    return raw.map((p) => {
      const modelIds = [p.sttModelId, p.llmModelId, p.embedModelId];
      const allInstalled =
        Boolean(status) &&
        modelIds.every((id) => status?.models.some((m) => m.id === id && m.present));
      return {
        ...p,
        title: profileLabels[p.id]?.title ?? p.id,
        desc: profileLabels[p.id]?.desc ?? '',
        allInstalled,
      };
    });
  }, [profileLabels, status]);

  const visibleProfiles = useMemo(
    () => allProfiles.filter((p) => p.group === profileGroup),
    [allProfiles, profileGroup],
  );

  const sttModels = useMemo(
    () => (status?.models ?? []).filter((m) => m.role === 'stt'),
    [status?.models],
  );
  const llmModels = useMemo(
    () => (status?.models ?? []).filter((m) => m.role === 'llm'),
    [status?.models],
  );
  const embedModels = useMemo(
    () => (status?.models ?? []).filter((m) => m.role === 'embed'),
    [status?.models],
  );

  const customValidation = useMemo(() => {
    const stt = sttModels.find((m) => m.id === customModels.sttModelId) ?? null;
    const llm = llmModels.find((m) => m.id === customModels.llmModelId) ?? null;
    const embed = embedModels.find((m) => m.id === customModels.embedModelId) ?? null;
    const selectedCount = (stt ? 1 : 0) + (llm ? 1 : 0) + (embed ? 1 : 0);
    const totalBytes =
      (stt?.expectedBytes ?? 0) + (llm?.expectedBytes ?? 0) + (embed?.expectedBytes ?? 0);
    const allInstalled = Boolean(stt?.present && llm?.present && embed?.present);
    const anyHardwareWarning =
      stt?.fitsHardware === false || llm?.fitsHardware === false || embed?.fitsHardware === false;
    return {
      ok: Boolean(stt && llm && embed),
      selectedCount,
      totalBytes,
      allInstalled,
      anyHardwareWarning,
    };
  }, [customModels, embedModels, llmModels, sttModels]);

  const selectedReadyProfile =
    allProfiles.find((p) => p.id === selectedProfileId) ??
    visibleProfiles.find((p) => p.recommended) ??
    visibleProfiles[0] ??
    allProfiles[0];

  const isCustomMode = profileGroup === 'custom';
  const isInstalling = Boolean(setup?.active) || isStartingSetup;
  const zeroModelsInstalled =
    !loading &&
    Boolean(status) &&
    !readiness.dictationReady &&
    !readiness.assistantReady &&
    status?.installedDiskBytes === 0;

  const phaseLabel = useMemo(() => {
    if (!setup) return t.aiOneClickStatusDownloading;
    if (setup.phase === 'configuring') return t.aiOneClickStatusConfiguring;
    if (setup.phase === 'warming') return t.aiOneClickStatusWarming;
    if (setup.phase === 'ready') return t.aiOneClickReadyBadge;
    return t.aiOneClickStatusDownloading;
  }, [
    setup,
    t.aiOneClickReadyBadge,
    t.aiOneClickStatusConfiguring,
    t.aiOneClickStatusDownloading,
    t.aiOneClickStatusWarming,
  ]);

  const handleGroupSwitch = (nextGroup: AiProfileGroup) => {
    setProfileGroup(nextGroup);
    if (nextGroup === 'custom') {
      onSelectProfileId('custom');
      return;
    }
    const candidates = allProfiles.filter((p) => p.group === nextGroup);
    const currentInGroup = candidates.find((p) => p.id === selectedProfileId);
    if (!currentInGroup) {
      const target = candidates.find((p) => p.recommended) ?? candidates[0];
      if (target) onSelectProfileId(target.id);
    }
  };

  if (loading && !status) {
    return (
      <section
        data-testid="ai-oneclick-skeleton"
        className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/75 p-5 space-y-4 animate-pulse"
      >
        <div className="space-y-2">
          <div className="h-5 w-48 rounded bg-[var(--surface-subtle)]" />
          <div className="h-3.5 w-3/4 rounded bg-[var(--surface-subtle)]" />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="h-9 rounded-lg bg-[var(--surface-subtle)]" />
          <div className="h-9 rounded-lg bg-[var(--surface-subtle)]" />
          <div className="h-9 rounded-lg bg-[var(--surface-subtle)]" />
        </div>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <div className="h-24 rounded-lg bg-[var(--surface-subtle)]" />
          <div className="h-24 rounded-lg bg-[var(--surface-subtle)]" />
        </div>
      </section>
    );
  }

  return (
    <section
      data-testid={zeroModelsInstalled ? 'ai-cold-start-banner' : 'ai-oneclick-hero'}
      className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/75 p-4 sm:p-5 space-y-5"
    >
      {/* Header & Readiness Strip */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 min-w-0">
            <h3 className="font-display text-[16px] font-semibold tracking-tight text-[var(--text-primary)]">
              {readiness.fullyReady ? t.aiOneClickReadyTitle : t.aiOneClickHeroTitle}
            </h3>
            <InfoTooltip text={t.aiOneClickInfoTooltip} testId="ai-oneclick-info" />
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface-subtle)] px-2 py-0.5 text-[11px] font-medium text-[var(--text-secondary)]">
            <span
              aria-hidden="true"
              className={`h-1.5 w-1.5 rounded-full ${
                readiness.fullyReady ? 'bg-emerald-500' : 'bg-[var(--text-muted)]/60'
              }`}
            />
            <span>{readiness.fullyReady ? t.aiOneClickReadyBadge : t.aiOneClickNotReadyBadge}</span>
          </span>
        </div>

        <p className="text-xs leading-relaxed text-[var(--text-secondary)]">
          {readiness.fullyReady ? t.aiOneClickReadyDesc : t.aiOneClickHeroDesc}
        </p>

        {/* Inline 3-Role Readiness Indicators */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 pt-1 text-xs">
          {[
            {
              key: 'dictation',
              label: t.aiOneClickFeatureDictation,
              ready: readiness.dictationReady,
            },
            {
              key: 'assistant',
              label: t.aiOneClickFeatureAssistant,
              ready: readiness.assistantReady,
            },
            {
              key: 'search',
              label: t.aiOneClickFeatureSearch,
              ready: readiness.semanticSearchReady,
            },
          ].map(({ key, label, ready }) => (
            <span
              key={key}
              data-testid={`ai-readiness-${key}`}
              data-ready={ready ? 'true' : 'false'}
              className={`inline-flex items-center gap-1.5 ${
                ready ? 'text-[var(--text-primary)] font-medium' : 'text-[var(--text-muted)]'
              }`}
            >
              {ready ? (
                <Check className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
              ) : (
                <Circle className="h-3 w-3 shrink-0 opacity-50" />
              )}
              <span>{label}</span>
            </span>
          ))}
        </div>
      </div>

      {/* Profile Group Selector: GPU (5) / CPU (2) / Custom Profile */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <fieldset
              aria-label={t.aiOneClickHeroTitle}
              className="m-0 inline-flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--canvas)]/70 p-0.5"
            >
              {(
                [
                  { id: 'gpu' as const, label: `${t.aiProfileGroupGpu} (5)`, icon: Sparkles },
                  { id: 'cpu' as const, label: `${t.aiProfileGroupCpu} (2)`, icon: Cpu },
                  { id: 'custom' as const, label: t.aiProfileGroupCustom, icon: Sliders },
                ] as const
              ).map(({ id, label, icon: Icon }) => {
                const active = profileGroup === id;
                return (
                  <button
                    key={id}
                    type="button"
                    disabled={isInstalling}
                    data-testid={`ai-profile-group-${id}`}
                    aria-pressed={active}
                    onClick={() => handleGroupSwitch(id)}
                    className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition whitespace-nowrap ${
                      active
                        ? 'bg-[var(--surface-subtle)] text-[var(--text-primary)] shadow-xs'
                        : 'text-[var(--text-muted)] ag-hover-glow hover:text-[var(--text-primary)]'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    <span>{label}</span>
                  </button>
                );
              })}
            </fieldset>
            <InfoTooltip text={t.aiProfileGroupTooltip} testId="ai-profile-group-info" />
          </div>

          {status?.hardware && (
            <span className="font-mono-tabular text-[11px] text-[var(--text-muted)] truncate">
              {status.hardware.hasDiscreteGpu && status.hardware.vramGb > 0
                ? `${status.hardware.gpuName} · ${status.hardware.vramGb} GB VRAM`
                : `CPU · ${status.hardware.ramGb} GB RAM`}
            </span>
          )}
        </div>

        {/* Ready Profiles Grid (CPU = 2 cards, GPU = 5 cards) */}
        {!isCustomMode ? (
          <div
            data-testid={`ai-profiles-grid-${profileGroup}`}
            className={`grid grid-cols-1 gap-2.5 ${
              profileGroup === 'cpu' ? 'sm:grid-cols-2' : 'sm:grid-cols-2 lg:grid-cols-3'
            }`}
          >
            {visibleProfiles.map((opt) => {
              const isSelected = selectedReadyProfile?.id === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  disabled={isInstalling}
                  data-testid={`ai-profile-${opt.id}`}
                  aria-pressed={isSelected}
                  onClick={() => onSelectProfileId(opt.id)}
                  className={`flex flex-col items-start justify-between rounded-lg border p-3 text-start transition disabled:opacity-60 ${
                    isSelected
                      ? 'border-[var(--accent)] bg-[var(--surface-subtle)]/90'
                      : 'border-[var(--border)] bg-[var(--canvas)]/50 ag-hover-card-glow'
                  }`}
                >
                  <div className="w-full space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-display text-[13px] font-semibold text-[var(--text-primary)]">
                        {opt.title}
                      </span>
                      {opt.recommended && (
                        <span
                          data-testid={`ai-profile-rec-${opt.id}`}
                          className="rounded border border-[var(--border-strong)] bg-[var(--surface)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--text-primary)] whitespace-nowrap"
                        >
                          {t.aiOneClickRecommendedShort}
                        </span>
                      )}
                    </div>
                    <p className="text-[11.5px] leading-snug text-[var(--text-muted)]">
                      {opt.desc}
                    </p>
                  </div>

                  <div className="mt-3 flex w-full items-center justify-between gap-2 text-[11px]">
                    <span className="font-mono-tabular text-[var(--text-secondary)]">
                      {formatBytes(opt.totalBytes)}
                    </span>
                    <div className="flex items-center gap-1.5">
                      {!opt.fitsHardware && (
                        <span
                          title={opt.warningCode || t.aiHardwareMemoryWarningBadge}
                          className="inline-flex items-center gap-1 text-[10.5px] text-amber-600 dark:text-amber-400"
                        >
                          <AlertTriangle className="h-3 w-3" />
                        </span>
                      )}
                      {opt.allInstalled && (
                        <span className="inline-flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400">
                          <Check className="h-3 w-3" />
                          <span>{t.aiModelInstalledBadge}</span>
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          /* Guided Custom Profile Builder (Must choose 1 STT + 1 LLM + 1 Embedding) */
          <div
            data-testid="ai-custom-profile-builder"
            className="rounded-lg border border-[var(--border)] bg-[var(--canvas)]/60 p-4 space-y-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="space-y-0.5 min-w-0 flex-1">
                <p className="text-[13px] font-semibold text-[var(--text-primary)]">
                  {t.aiCustomProfileTitle}
                </p>
                <p className="text-xs leading-relaxed text-[var(--text-muted)]">
                  {t.aiCustomProfileGuide}
                </p>
              </div>
              <span
                data-testid="ai-custom-selected-counter"
                className={`rounded-md border px-2 py-0.5 font-mono-tabular text-[11px] font-semibold shrink-0 ${
                  customValidation.ok
                    ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                    : 'border-amber-500/35 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                }`}
              >
                {customValidation.selectedCount}/3 {t.aiCustomSelectedCount}
              </span>
            </div>

            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
              {/* Role 1: STT */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-1">
                  <label
                    htmlFor="ai-custom-stt-select"
                    className="text-xs font-medium text-[var(--text-primary)]"
                  >
                    {t.aiCustomRoleSttTitle}
                  </label>
                  <InfoTooltip text={t.aiRoleSttTooltip} testId="ai-role-stt-info" />
                </div>
                <SelectField
                  id="ai-custom-stt-select"
                  data-testid="ai-custom-stt-select"
                  value={customModels.sttModelId}
                  onChange={(e) =>
                    onChangeCustomModels({ ...customModels, sttModelId: e.target.value })
                  }
                  wrapperClassName="w-full"
                >
                  <option value="">{t.aiCustomSelectPlaceholder}</option>
                  {sttModels.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label} ({formatBytes(m.expectedBytes)})
                    </option>
                  ))}
                </SelectField>
              </div>

              {/* Role 2: LLM */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-1">
                  <label
                    htmlFor="ai-custom-llm-select"
                    className="text-xs font-medium text-[var(--text-primary)]"
                  >
                    {t.aiCustomRoleLlmTitle}
                  </label>
                  <InfoTooltip text={t.aiRoleLlmTooltip} testId="ai-role-llm-info" />
                </div>
                <SelectField
                  id="ai-custom-llm-select"
                  data-testid="ai-custom-llm-select"
                  value={customModels.llmModelId}
                  onChange={(e) =>
                    onChangeCustomModels({ ...customModels, llmModelId: e.target.value })
                  }
                  wrapperClassName="w-full"
                >
                  <option value="">{t.aiCustomSelectPlaceholder}</option>
                  {llmModels.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label} ({formatBytes(m.expectedBytes)})
                    </option>
                  ))}
                </SelectField>
              </div>

              {/* Role 3: Embedding */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-1">
                  <label
                    htmlFor="ai-custom-embed-select"
                    className="text-xs font-medium text-[var(--text-primary)]"
                  >
                    {t.aiCustomRoleEmbedTitle}
                  </label>
                  <InfoTooltip text={t.aiRoleEmbedTooltip} testId="ai-role-embed-info" />
                </div>
                <SelectField
                  id="ai-custom-embed-select"
                  data-testid="ai-custom-embed-select"
                  value={customModels.embedModelId}
                  onChange={(e) =>
                    onChangeCustomModels({ ...customModels, embedModelId: e.target.value })
                  }
                  wrapperClassName="w-full"
                >
                  <option value="">{t.aiCustomSelectPlaceholder}</option>
                  {embedModels.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label} ({formatBytes(m.expectedBytes)})
                    </option>
                  ))}
                </SelectField>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border)]/60 pt-2.5 text-xs">
              {!customValidation.ok ? (
                <span
                  data-testid="ai-custom-missing-hint"
                  className="inline-flex items-center gap-1.5 text-amber-700 dark:text-amber-300"
                >
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  <span>{t.aiCustomMissingHint}</span>
                </span>
              ) : (
                <span className="font-mono-tabular text-[var(--text-secondary)]">
                  {formatBytes(customValidation.totalBytes)}
                  {customValidation.anyHardwareWarning
                    ? ` · ${t.aiHardwareMemoryWarningBadge}`
                    : ''}
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Live Unified Progress Bar during One-Click Setup */}
      {isInstalling && (
        <div data-testid="ai-oneclick-progress" className="space-y-2 py-1">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="inline-flex items-center gap-2 font-medium text-[var(--text-primary)] min-w-0">
              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-[var(--text-secondary)]" />
              <span className="truncate">
                {phaseLabel}
                {setup && setup.phase === 'downloading'
                  ? ` (${Math.max(1, setup.stepIndex)}/${setup.totalSteps})`
                  : ''}
              </span>
            </span>
            <span className="font-mono-tabular text-xs font-semibold text-[var(--text-primary)] shrink-0">
              {setup?.overallPercent ?? 0}%
            </span>
          </div>

          <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-subtle)]">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${Math.max(3, setup?.overallPercent ?? 3)}%`,
                backgroundColor: 'var(--accent)',
              }}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[var(--text-muted)]">
            <span className="truncate">
              {setup?.currentModelLabel || t.aiOneClickPreparingHint}
            </span>
            {setup && setup.totalBytes > 0 && (
              <span className="font-mono-tabular shrink-0">
                {formatBytes(setup.downloadedBytes)} / {formatBytes(setup.totalBytes)}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Setup Error Callout if last attempt failed */}
      {!isInstalling && setup?.phase === 'error' && setup.error && (
        <p role="alert" className="text-xs text-red-500 dark:text-red-400">
          {setup.error}
        </p>
      )}

      {/* Single Primary Action Row + Quiet Advanced Link */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)]/70 pt-4">
        <div className="flex flex-wrap items-center gap-2.5">
          {isInstalling ? (
            <button
              type="button"
              data-testid="ai-oneclick-cancel-btn"
              onClick={onCancelSetup}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3.5 py-2 text-xs font-medium text-[var(--text-primary)] ag-hover-card-glow"
            >
              <X className="h-3.5 w-3.5" />
              <span>{t.aiModelCancelButton}</span>
            </button>
          ) : (
            <button
              type="button"
              data-testid="ai-oneclick-setup-btn"
              disabled={isCustomMode && !customValidation.ok}
              onClick={() => {
                if (isCustomMode) {
                  if (!customValidation.ok) return;
                  onStartOneClickSetup({ profileId: 'custom', customModels });
                } else if (selectedReadyProfile) {
                  onStartOneClickSetup({ profileId: selectedReadyProfile.id });
                }
              }}
              className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold ag-hover-accent-glow disabled:opacity-45"
              style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-fg)' }}
            >
              <Download className="h-3.5 w-3.5 shrink-0" />
              <span>
                {(isCustomMode
                  ? customValidation.allInstalled
                  : selectedReadyProfile?.allInstalled) && readiness.fullyReady
                  ? t.aiOneClickReverifyButton
                  : t.aiOneClickSetupButton}
              </span>
            </button>
          )}

          {readiness.fullyReady && !isInstalling && (
            <button
              type="button"
              data-testid="ai-warmup-btn"
              disabled={isWarmingUp}
              onClick={onWarmup}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-subtle)] px-3 py-2 text-xs font-medium text-[var(--text-primary)] ag-hover-card-glow disabled:opacity-50"
            >
              {isWarmingUp ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Zap className="h-3.5 w-3.5" />
              )}
              <span>{t.aiOneClickWarmupButton}</span>
            </button>
          )}
        </div>

        <button
          type="button"
          data-testid="ai-cold-start-setup-btn"
          onClick={onOpenAdvancedModels}
          className="inline-flex items-center gap-1 text-xs font-medium text-[var(--text-muted)] ag-hover-glow hover:text-[var(--text-primary)] shrink-0"
        >
          <span>{t.aiOneClickAdvancedButton}</span>
          <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" />
        </button>
      </div>

      <p className="text-[11.5px] text-[var(--text-muted)]">{t.aiOneClickOfflineNote}</p>
    </section>
  );
});
