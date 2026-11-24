import {
  type Dispatch,
  type RefObject,
  type SetStateAction,
  useCallback,
  useRef,
  useState,
} from 'react';
import { api } from '../api/client';
import type {
  PiperVoiceStatus,
  VoiceChimePreset,
  VoiceSensitivityMode,
  VoiceTtsStyle,
} from '../types';
import {
  type AudioInputDeviceInfo,
  enumerateAudioInputDevices,
  MicLevelMonitor,
  playReadyChime,
} from '../voice/audioCapture';
import { evictPiperVoiceCache } from '../voice/piperTtsEngine';
import { PIPER_VOICE_PREFIX, speakLocalTextAsync, stopSpeaking } from '../voice/ttsPlayer';

interface UseAiVoiceAudioControlsOptions {
  lang: string;
  previewSample: string;
  micFallbackLabel?: string;
  operationFailedToast: string;
  isMountedRef: RefObject<boolean>;
  setActionError: Dispatch<SetStateAction<string | null>>;
  setPiperVoices: Dispatch<SetStateAction<PiperVoiceStatus[]>>;
  refreshPiperVoices: () => Promise<void>;
}

/**
 * Manages microphone device selection, live level monitor, noise suppression,
 * sensitivity/chime presets, and TTS / Piper neural voice actions for AiVoiceSettingsTab.
 */
export function useAiVoiceAudioControls({
  lang,
  previewSample,
  micFallbackLabel,
  operationFailedToast,
  isMountedRef,
  setActionError,
  refreshPiperVoices,
}: UseAiVoiceAudioControlsOptions) {
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
  const [busyPiperVoiceId, setBusyPiperVoiceId] = useState<string | null>(null);

  const micMonitorRef = useRef<MicLevelMonitor | null>(null);
  const previewSeqRef = useRef<number>(0);

  const cleanupAudioControls = useCallback(() => {
    micMonitorRef.current?.stop();
    stopSpeaking();
  }, []);

  const refreshMics = useCallback(
    async (requestPermission = false) => {
      const list = await enumerateAudioInputDevices(requestPermission, micFallbackLabel);
      if (isMountedRef.current) setMicDevices(list);
    },
    [isMountedRef, micFallbackLabel],
  );

  const hydrateAudioSettings = useCallback(
    (settings: {
      voiceAutoStopMs?: number;
      voiceTtsEnabled?: boolean;
      voiceTtsVoice?: string;
      voiceTtsStyle?: VoiceTtsStyle;
      voiceChimePreset?: VoiceChimePreset;
      voiceMicDeviceId?: string;
      voiceNoiseSuppression?: boolean;
      voiceSensitivity?: VoiceSensitivityMode;
    }) => {
      setVoiceAutoStopMs(settings.voiceAutoStopMs ?? 1500);
      setVoiceTtsEnabled(settings.voiceTtsEnabled !== false);
      setVoiceTtsVoice(settings.voiceTtsVoice || '');
      setVoiceTtsStyle(settings.voiceTtsStyle || 'natural');
      setVoiceChimePreset(settings.voiceChimePreset || 'soft');
      setVoiceMicDeviceId(settings.voiceMicDeviceId || '');
      setVoiceNoiseSuppression(settings.voiceNoiseSuppression !== false);
      setVoiceSensitivity(settings.voiceSensitivity || 'auto');
    },
    [],
  );

  const persistAudioPatch = useCallback(
    async (patch: Record<string, unknown>) => {
      try {
        await api.updateSettings(patch);
      } catch {
        if (isMountedRef.current) setActionError(operationFailedToast);
      }
    },
    [isMountedRef, operationFailedToast, setActionError],
  );

  const handleAutoStopChange = useCallback(
    async (ms: number) => {
      setActionError(null);
      setVoiceAutoStopMs(ms);
      await persistAudioPatch({ voiceAutoStopMs: ms });
    },
    [persistAudioPatch, setActionError],
  );

  const handleMicChange = useCallback(
    async (deviceId: string) => {
      setActionError(null);
      setVoiceMicDeviceId(deviceId);
      if (testingMic) {
        micMonitorRef.current?.stop();
        setTestingMic(false);
        setMicLevel(0);
      }
      await persistAudioPatch({ voiceMicDeviceId: deviceId });
    },
    [persistAudioPatch, setActionError, testingMic],
  );

  const handleNoiseSuppressionToggle = useCallback(
    async (enabled: boolean) => {
      setActionError(null);
      setVoiceNoiseSuppression(enabled);
      await persistAudioPatch({ voiceNoiseSuppression: enabled });
    },
    [persistAudioPatch, setActionError],
  );

  const handleSensitivityChange = useCallback(
    async (mode: VoiceSensitivityMode) => {
      setActionError(null);
      setVoiceSensitivity(mode);
      await persistAudioPatch({ voiceSensitivity: mode });
    },
    [persistAudioPatch, setActionError],
  );

  const handleToggleMicTest = useCallback(async () => {
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
    if (!isMountedRef.current) {
      if (ok) micMonitorRef.current?.stop();
      return;
    }
    if (ok) {
      setTestingMic(true);
      void refreshMics(false);
    } else {
      setActionError(operationFailedToast);
    }
  }, [
    isMountedRef,
    operationFailedToast,
    refreshMics,
    setActionError,
    testingMic,
    voiceMicDeviceId,
    voiceNoiseSuppression,
  ]);

  const handleTtsToggle = useCallback(
    async (enabled: boolean) => {
      setActionError(null);
      setVoiceTtsEnabled(enabled);
      await persistAudioPatch({ voiceTtsEnabled: enabled });
    },
    [persistAudioPatch, setActionError],
  );

  const handleTtsVoiceChange = useCallback(
    async (voiceUri: string) => {
      setActionError(null);
      setVoiceTtsVoice(voiceUri);
      await persistAudioPatch({ voiceTtsVoice: voiceUri });
    },
    [persistAudioPatch, setActionError],
  );

  const handleTtsStyleChange = useCallback(
    async (style: VoiceTtsStyle) => {
      setActionError(null);
      setVoiceTtsStyle(style);
      await persistAudioPatch({ voiceTtsStyle: style });
    },
    [persistAudioPatch, setActionError],
  );

  const handleChimePresetChange = useCallback(
    async (preset: VoiceChimePreset) => {
      setActionError(null);
      setVoiceChimePreset(preset);
      if (preset !== 'none') {
        playReadyChime(null, preset);
      }
      await persistAudioPatch({ voiceChimePreset: preset });
    },
    [persistAudioPatch, setActionError],
  );

  const handlePreviewTts = useCallback(
    async (overrideVoice?: string) => {
      if (previewingTts && !overrideVoice) {
        previewSeqRef.current += 1;
        stopSpeaking();
        setPreviewingTts(false);
        return;
      }
      const seq = ++previewSeqRef.current;
      setPreviewingTts(true);
      const res = await speakLocalTextAsync(previewSample, {
        language: lang,
        preferredVoice: overrideVoice ?? voiceTtsVoice,
        style: voiceTtsStyle,
        onEnd: () => {
          if (isMountedRef.current && seq === previewSeqRef.current) {
            setPreviewingTts(false);
          }
        },
      });
      if (!isMountedRef.current || seq !== previewSeqRef.current) {
        if (res.spoken) stopSpeaking();
        return;
      }
      if (!res.spoken) {
        setPreviewingTts(false);
      }
    },
    [isMountedRef, lang, previewSample, previewingTts, voiceTtsStyle, voiceTtsVoice],
  );

  const handleDownloadPiperVoice = useCallback(
    async (voiceId: string) => {
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
          setActionError(operationFailedToast);
        }
      } catch {
        if (isMountedRef.current) setActionError(operationFailedToast);
      } finally {
        if (isMountedRef.current) setBusyPiperVoiceId(null);
      }
    },
    [isMountedRef, operationFailedToast, refreshPiperVoices, setActionError],
  );

  const handleCancelPiperVoice = useCallback(
    async (voiceId: string) => {
      setActionError(null);
      try {
        await api.cancelPiperVoiceDownload(voiceId);
        await refreshPiperVoices();
      } catch {
        if (isMountedRef.current) setActionError(operationFailedToast);
      }
    },
    [isMountedRef, operationFailedToast, refreshPiperVoices, setActionError],
  );

  const handleDeletePiperVoice = useCallback(
    async (voiceId: string) => {
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
        if (isMountedRef.current) setActionError(operationFailedToast);
      } finally {
        if (isMountedRef.current) setBusyPiperVoiceId(null);
      }
    },
    [isMountedRef, operationFailedToast, refreshPiperVoices, setActionError, voiceTtsVoice],
  );

  return {
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
  };
}
