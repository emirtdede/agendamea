import { Check, Loader2, Mic, Plus, Send, Sparkles, Square } from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../../api/client';
import { useI18n } from '../../../i18n/I18nContext';
import type { VoiceSensitivityMode } from '../../../types';
import { VoiceAudioCapture } from '../../../voice/audioCapture';
import { InfoTooltip } from '../../InfoTooltip';

interface AiLivePlaygroundSectionProps {
  dictationReady: boolean;
  assistantReady: boolean;
  voiceMicDeviceId: string;
  voiceAutoStopMs: number;
  voiceNoiseSuppression: boolean;
  voiceSensitivity: VoiceSensitivityMode;
}

export const AiLivePlaygroundSection = React.memo(function AiLivePlaygroundSection({
  dictationReady,
  assistantReady,
  voiceMicDeviceId,
  voiceAutoStopMs,
  voiceNoiseSuppression,
  voiceSensitivity,
}: AiLivePlaygroundSectionProps) {
  const { t, lang } = useI18n();
  const [dictateStatus, setDictateStatus] = useState<
    'idle' | 'preparing' | 'listening' | 'transcribing'
  >('idle');
  const [liveLevel, setLiveLevel] = useState(0);
  const [dictatedText, setDictatedText] = useState('');
  const [dictateError, setDictateError] = useState<string | null>(null);
  const [addedAsTask, setAddedAsTask] = useState(false);

  const [aiQuestion, setAiQuestion] = useState('');
  const [aiAsking, setAiAsking] = useState(false);
  const [aiAnswer, setAiAnswer] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  const captureRef = useRef<VoiceAudioCapture | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (captureRef.current) {
        void captureRef.current.stop();
        captureRef.current = null;
      }
    };
  }, []);

  const transcribeCapturedPcm = useCallback(
    async (pcm: Float32Array) => {
      if (!mountedRef.current) return;
      if (!pcm || pcm.length < 4000) {
        setDictateStatus('idle');
        setDictateError(t.overlayNoSpeechHint);
        return;
      }
      setDictateStatus('transcribing');
      setDictateError(null);
      try {
        const res = await api.transcribeAudio(pcm, undefined, { cleanup: true });
        if (!mountedRef.current) return;
        if (res.ok && res.text?.trim()) {
          setDictatedText(res.text.trim());
          setAddedAsTask(false);
        } else if (res.code === 'STT_MODEL_MISSING') {
          setDictateError(t.sttErrorModelMissing);
        } else if (res.code === 'STT_UNAVAILABLE') {
          setDictateError(t.sttErrorUnavailable);
        } else if (res.code === 'TOO_SHORT') {
          setDictateError(t.sttErrorTooShort);
        } else if (res.code === 'INVALID_AUDIO') {
          setDictateError(t.sttErrorInvalidAudio);
        } else if (res.code === 'SILENCE' || res.code === 'HALLUCINATION_FILTERED') {
          setDictateError(t.overlayNoSpeechHint);
        } else {
          setDictateError(t.sttErrorFailed);
        }
      } catch {
        if (mountedRef.current) setDictateError(t.sttErrorFailed);
      } finally {
        if (mountedRef.current) {
          setDictateStatus('idle');
          setLiveLevel(0);
        }
      }
    },
    [
      t.overlayNoSpeechHint,
      t.sttErrorFailed,
      t.sttErrorInvalidAudio,
      t.sttErrorModelMissing,
      t.sttErrorTooShort,
      t.sttErrorUnavailable,
    ],
  );

  const handleToggleDictateTest = useCallback(async () => {
    if (dictateStatus === 'transcribing') return;
    if (dictateStatus === 'preparing') {
      const cap = captureRef.current;
      captureRef.current = null;
      cap?.stop();
      setDictateStatus('idle');
      setLiveLevel(0);
      return;
    }
    if (dictateStatus === 'listening') {
      const cap = captureRef.current;
      captureRef.current = null;
      const pcm = cap ? cap.stop() : new Float32Array(0);
      await transcribeCapturedPcm(pcm);
      return;
    }
    setDictateError(null);
    setAddedAsTask(false);
    setDictateStatus('preparing');
    try {
      const cap = new VoiceAudioCapture();
      captureRef.current = cap;
      const started = await cap.start({
        autoStopMs: voiceAutoStopMs || 1800,
        deviceId: voiceMicDeviceId || undefined,
        noiseSuppression: voiceNoiseSuppression,
        sensitivity: voiceSensitivity,
        onReady: () => {
          if (mountedRef.current) setDictateStatus('listening');
        },
        onLevel: (lvl: number) => {
          if (mountedRef.current) {
            setDictateStatus('listening');
            setLiveLevel(Math.min(1, lvl * 9));
          }
        },
        onAutoStop: (pcm: Float32Array, reason) => {
          captureRef.current = null;
          if (reason === 'no_speech') {
            if (mountedRef.current) {
              setDictateStatus('idle');
              setLiveLevel(0);
              setDictateError(t.overlayNoSpeechHint);
            }
            return;
          }
          void transcribeCapturedPcm(pcm);
        },
        onError: (code: string) => {
          captureRef.current = null;
          if (mountedRef.current) {
            setDictateStatus('idle');
            setLiveLevel(0);
            setDictateError(
              code === 'MIC_DENIED' || code === 'MIC_NOT_FOUND' || code === 'MIC_ERROR'
                ? t.overlayNoSpeechHint
                : t.sttErrorUnavailable,
            );
          }
        },
      });
      if (started && mountedRef.current) {
        setDictateStatus((prev) => (prev === 'preparing' ? 'listening' : prev));
      } else if (!started && mountedRef.current) {
        captureRef.current = null;
        setDictateStatus('idle');
      }
    } catch {
      captureRef.current = null;
      if (mountedRef.current) {
        setDictateStatus('idle');
        setDictateError(t.overlayNoSpeechHint);
      }
    }
  }, [
    dictateStatus,
    t.overlayNoSpeechHint,
    t.sttErrorUnavailable,
    transcribeCapturedPcm,
    voiceAutoStopMs,
    voiceMicDeviceId,
    voiceNoiseSuppression,
    voiceSensitivity,
  ]);

  const handleAddDictatedAsTask = useCallback(async () => {
    const clean = dictatedText.trim();
    if (!clean) return;
    try {
      await api.createTodo({ title: clean }, { source: 'playground' });
      if (mountedRef.current) setAddedAsTask(true);
    } catch {
      if (mountedRef.current) setDictateError(t.operationFailedToast);
    }
  }, [dictatedText, t.operationFailedToast]);

  const handleAskLive = useCallback(
    async (overridePrompt?: string) => {
      const q = (overridePrompt ?? aiQuestion).trim();
      if (!q || aiAsking) return;
      if (overridePrompt) setAiQuestion(overridePrompt);
      setAiAsking(true);
      setAiError(null);
      try {
        const res = await api.askAi({ text: q, language: lang, readOnly: true });
        if (!mountedRef.current) return;
        setAiAnswer(res.displayText || res.spokenText || t.cmdPaletteNoResults);
      } catch {
        if (mountedRef.current) setAiError(t.operationFailedToast);
      } finally {
        if (mountedRef.current) setAiAsking(false);
      }
    },
    [aiAsking, aiQuestion, lang, t.cmdPaletteNoResults, t.operationFailedToast],
  );

  const needsSetup = !dictationReady && !assistantReady;

  return (
    <section
      aria-label={t.aiLiveTestSectionTitle}
      data-testid="ai-live-playground"
      className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/75 p-4 sm:p-5 space-y-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
            {t.aiLiveTestSectionTitle}
          </h3>
          <InfoTooltip text={t.aiLiveTestTooltip} testId="ai-live-test-info" />
        </div>
        {needsSetup && (
          <p className="text-xs text-[var(--text-muted)]">{t.aiLiveTestSetupFirstHint}</p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 sm:gap-0 sm:divide-x sm:divide-[var(--border)]">
        {/* 1. Live Dictation Column */}
        <div data-testid="ai-live-dictation-box" className="space-y-3 sm:pe-6">
          <div className="space-y-1">
            <span className="inline-flex items-center gap-2 text-[13px] font-medium text-[var(--text-primary)]">
              <Mic className="h-3.5 w-3.5 text-[var(--text-muted)]" />
              <span>{t.aiLiveTestDictationTitle}</span>
            </span>
            {dictationReady && (
              <p className="text-xs leading-relaxed text-[var(--text-muted)]">
                {t.aiLiveTestDictationDesc}
              </p>
            )}
          </div>

          <div className="space-y-2.5">
            <button
              type="button"
              data-testid="ai-live-dictate-btn"
              disabled={!dictationReady || dictateStatus === 'transcribing'}
              onClick={() => void handleToggleDictateTest()}
              className={`inline-flex items-center gap-2 rounded-lg border px-3.5 py-2 text-xs font-medium transition-colors disabled:opacity-40 ${
                dictateStatus === 'listening'
                  ? 'border-red-500/45 text-red-500'
                  : 'border-[var(--border)] text-[var(--text-primary)] ag-hover-card-glow'
              }`}
            >
              {dictateStatus === 'transcribing' || dictateStatus === 'preparing' ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>
                    {dictateStatus === 'preparing'
                      ? t.overlayPreparingLabel
                      : t.overlayProcessingLabel}
                  </span>
                </>
              ) : dictateStatus === 'listening' ? (
                <>
                  <Square className="h-3.5 w-3.5 fill-current" />
                  <span>{t.aiLiveTestStopDictation}</span>
                </>
              ) : (
                <>
                  <Mic className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                  <span>{t.aiLiveTestStartDictation}</span>
                </>
              )}
            </button>

            {dictateStatus === 'listening' && (
              <div className="h-1 w-full overflow-hidden rounded-full bg-[var(--surface-subtle)]">
                <div
                  className="h-full rounded-full bg-[var(--text-primary)] transition-[width] duration-75"
                  style={{ width: `${Math.max(8, Math.round(liveLevel * 100))}%` }}
                />
              </div>
            )}

            {dictateError && (
              <p className="text-xs text-red-500 dark:text-red-400">{dictateError}</p>
            )}

            {dictatedText && (
              <div className="border-s-2 border-[var(--border-strong)] ps-3 space-y-2">
                <p className="text-xs leading-relaxed text-[var(--text-primary)]">{dictatedText}</p>
                <button
                  type="button"
                  onClick={() => void handleAddDictatedAsTask()}
                  disabled={addedAsTask}
                  className="inline-flex items-center gap-1 text-xs font-medium text-[var(--text-secondary)] ag-hover-glow hover:text-[var(--text-primary)] disabled:opacity-60"
                >
                  {addedAsTask ? (
                    <>
                      <Check className="h-3.5 w-3.5" />
                      <span>{t.aiLiveTestTaskAdded}</span>
                    </>
                  ) : (
                    <>
                      <Plus className="h-3.5 w-3.5" />
                      <span>{t.aiLiveTestAddAsTask}</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* 2. Live AI Assistant Column */}
        <div data-testid="ai-live-assistant-box" className="space-y-3 sm:ps-6">
          <div className="space-y-1">
            <span className="inline-flex items-center gap-2 text-[13px] font-medium text-[var(--text-primary)]">
              <Sparkles className="h-3.5 w-3.5 text-[var(--text-muted)]" />
              <span>{t.aiLiveTestAskTitle}</span>
            </span>
            {assistantReady && (
              <p className="text-xs leading-relaxed text-[var(--text-muted)]">
                {t.aiLiveTestAskDesc}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                data-testid="ai-live-ask-input"
                value={aiQuestion}
                onChange={(e) => setAiQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void handleAskLive();
                  }
                }}
                placeholder={t.aiLiveTestAskPlaceholder}
                aria-label={t.aiLiveTestAskTitle}
                className="h-8 flex-1 min-w-0 rounded-lg border border-[var(--border)] bg-transparent px-2.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--text-secondary)]"
              />
              <button
                type="button"
                data-testid="ai-live-ask-btn"
                disabled={!aiQuestion.trim() || aiAsking}
                onClick={() => void handleAskLive()}
                aria-label={t.aiLiveTestAskButton}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--text-primary)] ag-hover-card-glow disabled:opacity-35"
              >
                {aiAsking ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Send className="h-3.5 w-3.5" />
                )}
              </button>
            </div>

            {assistantReady && (
              <button
                type="button"
                onClick={() => void handleAskLive(t.docsVoiceExQueryCmd)}
                className="text-[11.5px] text-[var(--text-muted)] underline decoration-[var(--border-strong)] underline-offset-4 ag-hover-glow hover:text-[var(--text-primary)]"
              >
                {t.docsVoiceExQueryCmd}
              </button>
            )}

            {aiError && <p className="text-xs text-red-500 dark:text-red-400">{aiError}</p>}

            {aiAnswer && (
              <div
                data-testid="ai-live-ask-answer"
                className="border-s-2 border-[var(--border-strong)] ps-3 text-xs leading-relaxed text-[var(--text-primary)]"
              >
                {aiAnswer}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
});
