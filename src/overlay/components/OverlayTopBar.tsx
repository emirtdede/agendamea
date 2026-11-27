import { Keyboard, Loader2, Mic, ShieldCheck, Square, VolumeX, X } from 'lucide-react';
import type { UiDictionary } from '../../i18n/translations';

export type OverlayPhase =
  | 'idle'
  | 'preparing'
  | 'listening'
  | 'processing'
  | 'preview'
  | 'result'
  | 'confirm'
  | 'disambiguate'
  | 'error';

const WAVEFORM_BARS = [
  { id: 'bar-0', weight: 0.35 },
  { id: 'bar-1', weight: 0.65 },
  { id: 'bar-2', weight: 0.9 },
  { id: 'bar-3', weight: 1.0 },
  { id: 'bar-4', weight: 0.85 },
  { id: 'bar-5', weight: 0.6 },
  { id: 'bar-6', weight: 0.35 },
] as const;

function formatElapsed(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

interface OverlayTopBarProps {
  t: UiDictionary;
  phase: OverlayPhase;
  activeListeningTitle: string;
  isSpeaking: boolean;
  rmsLevel: number;
  elapsedSec: number;
  noiseSuppression: boolean;
  transcript: string;
  isKeyboardMode: boolean;
  onMicClick: () => void;
  onStopTts: () => void;
  onEnableKeyboardMode: () => void;
  onDismiss: () => void;
}

export function OverlayTopBar({
  t,
  phase,
  activeListeningTitle,
  isSpeaking,
  rmsLevel,
  elapsedSec,
  noiseSuppression,
  transcript,
  isKeyboardMode,
  onMicClick,
  onStopTts,
  onEnableKeyboardMode,
  onDismiss,
}: OverlayTopBarProps) {
  return (
    <div className="flex items-center justify-between gap-2.5">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          data-testid="overlay-mic-btn"
          onClick={onMicClick}
          aria-label={t.overlayListeningLabel}
          className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors ${
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

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0">
            <span
              data-testid="overlay-status-label"
              className="min-w-0 truncate text-xs font-semibold tracking-tight text-zinc-100"
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
                  {WAVEFORM_BARS.map((bar) => {
                    const pct = Math.max(
                      28,
                      Math.min(100, Math.round((0.24 + rmsLevel * bar.weight * 0.95) * 100)),
                    );
                    return (
                      <span
                        key={bar.id}
                        className="w-[3px] rounded-full bg-rose-400 transition-[height] duration-75"
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
            onClick={onStopTts}
            title={t.overlayStopButton}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-300 hover:bg-zinc-800 hover:text-white"
          >
            <VolumeX className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          type="button"
          data-testid="overlay-keyboard-toggle-btn"
          onClick={onEnableKeyboardMode}
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
          onClick={onDismiss}
          aria-label={t.windowClose}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-800 hover:text-white"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
