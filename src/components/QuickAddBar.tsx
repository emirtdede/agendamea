import {
  Calendar,
  CalendarRange,
  Check,
  ChevronDown,
  Clock,
  Flag,
  Folder,
  Loader2,
  Mic,
  Plus,
  Square,
  X,
} from 'lucide-react';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api/client';
import { useI18n } from '../i18n/I18nContext';
import { usePreferencesSelector } from '../store/preferencesStore';
import type { Category, Priority } from '../types';
import { createClientId } from '../utils/id';
import {
  addDaysToDateString,
  formatTodoDateSchedule,
  normalizeDateRange,
} from '../utils/todoLogic';
import { VoiceAudioCapture } from '../voice/audioCapture';
import { ColorDot } from './ColorDot';

interface QuickAddBarProps {
  inputRef: React.RefObject<HTMLInputElement | null>;
  categories: Category[];
  todayStr: string;
  defaultCategoryId: string | null;
  defaultImportant: boolean;
  defaultDueDate: string | null;
  onAdd: (payload: {
    id?: string;
    title: string;
    priority: Priority;
    startDate?: string | null;
    dueDate: string | null;
    dueTime?: string | null;
    categoryId: string | null;
    important: boolean;
  }) => Promise<unknown>;
  onOpenAiSetup?: () => void;
  onNotifyInfo?: (message: string, variant?: 'info' | 'error') => void;
}

const PRIORITY_CYCLE: Priority[] = ['normal', 'high', 'low'];

export const QuickAddBar = React.memo(function QuickAddBar({
  inputRef,
  categories,
  todayStr,
  defaultCategoryId,
  defaultImportant,
  defaultDueDate,
  onAdd,
  onOpenAiSetup,
  onNotifyInfo,
}: QuickAddBarProps) {
  const { t, meta } = useI18n();
  const defaultPriority = usePreferencesSelector((s) => s.defaultPriority, Object.is);
  const timeFormat = usePreferencesSelector((s) => s.timeFormat, Object.is);
  const [title, setTitle] = useState('');
  const [dictationState, setDictationState] = useState<
    'idle' | 'preparing' | 'listening' | 'transcribing'
  >('idle');
  const [liveAudioLevel, setLiveAudioLevel] = useState(0);
  const [dictationReviewActive, setDictationReviewActive] = useState(false);
  const [dictationCountdown, setDictationCountdown] = useState<number | null>(null);
  const [importantOverride, setImportantOverride] = useState<boolean | undefined>(undefined);
  const voiceCaptureRef = useRef<VoiceAudioCapture | null>(null);
  const submitCurrentTaskRef = useRef<(() => Promise<void>) | null>(null);
  const [priority, setPriority] = useState<Priority>(defaultPriority);

  useEffect(() => {
    setPriority(defaultPriority);
  }, [defaultPriority]);
  const [startDate, setStartDate] = useState<string | null>(null);
  const [dueDateOverride, setDueDateOverride] = useState<string | null | undefined>(undefined);
  const [dueTime, setDueTime] = useState<string | null>(null);
  const [categoryOverride, setCategoryOverride] = useState<string | null | undefined>(undefined);
  const [isCatMenuOpen, setIsCatMenuOpen] = useState(false);
  const [isDatePopoverOpen, setIsDatePopoverOpen] = useState(false);
  const [dateAlignEnd, setDateAlignEnd] = useState(false);
  const [catAlignEnd, setCatAlignEnd] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const catMenuRef = useRef<HTMLDivElement>(null);
  const datePopoverRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!isDatePopoverOpen || !datePopoverRef.current) return;
    const rect = datePopoverRef.current.getBoundingClientRect();
    const isRtl = document.documentElement.dir === 'rtl';
    const overflows = isRtl ? rect.right - 264 < 12 : rect.left + 264 > window.innerWidth - 12;
    setDateAlignEnd(overflows);
  }, [isDatePopoverOpen]);

  useLayoutEffect(() => {
    if (!isCatMenuOpen || !catMenuRef.current) return;
    const rect = catMenuRef.current.getBoundingClientRect();
    const isRtl = document.documentElement.dir === 'rtl';
    const overflows = isRtl ? rect.right - 260 < 12 : rect.left + 260 > window.innerWidth - 12;
    setCatAlignEnd(overflows);
  }, [isCatMenuOpen]);
  const isSubmittingRef = useRef(false);
  const pendingTodoIdRef = useRef<string | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (voiceCaptureRef.current) {
        void voiceCaptureRef.current.stop();
        voiceCaptureRef.current = null;
      }
    };
  }, []);

  const finishQuickDictation = useCallback(
    async (pcm: Float32Array) => {
      if (!isMountedRef.current) return;
      setLiveAudioLevel(0);
      if (!pcm || pcm.length < 4000) {
        setDictationState('idle');
        onNotifyInfo?.(t.overlayNoSpeechHint, 'info');
        return;
      }
      setDictationState('transcribing');
      try {
        const res = await api.transcribeAudio(pcm, undefined, { cleanup: true });
        if (!isMountedRef.current) return;
        if (res.ok && res.text?.trim()) {
          const parsed = res.parsed;
          const spoken = (parsed?.title || res.text).trim();
          setTitle((prev) => (prev.trim() ? `${prev.trim()} ${spoken}` : spoken));
          if (parsed?.dueDate) setDueDateOverride(parsed.dueDate);
          if (parsed?.dueTime) setDueTime(parsed.dueTime);
          if (parsed?.priority && parsed.priority !== 'normal') setPriority(parsed.priority);
          if (parsed?.important) setImportantOverride(true);
          if (parsed?.category) {
            const wanted = parsed.category.trim().toLocaleLowerCase('tr-TR');
            const matchedCat = categories.find(
              (c) => c.name.trim().toLocaleLowerCase('tr-TR') === wanted,
            );
            if (matchedCat) setCategoryOverride(matchedCat.id);
          }
          setDictationReviewActive(true);
          setDictationCountdown(3);
          inputRef.current?.focus();
        } else if (res.code === 'STT_MODEL_MISSING') {
          onNotifyInfo?.(t.aiQuickSetupNeededToast, 'error');
          onOpenAiSetup?.();
        } else if (res.code === 'STT_UNAVAILABLE') {
          onNotifyInfo?.(t.sttErrorUnavailable, 'error');
        } else if (res.code === 'TOO_SHORT') {
          onNotifyInfo?.(t.sttErrorTooShort, 'info');
        } else if (res.code === 'INVALID_AUDIO') {
          onNotifyInfo?.(t.sttErrorInvalidAudio, 'error');
        } else if (res.code === 'SILENCE' || res.code === 'HALLUCINATION_FILTERED') {
          onNotifyInfo?.(t.overlayNoSpeechHint, 'info');
        } else {
          onNotifyInfo?.(t.sttErrorFailed, 'error');
        }
      } catch {
        if (isMountedRef.current) onNotifyInfo?.(t.sttErrorFailed, 'error');
      } finally {
        if (isMountedRef.current) setDictationState('idle');
      }
    },
    [categories, inputRef, onNotifyInfo, onOpenAiSetup, t],
  );

  const handleToggleQuickDictation = useCallback(async () => {
    if (dictationState === 'transcribing') return;
    if (dictationState === 'preparing') {
      const cap = voiceCaptureRef.current;
      voiceCaptureRef.current = null;
      cap?.stop();
      setLiveAudioLevel(0);
      setDictationState('idle');
      return;
    }
    if (dictationState === 'listening') {
      const cap = voiceCaptureRef.current;
      voiceCaptureRef.current = null;
      const pcm = cap ? cap.stop() : new Float32Array(0);
      await finishQuickDictation(pcm);
      return;
    }
    setDictationReviewActive(false);
    setDictationCountdown(null);
    setDictationState('preparing');
    try {
      const status = await api.getAiStatus(false);
      if (!isMountedRef.current) return;
      const hasStt = Boolean(
        status.readiness?.dictationReady ??
          status.models.some((m) => m.role === 'stt' && m.present),
      );
      if (!hasStt) {
        setDictationState('idle');
        onNotifyInfo?.(t.aiQuickSetupNeededToast, 'error');
        onOpenAiSetup?.();
        return;
      }
      setLiveAudioLevel(0);
      const capture = new VoiceAudioCapture();
      voiceCaptureRef.current = capture;
      const started = await capture.start({
        autoStopMs: status.settings.voiceAutoStopMs || 1800,
        deviceId: status.settings.voiceMicDeviceId || undefined,
        noiseSuppression: status.settings.voiceNoiseSuppression !== false,
        sensitivity: status.settings.voiceSensitivity || 'auto',
        chimePreset: status.settings.voiceChimePreset || 'soft',
        onReady: () => {
          if (isMountedRef.current) setDictationState('listening');
        },
        onLevel: (lvl: number) => {
          if (isMountedRef.current) {
            setDictationState('listening');
            setLiveAudioLevel(Math.min(1, lvl * 9));
          }
        },
        onAutoStop: (pcm: Float32Array, reason) => {
          voiceCaptureRef.current = null;
          setLiveAudioLevel(0);
          if (reason === 'no_speech') {
            if (isMountedRef.current) {
              setDictationState('idle');
              onNotifyInfo?.(t.overlayNoSpeechHint, 'info');
            }
            return;
          }
          void finishQuickDictation(pcm);
        },
        onError: (code: string) => {
          voiceCaptureRef.current = null;
          if (isMountedRef.current) {
            setLiveAudioLevel(0);
            setDictationState('idle');
            onNotifyInfo?.(
              code === 'MIC_DENIED' || code === 'MIC_NOT_FOUND' || code === 'MIC_ERROR'
                ? t.overlayNoSpeechHint
                : t.sttErrorUnavailable,
              'error',
            );
          }
        },
      });
      if (started && isMountedRef.current) {
        setDictationState((prev) => (prev === 'preparing' ? 'listening' : prev));
      } else if (!started && isMountedRef.current) {
        voiceCaptureRef.current = null;
        setLiveAudioLevel(0);
        setDictationState('idle');
      }
    } catch {
      voiceCaptureRef.current = null;
      if (isMountedRef.current) {
        setLiveAudioLevel(0);
        setDictationState('idle');
        onNotifyInfo?.(t.overlayNoSpeechHint, 'error');
      }
    }
  }, [dictationState, finishQuickDictation, onNotifyInfo, onOpenAiSetup, t]);

  // Hands-free auto-add countdown after dictation finishes (paused immediately if user edits)
  useEffect(() => {
    if (!dictationReviewActive || dictationCountdown === null) return;
    if (dictationCountdown <= 0) {
      setDictationCountdown(null);
      void submitCurrentTaskRef.current?.();
      return;
    }
    const timer = window.setTimeout(() => {
      if (isMountedRef.current) {
        setDictationCountdown((prev) => (prev !== null ? prev - 1 : null));
      }
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [dictationCountdown, dictationReviewActive]);

  // Reset manual overrides when switching views so defaults match the newly opened list
  useEffect(() => {
    void defaultCategoryId;
    setCategoryOverride(undefined);
  }, [defaultCategoryId]);

  useEffect(() => {
    void defaultDueDate;
    setDueDateOverride(undefined);
    setStartDate(null);
    setDueTime(null);
  }, [defaultDueDate]);

  const effectiveCategoryId = categoryOverride !== undefined ? categoryOverride : defaultCategoryId;
  const effectiveDueDate = dueDateOverride !== undefined ? dueDateOverride : defaultDueDate;

  const selectedCategory = useMemo(
    () => categories.find((c) => c.id === effectiveCategoryId) ?? null,
    [categories, effectiveCategoryId],
  );

  useEffect(() => {
    if (!isCatMenuOpen && !isDatePopoverOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (isCatMenuOpen && catMenuRef.current && !catMenuRef.current.contains(e.target as Node)) {
        setIsCatMenuOpen(false);
      }
      if (
        isDatePopoverOpen &&
        datePopoverRef.current &&
        !datePopoverRef.current.contains(e.target as Node)
      ) {
        setIsDatePopoverOpen(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setIsCatMenuOpen(false);
        setIsDatePopoverOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [isCatMenuOpen, isDatePopoverOpen]);

  const submitCurrentTask = useCallback(async () => {
    if (isSubmittingRef.current) return;

    const trimmed = title.trim();
    if (!trimmed) return;

    const wasDictated = dictationReviewActive;
    setDictationReviewActive(false);
    setDictationCountdown(null);
    isSubmittingRef.current = true;
    setIsSubmitting(true);
    const id = pendingTodoIdRef.current ?? createClientId('todo');
    pendingTodoIdRef.current = id;

    const normalizedDates = normalizeDateRange(startDate, effectiveDueDate);

    try {
      await onAdd({
        id,
        title: trimmed,
        priority,
        startDate: normalizedDates.startDate,
        dueDate: normalizedDates.dueDate,
        dueTime,
        categoryId: effectiveCategoryId,
        important: importantOverride ?? defaultImportant,
      });
      if (!isMountedRef.current) return;
      setTitle('');
      setPriority(defaultPriority);
      setStartDate(null);
      setDueDateOverride(undefined);
      setDueTime(null);
      setCategoryOverride(undefined);
      setImportantOverride(undefined);
      setIsDatePopoverOpen(false);
      pendingTodoIdRef.current = null;
      if (wasDictated) {
        onNotifyInfo?.(`${t.aiLiveTestTaskAdded}: ${trimmed}`, 'info');
      }
    } catch {
      // Keep title and pendingTodoIdRef for safe idempotent retry
    } finally {
      isSubmittingRef.current = false;
      if (isMountedRef.current) {
        setIsSubmitting(false);
      }
    }
  }, [
    defaultImportant,
    defaultPriority,
    dictationReviewActive,
    dueTime,
    effectiveCategoryId,
    effectiveDueDate,
    importantOverride,
    onAdd,
    onNotifyInfo,
    priority,
    startDate,
    t.aiLiveTestTaskAdded,
    title,
  ]);

  submitCurrentTaskRef.current = submitCurrentTask;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitCurrentTask();
  };

  const handleCancelDictatedDraft = () => {
    setDictationReviewActive(false);
    setDictationCountdown(null);
    setTitle('');
    setDueDateOverride(undefined);
    setDueTime(null);
    setImportantOverride(undefined);
    setPriority(defaultPriority);
    setCategoryOverride(undefined);
  };

  const handleRetryDictatedDraft = () => {
    handleCancelDictatedDraft();
    void handleToggleQuickDictation();
  };

  const cyclePriority = () => {
    const idx = PRIORITY_CYCLE.indexOf(priority);
    const nextPriority = PRIORITY_CYCLE[(idx + 1) % PRIORITY_CYCLE.length];
    if (nextPriority) setPriority(nextPriority);
  };

  const tomorrowStr = useMemo(() => addDaysToDateString(todayStr, 1), [todayStr]);

  const cycleQuickDate = () => {
    if (!effectiveDueDate && !startDate) {
      setDueDateOverride(todayStr);
    } else if (effectiveDueDate === todayStr && !startDate) {
      setDueDateOverride(tomorrowStr);
    } else {
      setStartDate(null);
      setDueDateOverride(null);
    }
  };

  const scheduleInfo = useMemo(
    () =>
      formatTodoDateSchedule(
        startDate,
        effectiveDueDate,
        todayStr,
        meta.intlLocale,
        {
          today: t.today,
          tomorrow: t.tomorrow,
          yesterday: t.yesterday,
        },
        dueTime,
        timeFormat,
      ),
    [
      startDate,
      effectiveDueDate,
      dueTime,
      timeFormat,
      todayStr,
      meta.intlLocale,
      t.today,
      t.tomorrow,
      t.yesterday,
    ],
  );

  const dateLabel = scheduleInfo ? scheduleInfo.label : t.dateButton;
  const hasAnyDate = Boolean(startDate || effectiveDueDate);

  const priorityText =
    priority === 'high' ? t.priorityHigh : priority === 'low' ? t.priorityLow : t.priorityNormal;

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-[var(--border)] bg-[var(--surface)] transition-colors duration-150 focus-within:border-[var(--border-strong)]"
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <Plus className="h-5 w-5 shrink-0 text-[var(--accent)]" aria-hidden="true" />
        <input
          ref={inputRef}
          type="text"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            if (dictationCountdown !== null) setDictationCountdown(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && dictationReviewActive) {
              e.preventDefault();
              handleCancelDictatedDraft();
            }
          }}
          maxLength={300}
          placeholder={
            dictationState === 'preparing'
              ? t.overlayPreparingLabel
              : dictationState === 'listening'
                ? t.overlayListeningLabel
                : dictationState === 'transcribing'
                  ? t.overlayProcessingLabel
                  : t.addTaskPlaceholder
          }
          aria-label={t.addTaskPlaceholder}
          className="flex-1 min-w-0 bg-transparent text-[15px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
        />
        <button
          type="button"
          data-testid="quick-add-mic-btn"
          onClick={() => void handleToggleQuickDictation()}
          disabled={dictationState === 'transcribing'}
          aria-pressed={dictationState === 'listening' || dictationState === 'preparing'}
          aria-label={
            dictationState === 'listening' ? t.aiLiveTestStopDictation : t.cmdPaletteActionDictate
          }
          title={
            dictationState === 'listening' ? t.aiLiveTestStopDictation : t.cmdPaletteActionDictate
          }
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors ${
            dictationState === 'listening'
              ? 'text-red-500 ag-hover-danger-glow animate-pulse'
              : 'text-[var(--text-muted)] ag-hover-glow'
          }`}
        >
          {dictationState === 'transcribing' || dictationState === 'preparing' ? (
            <Loader2 className="h-4 w-4 animate-spin text-[var(--accent)]" />
          ) : dictationState === 'listening' ? (
            <Square className="h-3.5 w-3.5 fill-current" />
          ) : (
            <Mic className="h-4 w-4" />
          )}
        </button>
        <button
          type="submit"
          disabled={!title.trim() || isSubmitting}
          className="rounded-lg px-4 py-1.5 text-sm font-medium ag-hover-accent-glow disabled:opacity-35 whitespace-nowrap shrink-0"
          style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-fg)' }}
        >
          {t.addButton}
        </button>
      </div>

      {dictationState === 'listening' && (
        <div
          data-testid="quick-add-live-level"
          className="h-[2px] w-full overflow-hidden bg-[var(--surface-subtle)]"
        >
          <div
            className="h-full bg-red-500 transition-[width] duration-75"
            style={{ width: `${Math.max(8, Math.round(liveAudioLevel * 100))}%` }}
          />
        </div>
      )}

      {dictationReviewActive && title.trim() && (
        <div
          data-testid="quick-add-dictation-confirm-bar"
          className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border)] px-4 py-2 text-xs animate-fade-in"
        >
          <div className="flex items-center gap-2 text-[var(--text-secondary)]">
            <Mic className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />
            <span>{t.aiLiveTestAddAsTask}</span>
            {dictationCountdown !== null && (
              <span
                data-testid="quick-add-dictation-countdown"
                className="font-mono-tabular text-[11px] text-[var(--text-muted)]"
              >
                · {dictationCountdown}s
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              data-testid="quick-add-dictation-retry-btn"
              onClick={handleRetryDictatedDraft}
              className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-[var(--text-muted)] ag-hover-glow hover:text-[var(--text-primary)]"
            >
              <Mic className="h-3 w-3" />
              <span>{t.overlayTryAgainLabel}</span>
            </button>
            <button
              type="button"
              data-testid="quick-add-dictation-cancel-btn"
              onClick={handleCancelDictatedDraft}
              className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-[var(--text-muted)] ag-hover-glow hover:text-[var(--text-primary)]"
            >
              <X className="h-3 w-3" />
              <span>{t.overlayCancelButton}</span>
            </button>
            <button
              type="button"
              data-testid="quick-add-dictation-confirm-btn"
              disabled={isSubmitting}
              onClick={() => void submitCurrentTask()}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-semibold ag-hover-accent-glow disabled:opacity-40"
              style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-fg)' }}
            >
              <Check className="h-3.5 w-3.5" />
              <span>{t.overlayConfirmButton}</span>
            </button>
          </div>
        </div>
      )}

      {/* Subtle compact quick options bar */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-[var(--border)] bg-[var(--surface-subtle)]/60 px-4 py-2 text-xs rounded-b-xl">
        {/* Quick Date Cycle + Optional Start/End Date Popover */}
        <div ref={datePopoverRef} className="relative inline-flex items-center gap-1">
          <button
            type="button"
            onClick={cycleQuickDate}
            aria-label={`${t.dateButton}: ${dateLabel}`}
            className={`inline-flex items-center gap-1.5 py-0.5 font-medium transition-colors whitespace-nowrap ${
              hasAnyDate
                ? 'text-[var(--accent)]'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Calendar className="h-3.5 w-3.5 shrink-0" />
            <span>{dateLabel}</span>
          </button>

          <button
            type="button"
            onClick={() => setIsDatePopoverOpen((prev) => !prev)}
            aria-expanded={isDatePopoverOpen}
            aria-label={`${t.startDateLabel} - ${t.dueDateLabel}`}
            title={`${t.startDateLabel} / ${t.dueDateLabel}`}
            className={`inline-flex h-5 w-5 items-center justify-center rounded transition-colors ${
              isDatePopoverOpen || (startDate && effectiveDueDate)
                ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
                : 'text-[var(--text-muted)] ag-hover-glow hover:text-[var(--text-primary)]'
            }`}
          >
            <CalendarRange className="h-3.5 w-3.5" />
          </button>

          {isDatePopoverOpen && (
            <div
              role="dialog"
              aria-label={`${t.startDateLabel} - ${t.dueDateLabel}`}
              className={`animate-context-menu absolute ${dateAlignEnd ? 'end-0' : 'start-0'} top-7 z-30 w-64 max-w-[calc(100vw-2rem)] rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] p-3 shadow-lg space-y-2.5`}
            >
              <div className="flex items-center justify-between">
                <span className="font-display text-xs font-semibold text-[var(--text-primary)]">
                  {t.dateButton}
                </span>
                <button
                  type="button"
                  onClick={() => setIsDatePopoverOpen(false)}
                  aria-label={t.closeMenu}
                  className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setStartDate(null);
                    setDueDateOverride(todayStr);
                  }}
                  className={`rounded-md border px-2 py-1 text-[11px] font-medium transition-colors ${
                    !startDate && effectiveDueDate === todayStr
                      ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text-primary)]'
                      : 'border-[var(--border)] bg-[var(--canvas)] text-[var(--text-secondary)] ag-hover-card-glow'
                  }`}
                >
                  {t.today}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setStartDate(null);
                    setDueDateOverride(tomorrowStr);
                  }}
                  className={`rounded-md border px-2 py-1 text-[11px] font-medium transition-colors ${
                    !startDate && effectiveDueDate === tomorrowStr
                      ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text-primary)]'
                      : 'border-[var(--border)] bg-[var(--canvas)] text-[var(--text-secondary)] ag-hover-card-glow'
                  }`}
                >
                  {t.tomorrow}
                </button>
                {hasAnyDate && (
                  <button
                    type="button"
                    onClick={() => {
                      setStartDate(null);
                      setDueDateOverride(null);
                      setDueTime(null);
                    }}
                    className="ms-auto rounded-md px-2 py-1 text-[11px] font-medium text-[var(--text-muted)] ag-hover-glow hover:text-[var(--text-primary)]"
                  >
                    {t.clearDate}
                  </button>
                )}
              </div>

              <div className="space-y-2">
                <div>
                  <label
                    htmlFor="quick-add-start-date"
                    className="mb-1 block text-[11px] font-medium text-[var(--text-muted)]"
                  >
                    {t.startDateLabel}
                  </label>
                  <input
                    id="quick-add-start-date"
                    type="date"
                    value={startDate ?? ''}
                    onChange={(e) => setStartDate(e.target.value || null)}
                    aria-label={t.startDateLabel}
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--canvas)] px-2.5 py-1.5 text-xs text-[var(--text-primary)] focus:border-[var(--border-strong)] focus:outline-none"
                  />
                </div>
                <div>
                  <label
                    htmlFor="quick-add-due-date"
                    className="mb-1 block text-[11px] font-medium text-[var(--text-muted)]"
                  >
                    {t.dueDateLabel}
                  </label>
                  <input
                    id="quick-add-due-date"
                    type="date"
                    value={effectiveDueDate ?? ''}
                    onChange={(e) => {
                      const val = e.target.value || null;
                      setDueDateOverride(val);
                      if (!val && !startDate) {
                        setDueTime(null);
                      }
                    }}
                    aria-label={t.dueDateLabel}
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--canvas)] px-2.5 py-1.5 text-xs text-[var(--text-primary)] focus:border-[var(--border-strong)] focus:outline-none"
                  />
                </div>
                <div>
                  <label
                    htmlFor="quick-add-due-time"
                    className="mb-1 flex items-center gap-1 text-[11px] font-medium text-[var(--text-muted)]"
                  >
                    <Clock className="h-3 w-3 shrink-0" />
                    <span>{t.dueTimeLabel}</span>
                  </label>
                  <input
                    id="quick-add-due-time"
                    type="time"
                    value={dueTime ?? ''}
                    onChange={(e) => {
                      const val = e.target.value || null;
                      setDueTime(val);
                      if (val && !effectiveDueDate && !startDate) {
                        setDueDateOverride(todayStr);
                      }
                    }}
                    aria-label={t.dueTimeLabel}
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--canvas)] px-2.5 py-1.5 text-xs text-[var(--text-primary)] focus:border-[var(--border-strong)] focus:outline-none"
                  />
                </div>
              </div>

              <p className="text-[11px] leading-snug text-[var(--text-muted)]">
                {t.optionalDateHint}
              </p>
            </div>
          )}
        </div>

        {/* Quick Priority */}
        <button
          type="button"
          onClick={cyclePriority}
          aria-label={`${t.priorityLabel}: ${priorityText}`}
          className={`inline-flex items-center gap-1.5 py-0.5 font-medium transition-colors whitespace-nowrap ${
            priority === 'high'
              ? 'text-red-600 dark:text-red-400'
              : priority === 'low'
                ? 'text-[var(--text-muted)]'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          <Flag className="h-3.5 w-3.5 shrink-0" />
          <span>
            {t.priorityLabel}: {priorityText}
          </span>
        </button>

        {/* Clean Custom Category Dropdown */}
        {categories.length > 0 && (
          <div ref={catMenuRef} className="relative">
            <button
              type="button"
              onClick={() => setIsCatMenuOpen((prev) => !prev)}
              aria-expanded={isCatMenuOpen}
              aria-haspopup="listbox"
              aria-label={`${t.categories}: ${selectedCategory?.name ?? t.uncategorized}`}
              className="inline-flex items-center gap-1.5 py-0.5 font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors whitespace-nowrap"
            >
              {selectedCategory ? (
                <ColorDot color={selectedCategory.color} size="xs" />
              ) : (
                <Folder className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
              )}
              <span className="max-w-[120px] truncate">
                {selectedCategory?.name ?? t.uncategorized}
              </span>
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
            </button>

            {isCatMenuOpen && (
              <div
                role="listbox"
                aria-label={t.categories}
                className={`animate-modal-pop absolute ${catAlignEnd ? 'end-0' : 'start-0'} top-7 z-30 min-w-[176px] max-w-[min(260px,calc(100vw-2rem))] max-h-60 overflow-y-auto rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] p-1 shadow-lg`}
              >
                <button
                  type="button"
                  role="option"
                  aria-selected={effectiveCategoryId === null}
                  onClick={() => {
                    setCategoryOverride(null);
                    setIsCatMenuOpen(false);
                  }}
                  className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-start text-xs font-medium transition-colors ${
                    effectiveCategoryId === null
                      ? 'bg-[var(--accent-soft)] text-[var(--text-primary)]'
                      : 'text-[var(--text-secondary)] ag-hover-glow hover:text-[var(--text-primary)]'
                  }`}
                >
                  <span className="truncate">{t.uncategorized}</span>
                  {effectiveCategoryId === null && (
                    <Check className="h-3 w-3 shrink-0 text-[var(--accent)]" />
                  )}
                </button>
                {categories.map((cat) => {
                  const selected = effectiveCategoryId === cat.id;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      onClick={() => {
                        setCategoryOverride(cat.id);
                        setIsCatMenuOpen(false);
                      }}
                      className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-start text-xs font-medium transition-colors ${
                        selected
                          ? 'bg-[var(--accent-soft)] text-[var(--text-primary)]'
                          : 'text-[var(--text-secondary)] ag-hover-glow hover:text-[var(--text-primary)]'
                      }`}
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <ColorDot color={cat.color} size="xs" />
                        <span className="truncate" title={cat.name}>
                          {cat.name}
                        </span>
                      </span>
                      {selected && <Check className="h-3 w-3 shrink-0 text-[var(--accent)]" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <span className="ms-auto hidden sm:inline text-[11px] text-[var(--text-muted)]">
          {t.instantSaveBadge}
        </span>
      </div>
    </form>
  );
});
