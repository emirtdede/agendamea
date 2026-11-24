import { Sparkles, X } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../api/client';
import { subscribeServerEvents } from '../../api/eventStream';
import { useAiVoiceAudioControls } from '../../hooks/useAiVoiceAudioControls';
import { useI18n } from '../../i18n/I18nContext';
import { preferencesStore, usePreferencesSelector } from '../../store/preferencesStore';
import type { AiStatusPayload, AiTierId, PiperVoiceStatus } from '../../types';
import { listAvailableTtsVoices } from '../../voice/ttsPlayer';
import { HardwareProfileSection } from './ai/HardwareProfileSection';
import { ModelCatalogSection } from './ai/ModelCatalogSection';
import { TierSelectorSection } from './ai/TierSelectorSection';
import { VoiceAudioSection } from './ai/VoiceAudioSection';

interface AiVoiceSettingsTabProps {
  onNotifyVoice?: (payload: { title: string; body?: string; variant?: 'info' | 'error' }) => void;
}

export const AiVoiceSettingsTab = React.memo(function AiVoiceSettingsTab({
  onNotifyVoice,
}: AiVoiceSettingsTabProps) {
  const { t, lang } = useI18n();
  const [status, setStatus] = useState<AiStatusPayload | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [rescanning, setRescanning] = useState<boolean>(false);
  const [reindexing, setReindexing] = useState<boolean>(false);
  const [selectedTier, setSelectedTier] = useState<AiTierId>('tier-light');
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
        if (syncFormFields || !hydratedSettingsRef.current) {
          hydratedSettingsRef.current = true;
          setSelectedTier(data.settings.aiTier || data.recommendation.primaryOptionId);
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
      if (msg.type !== 'ai.download.progress' || !msg.modelId) return;
      if (msg.done) {
        void refreshModelsOnly();
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
  }, [refreshModelsOnly, refreshPiperVoices]);

  // Lightweight chained fallback poll while any model or Piper voice download is active
  const hasActiveModelDownload = useMemo(
    () => Boolean(status?.models.some((m) => m.downloading)),
    [status],
  );
  const hasActivePiperDownload = useMemo(
    () => piperVoices.some((v) => v.downloading),
    [piperVoices],
  );
  const hasActiveDownload = hasActiveModelDownload || hasActivePiperDownload;

  useEffect(() => {
    if (!hasActiveDownload) return;
    let cancelled = false;
    let timer: number | null = null;
    const tick = async () => {
      if (cancelled) return;
      const jobs: Array<Promise<void>> = [];
      if (hasActiveModelDownload) jobs.push(refreshModelsOnly());
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
    refreshModelsOnly,
    refreshPiperVoices,
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

  const handleDownloadModel = useCallback(
    async (modelId: string) => {
      setActionError(null);
      setBusyModelId(modelId);
      try {
        await api.downloadAiModel(modelId);
        await refreshModelsOnly();
      } catch {
        if (isMountedRef.current) setActionError(t.operationFailedToast);
      } finally {
        if (isMountedRef.current) setBusyModelId(null);
      }
    },
    [refreshModelsOnly, t.operationFailedToast],
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
      {/* Sticky Dismissible Action Error Banner */}
      {actionError && (
        <div
          role="alert"
          data-testid="ai-action-error-banner"
          className="sticky top-2 z-20 flex items-start justify-between gap-2.5 rounded-xl border border-red-500/40 bg-[var(--surface)] px-3.5 py-2.5 text-xs font-medium text-red-600 dark:text-red-400 shadow-md animate-fade-in"
        >
          <span className="min-w-0 flex-1 break-words leading-snug">{actionError}</span>
          <button
            type="button"
            onClick={() => setActionError(null)}
            aria-label={t.closeMenu}
            className="shrink-0 rounded-md p-0.5 text-red-600/80 hover:bg-red-500/15 hover:text-red-600 dark:text-red-400/80 dark:hover:text-red-300 transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

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

      {/* Quick-Enable Tray + Startup Guide Card for Always-Ready Voice Hotkey */}
      {isElectronDesktop &&
        (desktopPrefs.closeBehavior !== 'tray' || !desktopPrefs.launchAtStartup) && (
          <section
            data-testid="ai-tray-startup-guide-card"
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--accent)]/35 bg-[var(--accent-soft)] px-4 py-3"
          >
            <div className="flex items-start gap-2.5 min-w-0 flex-1">
              <Sparkles className="h-4 w-4 text-[var(--accent)] shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-[var(--text-primary)]">
                  {t.aiVoiceTrayGuideTitle}
                </p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--text-secondary)]">
                  {t.aiVoiceTrayGuideDesc}
                </p>
              </div>
            </div>
            <button
              type="button"
              data-testid="ai-enable-tray-startup-btn"
              onClick={handleEnableTrayAndStartup}
              className="rounded-lg px-3 py-1.5 text-xs font-semibold transition-opacity hover:opacity-90 shrink-0"
              style={{
                backgroundColor: 'var(--accent)',
                color: 'var(--accent-fg)',
              }}
            >
              {t.aiVoiceEnableTrayButton}
            </button>
          </section>
        )}

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

      <ModelCatalogSection
        status={status}
        busyModelId={busyModelId}
        onDownloadModel={(id) => void handleDownloadModel(id)}
        onCancelDownload={(id) => void handleCancelDownload(id)}
        onDeleteModel={(id) => void handleDeleteModel(id)}
        onDeleteAll={() => void handleDeleteAll()}
      />
    </div>
  );
});
