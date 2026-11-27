import {
  AudioLines,
  Check,
  ChevronDown,
  ChevronRight,
  Download,
  ExternalLink,
  Play,
  RefreshCw,
  Square,
  Trash2,
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
import { InfoTooltip } from '../../InfoTooltip';
import { SelectField } from '../../SelectField';
import { ToggleSwitch } from '../../ToggleSwitch';
import { SettingsAdvancedSection } from '../SettingsAdvancedSection';
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
      className="space-y-4"
    >
      {/* Primary Voice & Dictation Card (Everyday Controls) */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/75 divide-y divide-[var(--border)]/70">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3.5 sm:px-5">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
            {t.aiVoiceControlsTitle}
          </h3>
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
            className="inline-flex items-center gap-1 text-xs font-medium text-[var(--text-muted)] ag-hover-glow hover:text-[var(--text-primary)]"
          >
            <span>{t.aiVoiceTestOverlayButton}</span>
            <ExternalLink className="h-3 w-3" />
          </button>
        </div>

        {/* 1. Microphone Selector + Live Meter */}
        <div className="p-4 sm:px-5 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label
              htmlFor="ai-voice-mic-select"
              className="text-[13px] font-medium text-[var(--text-primary)]"
            >
              {t.aiVoiceMicLabel}
            </label>
            <div className="flex items-center gap-3">
              <button
                type="button"
                data-testid="ai-mic-refresh-btn"
                onClick={onRefreshMics}
                className="inline-flex items-center gap-1 text-xs text-[var(--text-muted)] ag-hover-glow hover:text-[var(--text-primary)]"
              >
                <RefreshCw className="h-3 w-3" />
                <span>{t.aiVoiceMicRefreshButton}</span>
              </button>
              <button
                type="button"
                data-testid="ai-mic-test-btn"
                onClick={onToggleMicTest}
                className={`inline-flex items-center gap-1 text-xs font-medium transition-colors ${
                  testingMic
                    ? 'text-red-500'
                    : 'text-[var(--text-secondary)] ag-hover-glow hover:text-[var(--text-primary)]'
                }`}
              >
                <AudioLines className="h-3.5 w-3.5" />
                <span>{testingMic ? t.aiVoiceMicStopTestButton : t.aiVoiceMicTestButton}</span>
              </button>
            </div>
          </div>

          <SelectField
            id="ai-voice-mic-select"
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
              className="h-1 w-full overflow-hidden rounded-full bg-[var(--surface-subtle)]"
            >
              <div
                className="h-full rounded-full bg-[var(--text-primary)] transition-[width] duration-75"
                style={{ width: `${Math.max(4, Math.round(micLevel * 100))}%` }}
              />
            </div>
          )}
        </div>

        {/* 2. Dictation Language */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 sm:px-5">
          <div className="flex items-center gap-1.5">
            <label
              htmlFor="ai-voice-dictation-lang-select"
              className="text-[13px] font-medium text-[var(--text-primary)]"
            >
              {t.aiVoiceDictationLangLabel}
            </label>
            <InfoTooltip text={t.aiVoiceDictationLangTooltip} testId="ai-dictation-lang-info" />
          </div>
          <SelectField
            id="ai-voice-dictation-lang-select"
            data-testid="ai-voice-dictation-lang-select"
            value={voiceDictationLanguage}
            onChange={(e) => onDictationLanguageChange(e.target.value)}
            wrapperClassName="w-full sm:w-[300px]"
          >
            <option value="auto">{t.aiVoiceDictationLangAuto}</option>
            {SUPPORTED_LANGUAGES.map((item) => (
              <option key={item.code} value={item.code}>
                {item.nativeName} ({item.code})
              </option>
            ))}
          </SelectField>
        </div>

        {/* 3. Noise Suppression */}
        <div className="flex items-center justify-between gap-4 p-4 sm:px-5">
          <div className="min-w-0 space-y-0.5">
            <div className="flex items-center gap-1.5">
              <p className="text-[13px] font-medium text-[var(--text-primary)]">
                {t.aiVoiceNoiseSuppressionLabel}
              </p>
              <InfoTooltip text={t.aiVoiceNoiseTooltip} testId="ai-voice-noise-info" />
            </div>
            <p className="text-xs leading-relaxed text-[var(--text-muted)]">
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
      </div>

      {/* Advanced Voice & Speech Settings (Auto-Stop, Sensitivity, Chime, TTS, Piper Voices) */}
      <SettingsAdvancedSection
        forceOpen={piperVoices.some((v) => v.downloading)}
        testId="ai-voice-advanced-section"
        toggleTestId="ai-voice-advanced-toggle"
      >
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/75 divide-y divide-[var(--border)]/70">
          {/* 4. Auto-Stop & Voice Sensitivity */}
          <div className="grid grid-cols-1 gap-4 p-4 sm:px-5 sm:grid-cols-2">
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <label
                  htmlFor="ai-voice-vad-select"
                  className="block text-xs font-medium text-[var(--text-secondary)]"
                >
                  {t.aiVoiceAutoStopLabel}
                </label>
                <InfoTooltip text={t.aiVoiceAutoStopTooltip} testId="ai-voice-vad-info" />
              </div>
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
              <div className="flex items-center gap-1.5">
                <label
                  htmlFor="ai-voice-sensitivity-select"
                  className="block text-xs font-medium text-[var(--text-secondary)]"
                >
                  {t.aiVoiceSensitivityLabel}
                </label>
                <InfoTooltip
                  text={t.aiVoiceSensitivityTooltip}
                  testId="ai-voice-sensitivity-info"
                />
              </div>
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

          {/* 5. Ready Chime */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-4 sm:px-5">
            <label
              htmlFor="ai-voice-chime-select"
              className="text-[13px] font-medium text-[var(--text-primary)]"
            >
              {t.aiVoiceChimeLabel}
            </label>
            <div className="flex items-center gap-2">
              <SelectField
                id="ai-voice-chime-select"
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
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--text-secondary)] ag-hover-card-glow hover:text-[var(--text-primary)] disabled:opacity-35"
                aria-label={t.aiVoiceTtsPreviewButton}
              >
                <Play className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* 6. Read-Aloud (TTS) */}
          <div className="p-4 sm:px-5 space-y-3.5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-[13px] font-medium text-[var(--text-primary)]">
                {t.aiVoiceTtsToggleLabel}
              </span>

              <div className="flex items-center gap-3 shrink-0">
                {voiceTtsEnabled && (
                  <button
                    type="button"
                    data-testid="ai-voice-tts-preview-btn"
                    onClick={() => onPreviewTts()}
                    className="inline-flex items-center gap-1 text-xs font-medium text-[var(--text-secondary)] ag-hover-glow hover:text-[var(--text-primary)] whitespace-nowrap"
                  >
                    {previewingTts ? <Square className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                    <span>
                      {previewingTts ? t.aiVoiceTtsStopPreviewButton : t.aiVoiceTtsPreviewButton}
                    </span>
                  </button>
                )}

                <ToggleSwitch
                  checked={voiceTtsEnabled}
                  onChange={onTtsToggle}
                  label={t.aiVoiceTtsToggleLabel}
                  testId="ai-voice-tts-toggle"
                />
              </div>
            </div>

            {voiceTtsEnabled && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label
                    htmlFor="ai-voice-tts-select"
                    className="block text-xs font-medium text-[var(--text-secondary)]"
                  >
                    {t.aiVoiceTtsVoiceLabel}
                  </label>
                  <SelectField
                    id="ai-voice-tts-select"
                    data-testid="ai-voice-tts-select"
                    value={voiceTtsVoice}
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
                              {pv.gender === 'female' ? t.aiVoiceGenderFemale : t.aiVoiceGenderMale}
                              )
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
                    className="block text-xs font-medium text-[var(--text-secondary)]"
                  >
                    {t.aiVoiceTtsStyleLabel}
                  </label>
                  <SelectField
                    id="ai-voice-tts-style-select"
                    data-testid="ai-voice-tts-style-select"
                    value={voiceTtsStyle}
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
            )}
          </div>

          {/* 7. Collapsible Offline Neural Voices */}
          {piperVoices.length > 0 && (
            <div data-testid="ai-piper-voices-section" className="p-4 sm:px-5">
              <button
                type="button"
                data-testid="ai-piper-accordion-toggle"
                aria-expanded={isPiperExpanded}
                onClick={() => setPiperOpen((prev) => !prev)}
                className="flex w-full items-center justify-between gap-3 text-start ag-hover-glow"
              >
                <div className="min-w-0 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[13px] font-medium text-[var(--text-primary)]">
                      {t.aiVoicePiperSectionTitle}
                    </span>
                    {installedPiperCount > 0 && (
                      <span className="font-mono-tabular text-[11px] text-[var(--text-muted)]">
                        {installedPiperCount}/{piperVoices.length}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[var(--text-muted)]">{t.aiVoicePiperSectionDesc}</p>
                </div>
                {isPiperExpanded ? (
                  <ChevronDown className="h-4 w-4 text-[var(--text-muted)] shrink-0" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-[var(--text-muted)] shrink-0 rtl:rotate-180" />
                )}
              </button>

              {isPiperExpanded && (
                <div className="animate-accordion mt-3 border-t border-[var(--border)]/75 divide-y divide-[var(--border)]/60">
                  {piperVoices.map((pv) => {
                    const isActive = voiceTtsVoice === `${PIPER_VOICE_PREFIX}${pv.id}`;
                    const genderLabel =
                      pv.gender === 'female' ? t.aiVoiceGenderFemale : t.aiVoiceGenderMale;
                    return (
                      <div
                        key={pv.id}
                        data-testid={`piper-voice-row-${pv.id}`}
                        className="flex flex-wrap items-center justify-between gap-3 py-2.5"
                      >
                        <div className="min-w-0 flex-1 space-y-0.5">
                          <div className="flex flex-wrap items-baseline gap-2">
                            <span className="text-xs font-medium text-[var(--text-primary)]">
                              {pv.name}
                            </span>
                            <span className="font-mono-tabular text-[11px] text-[var(--text-muted)]">
                              {pv.language} · {genderLabel} · {formatBytes(pv.expectedBytes)}
                            </span>
                            {isActive && pv.installed && (
                              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--text-primary)]">
                                <Check className="h-3 w-3" />
                                <span>{t.aiVoicePiperActiveBadge}</span>
                              </span>
                            )}
                          </div>
                          {pv.downloading && pv.progress && (
                            <div className="mt-1.5 w-full max-w-xs space-y-1">
                              <div className="h-1 w-full overflow-hidden rounded-full bg-[var(--surface-subtle)]">
                                <div
                                  className="h-full bg-[var(--accent)] transition-[width]"
                                  style={{ width: `${pv.progress.percent}%` }}
                                />
                              </div>
                              <p className="font-mono-tabular text-[10.5px] text-[var(--text-muted)]">
                                {t.aiModelDownloadingLabel} {pv.progress.percent}% (
                                {formatBytes(pv.progress.receivedBytes)} /{' '}
                                {formatBytes(pv.progress.totalBytes)})
                              </p>
                            </div>
                          )}
                        </div>

                        <div className="flex shrink-0 items-center gap-2">
                          {pv.downloading ? (
                            <button
                              type="button"
                              data-testid={`piper-voice-cancel-${pv.id}`}
                              onClick={() => onCancelPiperVoice(pv.id)}
                              className="inline-flex items-center gap-1 text-xs text-[var(--text-secondary)] ag-hover-glow"
                            >
                              <X className="h-3.5 w-3.5" />
                              <span>{t.aiModelCancelButton}</span>
                            </button>
                          ) : pv.installed ? (
                            <>
                              <button
                                type="button"
                                data-testid={`piper-voice-preview-${pv.id}`}
                                onClick={() => onPreviewTts(`${PIPER_VOICE_PREFIX}${pv.id}`)}
                                className="p-1 text-[var(--text-muted)] ag-hover-glow hover:text-[var(--text-primary)]"
                                aria-label={t.aiVoiceTtsPreviewButton}
                              >
                                <Play className="h-3.5 w-3.5" />
                              </button>
                              {!isActive && (
                                <button
                                  type="button"
                                  data-testid={`piper-voice-select-${pv.id}`}
                                  onClick={() => onTtsVoiceChange(`${PIPER_VOICE_PREFIX}${pv.id}`)}
                                  className="text-xs font-medium text-[var(--text-primary)] ag-hover-glow"
                                >
                                  {t.aiVoicePiperSelectButton}
                                </button>
                              )}
                              <button
                                type="button"
                                data-testid={`piper-voice-delete-${pv.id}`}
                                disabled={busyPiperVoiceId === pv.id}
                                onClick={() => onDeletePiperVoice(pv.id)}
                                className="p-1 text-[var(--text-muted)] ag-hover-danger-glow hover:text-red-500 disabled:opacity-40"
                                aria-label={t.aiModelDeleteButton}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              data-testid={`piper-voice-download-${pv.id}`}
                              disabled={busyPiperVoiceId === pv.id}
                              onClick={() => onDownloadPiperVoice(pv.id)}
                              className="inline-flex items-center gap-1 text-xs font-medium text-[var(--text-secondary)] ag-hover-glow hover:text-[var(--text-primary)] disabled:opacity-40"
                            >
                              <Download className="h-3.5 w-3.5" />
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
      </SettingsAdvancedSection>
    </section>
  );
});
