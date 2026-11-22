import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Keyboard,
  Loader2,
  Mic,
  Send,
  ShieldCheck,
  Square,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { api } from '../api/client';
import type { LanguageCode } from '../i18n/languages';
import { getDictionary } from '../i18n/localesWorld';
import { localizeErrorMessage } from '../i18n/translations';
import type { VoiceAskResponse, VoiceSensitivityMode } from '../types';
import { VoiceAudioCapture, VoiceVadController } from '../voice/audioCapture';
import { speakLocalText, stopSpeaking } from '../voice/ttsPlayer';

type OverlayPhase =
  | 'idle'
  | 'preparing'
  | 'listening'
  | 'processing'
  | 'result'
  | 'confirm'
  | 'disambiguate'
  | 'error';

const WAVEFORM_WEIGHTS = [0.35, 0.65, 0.9, 1.0, 0.85, 0.6, 0.35] as const;

function float32ToBase64(pcm: Float32Array): string {
  const bytes = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function formatElapsed(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

export function VoiceOverlayApp() {
  const [language, setLanguage] = useState<LanguageCode>('tr');
  const [autoStopMs, setAutoStopMs] = useState<number>(1500);
  const [ttsEnabled, setTtsEnabled] = useState<boolean>(true);
  const [ttsVoice, setTtsVoice] = useState<string>('');
  const [micDeviceId, setMicDeviceId] = useState<string>('');
  const [noiseSuppression, setNoiseSuppression] = useState<boolean>(true);
  const [sensitivity, setSensitivity] = useState<VoiceSensitivityMode>('auto');
  const [phase, setPhase] = useState<OverlayPhase>('idle');
  const [rmsLevel, setRmsLevel] = useState<number>(0);
  const [elapsedSec, setElapsedSec] = useState<number>(0);
  const [transcript, setTranscript] = useState<string>('');
  const [response, setResponse] = useState<VoiceAskResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isKeyboardMode, setIsKeyboardMode] = useState<boolean>(false);
  const [keyboardInput, setKeyboardInput] = useState<string>('');
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const [missingVoicePack, setMissingVoicePack] = useState<boolean>(false);
  const [isDismissed, setIsDismissed] = useState<boolean>(false);

  const captureRef = useRef<VoiceAudioCapture | null>(null);
  const hideTimerRef = useRef<number | null>(null);
  const focusTimerRef = useRef<number | null>(null);
  const requestSeqRef = useRef<number>(0);
  const isMountedRef = useRef<boolean>(true);
  const hoveredRef = useRef<boolean>(false);
  const keyboardModeRef = useRef<boolean>(false);
  keyboardModeRef.current = isKeyboardMode;
  const inputRef = useRef<HTMLInputElement>(null);

  const t = useMemo(() => getDictionary(language), [language]);

  // Strip trailing ellipsis on active listening pill so waveform bars never look like duplicated dots
  const activeListeningTitle = useMemo(
    () => t.overlayListeningLabel.replace(/\.+$/, '').trim(),
    [t.overlayListeningLabel],
  );

  // Live elapsed timer while listening
  useEffect(() => {
    if (phase !== 'listening') {
      setElapsedSec(0);
      return;
    }
    const startedAt = Date.now();
    const id = window.setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - startedAt) / 1000));
    }, 500);
    return () => window.clearInterval(id);
  }, [phase]);

  const clearAutoHide = useCallback(() => {
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const openKeyboardFallback = useCallback(() => {
    setIsKeyboardMode(true);
    void window.agendameaWindow?.setOverlayFocusable?.(true);
    if (focusTimerRef.current !== null) {
      window.clearTimeout(focusTimerRef.current);
    }
    focusTimerRef.current = window.setTimeout(() => {
      focusTimerRef.current = null;
      inputRef.current?.focus();
    }, 40);
  }, []);

  const scheduleAutoHide = useCallback(
    (delayMs = 3000) => {
      clearAutoHide();
      hideTimerRef.current = window.setTimeout(() => {
        hideTimerRef.current = null;
        const isInputFocused =
          typeof document !== 'undefined' &&
          inputRef.current !== null &&
          document.activeElement === inputRef.current;
        if (
          !isMountedRef.current ||
          hoveredRef.current ||
          keyboardModeRef.current ||
          isInputFocused
        ) {
          return;
        }
        stopSpeaking();
        setIsSpeaking(false);
        void window.agendameaWindow?.notifyOverlayListening?.(false);
        void window.agendameaWindow?.hideVoiceOverlay?.();
      }, delayMs);
    },
    [clearAutoHide],
  );

  // Unmount cleanup: release microphone tracks, AudioContext, TTS and pending timers
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      clearAutoHide();
      if (focusTimerRef.current !== null) {
        window.clearTimeout(focusTimerRef.current);
        focusTimerRef.current = null;
      }
      stopSpeaking();
      captureRef.current?.stop();
      void window.agendameaWindow?.notifyOverlayListening?.(false);
    };
  }, [clearAutoHide]);

  const refreshSettings = useCallback(async () => {
    try {
      const settings = await api.getSettings();
      if (!isMountedRef.current) return null;
      if (settings.language) setLanguage(settings.language);
      if (typeof settings.voiceAutoStopMs === 'number') {
        setAutoStopMs(settings.voiceAutoStopMs);
      }
      if (typeof settings.voiceTtsEnabled === 'boolean') {
        setTtsEnabled(settings.voiceTtsEnabled);
      }
      if (settings.voiceTtsVoice !== undefined) {
        setTtsVoice(settings.voiceTtsVoice || '');
      }
      if (settings.voiceMicDeviceId !== undefined) {
        setMicDeviceId(settings.voiceMicDeviceId || '');
      }
      if (typeof settings.voiceNoiseSuppression === 'boolean') {
        setNoiseSuppression(settings.voiceNoiseSuppression);
      }
      if (settings.voiceSensitivity) {
        setSensitivity(settings.voiceSensitivity);
      }
      return settings;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    void refreshSettings();
  }, [refreshSettings]);

  const handleAskResult = useCallback(
    (res: VoiceAskResponse) => {
      setResponse(res);
      setMissingVoicePack(false);

      if (res.status === 'confirmation_required') {
        setPhase('confirm');
        clearAutoHide();
        return;
      }
      if (res.status === 'disambiguation' && Array.isArray(res.candidates) && res.candidates.length > 0) {
        setPhase('disambiguate');
        clearAutoHide();
        return;
      }

      setPhase('result');
      if (ttsEnabled && res.spokenText) {
        const tts = speakLocalText(res.spokenText, {
          language,
          preferredVoice: ttsVoice,
          onEnd: () => {
            if (!isMountedRef.current) return;
            setIsSpeaking(false);
            scheduleAutoHide(3000);
          },
        });
        if (tts.spoken) {
          setIsSpeaking(true);
          clearAutoHide();
        } else {
          setIsSpeaking(false);
          if (tts.reason === 'NO_LANGUAGE_VOICE') {
            setMissingVoicePack(true);
          }
          scheduleAutoHide(3500);
        }
      } else {
        scheduleAutoHide(3000);
      }
    },
    [clearAutoHide, language, scheduleAutoHide, ttsEnabled, ttsVoice],
  );

  const runUtterance = useCallback(
    async (
      text: string,
      extra?: { confirmToken?: string; selectedTodoId?: string; languageOverride?: LanguageCode },
    ) => {
      const seq = ++requestSeqRef.current;
      const activeLang = extra?.languageOverride ?? language;
      const activeDict = activeLang === language ? t : getDictionary(activeLang);
      clearAutoHide();
      stopSpeaking();
      setIsSpeaking(false);
      setPhase('processing');
      setErrorMessage('');
      if (text) setTranscript(text);
      try {
        const res = await api.askAi({
          text,
          language: activeLang,
          confirmToken: extra?.confirmToken,
          selectedTodoId: extra?.selectedTodoId,
        });
        if (!isMountedRef.current || seq !== requestSeqRef.current) return;
        handleAskResult(res);
      } catch (err) {
        if (!isMountedRef.current || seq !== requestSeqRef.current) return;
        setPhase('error');
        setErrorMessage(
          localizeErrorMessage(err, activeDict.operationFailedToast, activeLang, activeDict),
        );
        openKeyboardFallback();
      }
    },
    [clearAutoHide, handleAskResult, language, openKeyboardFallback, t],
  );

  const processRecordedPcm = useCallback(
    async (pcm: Float32Array, languageOverride?: LanguageCode) => {
      const seq = ++requestSeqRef.current;
      const activeLang = languageOverride ?? language;
      const activeDict = activeLang === language ? t : getDictionary(activeLang);
      void window.agendameaWindow?.notifyOverlayListening?.(false);

      const check = VoiceVadController.hasEnoughSpeech(pcm);
      if (!check.ok) {
        setPhase('error');
        setErrorMessage(activeDict.overlayNoSpeechHint);
        openKeyboardFallback();
        return;
      }
      setPhase('processing');
      try {
        const stt = await api.transcribeAudio(float32ToBase64(pcm), activeLang);
        if (!isMountedRef.current || seq !== requestSeqRef.current) return;
        if (!stt.ok || !stt.text) {
          setPhase('error');
          setErrorMessage(stt.message || activeDict.overlayNoSpeechHint);
          openKeyboardFallback();
          return;
        }
        setTranscript(stt.text);
        await runUtterance(stt.text, { languageOverride: activeLang });
      } catch (err) {
        if (!isMountedRef.current || seq !== requestSeqRef.current) return;
        setPhase('error');
        setErrorMessage(
          localizeErrorMessage(err, activeDict.operationFailedToast, activeLang, activeDict),
        );
        openKeyboardFallback();
      }
    },
    [language, openKeyboardFallback, runUtterance, t],
  );

  const startListening = useCallback(
    async (overrides?: {
      autoStopMs?: number;
      language?: LanguageCode;
      deviceId?: string;
      noiseSuppression?: boolean;
      sensitivity?: VoiceSensitivityMode;
    }) => {
      clearAutoHide();
      stopSpeaking();
      setIsSpeaking(false);
      setResponse(null);
      setErrorMessage('');
      setTranscript('');
      setIsKeyboardMode(false);
      setIsDismissed(false);
      setPhase('preparing');

      const effectiveAutoStop = overrides?.autoStopMs ?? autoStopMs;
      const effectiveLanguage = overrides?.language ?? language;
      const effectiveDeviceId = overrides?.deviceId !== undefined ? overrides.deviceId : micDeviceId;
      const effectiveNoise =
        overrides?.noiseSuppression !== undefined ? overrides.noiseSuppression : noiseSuppression;
      const effectiveSensitivity = overrides?.sensitivity ?? sensitivity;
      const activeDict = effectiveLanguage === language ? t : getDictionary(effectiveLanguage);

      if (!captureRef.current) {
        captureRef.current = new VoiceAudioCapture();
      }
      let handledError = false;
      const ok = await captureRef.current.start({
        autoStopMs: effectiveAutoStop,
        deviceId: effectiveDeviceId || undefined,
        noiseSuppression: effectiveNoise,
        sensitivity: effectiveSensitivity,
        onReady: () => {
          if (!isMountedRef.current) return;
          setPhase('listening');
          void window.agendameaWindow?.notifyOverlayListening?.(true);
        },
        onLevel: (rms) => {
          if (isMountedRef.current) setRmsLevel(Math.min(1, rms * 10));
        },
        onAutoStop: (pcm, reason) => {
          if (!isMountedRef.current) return;
          setRmsLevel(0);
          if (reason === 'no_speech') {
            void window.agendameaWindow?.notifyOverlayListening?.(false);
            setPhase('error');
            setErrorMessage(activeDict.overlayNoSpeechHint);
            openKeyboardFallback();
            return;
          }
          void processRecordedPcm(pcm, effectiveLanguage);
        },
        onError: (_code, message) => {
          handledError = true;
          if (!isMountedRef.current) return;
          setRmsLevel(0);
          setPhase('error');
          setErrorMessage(message);
          void window.agendameaWindow?.notifyOverlayListening?.(false);
          openKeyboardFallback();
        },
      });
      if (!ok && !handledError && isMountedRef.current) {
        setPhase('error');
        void window.agendameaWindow?.notifyOverlayListening?.(false);
        openKeyboardFallback();
      }
    },
    [
      autoStopMs,
      clearAutoHide,
      language,
      micDeviceId,
      noiseSuppression,
      openKeyboardFallback,
      processRecordedPcm,
      sensitivity,
      t,
    ],
  );

  const stopListeningAndProcess = useCallback(() => {
    void window.agendameaWindow?.notifyOverlayListening?.(false);
    if (!captureRef.current) return;
    const pcm = captureRef.current.stop();
    setRmsLevel(0);
    if (pcm.length > 0) {
      void processRecordedPcm(pcm);
    } else {
      setPhase('idle');
    }
  }, [processRecordedPcm]);

  const dismissOverlay = useCallback(() => {
    requestSeqRef.current += 1;
    clearAutoHide();
    stopSpeaking();
    setIsSpeaking(false);
    captureRef.current?.stop();
    setRmsLevel(0);
    setResponse(null);
    setTranscript('');
    setErrorMessage('');
    setKeyboardInput('');
    setIsKeyboardMode(false);
    setMissingVoicePack(false);
    setPhase('idle');
    void window.agendameaWindow?.notifyOverlayListening?.(false);
    if (window.agendameaWindow?.hideVoiceOverlay) {
      void window.agendameaWindow.hideVoiceOverlay();
    } else {
      setIsDismissed(true);
    }
  }, [clearAutoHide]);

  // Listen to Electron global shortcut toggle IPC ('start' | 'stop')
  useEffect(() => {
    const unsub = window.agendameaWindow?.onOverlayCommand?.((payload) => {
      if (payload?.action === 'start') {
        void (async () => {
          const fresh = await refreshSettings();
          if (!isMountedRef.current) return;
          await startListening({
            autoStopMs: typeof fresh?.voiceAutoStopMs === 'number' ? fresh.voiceAutoStopMs : undefined,
            language: fresh?.language,
            deviceId: fresh?.voiceMicDeviceId,
            noiseSuppression: fresh?.voiceNoiseSuppression,
            sensitivity: fresh?.voiceSensitivity,
          });
        })();
      } else if (payload?.action === 'stop') {
        stopListeningAndProcess();
      }
    });
    return () => {
      if (typeof unsub === 'function') unsub();
    };
  }, [refreshSettings, startListening, stopListeningAndProcess]);

  // Escape stops speech immediately (< 100 ms) and hides overlay
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
        stopSpeaking();
        setIsSpeaking(false);
        dismissOverlay();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [dismissOverlay]);

  const enableKeyboardMode = useCallback(() => {
    clearAutoHide();
    captureRef.current?.stop();
    void window.agendameaWindow?.notifyOverlayListening?.(false);
    openKeyboardFallback();
  }, [clearAutoHide, openKeyboardFallback]);

  const handleKeyboardSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = keyboardInput.trim();
    if (!clean) return;
    setKeyboardInput('');
    setIsKeyboardMode(false);
    void runUtterance(clean);
  };

  if (isDismissed) {
    return (
      <div className="flex h-full w-full items-end justify-center p-2" data-testid="voice-overlay-dismissed">
        <button
          type="button"
          data-testid="overlay-reopen-btn"
          onClick={() => setIsDismissed(false)}
          aria-label={t.settingsTabAi}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-zinc-700/80 bg-zinc-950/90 text-zinc-200 shadow-lg hover:bg-zinc-800"
        >
          <Mic className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div
      data-testid="voice-overlay-pill"
      data-phase={phase}
      onMouseEnter={() => {
        hoveredRef.current = true;
        clearAutoHide();
      }}
      onMouseLeave={() => {
        hoveredRef.current = false;
        if (phase === 'result' && !isSpeaking) {
          scheduleAutoHide(2500);
        }
      }}
      className="flex h-full w-full items-end justify-center p-2"
    >
      <div className="w-full max-w-[428px] rounded-2xl border border-zinc-700/80 bg-zinc-950/95 px-4 py-3 text-zinc-100 shadow-2xl backdrop-blur-xl transition-all duration-200">
        {/* Top Control Row */}
        <div className="flex items-center justify-between gap-2.5">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              data-testid="overlay-mic-btn"
              onClick={() =>
                phase === 'listening' || phase === 'preparing'
                  ? stopListeningAndProcess()
                  : void startListening()
              }
              aria-label={t.overlayListeningLabel}
              className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-all ${
                phase === 'listening'
                  ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/35 ring-4 ring-rose-500/20'
                  : phase === 'preparing' || phase === 'processing'
                    ? 'bg-amber-500/20 text-amber-300'
                    : 'bg-zinc-800 text-zinc-100 hover:bg-zinc-700'
              }`}
            >
              {phase === 'processing' || phase === 'preparing' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : phase === 'listening' ? (
                <Square className="h-3.5 w-3.5 fill-current" />
              ) : (
                <Mic className="h-4 w-4" />
              )}
            </button>

            <div className="min-w-0">
              <div className="flex items-center gap-2.5">
                <span
                  data-testid="overlay-status-label"
                  className="text-xs font-semibold tracking-tight text-zinc-100 whitespace-nowrap"
                >
                  {phase === 'preparing'
                    ? t.overlayPreparingLabel
                    : phase === 'listening'
                      ? activeListeningTitle
                      : phase === 'processing'
                        ? t.overlayProcessingLabel
                        : isSpeaking
                          ? t.overlaySpeakingLabel
                          : t.settingsTabAi}
                </span>

                {phase === 'listening' && (
                  <>
                    <div
                      data-testid="overlay-waveform"
                      className="flex h-4 items-center gap-[3px]"
                      aria-hidden="true"
                    >
                      {WAVEFORM_WEIGHTS.map((weight, idx) => {
                        const pct = Math.max(
                          28,
                          Math.min(100, Math.round((0.24 + rmsLevel * weight * 0.95) * 100)),
                        );
                        return (
                          <span
                            key={idx}
                            className="w-[3px] rounded-full bg-rose-400 transition-all duration-75"
                            style={{ height: `${pct}%` }}
                          />
                        );
                      })}
                    </div>
                    <span
                      data-testid="overlay-elapsed"
                      className="font-mono-tabular text-[11px] font-medium text-zinc-400"
                    >
                      {formatElapsed(elapsedSec)}
                    </span>
                    {noiseSuppression && (
                      <span
                        title={t.aiVoiceNoiseSuppressionLabel}
                        className="inline-flex items-center text-emerald-400/90"
                      >
                        <ShieldCheck className="h-3 w-3" />
                      </span>
                    )}
                  </>
                )}
              </div>

              {transcript && (
                <p className="truncate text-[11px] text-zinc-400" data-testid="overlay-transcript">
                  {transcript}
                </p>
              )}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            {isSpeaking && (
              <button
                type="button"
                data-testid="overlay-stop-tts-btn"
                onClick={() => {
                  stopSpeaking();
                  setIsSpeaking(false);
                }}
                title={t.overlayStopButton}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-300 hover:bg-zinc-800 hover:text-white"
              >
                <VolumeX className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              type="button"
              data-testid="overlay-keyboard-toggle-btn"
              onClick={enableKeyboardMode}
              title={t.overlayKeyboardPlaceholder}
              className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${
                isKeyboardMode
                  ? 'bg-zinc-800 text-white'
                  : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'
              }`}
            >
              <Keyboard className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              data-testid="overlay-close-btn"
              onClick={dismissOverlay}
              aria-label={t.windowClose}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-800 hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Result Card */}
        {phase === 'result' && response && (
          <div
            data-testid="overlay-result-card"
            className="mt-2.5 rounded-xl border border-zinc-800 bg-zinc-900/90 px-3 py-2 text-xs leading-relaxed text-zinc-200 max-h-[84px] overflow-y-auto"
          >
            <div className="flex items-start gap-2">
              {isSpeaking ? (
                <Volume2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
              ) : (
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
              )}
              <div className="min-w-0 flex-1 space-y-1">
                <p data-testid="overlay-result-text">{response.displayText}</p>
                {missingVoicePack && (
                  <button
                    type="button"
                    data-testid="overlay-speech-settings-link"
                    onClick={() => void window.agendameaWindow?.openWindowsSpeechSettings?.()}
                    className="text-[11px] font-medium text-sky-400 underline hover:text-sky-300"
                  >
                    {t.overlaySpeechPackHint}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Destructive Action Confirmation Lock (R-14) */}
        {phase === 'confirm' && response?.confirmationToken && (
          <div
            data-testid="overlay-confirm-panel"
            className="mt-2.5 flex items-center justify-between gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2"
          >
            <div className="flex min-w-0 items-center gap-2 text-xs text-amber-200">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
              <span className="truncate">{response.displayText}</span>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                data-testid="overlay-confirm-yes-btn"
                onClick={() =>
                  void runUtterance('', { confirmToken: response.confirmationToken })
                }
                className="rounded-lg bg-rose-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-rose-500"
              >
                {t.overlayConfirmButton}
              </button>
              <button
                type="button"
                data-testid="overlay-confirm-no-btn"
                onClick={dismissOverlay}
                className="rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-[11px] font-medium text-zinc-300 hover:bg-zinc-800"
              >
                {t.overlayCancelButton}
              </button>
            </div>
          </div>
        )}

        {/* Multi-Match Disambiguation Chips (R-15) */}
        {phase === 'disambiguate' && response?.candidates && (
          <div data-testid="overlay-disambiguate-panel" className="mt-2.5 space-y-1.5">
            <p className="text-[11px] text-zinc-400">{response.displayText}</p>
            <div className="flex flex-wrap gap-1.5">
              {response.candidates.map((cand) => (
                <button
                  key={cand.todoId}
                  type="button"
                  data-testid={`overlay-candidate-${cand.index}`}
                  onClick={() => void runUtterance('', { selectedTodoId: cand.todoId })}
                  className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-xs font-medium text-zinc-100 hover:border-zinc-500 hover:bg-zinc-800"
                >
                  <span className="font-mono text-[10px] text-emerald-400">{cand.index}</span>
                  <span className="truncate">{cand.title}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Error Message */}
        {phase === 'error' && errorMessage && (
          <p data-testid="overlay-error-text" className="mt-2 text-[11px] text-amber-300">
            {errorMessage}
          </p>
        )}

        {/* Keyboard Text Command Fallback Input */}
        {(isKeyboardMode || phase === 'idle' || phase === 'error') && (
          <form onSubmit={handleKeyboardSubmit} className="mt-2.5 flex items-center gap-1.5">
            <input
              ref={inputRef}
              type="text"
              data-testid="overlay-text-input"
              value={keyboardInput}
              onChange={(e) => setKeyboardInput(e.target.value)}
              placeholder={t.overlayKeyboardPlaceholder}
              className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-500 focus:border-zinc-500 focus:outline-none"
            />
            <button
              type="submit"
              data-testid="overlay-text-submit-btn"
              disabled={!keyboardInput.trim()}
              className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-zinc-100 px-2.5 py-1.5 text-xs font-semibold text-zinc-950 hover:bg-white disabled:opacity-40"
            >
              <Send className="h-3 w-3" />
              <span>{t.overlaySendButton}</span>
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
