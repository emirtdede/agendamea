import { Cpu, Mic, Sparkles, X } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../api/client';
import { subscribeServerEvents } from '../../api/eventStream';
import { useAiVoiceAudioControls } from '../../hooks/useAiVoiceAudioControls';
import { useI18n } from '../../i18n/I18nContext';
import { preferencesStore, usePreferencesSelector } from '../../store/preferencesStore';
import type { AiSetupState, AiStatusPayload, AiTierId, PiperVoiceStatus } from '../../types';
import { listAvailableTtsVoices } from '../../voice/ttsPlayer';
import { AiLivePlaygroundSection } from './ai/AiLivePlaygroundSection';
import { AiOneClickSetupHero, type CustomAiModelSelection } from './ai/AiOneClickSetupHero';
import { HardwareProfileSection } from './ai/HardwareProfileSection';
import { ModelCatalogSection } from './ai/ModelCatalogSection';
import { TierSelectorSection } from './ai/TierSelectorSection';
import { VoiceAudioSection } from './ai/VoiceAudioSection';

export type AiSubTabId = 'voice' | 'engine';

interface AiVoiceSettingsTabProps {
  onNotifyVoice?: (payload: { title: string; body?: string; variant?: 'info' | 'error' }) => void;
  requestedSubTab?: AiSubTabId;
  subTabSeq?: number;
  revealSettingId?: string;
}

export const AiVoiceSettingsTab = React.memo(function AiVoiceSettingsTab({
  onNotifyVoice,
  requestedSubTab,
  subTabSeq,
}: AiVoiceSettingsTabProps) {
  const { t, lang } = useI18n();
  const [activeSubTab, setActiveSubTab] = useState<AiSubTabId>(requestedSubTab ?? 'voice');
  const [status, setStatus] = useState<AiStatusPayload | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [rescanning, setRescanning] = useState<boolean>(false);
  const [reindexing, setReindexing] = useState<boolean>(false);
  const [selectedTier, setSelectedTier] = useState<AiTierId>('tier-light');
  const [selectedProfileId, setSelectedProfileId] = useState<AiTierId>('cpu-light');
  const [customModels, setCustomModels] = useState<CustomAiModelSelection>({
    sttModelId: 'whisper-small-q5_1',
    llmModelId: 'qwen3-1.7b-q8_0',
    embedModelId: 'multilingual-e5-small-q8_0',
  });
  const [setupState, setSetupState] = useState<AiSetupState | null>(null);
  const [isStartingSetup, setIsStartingSetup] = useState(false);
  const [isWarmingUp, setIsWarmingUp] = useState(false);
  const [externalModel, setExternalModel] = useState<string>('');
  const [externalBaseUrl, setExternalBaseUrl] = useState<string>('');
  const [voiceDictationLanguage, setVoiceDictationLanguage] = useState<string>('auto');
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const desktopPrefs = usePreferencesSelector((s) => ({
    closeBehavior: s.closeBehavior,
    launchAtStartup: s.launchAtStartup,
  }));
  const isElectronDesktop =
    typeof window !== 'undefined' && Boolean(window.agendameaWindow?.setCloseBehavior);
  const [piperVoices, setPiperVoices] = useState<PiperVoiceStatus[]>([]);
  const [busyModelId, setBusyModelId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reindexNotice, setReindexNotice] = useState<string | null>(null);

  const isMountedRef = useRef<boolean>(true);
  const hydratedSettingsRef = useRef<boolean>(false);
  const reindexNoticeTimerRef = useRef<number | null>(null);

  const refreshPiperVoices = useCallback(async () => {
    try {
      const res = await api.getPiperVoices();
      if (isMountedRef.current && Array.isArray(res.voices)) {
        setPiperVoices(res.voices);
      }
    } catch {
      // Non-fatal
    }
  }, []);

  const {
    voiceAutoStopMs,
    voiceTtsEnabled,
    voiceTtsVoice,
    voiceTtsStyle,
    voiceChimePreset,
    previewingTts,
    voiceMicDeviceId,
    voiceNoiseSuppression,
    voiceSensitivity,
    micDevices,
    testingMic,
    micLevel,
    busyPiperVoiceId,
    cleanupAudioControls,
    refreshMics,
    hydrateAudioSettings,
    handleAutoStopChange,
    handleMicChange,
    handleNoiseSuppressionToggle,
    handleSensitivityChange,
    handleToggleMicTest,
    handleTtsToggle,
    handleTtsVoiceChange,
    handleTtsStyleChange,
    handleChimePresetChange,
    handlePreviewTts,
    handleDownloadPiperVoice,
    handleCancelPiperVoice,
    handleDeletePiperVoice,
  } = useAiVoiceAudioControls({
    lang,
    previewSample: t.aiVoiceTtsPreviewSample,
    operationFailedToast: t.operationFailedToast,
    micFallbackLabel: t.aiVoiceMicLabel,
    isMountedRef,
    setActionError,
    setPiperVoices,
    refreshPiperVoices,
  });

  useEffect(() => {
    if (subTabSeq !== undefined && requestedSubTab) {
      setActiveSubTab(requestedSubTab);
    }
  }, [requestedSubTab, subTabSeq]);

  useEffect(() => {
    if (activeSubTab !== 'voice' && testingMic) {
      void handleToggleMicTest();
    }
  }, [activeSubTab, testingMic, handleToggleMicTest]);

  const handleSwitchSubTab = useCallback(
    (next: AiSubTabId) => {
      if (next === activeSubTab) return;
      setActiveSubTab(next);
    },
    [activeSubTab],
  );

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (reindexNoticeTimerRef.current !== null) {
        window.clearTimeout(reindexNoticeTimerRef.current);
        reindexNoticeTimerRef.current = null;
      }
      cleanupAudioControls();
    };
  }, [cleanupAudioControls]);

  const loadStatus = useCallback(
    async (force = false, syncFormFields = false) => {
      try {
        if (force && isMountedRef.current) setRescanning(true);
        const data = await api.getAiStatus(force);
        if (!isMountedRef.current) return;
        setStatus(data);
        if (data.setup) {
          setSetupState(data.setup);
        }
        if (syncFormFields || !hydratedSettingsRef.current) {
          hydratedSettingsRef.current = true;
          const nextTier = data.settings.aiTier || data.recommendation.primaryOptionId;
          setSelectedTier(nextTier);
          const recProfile = data.recommendation.recommendedProfileId;
          const isExplicitNewProfile =
            nextTier === 'custom' || nextTier.startsWith('cpu-') || nextTier.startsWith('gpu-');
          const hasAnyLocalModel = data.models.some((m) => m.present);
          const preferredProfile: AiTierId = isExplicitNewProfile
            ? nextTier
            : !hasAnyLocalModel && recProfile
              ? recProfile
              : recProfile || 'cpu-light';
          setSelectedProfileId(preferredProfile);
          setCustomModels({
            sttModelId: data.settings.aiSttModelId || 'whisper-small-q5_1',
            llmModelId: data.settings.aiLlmModelId || 'qwen3-1.7b-q8_0',
            embedModelId: data.settings.aiEmbedModelId || 'multilingual-e5-small-q8_0',
          });
          setExternalModel(data.settings.aiOllamaModel || '');
          setExternalBaseUrl(data.settings.aiExternalBaseUrl || '');
          setVoiceDictationLanguage(data.settings.voiceDictationLanguage || 'auto');
          hydrateAudioSettings(data.settings);
        }
      } catch {
        // Non-fatal: keep previous state
      } finally {
        if (isMountedRef.current) {
          setLoading(false);
          setRescanning(false);
        }
      }
    },
    [hydrateAudioSettings],
  );

  const refreshModelsOnly = useCallback(async () => {
    try {
      const data = await api.getAiModels();
      if (!isMountedRef.current) return;
      setStatus((prev) => {
        if (!prev) return prev;
        const fitById = new Map(
          prev.models.map((m) => [
            m.id,
            { fitsHardware: m.fitsHardware, warningCode: m.warningCode },
          ]),
        );
        return {
          ...prev,
          installedDiskBytes: data.installedDiskBytes,
          models: data.models.map((m) => ({
            ...m,
            fitsHardware: fitById.get(m.id)?.fitsHardware ?? m.fitsHardware ?? true,
            warningCode: fitById.get(m.id)?.warningCode ?? m.warningCode ?? null,
          })),
        };
      });
    } catch {
      // Non-fatal
    }
  }, []);

  useEffect(() => {
    void loadStatus(false, true);
    void refreshMics(false);
    void refreshPiperVoices();
    setVoices(listAvailableTtsVoices(undefined, lang));

    const onDeviceChange = () => void refreshMics(false);
    navigator.mediaDevices?.addEventListener?.('devicechange', onDeviceChange);

    let cleanupVoices: (() => void) | undefined;
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      const onVoicesChanged = () => {
        if (isMountedRef.current) setVoices(listAvailableTtsVoices(undefined, lang));
      };
      window.speechSynthesis.addEventListener?.('voiceschanged', onVoicesChanged);
      cleanupVoices = () => {
        window.speechSynthesis.removeEventListener?.('voiceschanged', onVoicesChanged);
      };
    }

    return () => {
      navigator.mediaDevices?.removeEventListener?.('devicechange', onDeviceChange);
      cleanupVoices?.();
    };
  }, [lang, loadStatus, refreshMics, refreshPiperVoices]);

  // Listen for live SSE model & Piper neural voice download progress events via shared singleton bus
  useEffect(() => {
    return subscribeServerEvents((msg) => {
      if (!isMountedRef.current || !msg) return;
      if (msg.type === 'tts.download.progress' && typeof msg.voiceId === 'string') {
        if (msg.done) {
          void refreshPiperVoices();
          return;
        }
        const targetVoiceId = msg.voiceId;
        setPiperVoices((prev) =>
          prev.map((v) =>
            v.id === targetVoiceId
              ? {
                  ...v,
                  downloading: true,
                  progress: {
                    voiceId: targetVoiceId,
                    receivedBytes: Number(msg.receivedBytes || 0),
                    totalBytes: Number(msg.totalBytes || v.expectedBytes),
                    percent: Number(msg.percent || 0),
                  },
                }
              : v,
          ),
        );
        return;
      }
      if (msg.type === 'ai.setup.progress' && msg.setup && typeof msg.setup === 'object') {
        setSetupState(msg.setup as AiSetupState);
        if (msg.done) {
          void loadStatus(false, false);
        }
        return;
      }
      if (msg.type !== 'ai.download.progress' || !msg.modelId) return;
      if (msg.done) {
        void loadStatus(false, false);
        return;
      }
      const targetModelId = msg.modelId;
      setStatus((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          models: prev.models.map((m) =>
            m.id === targetModelId
              ? {
                  ...m,
                  downloading: true,
                  progress: {
                    modelId: targetModelId,
                    receivedBytes: Number(msg.receivedBytes || 0),
                    totalBytes: Number(msg.totalBytes || m.expectedBytes),
                    percent: Number(msg.percent || 0),
                    resumed: Boolean(msg.resumed),
                  },
                }
              : m,
          ),
        };
      });
    });
  }, [loadStatus, refreshPiperVoices]);

  // Lightweight chained fallback poll while any model, setup bundle, or Piper voice download is active
  const hasActiveModelDownload = useMemo(
    () => Boolean(setupState?.active || status?.models.some((m) => m.downloading)),
    [setupState?.active, status],
  );
  const hasActivePiperDownload = useMemo(
    () => piperVoices.some((v) => v.downloading),
    [piperVoices],
  );
  const hasActiveDownload = hasActiveModelDownload || hasActivePiperDownload;

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

  useEffect(() => {
    if (!hasActiveDownload) return;
    let cancelled = false;
    let timer: number | null = null;
    const tick = async () => {
      if (cancelled) return;
      const jobs: Array<Promise<void>> = [];
      if (setupState?.active) {
        jobs.push(loadStatus(false, false));
      } else if (hasActiveModelDownload) {
        jobs.push(refreshModelsOnly());
      }
      if (hasActivePiperDownload) jobs.push(refreshPiperVoices());
      await Promise.all(jobs);
      if (!cancelled) {
        timer = window.setTimeout(() => void tick(), 1200);
      }
    };
    timer = window.setTimeout(() => void tick(), 1200);
    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [
    hasActiveDownload,
    hasActiveModelDownload,
    hasActivePiperDownload,
    loadStatus,
    refreshModelsOnly,
    refreshPiperVoices,
    setupState?.active,
  ]);

  const detectedExternalModels = useMemo(() => {
    if (!status) return [] as string[];
    const list =
      selectedTier === 'external-lmstudio'
        ? status.recommendation.externalLmStudio.models
        : status.recommendation.externalOllama.models.length > 0
          ? status.recommendation.externalOllama.models
          : status.recommendation.externalLmStudio.models;
    return Array.isArray(list) ? list : [];
  }, [selectedTier, status]);

  const isExternalTierSelected =
    selectedTier === 'external-ollama' || selectedTier === 'external-lmstudio';

  const handleSelectTier = useCallback(
    async (tierId: AiTierId) => {
      setActionError(null);
      setSelectedTier(tierId);
      const tierSpec = status?.recommendation.tiers.find((item) => item.id === tierId);
      const patch: Record<string, unknown> = {
        aiTier: tierId,
        aiUseExternalOllama: tierId === 'external-ollama' || tierId === 'external-lmstudio',
      };
      if (tierSpec) {
        patch.aiSttModelId = tierSpec.sttModelId;
        patch.aiLlmModelId = tierSpec.llmModelId;
        patch.aiEmbedModelId = tierSpec.embedModelId;
      } else if (tierId === 'external-ollama') {
        const firstModel = externalModel || status?.recommendation.externalOllama.models[0] || '';
        if (firstModel) {
          patch.aiOllamaModel = firstModel;
          setExternalModel(firstModel);
        }
      } else if (tierId === 'external-lmstudio') {
        const firstModel = externalModel || status?.recommendation.externalLmStudio.models[0] || '';
        if (firstModel) {
          patch.aiOllamaModel = firstModel;
          setExternalModel(firstModel);
        }
      }
      try {
        await api.updateSettings(patch);
        void loadStatus(false, false);
      } catch {
        if (isMountedRef.current) setActionError(t.operationFailedToast);
      }
    },
    [externalModel, loadStatus, status, t.operationFailedToast],
  );

  const handleExternalModelChange = useCallback(
    async (modelName: string) => {
      setActionError(null);
      setExternalModel(modelName);
      try {
        await api.updateSettings({ aiOllamaModel: modelName.trim() });
      } catch {
        if (isMountedRef.current) setActionError(t.operationFailedToast);
      }
    },
    [t.operationFailedToast],
  );

  const handleExternalBaseUrlCommit = useCallback(
    async (rawUrl: string) => {
      setActionError(null);
      const trimmed = rawUrl.trim();
      setExternalBaseUrl(trimmed);
      try {
        await api.updateSettings({ aiExternalBaseUrl: trimmed });
      } catch {
        if (isMountedRef.current) setActionError(t.operationFailedToast);
      }
    },
    [t.operationFailedToast],
  );

  const handleDictationLanguageChange = useCallback(
    async (nextLang: string) => {
      setActionError(null);
      setVoiceDictationLanguage(nextLang);
      try {
        await api.updateSettings({ voiceDictationLanguage: nextLang });
      } catch {
        if (isMountedRef.current) setActionError(t.operationFailedToast);
      }
    },
    [t.operationFailedToast],
  );

  const handleEnableTrayAndStartup = useCallback(() => {
    void preferencesStore.setCloseBehavior('tray');
    preferencesStore.setLaunchAtStartup(true);
  }, []);

  const handleStartOneClickSetup = useCallback(
    async (payload: { profileId: AiTierId; customModels?: CustomAiModelSelection }) => {
      setActionError(null);
      setSelectedProfileId(payload.profileId);
      setIsStartingSetup(true);
      try {
        const res = await api.startAiOneClickSetup({
          profileId: payload.profileId,
          customModels: payload.customModels,
        });
        if (isMountedRef.current && res.setup) {
          setSetupState(res.setup);
        }
        await loadStatus(false, false);
      } catch {
        if (isMountedRef.current) setActionError(t.operationFailedToast);
      } finally {
        if (isMountedRef.current) setIsStartingSetup(false);
      }
    },
    [loadStatus, t.operationFailedToast],
  );

  const handleCancelOneClickSetup = useCallback(async () => {
    setActionError(null);
    try {
      const res = await api.cancelAiOneClickSetup();
      if (isMountedRef.current && res.setup) {
        setSetupState(res.setup);
      }
      await loadStatus(false, false);
    } catch {
      if (isMountedRef.current) setActionError(t.operationFailedToast);
    }
  }, [loadStatus, t.operationFailedToast]);

  const handleWarmupEngines = useCallback(async () => {
    setActionError(null);
    setIsWarmingUp(true);
    try {
      const res = await api.warmupAiEngines({ includeLlm: false });
      await loadStatus(false, false);
      if (!isMountedRef.current) return;
      if (res?.ok && res?.stt?.ok) {
        onNotifyVoice?.({
          title: t.aiOneClickReadyTitle,
          body: t.aiOneClickWarmupDone,
        });
      } else {
        const msg =
          res?.stt?.code === 'STT_MODEL_MISSING' ? t.sttErrorModelMissing : t.sttErrorUnavailable;
        setActionError(msg);
        onNotifyVoice?.({
          title: t.aiOneClickNotReadyBadge,
          body: msg,
          variant: 'error',
        });
      }
    } catch {
      if (isMountedRef.current) setActionError(t.operationFailedToast);
    } finally {
      if (isMountedRef.current) setIsWarmingUp(false);
    }
  }, [
    loadStatus,
    onNotifyVoice,
    t.aiOneClickNotReadyBadge,
    t.aiOneClickReadyTitle,
    t.aiOneClickWarmupDone,
    t.operationFailedToast,
    t.sttErrorModelMissing,
    t.sttErrorUnavailable,
  ]);

  const handleActivateModel = useCallback(
    async (modelId: string) => {
      setActionError(null);
      setBusyModelId(modelId);
      try {
        await api.activateAiModel(modelId);
        await loadStatus(false, false);
      } catch {
        if (isMountedRef.current) setActionError(t.operationFailedToast);
      } finally {
        if (isMountedRef.current) setBusyModelId(null);
      }
    },
    [loadStatus, t.operationFailedToast],
  );

  const handleDownloadModel = useCallback(
    async (modelId: string) => {
      setActionError(null);
      setBusyModelId(modelId);
      try {
        await api.downloadAiModel(modelId, { activate: true });
        await loadStatus(false, false);
      } catch {
        if (isMountedRef.current) setActionError(t.operationFailedToast);
      } finally {
        if (isMountedRef.current) setBusyModelId(null);
      }
    },
    [loadStatus, t.operationFailedToast],
  );

  const handleCancelDownload = useCallback(
    async (modelId: string) => {
      setActionError(null);
      setBusyModelId(modelId);
      try {
        await api.cancelAiModelDownload(modelId);
        await refreshModelsOnly();
      } catch {
        if (isMountedRef.current) setActionError(t.operationFailedToast);
      } finally {
        if (isMountedRef.current) setBusyModelId(null);
      }
    },
    [refreshModelsOnly, t.operationFailedToast],
  );

  const handleDeleteModel = useCallback(
    async (modelId: string) => {
      setActionError(null);
      setBusyModelId(modelId);
      try {
        await api.deleteAiModel(modelId);
        await refreshModelsOnly();
      } catch {
        if (isMountedRef.current) setActionError(t.operationFailedToast);
      } finally {
        if (isMountedRef.current) setBusyModelId(null);
      }
    },
    [refreshModelsOnly, t.operationFailedToast],
  );

  const handleDeleteAll = useCallback(async () => {
    setActionError(null);
    setBusyModelId('all');
    try {
      await api.deleteAllAiModels();
      await refreshModelsOnly();
    } catch {
      if (isMountedRef.current) setActionError(t.operationFailedToast);
    } finally {
      if (isMountedRef.current) setBusyModelId(null);
    }
  }, [refreshModelsOnly, t.operationFailedToast]);

  const handleReindexRag = useCallback(async () => {
    setActionError(null);
    setReindexNotice(null);
    setReindexing(true);
    try {
      const res = await api.reindexRag();
      await loadStatus(false, false);
      if (isMountedRef.current) {
        const modeLabel = res?.mode || 'fts5';
        const recomputed = typeof res?.recomputed === 'number' ? res.recomputed : 0;
        if (reindexNoticeTimerRef.current !== null) {
          window.clearTimeout(reindexNoticeTimerRef.current);
        }
        setReindexNotice(`${t.aiRagReindexButton} · ${modeLabel} (${recomputed})`);
        reindexNoticeTimerRef.current = window.setTimeout(() => {
          reindexNoticeTimerRef.current = null;
          if (isMountedRef.current) setReindexNotice(null);
        }, 6000);
        onNotifyVoice?.({
          title: t.aiRagReindexButton,
          body: `${modeLabel} (${recomputed})`,
        });
      }
    } catch {
      if (isMountedRef.current) setActionError(t.operationFailedToast);
    } finally {
      if (isMountedRef.current) setReindexing(false);
    }
  }, [loadStatus, onNotifyVoice, t.aiRagReindexButton, t.operationFailedToast]);

  const handleRescanHardware = useCallback(() => {
    void loadStatus(true);
  }, [loadStatus]);

  const handleRescanExternal = useCallback(() => {
    void loadStatus(true, false);
  }, [loadStatus]);

  const handleRefreshMicsClick = useCallback(() => {
    void refreshMics(true);
  }, [refreshMics]);

  const handleDismissReindexNotice = useCallback(() => {
    setReindexNotice(null);
  }, []);

  return (
    <div className="space-y-6" data-testid="settings-ai-section">
      {/* Razor-thin Hairline Underline Sub-Navigation (role="group" via fieldset, zero nested tablist) */}
      <div className="border-b border-[var(--border)]">
        <fieldset aria-label={t.settingsTabAi} className="m-0 flex items-center gap-6 border-0 p-0">
          <button
            type="button"
            data-testid="ai-subtab-voice"
            aria-pressed={activeSubTab === 'voice'}
            onClick={() => handleSwitchSubTab('voice')}
            className={`relative inline-flex items-center gap-1.5 pb-2.5 text-xs font-medium transition-colors ${
              activeSubTab === 'voice'
                ? 'text-[var(--text-primary)]'
                : 'text-[var(--text-muted)] ag-hover-glow hover:text-[var(--text-primary)]'
            }`}
          >
            <Mic className="h-3.5 w-3.5 shrink-0" />
            <span>{t.aiSubTabVoice}</span>
            {hasActivePiperDownload && (
              <span
                aria-hidden="true"
                className="h-1.5 w-1.5 rounded-full bg-[var(--text-primary)] animate-pulse"
              />
            )}
            {activeSubTab === 'voice' && (
              <span
                aria-hidden="true"
                className="absolute inset-x-0 -bottom-px h-[1.5px] bg-[var(--text-primary)]"
              />
            )}
          </button>

          <button
            type="button"
            data-testid="ai-subtab-engine"
            aria-pressed={activeSubTab === 'engine'}
            onClick={() => handleSwitchSubTab('engine')}
            className={`relative inline-flex items-center gap-1.5 pb-2.5 text-xs font-medium transition-colors ${
              activeSubTab === 'engine'
                ? 'text-[var(--text-primary)]'
                : 'text-[var(--text-muted)] ag-hover-glow hover:text-[var(--text-primary)]'
            }`}
          >
            <Cpu className="h-3.5 w-3.5 shrink-0" />
            <span>{t.aiSubTabEngine}</span>
            {hasActiveModelDownload && (
              <span
                aria-hidden="true"
                className="h-1.5 w-1.5 rounded-full bg-[var(--text-primary)] animate-pulse"
              />
            )}
            {activeSubTab === 'engine' && (
              <span
                aria-hidden="true"
                className="absolute inset-x-0 -bottom-px h-[1.5px] bg-[var(--text-primary)]"
              />
            )}
          </button>
        </fieldset>
      </div>

      {/* Sticky Dismissible Action Error Banner */}
      {actionError && (
        <div
          role="alert"
          data-testid="ai-action-error-banner"
          className="sticky top-2 z-20 flex items-start justify-between gap-2.5 border-y border-red-500/35 bg-[var(--canvas)] py-2.5 text-xs font-medium text-red-500 dark:text-red-400 animate-fade-in"
        >
          <span className="min-w-0 flex-1 break-words leading-snug">{actionError}</span>
          <button
            type="button"
            onClick={() => setActionError(null)}
            aria-label={t.closeMenu}
            className="shrink-0 p-0.5 text-red-500/80 ag-hover-danger-glow hover:text-red-500 transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {activeSubTab === 'voice' ? (
        <div className="space-y-8 animate-tab-enter">
          {/* Unified One-Click Setup & Readiness Hero */}
          <AiOneClickSetupHero
            status={status}
            loading={loading}
            setup={setupState}
            selectedProfileId={selectedProfileId}
            customModels={customModels}
            isStartingSetup={isStartingSetup}
            isWarmingUp={isWarmingUp}
            onSelectProfileId={setSelectedProfileId}
            onChangeCustomModels={setCustomModels}
            onStartOneClickSetup={(payload) => void handleStartOneClickSetup(payload)}
            onCancelSetup={() => void handleCancelOneClickSetup()}
            onWarmup={() => void handleWarmupEngines()}
            onOpenAdvancedModels={() => handleSwitchSubTab('engine')}
          />

          {/* Built-in Live Dictation & AI Test Playground */}
          <AiLivePlaygroundSection
            dictationReady={readiness.dictationReady}
            assistantReady={readiness.assistantReady}
            voiceMicDeviceId={voiceMicDeviceId}
            voiceAutoStopMs={voiceAutoStopMs}
            voiceNoiseSuppression={voiceNoiseSuppression}
            voiceSensitivity={voiceSensitivity}
          />

          {/* Quick-Enable Tray + Startup Card for Always-Ready Voice Hotkey */}
          {isElectronDesktop &&
            (desktopPrefs.closeBehavior !== 'tray' || !desktopPrefs.launchAtStartup) && (
              <section
                data-testid="ai-tray-startup-guide-card"
                className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface)]/75 p-4 sm:px-5"
              >
                <div className="flex items-start gap-2.5 min-w-0 flex-1">
                  <Sparkles className="h-4 w-4 text-[var(--text-muted)] shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-[var(--text-primary)]">
                      {t.aiVoiceTrayGuideTitle}
                    </p>
                    <p className="mt-0.5 text-xs leading-relaxed text-[var(--text-muted)]">
                      {t.aiVoiceTrayGuideDesc}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  data-testid="ai-enable-tray-startup-btn"
                  onClick={handleEnableTrayAndStartup}
                  className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] ag-hover-card-glow shrink-0"
                >
                  {t.aiVoiceEnableTrayButton}
                </button>
              </section>
            )}

          <div data-setting-id="ai-voice">
            <VoiceAudioSection
              voiceMicDeviceId={voiceMicDeviceId}
              voiceDictationLanguage={voiceDictationLanguage}
              micDevices={micDevices}
              testingMic={testingMic}
              micLevel={micLevel}
              voiceNoiseSuppression={voiceNoiseSuppression}
              voiceAutoStopMs={voiceAutoStopMs}
              voiceSensitivity={voiceSensitivity}
              voiceChimePreset={voiceChimePreset}
              voiceTtsEnabled={voiceTtsEnabled}
              voiceTtsVoice={voiceTtsVoice}
              voiceTtsStyle={voiceTtsStyle}
              previewingTts={previewingTts}
              voices={voices}
              piperVoices={piperVoices}
              busyPiperVoiceId={busyPiperVoiceId}
              onRefreshMics={handleRefreshMicsClick}
              onToggleMicTest={() => void handleToggleMicTest()}
              onMicChange={(id) => void handleMicChange(id)}
              onDictationLanguageChange={(code) => void handleDictationLanguageChange(code)}
              onNoiseSuppressionToggle={(enabled) => void handleNoiseSuppressionToggle(enabled)}
              onAutoStopChange={(ms) => void handleAutoStopChange(ms)}
              onSensitivityChange={(mode) => void handleSensitivityChange(mode)}
              onChimePresetChange={(preset) => void handleChimePresetChange(preset)}
              onPreviewTts={(overrideVoice) => void handlePreviewTts(overrideVoice)}
              onTtsToggle={(enabled) => void handleTtsToggle(enabled)}
              onTtsVoiceChange={(uri) => void handleTtsVoiceChange(uri)}
              onTtsStyleChange={(style) => void handleTtsStyleChange(style)}
              onDownloadPiperVoice={(id) => void handleDownloadPiperVoice(id)}
              onCancelPiperVoice={(id) => void handleCancelPiperVoice(id)}
              onDeletePiperVoice={(id) => void handleDeletePiperVoice(id)}
            />
          </div>
        </div>
      ) : (
        <div className="space-y-6 animate-tab-enter">
          <HardwareProfileSection
            status={status}
            loading={loading}
            rescanning={rescanning}
            reindexing={reindexing}
            reindexNotice={reindexNotice}
            onRescan={handleRescanHardware}
            onReindexRag={() => void handleReindexRag()}
            onDismissReindexNotice={handleDismissReindexNotice}
          />

          <div data-setting-id="ai-tier">
            <TierSelectorSection
              status={status}
              selectedTier={selectedTier}
              externalModel={externalModel}
              externalBaseUrl={externalBaseUrl}
              detectedExternalModels={detectedExternalModels}
              isExternalTierSelected={isExternalTierSelected}
              rescanning={rescanning}
              onSelectTier={(tierId) => void handleSelectTier(tierId)}
              onChangeExternalModelDraft={setExternalModel}
              onCommitExternalModel={(modelName) => void handleExternalModelChange(modelName)}
              onChangeExternalBaseUrlDraft={setExternalBaseUrl}
              onCommitExternalBaseUrl={(url) => void handleExternalBaseUrlCommit(url)}
              onRescanExternal={handleRescanExternal}
            />
          </div>

          <ModelCatalogSection
            status={status}
            busyModelId={busyModelId}
            onDownloadModel={(id) => void handleDownloadModel(id)}
            onActivateModel={(id) => void handleActivateModel(id)}
            onCancelDownload={(id) => void handleCancelDownload(id)}
            onDeleteModel={(id) => void handleDeleteModel(id)}
            onDeleteAll={() => void handleDeleteAll()}
          />
        </div>
      )}
    </div>
  );
});
