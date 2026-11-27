import { Mic } from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppLockRequiredError, api } from '../api/client';
import { localizeErrorMessage } from '../i18n/core/errorLocalizer';
import { readInitialLanguage } from '../i18n/I18nContext';
import { getLanguageMeta, type LanguageCode } from '../i18n/languages';
import {
  getCachedDictionary,
  loadLocaleBundle,
  useResolvedLocaleBundle,
} from '../i18n/localeLoader';
import type {
  NotificationChannelsMap,
  VoiceAskResponse,
  VoiceChimePreset,
  VoiceSensitivityMode,
  VoiceTtsStyle,
} from '../types';
import {
  DEFAULT_NOTIFICATION_CHANNELS,
  sanitizeNotificationChannels,
  shouldDeliverNotification,
} from '../utils/notifications';
import { VoiceAudioCapture, VoiceVadController } from '../voice/audioCapture';
import { speakLocalTextAsync, stopSpeaking } from '../voice/ttsPlayer';
import { OverlayResultPanels } from './components/OverlayResultPanels';
import { type OverlayPhase, OverlayTopBar } from './components/OverlayTopBar';

export function VoiceOverlayApp() {
  const [language, setLanguage] = useState<LanguageCode>(() => readInitialLanguage().code);
  const [dictationLanguage, setDictationLanguage] = useState<string>('auto');
  const [autoStopMs, setAutoStopMs] = useState<number>(1500);
  const [ttsEnabled, setTtsEnabled] = useState<boolean>(true);
  const [ttsVoice, setTtsVoice] = useState<string>('');
  const [ttsStyle, setTtsStyle] = useState<VoiceTtsStyle>('natural');
  const [chimePreset, setChimePreset] = useState<VoiceChimePreset>('soft');
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
  const [previewTitle, setPreviewTitle] = useState<string>('');
  const [isConfirmingPreview, setIsConfirmingPreview] = useState<boolean>(false);
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
  const settingsRef = useRef({ language, dictationLanguage, ttsEnabled, ttsVoice, ttsStyle });
  settingsRef.current = { language, dictationLanguage, ttsEnabled, ttsVoice, ttsStyle };
  const notificationChannelsRef = useRef<NotificationChannelsMap>({
    ...DEFAULT_NOTIFICATION_CHANNELS,
  });
  const inputRef = useRef<HTMLInputElement>(null);
  const previewInputRef = useRef<HTMLInputElement>(null);

  const { dict: t } = useResolvedLocaleBundle(language);

  useEffect(() => {
    const meta = getLanguageMeta(language);
    document.documentElement.lang = meta.code;
    document.documentElement.dir = meta.dir;
  }, [language]);

  const activeListeningTitle = useMemo(
    () => t.overlayListeningLabel.replace(/\.+$/, '').trim(),
    [t.overlayListeningLabel],
  );

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

  const resetOverlayLocally = useCallback(() => {
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
    setPreviewTitle('');
    setIsConfirmingPreview(false);
    setIsKeyboardMode(false);
    setMissingVoicePack(false);
    setPhase('idle');
    void window.agendameaWindow?.notifyOverlayListening?.(false);
  }, [clearAutoHide]);

  const dismissOverlay = useCallback(() => {
    resetOverlayLocally();
    if (window.agendameaWindow?.hideVoiceOverlay) {
      void window.agendameaWindow.hideVoiceOverlay();
    } else {
      setIsDismissed(true);
    }
  }, [resetOverlayLocally]);

  const openKeyboardFallback = useCallback(() => {
    setIsKeyboardMode(true);
    void window.agendameaWindow?.setOverlayFocusable?.(true);
    if (focusTimerRef.current !== null) window.clearTimeout(focusTimerRef.current);
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
      if (settings.language) {
        setLanguage(settings.language);
        settingsRef.current.language = settings.language;
        void loadLocaleBundle(settings.language);
      }
      if (typeof settings.voiceDictationLanguage === 'string' && settings.voiceDictationLanguage) {
        setDictationLanguage(settings.voiceDictationLanguage);
        settingsRef.current.dictationLanguage = settings.voiceDictationLanguage;
      }
      if (typeof settings.voiceAutoStopMs === 'number') setAutoStopMs(settings.voiceAutoStopMs);
      if (typeof settings.voiceTtsEnabled === 'boolean') {
        setTtsEnabled(settings.voiceTtsEnabled);
        settingsRef.current.ttsEnabled = settings.voiceTtsEnabled;
      }
      if (settings.voiceTtsVoice !== undefined) {
        const nextVoice = settings.voiceTtsVoice || '';
        setTtsVoice(nextVoice);
        settingsRef.current.ttsVoice = nextVoice;
      }
      if (settings.voiceTtsStyle) {
        setTtsStyle(settings.voiceTtsStyle);
        settingsRef.current.ttsStyle = settings.voiceTtsStyle;
      }
      if (settings.voiceChimePreset) setChimePreset(settings.voiceChimePreset);
      if (settings.voiceMicDeviceId !== undefined) setMicDeviceId(settings.voiceMicDeviceId || '');
      if (typeof settings.voiceNoiseSuppression === 'boolean') {
        setNoiseSuppression(settings.voiceNoiseSuppression);
      }
      if (settings.voiceSensitivity) setSensitivity(settings.voiceSensitivity);
      if (settings.notificationChannels) {
        notificationChannelsRef.current = sanitizeNotificationChannels(
          settings.notificationChannels,
        );
      }
      return settings;
    } catch (err) {
      if (err instanceof AppLockRequiredError) {
        dismissOverlay();
      }
      return null;
    }
  }, [dismissOverlay]);

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
        void window.agendameaWindow?.setOverlayFocusable?.(true);
        return;
      }
      if (
        res.status === 'disambiguation' &&
        Array.isArray(res.candidates) &&
        res.candidates.length > 0
      ) {
        setPhase('disambiguate');
        clearAutoHide();
        void window.agendameaWindow?.setOverlayFocusable?.(true);
        return;
      }
      if (res.status === 'preview') {
        setPreviewTitle((res.payload?.title || res.displayText || '').trim());
        setPhase('preview');
        clearAutoHide();
        void window.agendameaWindow?.setOverlayFocusable?.(true);
        if (focusTimerRef.current !== null) window.clearTimeout(focusTimerRef.current);
        focusTimerRef.current = window.setTimeout(() => {
          focusTimerRef.current = null;
          previewInputRef.current?.focus();
        }, 40);
        return;
      }

      setPhase('result');
      const liveSettings = settingsRef.current;
      if (res.status === 'executed' && res.mutated) {
        const delivery = shouldDeliverNotification(
          notificationChannelsRef.current,
          'voiceAssistant',
        );
        if (delivery.desktop && window.agendameaWindow?.showDesktopNotification) {
          const activeDict = getCachedDictionary(liveSettings.language);
          void window.agendameaWindow
            .showDesktopNotification({
              title: activeDict.notificationsEventVoice,
              body: res.displayText || res.spokenText || res.todo?.title || '',
              todoId: res.todo?.id,
            })
            .catch(() => {
              /* ignore */
            });
        }
      }
      if (liveSettings.ttsEnabled && res.spokenText) {
        setIsSpeaking(true);
        clearAutoHide();
        void speakLocalTextAsync(res.spokenText, {
          language: liveSettings.language,
          preferredVoice: liveSettings.ttsVoice,
          style: liveSettings.ttsStyle,
          onEnd: () => {
            if (!isMountedRef.current) return;
            setIsSpeaking(false);
            scheduleAutoHide(3000);
          },
        }).then((tts) => {
          if (!isMountedRef.current) return;
          if (!tts.spoken) {
            setIsSpeaking(false);
            if (tts.reason === 'NO_LANGUAGE_VOICE') setMissingVoicePack(true);
            scheduleAutoHide(3500);
          }
        });
      } else {
        scheduleAutoHide(3000);
      }
    },
    [clearAutoHide, scheduleAutoHide],
  );

  const runUtterance = useCallback(
    async (
      text: string,
      extra?: { confirmToken?: string; selectedTodoId?: string; languageOverride?: LanguageCode },
    ) => {
      const seq = ++requestSeqRef.current;
      const activeLang = extra?.languageOverride ?? settingsRef.current.language;
      const activeDict = getCachedDictionary(activeLang);
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
        if (err instanceof AppLockRequiredError) {
          dismissOverlay();
          return;
        }
        setPhase('error');
        setErrorMessage(
          localizeErrorMessage(err, activeDict.operationFailedToast, activeLang, activeDict),
        );
        openKeyboardFallback();
      }
    },
    [clearAutoHide, dismissOverlay, handleAskResult, openKeyboardFallback],
  );

  const processRecordedPcm = useCallback(
    async (pcm: Float32Array, languageOverride?: LanguageCode) => {
      const seq = ++requestSeqRef.current;
      const activeLang = languageOverride ?? settingsRef.current.language;
      const configuredDictation = settingsRef.current.dictationLanguage;
      const sttLang =
        configuredDictation && configuredDictation !== 'auto' ? configuredDictation : activeLang;
      const activeDict = getCachedDictionary(activeLang);
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
        const stt = await api.transcribeAudio(pcm, sttLang);
        if (!isMountedRef.current || seq !== requestSeqRef.current) return;
        if (!stt.ok || !stt.text) {
          const sttErrorMap: Record<string, string> = {
            INVALID_AUDIO: activeDict.sttErrorInvalidAudio,
            TOO_SHORT: activeDict.sttErrorTooShort,
            SILENCE: activeDict.overlayNoSpeechHint,
            HALLUCINATION_FILTERED: activeDict.overlayNoSpeechHint,
            STT_MODEL_MISSING: activeDict.sttErrorModelMissing,
            STT_UNAVAILABLE: activeDict.sttErrorUnavailable,
            TRANSCRIBE_FAILED: activeDict.sttErrorFailed,
          };
          setPhase('error');
          setErrorMessage((stt.code && sttErrorMap[stt.code]) || activeDict.overlayNoSpeechHint);
          openKeyboardFallback();
          return;
        }
        setTranscript(stt.text);
        await runUtterance(stt.text, { languageOverride: activeLang });
      } catch (err) {
        if (!isMountedRef.current || seq !== requestSeqRef.current) return;
        if (err instanceof AppLockRequiredError) {
          dismissOverlay();
          return;
        }
        setPhase('error');
        setErrorMessage(
          localizeErrorMessage(err, activeDict.operationFailedToast, activeLang, activeDict),
        );
        openKeyboardFallback();
      }
    },
    [dismissOverlay, openKeyboardFallback, runUtterance],
  );

  const startListening = useCallback(
    async (overrides?: {
      autoStopMs?: number;
      language?: LanguageCode;
      deviceId?: string;
      noiseSuppression?: boolean;
      sensitivity?: VoiceSensitivityMode;
      chimePreset?: VoiceChimePreset;
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
      const effectiveDeviceId =
        overrides?.deviceId !== undefined ? overrides.deviceId : micDeviceId;
      const effectiveNoise =
        overrides?.noiseSuppression !== undefined ? overrides.noiseSuppression : noiseSuppression;
      const effectiveSensitivity = overrides?.sensitivity ?? sensitivity;
      const effectiveChime = overrides?.chimePreset ?? chimePreset;
      const activeDict =
        effectiveLanguage === language ? t : getCachedDictionary(effectiveLanguage);

      if (!captureRef.current) captureRef.current = new VoiceAudioCapture();
      let handledError = false;
      const ok = await captureRef.current.start({
        autoStopMs: effectiveAutoStop,
        deviceId: effectiveDeviceId || undefined,
        noiseSuppression: effectiveNoise,
        sensitivity: effectiveSensitivity,
        chimePreset: effectiveChime,
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
        onError: (code, message) => {
          handledError = true;
          if (!isMountedRef.current) return;
          setRmsLevel(0);
          setPhase('error');
          setErrorMessage(
            code === 'MIC_DENIED' || code === 'MIC_NOT_FOUND' || code === 'MIC_ERROR'
              ? activeDict.overlayNoSpeechHint
              : code === 'WORKLET_ERROR' || code === 'INSECURE_CONTEXT'
                ? activeDict.sttErrorUnavailable
                : message || activeDict.operationFailedToast,
          );
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
      chimePreset,
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
    if (pcm.length > 0) void processRecordedPcm(pcm);
    else setPhase('idle');
  }, [processRecordedPcm]);

  const overlayHandlersRef = useRef({
    refreshSettings,
    startListening,
    stopListeningAndProcess,
    resetOverlayLocally,
  });
  overlayHandlersRef.current = {
    refreshSettings,
    startListening,
    stopListeningAndProcess,
    resetOverlayLocally,
  };

  useEffect(() => {
    const unsub = window.agendameaWindow?.onOverlayCommand?.((payload) => {
      if (payload?.action === 'start') {
        void (async () => {
          const fresh = await overlayHandlersRef.current.refreshSettings();
          if (!isMountedRef.current) return;
          if (!fresh) {
            // If backend is locked (423) or unreachable, refuse to start microphone capture
            return;
          }
          await overlayHandlersRef.current.startListening({
            autoStopMs:
              typeof fresh?.voiceAutoStopMs === 'number' ? fresh.voiceAutoStopMs : undefined,
            language: fresh?.language,
            deviceId: fresh?.voiceMicDeviceId,
            noiseSuppression: fresh?.voiceNoiseSuppression,
            sensitivity: fresh?.voiceSensitivity,
            chimePreset: fresh?.voiceChimePreset,
          });
        })();
      } else if (payload?.action === 'stop') {
        overlayHandlersRef.current.stopListeningAndProcess();
      } else if (payload?.action === 'cancel') {
        overlayHandlersRef.current.resetOverlayLocally();
      }
    });
    window.agendameaWindow?.notifyOverlayReady?.();
    return () => {
      if (typeof unsub === 'function') unsub();
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
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

  const handleConfirmPreviewAdd = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();
      const clean = previewTitle.trim();
      if (!clean || isConfirmingPreview) return;
      const activeDict = getCachedDictionary(settingsRef.current.language);
      setIsConfirmingPreview(true);
      setErrorMessage('');
      try {
        const created = await api.createTodo(
          {
            title: clean,
            dueDate: response?.payload?.dueDate ?? null,
            dueTime: response?.payload?.dueTime ?? null,
            priority: response?.payload?.priority ?? 'normal',
            important: Boolean(response?.payload?.important),
            pinned: Boolean(response?.payload?.pinned),
            tags: response?.payload?.tags ?? [],
          },
          { source: 'overlay' },
        );
        if (!isMountedRef.current) return;
        setPreviewTitle('');
        const display = `${activeDict.aiLiveTestTaskAdded}: ${created.title}`;
        handleAskResult({
          ok: true,
          status: 'executed',
          intent: 'add_task',
          mutated: true,
          todo: created,
          spokenText: display,
          displayText: display,
        });
      } catch (err) {
        if (!isMountedRef.current) return;
        if (err instanceof AppLockRequiredError) {
          dismissOverlay();
          return;
        }
        setPhase('error');
        setErrorMessage(
          localizeErrorMessage(
            err,
            activeDict.operationFailedToast,
            settingsRef.current.language,
            activeDict,
          ),
        );
      } finally {
        if (isMountedRef.current) setIsConfirmingPreview(false);
      }
    },
    [dismissOverlay, handleAskResult, isConfirmingPreview, previewTitle, response?.payload],
  );

  if (isDismissed) {
    return (
      <div
        className="flex h-full w-full items-end justify-center p-2"
        data-testid="voice-overlay-dismissed"
      >
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
    // biome-ignore lint/a11y/noStaticElementInteractions: Auto-hide hover pause wrapper; controls exposed via inner buttons
    <div
      data-testid="voice-overlay-pill"
      data-phase={phase}
      onMouseEnter={() => {
        hoveredRef.current = true;
        clearAutoHide();
      }}
      onMouseLeave={() => {
        hoveredRef.current = false;
        if (phase === 'result' && !isSpeaking) scheduleAutoHide(2500);
      }}
      className="flex h-full w-full items-end justify-center p-2"
    >
      <div className="w-full max-w-[428px] max-h-[calc(100vh-16px)] flex flex-col overflow-hidden rounded-2xl border border-zinc-700/80 bg-zinc-950/95 px-4 py-3 text-zinc-100 shadow-2xl backdrop-blur-xl transition-all duration-200">
        <OverlayTopBar
          t={t}
          phase={phase}
          activeListeningTitle={activeListeningTitle}
          isSpeaking={isSpeaking}
          rmsLevel={rmsLevel}
          elapsedSec={elapsedSec}
          noiseSuppression={noiseSuppression}
          transcript={transcript}
          isKeyboardMode={isKeyboardMode}
          onMicClick={() =>
            phase === 'listening' || phase === 'preparing'
              ? stopListeningAndProcess()
              : void startListening()
          }
          onStopTts={() => {
            stopSpeaking();
            setIsSpeaking(false);
          }}
          onEnableKeyboardMode={enableKeyboardMode}
          onDismiss={dismissOverlay}
        />

        <OverlayResultPanels
          t={t}
          phase={phase}
          response={response}
          errorMessage={errorMessage}
          isSpeaking={isSpeaking}
          missingVoicePack={missingVoicePack}
          isKeyboardMode={isKeyboardMode}
          keyboardInput={keyboardInput}
          previewTitle={previewTitle}
          isConfirmingPreview={isConfirmingPreview}
          inputRef={inputRef}
          previewInputRef={previewInputRef}
          onChangeKeyboardInput={setKeyboardInput}
          onChangePreviewTitle={setPreviewTitle}
          onKeyboardSubmit={handleKeyboardSubmit}
          onConfirmPreviewAdd={(e) => void handleConfirmPreviewAdd(e)}
          onRetryDictation={() => void startListening()}
          onDismiss={dismissOverlay}
          onConfirmAction={(confirmToken) => void runUtterance('', { confirmToken })}
          onSelectCandidate={(selectedTodoId) => void runUtterance('', { selectedTodoId })}
        />
      </div>
    </div>
  );
}
