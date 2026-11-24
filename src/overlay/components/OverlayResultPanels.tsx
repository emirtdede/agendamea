import { AlertTriangle, Check, Send, Volume2 } from 'lucide-react';
import type React from 'react';
import type { UiDictionary } from '../../i18n/translations';
import type { VoiceAskResponse } from '../../types';
import type { OverlayPhase } from './OverlayTopBar';

interface OverlayResultPanelsProps {
  t: UiDictionary;
  phase: OverlayPhase;
  response: VoiceAskResponse | null;
  errorMessage: string;
  isSpeaking: boolean;
  missingVoicePack: boolean;
  isKeyboardMode: boolean;
  keyboardInput: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onChangeKeyboardInput: (value: string) => void;
  onKeyboardSubmit: (e: React.FormEvent) => void;
  onDismiss: () => void;
  onConfirmAction: (confirmToken: string) => void;
  onSelectCandidate: (todoId: string) => void;
}

export function OverlayResultPanels({
  t,
  phase,
  response,
  errorMessage,
  isSpeaking,
  missingVoicePack,
  isKeyboardMode,
  keyboardInput,
  inputRef,
  onChangeKeyboardInput,
  onKeyboardSubmit,
  onDismiss,
  onConfirmAction,
  onSelectCandidate,
}: OverlayResultPanelsProps) {
  return (
    <>
      {phase === 'result' && response && (
        <div
          data-testid="overlay-result-card"
          className={`mt-2 rounded-xl border border-zinc-800 bg-zinc-900/90 px-3 py-2 text-xs leading-relaxed text-zinc-200 overflow-y-auto ${
            isKeyboardMode ? 'max-h-[44px]' : 'max-h-[84px]'
          }`}
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

      {phase === 'confirm' && response?.confirmationToken && (
        <div
          data-testid="overlay-confirm-panel"
          className="mt-2.5 flex flex-col gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2"
        >
          <div className="flex min-w-0 items-start gap-2 text-xs text-amber-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
            <span className="line-clamp-3 break-words leading-snug" title={response.displayText}>
              {response.displayText}
            </span>
          </div>
          <div className="flex items-center justify-end gap-1.5">
            <button
              type="button"
              data-testid="overlay-confirm-no-btn"
              onClick={onDismiss}
              className="rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-[11px] font-medium text-zinc-300 hover:bg-zinc-800"
            >
              {t.overlayCancelButton}
            </button>
            <button
              type="button"
              data-testid="overlay-confirm-yes-btn"
              onClick={() => onConfirmAction(response.confirmationToken ?? '')}
              className="rounded-lg bg-red-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-red-500"
            >
              {t.overlayConfirmButton}
            </button>
          </div>
        </div>
      )}

      {phase === 'disambiguate' && response?.candidates && (
        <div data-testid="overlay-disambiguate-panel" className="mt-2.5 min-h-0 space-y-1.5">
          <p className="line-clamp-2 text-[11px] leading-snug text-zinc-400">
            {response.displayText}
          </p>
          <div className="flex max-h-[82px] flex-wrap gap-1.5 overflow-y-auto pe-1">
            {response.candidates.map((cand) => (
              <button
                key={cand.todoId}
                type="button"
                data-testid={`overlay-candidate-${cand.index}`}
                onClick={() => onSelectCandidate(cand.todoId)}
                className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-xs font-medium text-zinc-100 hover:border-zinc-500 hover:bg-zinc-800"
              >
                <span className="font-mono text-[10px] text-emerald-400 shrink-0">
                  {cand.index}
                </span>
                <span className="truncate">{cand.title}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {phase === 'error' && errorMessage && (
        <div
          role="alert"
          data-testid="overlay-error-text"
          className="mt-2 max-h-[60px] overflow-y-auto rounded-lg border border-amber-500/40 bg-amber-500/12 px-2.5 py-1.5 text-[11px] leading-snug text-amber-200 break-words"
        >
          {errorMessage}
        </div>
      )}

      {(isKeyboardMode || phase === 'idle' || phase === 'error') && (
        <form onSubmit={onKeyboardSubmit} className="mt-2.5 flex items-center gap-1.5">
          <input
            ref={inputRef}
            type="text"
            data-testid="overlay-text-input"
            value={keyboardInput}
            onChange={(e) => onChangeKeyboardInput(e.target.value)}
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
    </>
  );
}
