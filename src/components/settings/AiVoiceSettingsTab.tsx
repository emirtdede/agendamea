import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AudioLines,
  CheckCircle2,
  Cpu,
  Database,
  Download,
  HardDrive,
  Mic,
  Play,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Square,
  Trash2,
  Volume2,
  X,
} from 'lucide-react';
import { api } from '../../api/client';
import { subscribeServerEvents } from '../../api/eventStream';
import { useI18n } from '../../i18n/I18nContext';
import type {
  AiStatusPayload,
  AiTierId,
  CloseBehavior,
  PiperVoiceStatus,
  VoiceChimePreset,
  VoiceSensitivityMode,
  VoiceTtsStyle,
} from '../../types';
import {
  enumerateAudioInputDevices,
  MicLevelMonitor,
  playReadyChime,
  type AudioInputDeviceInfo,
} from '../../voice/audioCapture';
import { evictPiperVoiceCache } from '../../voice/piperTtsEngine';
import {
  listAvailableTtsVoices,
  PIPER_VOICE_PREFIX,
  speakLocalTextAsync,
  stopSpeaking,
} from '../../voice/ttsPlayer';
import { SelectField } from '../SelectField';
import { ShortcutRecorder } from '../ShortcutRecorder';

interface AiVoiceSettingsTabProps {
  closeBehavior: CloseBehavior;
  launchAtStartup: boolean;
  onChangeCloseBehavior: (behavior: CloseBehavior) => void;
  onToggleLaunchAtStartup?: (enabled: boolean) => void;
  onVoiceShortcutChange?: (shortcut: string) => void;
}

const VAD_OPTIONS = [1000, 1500, 2200, 3000] as const;

function formatBytes(bytes: number | null | undefined): string {
  const n = Number(bytes || 0);
  if (n <= 0) return '0 MB';
  if (n >= 1024 * 1024 * 1024) {
    return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }
  return `${Math.round(n / (1024 * 1024))} MB`;
}

export const AiVoiceSettingsTab = React.memo(function AiVoiceSettingsTab({
  closeBehavior,
  launchAtStartup,
  onChangeCloseBehavior,
  onToggleLaunchAtStartup,
  onVoiceShortcutChange,
}: AiVoiceSettingsTabProps) {
  const { t, lang } = useI18n();
  const [status, setStatus] = useState<AiStatusPayload | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [rescanning, setRescanning] = useState<boolean>(false);
  const [reindexing, setReindexing] = useState<boolean>(false);
  const [selectedTier, setSelectedTier] = useState<AiTierId>('tier-light');
  const [externalModel, setExternalModel] = useState<string>('');
  const [voiceShortcut, setVoiceShortcut] = useState<string>('CommandOrControl+Alt+Space');
  const [voiceAutoStopMs, setVoiceAutoStopMs] = useState<number>(1500);
  const [voiceTtsEnabled, setVoiceTtsEnabled] = useState<boolean>(true);
  const [voiceTtsVoice, setVoiceTtsVoice] = useState<string>('');
  const [voiceTtsStyle, setVoiceTtsStyle] = useState<VoiceTtsStyle>('natural');
  const [voiceChimePreset, setVoiceChimePreset] = useState<VoiceChimePreset>('soft');
  const [previewingTts, setPreviewingTts] = useState<boolean>(false);
  const [voiceMicDeviceId, setVoiceMicDeviceId] = useState<string>('');
  const [voiceNoiseSuppression, setVoiceNoiseSuppression] = useState<boolean>(true);
  const [voiceSensitivity, setVoiceSensitivity] = useState<VoiceSensitivityMode>('auto');
  const [micDevices, setMicDevices] = useState<AudioInputDeviceInfo[]>([]);
  const [testingMic, setTestingMic] = useState<boolean>(false);
  const [micLevel, setMicLevel] = useState<number>(0);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [piperVoices, setPiperVoices] = useState<PiperVoiceStatus[]>([]);
  const [busyPiperVoiceId, setBusyPiperVoiceId] = useState<string | null>(null);
  const [busyModelId, setBusyModelId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reindexNotice, setReindexNotice] = useState<string | null>(null);

  const isMountedRef = useRef<boolean>(true);
  const hydratedSettingsRef = useRef<boolean>(false);
  const micMonitorRef = useRef<MicLevelMonitor | null>(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      micMonitorRef.current?.stop();
      stopSpeaking();
    };
  }, []);

  const refreshMics = useCallback(async (requestPermission = false) => {
    const list = await enumerateAudioInputDevices(requestPermission);
    if (isMountedRef.current) setMicDevices(list);
  }, []);

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

  const loadStatus = useCallback(async (force = false, syncFormFields = false) => {
    try {
      if (force && isMountedRef.current) setRescanning(true);
      const data = await api.getAiStatus(force);
      if (!isMountedRef.current) return;
      setStatus(data);
      if (syncFormFields || !hydratedSettingsRef.current) {
        hydratedSettingsRef.current = true;
        setSelectedTier(data.settings.aiTier || data.recommendation.primaryOptionId);
        setExternalModel(data.settings.aiOllamaModel || '');
        setVoiceShortcut(data.settings.voiceShortcut || 'CommandOrControl+Alt+Space');
        setVoiceAutoStopMs(data.settings.voiceAutoStopMs ?? 1500);
        setVoiceTtsEnabled(data.settings.voiceTtsEnabled !== false);
        setVoiceTtsVoice(data.settings.voiceTtsVoice || '');
        setVoiceTtsStyle(data.settings.voiceTtsStyle || 'natural');
        setVoiceChimePreset(data.settings.voiceChimePreset || 'soft');
        setVoiceMicDeviceId(data.settings.voiceMicDeviceId || '');
        setVoiceNoiseSuppression(data.settings.voiceNoiseSuppression !== false);
        setVoiceSensitivity(data.settings.voiceSensitivity || 'auto');
      }
    } catch {
      // Non-fatal: keep previous state
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
        setRescanning(false);
      }
    }
  }, []);

  const refreshModelsOnly = useCallback(async () => {
    try {
      const data = await api.getAiModels();
      if (!isMountedRef.current) return;
      setStatus((prev) => {
        if (!prev) return prev;
        const fitById = new Map(
          prev.models.map((m) => [m.id, { fitsHardware: m.fitsHardware, warningCode: m.warningCode }]),
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

  // Lightweight chained fallback poll while any model download is active
  const hasActiveDownload = useMemo(
    () => Boolean(status?.models.some((m) => m.downloading)),
    [status],
  );

  useEffect(() => {
    if (!hasActiveDownload) return;
    let cancelled = false;
    let timer: number | null = null;
    const tick = async () => {
      if (cancelled) return;
      await refreshModelsOnly();
      if (!cancelled) {
        timer = window.setTimeout(() => void tick(), 1200);
      }
    };
    timer = window.setTimeout(() => void tick(), 1200);
    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [hasActiveDownload, refreshModelsOnly]);

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

  const handleSelectTier = async (tierId: AiTierId) => {
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
  };

  const handleExternalModelChange = async (modelName: string) => {
    setActionError(null);
    setExternalModel(modelName);
    try {
      await api.updateSettings({ aiOllamaModel: modelName.trim() });
    } catch {
      if (isMountedRef.current) setActionError(t.operationFailedToast);
    }
  };

  const handleDownloadModel = async (modelId: string) => {
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
  };

  const handleCancelDownload = async (modelId: string) => {
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
  };

  const handleDeleteModel = async (modelId: string) => {
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
  };

  const handleDeleteAll = async () => {
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
  };

  const handleReindexRag = async () => {
    setActionError(null);
    setReindexNotice(null);
    setReindexing(true);
    try {
      const res = await api.reindexRag();
      await loadStatus(false, false);
      if (isMountedRef.current) {
        const modeLabel = res?.mode || 'fts5';
        const recomputed = typeof res?.recomputed === 'number' ? res.recomputed : 0;
        setReindexNotice(`${t.aiRagReindexButton}: OK (${modeLabel}, ${recomputed})`);
      }
    } catch {
      if (isMountedRef.current) setActionError(t.operationFailedToast);
    } finally {
      if (isMountedRef.current) setReindexing(false);
    }
  };

  const handleShortcutChange = async (next: string) => {
    setActionError(null);
    setVoiceShortcut(next);
    if (onVoiceShortcutChange) {
      onVoiceShortcutChange(next);
      return;
    }
    try {
      const reg = await window.agendameaWindow?.setVoiceShortcut?.(next);
      if (reg && reg.ok === false && isMountedRef.current) {
        setActionError(t.operationFailedToast);
      }
      await api.updateSettings({ voiceShortcut: next });
    } catch {
      if (isMountedRef.current) setActionError(t.operationFailedToast);
    }
  };

  const handleAutoStopChange = async (ms: number) => {
    setActionError(null);
    setVoiceAutoStopMs(ms);
    try {
      await api.updateSettings({ voiceAutoStopMs: ms });
    } catch {
      if (isMountedRef.current) setActionError(t.operationFailedToast);
    }
  };

  const handleMicChange = async (deviceId: string) => {
    setActionError(null);
    setVoiceMicDeviceId(deviceId);
    if (testingMic) {
      micMonitorRef.current?.stop();
      setTestingMic(false);
      setMicLevel(0);
    }
    try {
      await api.updateSettings({ voiceMicDeviceId: deviceId });
    } catch {
      if (isMountedRef.current) setActionError(t.operationFailedToast);
    }
  };

  const handleNoiseSuppressionToggle = async (enabled: boolean) => {
    setActionError(null);
    setVoiceNoiseSuppression(enabled);
    try {
      await api.updateSettings({ voiceNoiseSuppression: enabled });
    } catch {
      if (isMountedRef.current) setActionError(t.operationFailedToast);
    }
  };

  const handleSensitivityChange = async (mode: VoiceSensitivityMode) => {
    setActionError(null);
    setVoiceSensitivity(mode);
    try {
      await api.updateSettings({ voiceSensitivity: mode });
    } catch {
      if (isMountedRef.current) setActionError(t.operationFailedToast);
    }
  };

  const handleToggleMicTest = async () => {
    if (testingMic) {
      micMonitorRef.current?.stop();
      setTestingMic(false);
      setMicLevel(0);
      return;
    }
    if (!micMonitorRef.current) {
      micMonitorRef.current = new MicLevelMonitor();
    }
    const ok = await micMonitorRef.current.start(
      { deviceId: voiceMicDeviceId || undefined, noiseSuppression: voiceNoiseSuppression },
      (lvl) => {
        if (isMountedRef.current) setMicLevel(lvl);
      },
    );
    if (ok && isMountedRef.current) {
      setTestingMic(true);
      void refreshMics(false);
    } else if (isMountedRef.current) {
      setActionError(t.operationFailedToast);
    }
  };

  const handleTtsToggle = async (enabled: boolean) => {
    setActionError(null);
    setVoiceTtsEnabled(enabled);
    try {
      await api.updateSettings({ voiceTtsEnabled: enabled });
    } catch {
      if (isMountedRef.current) setActionError(t.operationFailedToast);
    }
  };

  const handleTtsVoiceChange = async (voiceUri: string) => {
    setActionError(null);
    setVoiceTtsVoice(voiceUri);
    try {
      await api.updateSettings({ voiceTtsVoice: voiceUri });
    } catch {
      if (isMountedRef.current) setActionError(t.operationFailedToast);
    }
  };

  const handleTtsStyleChange = async (style: VoiceTtsStyle) => {
    setActionError(null);
    setVoiceTtsStyle(style);
    try {
      await api.updateSettings({ voiceTtsStyle: style });
    } catch {
      if (isMountedRef.current) setActionError(t.operationFailedToast);
    }
  };

  const handleChimePresetChange = async (preset: VoiceChimePreset) => {
    setActionError(null);
    setVoiceChimePreset(preset);
    if (preset !== 'none') {
      playReadyChime(null, preset);
    }
    try {
      await api.updateSettings({ voiceChimePreset: preset });
    } catch {
      if (isMountedRef.current) setActionError(t.operationFailedToast);
    }
  };

  const handlePreviewTts = async (overrideVoice?: string) => {
    if (previewingTts && !overrideVoice) {
      stopSpeaking();
      setPreviewingTts(false);
      return;
    }
    setPreviewingTts(true);
    const res = await speakLocalTextAsync(t.aiVoiceTtsPreviewSample, {
      language: lang,
      preferredVoice: overrideVoice ?? voiceTtsVoice,
      style: voiceTtsStyle,
      onEnd: () => {
        if (isMountedRef.current) setPreviewingTts(false);
      },
    });
    if (!res.spoken && isMountedRef.current) {
      setPreviewingTts(false);
    }
  };

  const handleDownloadPiperVoice = async (voiceId: string) => {
    setActionError(null);
    setBusyPiperVoiceId(voiceId);
    try {
      const res = await api.downloadPiperVoice(voiceId);
      await refreshPiperVoices();
      if (res.ok && isMountedRef.current) {
        const nextVal = `${PIPER_VOICE_PREFIX}${voiceId}`;
        setVoiceTtsVoice(nextVal);
        await api.updateSettings({ voiceTtsVoice: nextVal, voiceTtsEnabled: true });
        setVoiceTtsEnabled(true);
      } else if (!res.ok && res.code !== 'CANCELLED' && isMountedRef.current) {
        setActionError(t.operationFailedToast);
      }
    } catch {
      if (isMountedRef.current) setActionError(t.operationFailedToast);
    } finally {
      if (isMountedRef.current) setBusyPiperVoiceId(null);
    }
  };

  const handleCancelPiperVoice = async (voiceId: string) => {
    setActionError(null);
    try {
      await api.cancelPiperVoiceDownload(voiceId);
      await refreshPiperVoices();
    } catch {
      if (isMountedRef.current) setActionError(t.operationFailedToast);
    }
  };

  const handleDeletePiperVoice = async (voiceId: string) => {
    setActionError(null);
    setBusyPiperVoiceId(voiceId);
    try {
      evictPiperVoiceCache(voiceId);
      await api.deletePiperVoice(voiceId);
      await refreshPiperVoices();
      if (voiceTtsVoice === `${PIPER_VOICE_PREFIX}${voiceId}` && isMountedRef.current) {
        setVoiceTtsVoice('');
        await api.updateSettings({ voiceTtsVoice: '' });
      }
    } catch {
      if (isMountedRef.current) setActionError(t.operationFailedToast);
    } finally {
      if (isMountedRef.current) setBusyPiperVoiceId(null);
    }
  };

  const handleEnableTrayBackground = () => {
    onChangeCloseBehavior('tray');
    onToggleLaunchAtStartup?.(true);
  };

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
    <div className="space-y-6" data-testid="settings-ai-section">
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
            onClick={() => void loadStatus(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--canvas)] px-2.5 py-1 text-xs font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-hover)] disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${rescanning ? 'animate-spin' : ''}`} />
            <span>{t.aiHardwareRescanButton}</span>
          </button>
        </div>

        {status ? (
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <div className="rounded-lg border border-[var(--border)] bg-[var(--canvas)] px-3 py-2">
              <p className="text-[10px] font-medium uppercase text-[var(--text-muted)]">GPU / VRAM</p>
              <p className="mt-0.5 truncate text-xs font-semibold text-[var(--text-primary)]" title={status.hardware.gpuName}>
                {status.hardware.vramGb > 0 ? `${status.hardware.vramGb} GB` : 'iGPU / CPU'}
              </p>
              <p className="truncate text-[10px] text-[var(--text-muted)]">{status.hardware.gpuName}</p>
            </div>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--canvas)] px-3 py-2">
              <p className="text-[10px] font-medium uppercase text-[var(--text-muted)]">RAM</p>
              <p className="mt-0.5 text-xs font-semibold text-[var(--text-primary)]">
                {status.hardware.ramGb} GB
              </p>
              <p className="text-[10px] text-[var(--text-muted)]">{status.hardware.cpuCores} Threads</p>
            </div>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--canvas)] px-3 py-2">
              <p className="text-[10px] font-medium uppercase text-[var(--text-muted)]">Disk</p>
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
                onClick={() => void handleReindexRag()}
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
            className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400"
          >
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
            <span>{reindexNotice}</span>
          </div>
        )}
        {actionError && (
          <p role="alert" className="text-xs font-medium text-red-500">
            {actionError}
          </p>
        )}
      </section>

      {/* Tier & External Ollama Selector */}
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
                onClick={() => void handleSelectTier(card.id)}
                className={`flex flex-col items-start gap-1.5 rounded-xl border p-3.5 text-left transition-all ${
                  isSelected
                    ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                    : 'border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-hover)]'
                }`}
              >
                <span className="w-full truncate whitespace-nowrap text-xs font-semibold text-[var(--text-primary)]">
                  {card.title}
                </span>
                <p className="text-[11px] leading-snug text-[var(--text-muted)]">{card.desc}</p>
                <div className="mt-auto flex w-full items-center justify-between gap-2 pt-1.5">
                  <span className="font-mono-tabular text-[10.5px] text-[var(--text-secondary)] whitespace-nowrap">
                    {tierMeta ? formatBytes(tierMeta.totalBytes) : ''}
                  </span>
                  {isRecommended && (
                    <span
                      data-testid="ai-recommended-badge"
                      className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 whitespace-nowrap"
                    >
                      <Sparkles className="h-2.5 w-2.5 shrink-0" />
                      <span>{t.aiTierRecommendedBadge}</span>
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
              void handleSelectTier(
                status?.recommendation.externalLmStudio.detected &&
                  !status?.recommendation.externalOllama.detected
                  ? 'external-lmstudio'
                  : 'external-ollama',
              )
            }
            className="flex w-full items-center justify-between gap-3 p-3.5 text-left"
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
              <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
                {t.aiExternalOllamaDesc}
              </p>
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
                    onChange={(e) => void handleExternalModelChange(e.target.value)}
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
                    onChange={(e) => setExternalModel(e.target.value)}
                    onBlur={(e) => void handleExternalModelChange(e.target.value)}
                    placeholder={t.aiExternalModelCustomPlaceholder}
                    className="min-w-[200px] flex-1 rounded-lg border border-[var(--border)] bg-[var(--canvas)] px-2.5 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent)] sm:max-w-[280px]"
                  />
                )}
                <button
                  type="button"
                  data-testid="ai-external-rescan-btn"
                  disabled={rescanning}
                  onClick={() => void loadStatus(true, false)}
                  className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--canvas)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-hover)] disabled:opacity-50"
                >
                  <RefreshCw className={`h-3 w-3 ${rescanning ? 'animate-spin' : ''}`} />
                  <span>{t.aiHardwareRescanButton}</span>
                </button>
              </div>
              {detectedExternalModels.length === 0 && (
                <p className="text-[11px] text-[var(--text-muted)]">
                  {t.aiExternalOfflineHint}
                </p>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Voice Dictation, Microphone, Noise Filter, Sensitivity, Shortcut & TTS Settings */}
      <section
        aria-label={t.aiVoiceControlsTitle}
        data-testid="ai-voice-controls"
        className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Mic className="h-4 w-4 text-[var(--accent)]" />
            <h3 className="font-display text-xs font-semibold text-[var(--text-primary)]">
              {t.aiVoiceControlsTitle}
            </h3>
          </div>
          <button
            type="button"
            data-testid="ai-test-overlay-btn"
            onClick={() => {
              if (window.agendameaWindow?.toggleVoiceOverlay) {
                void window.agendameaWindow.toggleVoiceOverlay();
              } else {
                window.open('/overlay.html', '_blank', 'width=460,height=220');
              }
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--accent)] bg-[var(--accent-soft)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] transition-opacity hover:opacity-90"
          >
            <Mic className="h-3.5 w-3.5 text-[var(--accent)]" />
            <span>{t.aiVoiceTestOverlayButton}</span>
          </button>
        </div>

        {/* Microphone Selector + Live Level Meter */}
        <div className="space-y-2 rounded-lg border border-[var(--border)] bg-[var(--canvas)] p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] font-semibold text-[var(--text-primary)]">
              {t.aiVoiceMicLabel}
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                data-testid="ai-mic-refresh-btn"
                onClick={() => void refreshMics(true)}
                className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-[11px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
              >
                <RefreshCw className="h-3 w-3" />
                <span>{t.aiVoiceMicRefreshButton}</span>
              </button>
              <button
                type="button"
                data-testid="ai-mic-test-btn"
                onClick={() => void handleToggleMicTest()}
                className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  testingMic
                    ? 'border-rose-500/40 bg-rose-500/15 text-rose-600 dark:text-rose-400'
                    : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text-primary)] hover:bg-[var(--surface-hover)]'
                }`}
              >
                <AudioLines className="h-3 w-3" />
                <span>{testingMic ? t.aiVoiceMicStopTestButton : t.aiVoiceMicTestButton}</span>
              </button>
            </div>
          </div>

          <SelectField
            data-testid="ai-voice-mic-select"
            value={voiceMicDeviceId}
            onChange={(e) => void handleMicChange(e.target.value)}
            wrapperClassName="w-full"
          >
            <option value="">{t.aiVoiceMicDefaultOption}</option>
            {micDevices.map((dev) => (
              <option key={dev.deviceId} value={dev.deviceId}>
                {dev.label}
              </option>
            ))}
          </SelectField>

          {testingMic && (
            <div
              data-testid="ai-mic-level-meter"
              className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-subtle)]"
            >
              <div
                className="h-full rounded-full bg-emerald-500 transition-all duration-75"
                style={{ width: `${Math.max(4, Math.round(micLevel * 100))}%` }}
              />
            </div>
          )}
        </div>

        {/* Neural Noise Suppression Switch (RNNoise WASM + Silero VAD v5) */}
        <div className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--canvas)] px-3 py-2.5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-medium text-[var(--text-primary)]">
                {t.aiVoiceNoiseSuppressionLabel}
              </p>
              <span
                data-testid="ai-voice-neural-badge"
                className="inline-flex items-center rounded-md border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 font-mono-tabular text-[10px] font-medium text-emerald-600 dark:text-emerald-400"
              >
                {t.aiVoiceNeuralEngineBadge}
              </span>
            </div>
            <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
              {t.aiVoiceNoiseSuppressionDesc}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={voiceNoiseSuppression}
            data-testid="ai-voice-noise-toggle"
            onClick={() => void handleNoiseSuppressionToggle(!voiceNoiseSuppression)}
            className={`inline-flex items-center rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              voiceNoiseSuppression
                ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text-primary)]'
                : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]'
            }`}
          >
            {voiceNoiseSuppression ? t.enabledBadge : t.disabledBadge}
          </button>
        </div>

        {/* Shortcut Recorder + VAD Timeout + Sensitivity */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <span className="block text-[11px] font-medium text-[var(--text-secondary)]">
              {t.aiVoiceShortcutLabel}
            </span>
            <div className="flex items-start">
              <ShortcutRecorder
                testId="ai-voice-shortcut-recorder"
                value={voiceShortcut}
                defaultValue="CommandOrControl+Alt+Space"
                requireModifier
                electronFormat
                recordPrompt={t.shortcutRecordPrompt}
                resetLabel={t.shortcutResetDefaults}
                modifierHint={t.shortcutRequireModifierHint}
                onChange={(next) => void handleShortcutChange(next)}
              />
            </div>
          </div>

          <label className="space-y-1.5">
            <span className="block text-[11px] font-medium text-[var(--text-secondary)]">
              {t.aiVoiceAutoStopLabel}
            </span>
            <SelectField
              data-testid="ai-voice-vad-select"
              value={voiceAutoStopMs}
              onChange={(e) => void handleAutoStopChange(Number(e.target.value))}
              wrapperClassName="w-full"
            >
              {VAD_OPTIONS.map((ms) => (
                <option key={ms} value={ms}>
                  {(ms / 1000).toFixed(1)} s
                </option>
              ))}
            </SelectField>
          </label>

          <label className="space-y-1.5">
            <span className="block text-[11px] font-medium text-[var(--text-secondary)]">
              {t.aiVoiceSensitivityLabel}
            </span>
            <SelectField
              data-testid="ai-voice-sensitivity-select"
              value={voiceSensitivity}
              onChange={(e) => void handleSensitivityChange(e.target.value as VoiceSensitivityMode)}
              wrapperClassName="w-full"
            >
              <option value="auto">{t.aiVoiceSensitivityAuto}</option>
              <option value="low">{t.aiVoiceSensitivityLow}</option>
              <option value="medium">{t.aiVoiceSensitivityMedium}</option>
              <option value="high">{t.aiVoiceSensitivityHigh}</option>
            </SelectField>
          </label>
        </div>

        {/* Dictation Ready Chime Selector */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--canvas)] px-3 py-2.5">
          <span className="text-xs font-medium text-[var(--text-primary)]">
            {t.aiVoiceChimeLabel}
          </span>
          <div className="flex items-center gap-2">
            <SelectField
              data-testid="ai-voice-chime-select"
              value={voiceChimePreset}
              onChange={(e) => void handleChimePresetChange(e.target.value as VoiceChimePreset)}
              wrapperClassName="w-[180px]"
            >
              <option value="soft">{t.aiVoiceChimeSoft}</option>
              <option value="crystal">{t.aiVoiceChimeCrystal}</option>
              <option value="studio">{t.aiVoiceChimeStudio}</option>
              <option value="minimal">{t.aiVoiceChimeMinimal}</option>
              <option value="none">{t.aiVoiceChimeNone}</option>
            </SelectField>
            <button
              type="button"
              data-testid="ai-voice-chime-preview-btn"
              disabled={voiceChimePreset === 'none'}
              onClick={() => playReadyChime(null, voiceChimePreset)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-hover)] disabled:opacity-40"
              aria-label={t.aiVoiceTtsPreviewButton}
            >
              <Play className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* TTS Read-Aloud: Multiple Voices, Styles & Live Preview */}
        <div className="space-y-3 border-t border-[var(--border)] pt-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-xs text-[var(--text-primary)] cursor-pointer">
              <input
                type="checkbox"
                data-testid="ai-voice-tts-toggle"
                checked={voiceTtsEnabled}
                onChange={(e) => void handleTtsToggle(e.target.checked)}
                className="h-3.5 w-3.5 rounded accent-[var(--accent)]"
              />
              <Volume2 className="h-3.5 w-3.5 text-[var(--accent)]" />
              <span>{t.aiVoiceTtsToggleLabel}</span>
            </label>

            <button
              type="button"
              data-testid="ai-voice-tts-preview-btn"
              disabled={!voiceTtsEnabled}
              onClick={() => void handlePreviewTts()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--canvas)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-hover)] disabled:opacity-40"
            >
              {previewingTts ? (
                <Square className="h-3 w-3 text-rose-500" />
              ) : (
                <Play className="h-3 w-3 text-[var(--accent)]" />
              )}
              <span>{previewingTts ? t.aiVoiceTtsStopPreviewButton : t.aiVoiceTtsPreviewButton}</span>
            </button>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="space-y-1.5">
              <span className="block text-[11px] font-medium text-[var(--text-secondary)]">
                {t.aiVoiceTtsVoiceLabel}
              </span>
              <SelectField
                data-testid="ai-voice-tts-select"
                value={voiceTtsVoice}
                disabled={!voiceTtsEnabled}
                onChange={(e) => void handleTtsVoiceChange(e.target.value)}
                wrapperClassName="w-full"
              >
                <option value="">Auto ({t.aiVoiceTtsVoiceLabel})</option>
                {piperVoices.some((pv) => pv.installed) && (
                  <optgroup label={t.aiVoicePiperGroupLabel}>
                    {piperVoices
                      .filter((pv) => pv.installed)
                      .map((pv) => (
                        <option key={pv.id} value={`${PIPER_VOICE_PREFIX}${pv.id}`}>
                          {pv.name} ({pv.language} - {pv.gender === 'female' ? t.aiVoiceGenderFemale : t.aiVoiceGenderMale})
                        </option>
                      ))}
                  </optgroup>
                )}
                {voices.length > 0 && (
                  <optgroup label={t.aiVoiceSystemGroupLabel}>
                    {voices.map((v) => (
                      <option key={v.voiceURI} value={v.voiceURI}>
                        {v.name} ({v.lang})
                      </option>
                    ))}
                  </optgroup>
                )}
              </SelectField>
            </label>

            <label className="space-y-1.5">
              <span className="block text-[11px] font-medium text-[var(--text-secondary)]">
                {t.aiVoiceTtsStyleLabel}
              </span>
              <SelectField
                data-testid="ai-voice-tts-style-select"
                value={voiceTtsStyle}
                disabled={!voiceTtsEnabled}
                onChange={(e) => void handleTtsStyleChange(e.target.value as VoiceTtsStyle)}
                wrapperClassName="w-full"
              >
                <option value="natural">{t.aiVoiceTtsStyleNatural}</option>
                <option value="crisp">{t.aiVoiceTtsStyleCrisp}</option>
                <option value="calm">{t.aiVoiceTtsStyleCalm}</option>
                <option value="bright">{t.aiVoiceTtsStyleBright}</option>
                <option value="studio">{t.aiVoiceTtsStyleStudio}</option>
              </SelectField>
            </label>
          </div>

          {/* Offline Piper Neural Voices (Female & Male) */}
          {piperVoices.length > 0 && (
            <div
              data-testid="ai-piper-voices-section"
              className="rounded-lg border border-[var(--border)] bg-[var(--canvas)] overflow-hidden"
            >
              <div className="border-b border-[var(--border)] px-3 py-2">
                <p className="text-[11px] font-semibold text-[var(--text-primary)]">
                  {t.aiVoicePiperSectionTitle}
                </p>
                <p className="text-[10.5px] text-[var(--text-muted)]">
                  {t.aiVoicePiperSectionDesc}
                </p>
              </div>
              <div className="divide-y divide-[var(--border)]">
                {piperVoices.map((pv) => {
                  const isActive = voiceTtsVoice === `${PIPER_VOICE_PREFIX}${pv.id}`;
                  const genderLabel =
                    pv.gender === 'female' ? t.aiVoiceGenderFemale : t.aiVoiceGenderMale;
                  return (
                    <div
                      key={pv.id}
                      data-testid={`piper-voice-row-${pv.id}`}
                      className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
                    >
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-xs font-semibold text-[var(--text-primary)]">
                            {pv.name}
                          </span>
                          <span className="rounded bg-[var(--surface-subtle)] px-1.5 py-0.5 font-mono-tabular text-[10px] text-[var(--text-secondary)]">
                            {pv.language}
                          </span>
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                              pv.gender === 'female'
                                ? 'bg-pink-500/15 text-pink-600 dark:text-pink-300'
                                : 'bg-sky-500/15 text-sky-600 dark:text-sky-300'
                            }`}
                          >
                            {genderLabel}
                          </span>
                          <span className="rounded bg-[var(--surface-subtle)] px-1.5 py-0.5 font-mono-tabular text-[10px] uppercase text-[var(--text-muted)]">
                            {pv.license}
                          </span>
                          <span className="font-mono-tabular text-[10px] text-[var(--text-muted)]">
                            {formatBytes(pv.expectedBytes)}
                          </span>
                          {isActive && pv.installed && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                              <CheckCircle2 className="h-3 w-3" />
                              <span>{t.aiVoicePiperActiveBadge}</span>
                            </span>
                          )}
                        </div>
                        {pv.downloading && pv.progress && (
                          <div className="mt-1 w-full max-w-xs space-y-0.5">
                            <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-subtle)]">
                              <div
                                className="h-full bg-[var(--accent)] transition-all"
                                style={{ width: `${pv.progress.percent}%` }}
                              />
                            </div>
                            <p className="font-mono-tabular text-[10px] text-[var(--text-muted)]">
                              {t.aiModelDownloadingLabel} {pv.progress.percent}% ({formatBytes(pv.progress.receivedBytes)} / {formatBytes(pv.progress.totalBytes)})
                            </p>
                          </div>
                        )}
                      </div>

                      <div className="flex shrink-0 items-center gap-1.5">
                        {pv.downloading ? (
                          <button
                            type="button"
                            data-testid={`piper-voice-cancel-${pv.id}`}
                            onClick={() => void handleCancelPiperVoice(pv.id)}
                            className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-[11px] font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)]"
                          >
                            <X className="h-3 w-3" />
                            <span>{t.aiModelCancelButton}</span>
                          </button>
                        ) : pv.installed ? (
                          <>
                            <button
                              type="button"
                              data-testid={`piper-voice-preview-${pv.id}`}
                              onClick={() => void handlePreviewTts(`${PIPER_VOICE_PREFIX}${pv.id}`)}
                              className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-[11px] font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)]"
                              aria-label={t.aiVoiceTtsPreviewButton}
                            >
                              <Play className="h-3 w-3 text-[var(--accent)]" />
                            </button>
                            {!isActive && (
                              <button
                                type="button"
                                data-testid={`piper-voice-select-${pv.id}`}
                                onClick={() => void handleTtsVoiceChange(`${PIPER_VOICE_PREFIX}${pv.id}`)}
                                className="inline-flex items-center gap-1 rounded-lg border border-[var(--accent)] bg-[var(--accent-soft)] px-2 py-1 text-[11px] font-medium text-[var(--text-primary)] hover:opacity-90"
                              >
                                <span>{t.aiVoicePiperSelectButton}</span>
                              </button>
                            )}
                            <button
                              type="button"
                              data-testid={`piper-voice-delete-${pv.id}`}
                              disabled={busyPiperVoiceId === pv.id}
                              onClick={() => void handleDeletePiperVoice(pv.id)}
                              className="inline-flex items-center gap-1 rounded-lg border border-rose-500/40 bg-rose-500/10 px-2 py-1 text-[11px] font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-500/20 disabled:opacity-50"
                              aria-label={t.aiModelDeleteButton}
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            data-testid={`piper-voice-download-${pv.id}`}
                            disabled={busyPiperVoiceId === pv.id}
                            onClick={() => void handleDownloadPiperVoice(pv.id)}
                            className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)] disabled:opacity-50"
                          >
                            <Download className="h-3 w-3 text-[var(--accent)]" />
                            <span>{t.aiModelDownloadButton}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Background Tray + Startup One-Click Helper */}
      {(closeBehavior !== 'tray' || !launchAtStartup) && (
        <section
          data-testid="ai-tray-background-guide"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/35 bg-amber-500/10 p-4"
        >
          <div className="min-w-0 flex-1">
            <h4 className="text-xs font-semibold text-[var(--text-primary)]">
              {t.aiVoiceTrayGuideTitle}
            </h4>
            <p className="mt-0.5 text-[11px] text-[var(--text-secondary)]">
              {t.aiVoiceTrayGuideDesc}
            </p>
          </div>
          <button
            type="button"
            data-testid="ai-enable-tray-btn"
            onClick={handleEnableTrayBackground}
            className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-[var(--accent-fg)] transition-opacity hover:opacity-90 whitespace-nowrap"
          >
            {t.aiVoiceEnableTrayButton}
          </button>
        </section>
      )}

      {/* Local Models List with 1:1 Skeleton while loading */}
      <section aria-label={t.aiModelsSectionTitle} className="space-y-2.5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <HardDrive className="h-4 w-4 text-[var(--accent)]" />
            <h3 className="font-display text-xs font-semibold text-[var(--text-muted)]">
              {t.aiModelsSectionTitle}
            </h3>
          </div>
          {status && status.installedDiskBytes > 0 && (
            <button
              type="button"
              data-testid="ai-delete-all-models-btn"
              disabled={busyModelId !== null}
              onClick={() => void handleDeleteAll()}
              className="inline-flex items-center gap-1 rounded-lg border border-rose-500/40 bg-rose-500/10 px-2.5 py-1 text-[11px] font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-500/20 disabled:opacity-50"
            >
              <Trash2 className="h-3 w-3" />
              <span>{t.aiDeleteAllModelsButton}</span>
            </button>
          )}
        </div>

        <div className="divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
          {!status ? (
            <div data-testid="ai-models-skeleton" className="divide-y divide-[var(--border)] animate-pulse">
              {[0, 1, 2, 3, 4].map((idx) => (
                <div key={idx} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="h-3.5 w-32 rounded bg-[var(--surface-subtle)]" />
                    <div className="h-4 w-20 rounded bg-[var(--surface-subtle)]" />
                    <div className="h-3 w-12 rounded bg-[var(--surface-subtle)]" />
                  </div>
                  <div className="h-7 w-16 rounded-lg bg-[var(--surface-subtle)]" />
                </div>
              ))}
            </div>
          ) : (
            status.models.map((m) => (
              <div
                key={m.id}
                data-testid={`ai-model-row-${m.id}`}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5"
              >
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold text-[var(--text-primary)]">{m.label}</span>{' '}
                    <span className="rounded bg-[var(--surface-subtle)] px-1.5 py-0.5 font-mono-tabular text-[10px] uppercase text-[var(--text-muted)]">
                      {m.role} · {m.license}
                    </span>{' '}
                    <span className="font-mono-tabular text-[10.5px] text-[var(--text-muted)]">
                      {formatBytes(m.expectedBytes)}
                    </span>
                    {m.verified && (
                      <span className="inline-flex items-center gap-1 text-[10.5px] font-medium text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 className="h-3 w-3" />
                        <span>{t.aiModelInstalledBadge}</span>
                      </span>
                    )}
                    {m.fitsHardware === false && (
                      <span
                        data-testid={`ai-model-hw-warn-${m.id}`}
                        title={m.warningCode || 'RAM/VRAM'}
                        className="rounded bg-amber-500/15 px-1.5 py-0.5 font-mono-tabular text-[10px] font-semibold text-amber-600 dark:text-amber-400"
                      >
                        RAM/VRAM!
                      </span>
                    )}
                  </div>
                  {m.downloading && m.progress && (
                    <div className="mt-1.5 w-full max-w-xs space-y-1">
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-subtle)]">
                        <div
                          className="h-full bg-[var(--accent)] transition-all"
                          style={{ width: `${m.progress.percent}%` }}
                        />
                      </div>
                      <p className="font-mono-tabular text-[10px] text-[var(--text-muted)]">
                        {t.aiModelDownloadingLabel} {m.progress.percent}% ({formatBytes(m.progress.receivedBytes)} / {formatBytes(m.progress.totalBytes)})
                      </p>
                    </div>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-1.5">
                  {m.downloading ? (
                    <button
                      type="button"
                      data-testid={`ai-model-cancel-${m.id}`}
                      onClick={() => void handleCancelDownload(m.id)}
                      className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--canvas)] px-2.5 py-1 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)]"
                    >
                      <X className="h-3.5 w-3.5" />
                      <span>{t.aiModelCancelButton}</span>
                    </button>
                  ) : m.present ? (
                    <button
                      type="button"
                      data-testid={`ai-model-delete-${m.id}`}
                      disabled={busyModelId === m.id}
                      onClick={() => void handleDeleteModel(m.id)}
                      className="inline-flex items-center gap-1 rounded-lg border border-rose-500/40 bg-rose-500/10 px-2.5 py-1 text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-500/20 disabled:opacity-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>{t.aiModelDeleteButton}</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      data-testid={`ai-model-download-${m.id}`}
                      disabled={busyModelId === m.id}
                      onClick={() => void handleDownloadModel(m.id)}
                      className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--canvas)] px-2.5 py-1 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)] disabled:opacity-50"
                    >
                      <Download className="h-3.5 w-3.5 text-[var(--accent)]" />
                      <span>{t.aiModelDownloadButton}</span>
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
});
