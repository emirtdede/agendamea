import {
  AudioLines,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Download,
  Mic,
  Play,
  RefreshCw,
  Square,
  Trash2,
  Volume2,
  X,
} from 'lucide-react';
import React, { useState } from 'react';
import { useI18n } from '../../../i18n/I18nContext';
import { SUPPORTED_LANGUAGES } from '../../../i18n/languages';
import type {
  PiperVoiceStatus,
  VoiceChimePreset,
  VoiceSensitivityMode,
  VoiceTtsStyle,
} from '../../../types';
import { type AudioInputDeviceInfo, playReadyChime } from '../../../voice/audioCapture';
import { PIPER_VOICE_PREFIX } from '../../../voice/ttsPlayer';
import { SelectField } from '../../SelectField';
import { ToggleSwitch } from '../../ToggleSwitch';
import { formatBytes, VAD_OPTIONS } from './aiUtils';

interface VoiceAudioSectionProps {
  voiceMicDeviceId: string;
  voiceDictationLanguage: string;
  micDevices: AudioInputDeviceInfo[];
  testingMic: boolean;
  micLevel: number;
  voiceNoiseSuppression: boolean;
  voiceAutoStopMs: number;
  voiceSensitivity: VoiceSensitivityMode;
  voiceChimePreset: VoiceChimePreset;
  voiceTtsEnabled: boolean;
  voiceTtsVoice: string;
  voiceTtsStyle: VoiceTtsStyle;
  previewingTts: boolean;
  voices: SpeechSynthesisVoice[];
  piperVoices: PiperVoiceStatus[];
  busyPiperVoiceId: string | null;
  onRefreshMics: () => void;
  onToggleMicTest: () => void;
  onMicChange: (deviceId: string) => void;
  onDictationLanguageChange: (langCode: string) => void;
  onNoiseSuppressionToggle: (enabled: boolean) => void;
  onAutoStopChange: (ms: number) => void;
  onSensitivityChange: (mode: VoiceSensitivityMode) => void;
  onChimePresetChange: (preset: VoiceChimePreset) => void;
  onPreviewTts: (overrideVoice?: string) => void;
  onTtsToggle: (enabled: boolean) => void;
  onTtsVoiceChange: (voiceUri: string) => void;
  onTtsStyleChange: (style: VoiceTtsStyle) => void;
  onDownloadPiperVoice: (voiceId: string) => void;
  onCancelPiperVoice: (voiceId: string) => void;
  onDeletePiperVoice: (voiceId: string) => void;
}

export const VoiceAudioSection = React.memo(function VoiceAudioSection({
  voiceMicDeviceId,
  voiceDictationLanguage,
  micDevices,
  testingMic,
  micLevel,
  voiceNoiseSuppression,
  voiceAutoStopMs,
  voiceSensitivity,
  voiceChimePreset,
  voiceTtsEnabled,
  voiceTtsVoice,
  voiceTtsStyle,
  previewingTts,
  voices,
  piperVoices,
  busyPiperVoiceId,
  onRefreshMics,
  onToggleMicTest,
  onMicChange,
  onDictationLanguageChange,
  onNoiseSuppressionToggle,
  onAutoStopChange,
  onSensitivityChange,
  onChimePresetChange,
  onPreviewTts,
  onTtsToggle,
  onTtsVoiceChange,
  onTtsStyleChange,
  onDownloadPiperVoice,
  onCancelPiperVoice,
  onDeletePiperVoice,
}: VoiceAudioSectionProps) {
  const { t } = useI18n();
  const [piperOpen, setPiperOpen] = useState(false);
  const installedPiperCount = piperVoices.filter((v) => v.installed).length;
  const isPiperExpanded = piperOpen || piperVoices.some((v) => v.downloading);

  return (
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
              onClick={onRefreshMics}
              className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-[11px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
            >
              <RefreshCw className="h-3 w-3" />
              <span>{t.aiVoiceMicRefreshButton}</span>
            </button>
            <button
              type="button"
              data-testid="ai-mic-test-btn"
              onClick={onToggleMicTest}
              className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                testingMic
                  ? 'border-red-500/40 bg-red-500/15 text-red-600 dark:text-red-400'
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
          onChange={(e) => onMicChange(e.target.value)}
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
        <ToggleSwitch
          checked={voiceNoiseSuppression}
          onChange={onNoiseSuppressionToggle}
          label={t.aiVoiceNoiseSuppressionLabel}
          testId="ai-voice-noise-toggle"
        />
      </div>

      {/* VAD Timeout + Voice Sensitivity */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label
            htmlFor="ai-voice-vad-select"
            className="block text-[11px] font-medium text-[var(--text-secondary)]"
          >
            {t.aiVoiceAutoStopLabel}
          </label>
          <SelectField
            id="ai-voice-vad-select"
            data-testid="ai-voice-vad-select"
            value={voiceAutoStopMs}
            onChange={(e) => onAutoStopChange(Number(e.target.value))}
            wrapperClassName="w-full"
          >
            {VAD_OPTIONS.map((ms) => (
              <option key={ms} value={ms}>
                {(ms / 1000).toFixed(1)} s
              </option>
            ))}
          </SelectField>
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="ai-voice-sensitivity-select"
            className="block text-[11px] font-medium text-[var(--text-secondary)]"
          >
            {t.aiVoiceSensitivityLabel}
          </label>
          <SelectField
            id="ai-voice-sensitivity-select"
            data-testid="ai-voice-sensitivity-select"
            value={voiceSensitivity}
            onChange={(e) => onSensitivityChange(e.target.value as VoiceSensitivityMode)}
            wrapperClassName="w-full"
          >
            <option value="auto">{t.aiVoiceSensitivityAuto}</option>
            <option value="low">{t.aiVoiceSensitivityLow}</option>
            <option value="medium">{t.aiVoiceSensitivityMedium}</option>
            <option value="high">{t.aiVoiceSensitivityHigh}</option>
          </SelectField>
        </div>
      </div>

      {/* Dictation Language Selector */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--canvas)] px-3 py-2.5">
        <span className="text-xs font-medium text-[var(--text-primary)]">
          {t.aiVoiceDictationLangLabel}
        </span>
        <SelectField
          data-testid="ai-voice-dictation-lang-select"
          value={voiceDictationLanguage}
          onChange={(e) => onDictationLanguageChange(e.target.value)}
          wrapperClassName="w-full sm:w-[270px]"
        >
          <option value="auto">{t.aiVoiceDictationLangAuto}</option>
          {SUPPORTED_LANGUAGES.map((item) => (
            <option key={item.code} value={item.code}>
              {item.nativeName} ({item.code})
            </option>
          ))}
        </SelectField>
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
            onChange={(e) => onChimePresetChange(e.target.value as VoiceChimePreset)}
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
          <div className="flex items-center gap-2 min-w-0">
            <Volume2 className="h-3.5 w-3.5 text-[var(--accent)] shrink-0" />
            <span className="text-xs font-medium text-[var(--text-primary)]">
              {t.aiVoiceTtsToggleLabel}
            </span>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              data-testid="ai-voice-tts-preview-btn"
              disabled={!voiceTtsEnabled}
              onClick={() => onPreviewTts()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--canvas)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-hover)] disabled:opacity-40 whitespace-nowrap"
            >
              {previewingTts ? (
                <Square className="h-3 w-3 text-red-500" />
              ) : (
                <Play className="h-3 w-3 text-[var(--accent)]" />
              )}
              <span>
                {previewingTts ? t.aiVoiceTtsStopPreviewButton : t.aiVoiceTtsPreviewButton}
              </span>
            </button>

            <ToggleSwitch
              checked={voiceTtsEnabled}
              onChange={onTtsToggle}
              label={t.aiVoiceTtsToggleLabel}
              testId="ai-voice-tts-toggle"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label
              htmlFor="ai-voice-tts-select"
              className="block text-[11px] font-medium text-[var(--text-secondary)]"
            >
              {t.aiVoiceTtsVoiceLabel}
            </label>
            <SelectField
              id="ai-voice-tts-select"
              data-testid="ai-voice-tts-select"
              value={voiceTtsVoice}
              disabled={!voiceTtsEnabled}
              onChange={(e) => onTtsVoiceChange(e.target.value)}
              wrapperClassName="w-full"
            >
              <option value="">{t.aiVoiceMicDefaultOption}</option>
              {piperVoices.some((pv) => pv.installed) && (
                <optgroup label={t.aiVoicePiperGroupLabel}>
                  {piperVoices
                    .filter((pv) => pv.installed)
                    .map((pv) => (
                      <option key={pv.id} value={`${PIPER_VOICE_PREFIX}${pv.id}`}>
                        {pv.name} ({pv.language} -{' '}
                        {pv.gender === 'female' ? t.aiVoiceGenderFemale : t.aiVoiceGenderMale})
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
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="ai-voice-tts-style-select"
              className="block text-[11px] font-medium text-[var(--text-secondary)]"
            >
              {t.aiVoiceTtsStyleLabel}
            </label>
            <SelectField
              id="ai-voice-tts-style-select"
              data-testid="ai-voice-tts-style-select"
              value={voiceTtsStyle}
              disabled={!voiceTtsEnabled}
              onChange={(e) => onTtsStyleChange(e.target.value as VoiceTtsStyle)}
              wrapperClassName="w-full"
            >
              <option value="natural">{t.aiVoiceTtsStyleNatural}</option>
              <option value="crisp">{t.aiVoiceTtsStyleCrisp}</option>
              <option value="calm">{t.aiVoiceTtsStyleCalm}</option>
              <option value="bright">{t.aiVoiceTtsStyleBright}</option>
              <option value="studio">{t.aiVoiceTtsStyleStudio}</option>
            </SelectField>
          </div>
        </div>

        {/* Collapsible Offline Piper Neural Voices (Default Closed unless Downloading) */}
        {piperVoices.length > 0 && (
          <div
            data-testid="ai-piper-voices-section"
            className="rounded-lg border border-[var(--border)] bg-[var(--canvas)] overflow-hidden"
          >
            <button
              type="button"
              data-testid="ai-piper-accordion-toggle"
              aria-expanded={isPiperExpanded}
              onClick={() => setPiperOpen((prev) => !prev)}
              className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-start transition-colors hover:bg-[var(--surface-hover)]"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[11px] font-semibold text-[var(--text-primary)]">
                    {t.aiVoicePiperSectionTitle}
                  </p>
                  <span className="rounded bg-[var(--surface-subtle)] px-1.5 py-0.5 font-mono-tabular text-[10px] text-[var(--text-muted)]">
                    {installedPiperCount}/{piperVoices.length}
                  </span>
                </div>
                <p className="text-[10.5px] text-[var(--text-muted)]">
                  {t.aiVoicePiperSectionDesc}
                </p>
              </div>
              {isPiperExpanded ? (
                <ChevronDown className="h-4 w-4 text-[var(--text-muted)] shrink-0" />
              ) : (
                <ChevronRight className="h-4 w-4 text-[var(--text-muted)] shrink-0 rtl:rotate-180" />
              )}
            </button>

            {isPiperExpanded && (
              <div className="animate-accordion border-t border-[var(--border)] divide-y divide-[var(--border)]">
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
                          <span
                            lang="en"
                            className="rounded bg-[var(--surface-subtle)] px-1.5 py-0.5 font-mono-tabular text-[10px] uppercase text-[var(--text-muted)]"
                          >
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
                              {t.aiModelDownloadingLabel} {pv.progress.percent}% (
                              {formatBytes(pv.progress.receivedBytes)} /{' '}
                              {formatBytes(pv.progress.totalBytes)})
                            </p>
                          </div>
                        )}
                      </div>

                      <div className="flex shrink-0 items-center gap-1.5">
                        {pv.downloading ? (
                          <button
                            type="button"
                            data-testid={`piper-voice-cancel-${pv.id}`}
                            onClick={() => onCancelPiperVoice(pv.id)}
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
                              onClick={() => onPreviewTts(`${PIPER_VOICE_PREFIX}${pv.id}`)}
                              className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-[11px] font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)]"
                              aria-label={t.aiVoiceTtsPreviewButton}
                            >
                              <Play className="h-3 w-3 text-[var(--accent)]" />
                            </button>
                            {!isActive && (
                              <button
                                type="button"
                                data-testid={`piper-voice-select-${pv.id}`}
                                onClick={() => onTtsVoiceChange(`${PIPER_VOICE_PREFIX}${pv.id}`)}
                                className="inline-flex items-center gap-1 rounded-lg border border-[var(--accent)] bg-[var(--accent-soft)] px-2 py-1 text-[11px] font-medium text-[var(--text-primary)] hover:opacity-90"
                              >
                                <span>{t.aiVoicePiperSelectButton}</span>
                              </button>
                            )}
                            <button
                              type="button"
                              data-testid={`piper-voice-delete-${pv.id}`}
                              disabled={busyPiperVoiceId === pv.id}
                              onClick={() => onDeletePiperVoice(pv.id)}
                              className="inline-flex items-center gap-1 rounded-lg border border-red-500/40 bg-red-500/10 px-2 py-1 text-[11px] font-medium text-red-600 dark:text-red-400 hover:bg-red-500/20 disabled:opacity-50"
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
                            onClick={() => onDownloadPiperVoice(pv.id)}
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
            )}
          </div>
        )}
      </div>
    </section>
  );
});
