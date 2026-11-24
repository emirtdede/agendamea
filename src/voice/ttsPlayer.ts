/**
 * WBS-4.3: Zero-License-Risk OS TTS Player (Windows OneCore / Chromium window.speechSynthesis)
 * - Caps spoken text at <= 400 chars while visual overlay displays full text
 * - Instant cancel (< 100 ms) on Escape or stop click
 * - Graceful silent fallback with ms-settings:speech link if language voice pack is absent
 */

import type { VoiceTtsStyle } from '../types';
import { speakWithPiperVoice, stopPiperSpeech } from './piperTtsEngine';

export const MAX_SPOKEN_CHARS = 400;
export const WINDOWS_SPEECH_SETTINGS_URI = 'ms-settings:speech';
export const PIPER_VOICE_PREFIX = 'piper:';

export function isPiperVoiceId(voiceId?: string | null): boolean {
  return typeof voiceId === 'string' && voiceId.startsWith(PIPER_VOICE_PREFIX);
}

export function stripPiperVoicePrefix(voiceId: string): string {
  return voiceId.startsWith(PIPER_VOICE_PREFIX)
    ? voiceId.slice(PIPER_VOICE_PREFIX.length)
    : voiceId;
}

export const TTS_STYLE_PRESETS: Record<VoiceTtsStyle, { rate: number; pitch: number }> = {
  natural: { rate: 1.02, pitch: 1.0 },
  crisp: { rate: 1.18, pitch: 1.04 },
  calm: { rate: 0.92, pitch: 0.88 },
  bright: { rate: 1.08, pitch: 1.14 },
  studio: { rate: 0.86, pitch: 0.96 },
};

export interface TtsSpeakResult {
  spoken: boolean;
  spokenText: string;
  fullText: string;
  truncated: boolean;
  voiceName?: string;
  reason?: 'OK' | 'NO_SYNTHESIS_API' | 'NO_LANGUAGE_VOICE' | 'EMPTY_TEXT';
  settingsUri: string;
}

export function sanitizeTextForSpeech(rawText: string): string {
  return String(rawText || '')
    .replace(/https?:\/\/(?:www\.)?([^/\s]+)[^\s]*/gi, '$1')
    .replace(/[`*_~#>]+/g, ' ')
    .replace(/\s*[·|]\s*/g, ', ')
    .replace(/\s*->\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function truncateForSpeech(
  rawText: string,
  maxChars = MAX_SPOKEN_CHARS,
): {
  spokenText: string;
  fullText: string;
  truncated: boolean;
} {
  const fullText = String(rawText || '')
    .replace(/\s+/g, ' ')
    .trim();
  const cleanForSpeech = sanitizeTextForSpeech(fullText);
  const limit = Math.max(40, maxChars);
  if (cleanForSpeech.length <= limit) {
    return { spokenText: cleanForSpeech, fullText, truncated: false };
  }
  const slice = cleanForSpeech.slice(0, limit);
  const sentenceBreak = Math.max(
    slice.lastIndexOf('. '),
    slice.lastIndexOf('! '),
    slice.lastIndexOf('? '),
  );
  let cut: string;
  if (sentenceBreak >= Math.floor(limit * 0.55)) {
    cut = slice.slice(0, sentenceBreak + 1).trim();
  } else {
    const wordBreak = slice.lastIndexOf(' ');
    cut = (wordBreak >= Math.floor(limit * 0.6) ? slice.slice(0, wordBreak) : slice).trim();
    if (cut.length > limit - 3) cut = cut.slice(0, limit - 3).trim();
    cut = `${cut}...`;
  }
  return { spokenText: cut.slice(0, limit), fullText, truncated: true };
}

export function rankTtsVoices(
  voices: readonly SpeechSynthesisVoice[],
  baseLang: string,
): SpeechSynthesisVoice[] {
  const matches = voices.filter((v) =>
    String(v.lang || '')
      .toLowerCase()
      .startsWith(baseLang),
  );
  const score = (v: SpeechSynthesisVoice): number => {
    const name = String(v.name || '');
    let pts = 0;
    if (/natural|neural/i.test(name)) pts += 60;
    if (v.localService !== false) pts += 25;
    if (/emel|ahmet|aria|jenny|guy|sonia|katja|denise/i.test(name)) pts += 15;
    if (/desktop/i.test(name)) pts -= 10;
    return pts;
  };
  return [...matches].sort((a, b) => score(b) - score(a));
}

export function stopSpeaking(synth?: SpeechSynthesis | null): void {
  stopPiperSpeech();
  const api = synth ?? (typeof window !== 'undefined' ? window.speechSynthesis : null);
  try {
    api?.cancel();
  } catch {
    // Ignore synth cancel errors
  }
}

export function listAvailableTtsVoices(
  synth?: SpeechSynthesis | null,
  preferredLang?: string,
): SpeechSynthesisVoice[] {
  const api = synth ?? (typeof window !== 'undefined' ? window.speechSynthesis : null);
  try {
    const all = api ? api.getVoices() : [];
    if (!preferredLang || all.length <= 1) return all;
    const baseLang = String(preferredLang).toLowerCase().split('-')[0] ?? 'en';
    const prioritized = rankTtsVoices(all, baseLang);
    const seen = new Set(prioritized.map((v) => v.voiceURI));
    const others = all.filter((v) => !seen.has(v.voiceURI));
    return [...prioritized, ...others];
  } catch {
    return [];
  }
}

export function speakLocalText(
  text: string,
  options?: {
    language?: string;
    preferredVoice?: string;
    style?: VoiceTtsStyle;
    maxChars?: number;
    synth?: SpeechSynthesis | null;
    UtteranceCtor?: typeof SpeechSynthesisUtterance;
    onEnd?: () => void;
  },
): TtsSpeakResult {
  const { spokenText, fullText, truncated } = truncateForSpeech(
    text,
    options?.maxChars ?? MAX_SPOKEN_CHARS,
  );
  if (!spokenText) {
    return {
      spoken: false,
      spokenText: '',
      fullText,
      truncated: false,
      reason: 'EMPTY_TEXT',
      settingsUri: WINDOWS_SPEECH_SETTINGS_URI,
    };
  }

  const api = options?.synth ?? (typeof window !== 'undefined' ? window.speechSynthesis : null);
  const Utterance =
    options?.UtteranceCtor ??
    (typeof window !== 'undefined' ? window.SpeechSynthesisUtterance : undefined);

  if (!api || typeof api.speak !== 'function' || !Utterance) {
    return {
      spoken: false,
      spokenText,
      fullText,
      truncated,
      reason: 'NO_SYNTHESIS_API',
      settingsUri: WINDOWS_SPEECH_SETTINGS_URI,
    };
  }

  const voices = typeof api.getVoices === 'function' ? api.getVoices() : [];
  const baseLang =
    String(options?.language || 'en')
      .toLowerCase()
      .split('-')[0] ?? 'en';
  let chosen: SpeechSynthesisVoice | null = null;

  if (options?.preferredVoice) {
    chosen =
      voices.find(
        (v) => v.voiceURI === options.preferredVoice || v.name === options.preferredVoice,
      ) ?? null;
  }
  if (!chosen) {
    const ranked = rankTtsVoices(voices, baseLang);
    chosen = ranked[0] ?? null;
  }

  if (!chosen) {
    return {
      spoken: false,
      spokenText,
      fullText,
      truncated,
      reason: 'NO_LANGUAGE_VOICE',
      settingsUri: WINDOWS_SPEECH_SETTINGS_URI,
    };
  }

  try {
    api.cancel();
    const utterance = new Utterance(spokenText);
    const preset = TTS_STYLE_PRESETS[options?.style ?? 'natural'] ?? TTS_STYLE_PRESETS.natural;
    utterance.voice = chosen;
    utterance.lang = chosen.lang || options?.language || 'en-US';
    utterance.rate = preset.rate;
    utterance.pitch = preset.pitch;
    if (options?.onEnd) {
      utterance.onend = options.onEnd;
      utterance.onerror = options.onEnd;
    }
    api.speak(utterance);
    return {
      spoken: true,
      spokenText,
      fullText,
      truncated,
      voiceName: chosen.name,
      reason: 'OK',
      settingsUri: WINDOWS_SPEECH_SETTINGS_URI,
    };
  } catch {
    return {
      spoken: false,
      spokenText,
      fullText,
      truncated,
      reason: 'NO_SYNTHESIS_API',
      settingsUri: WINDOWS_SPEECH_SETTINGS_URI,
    };
  }
}

/**
 * Unified async TTS entry point:
 * - If preferredVoice starts with "piper:", synthesizes speech locally via offline Piper VITS ONNX.
 * - Falls back seamlessly to Windows OneCore / OS SpeechSynthesis if Piper voice is unavailable.
 */
export async function speakLocalTextAsync(
  text: string,
  options?: {
    language?: string;
    preferredVoice?: string;
    style?: VoiceTtsStyle;
    maxChars?: number;
    synth?: SpeechSynthesis | null;
    UtteranceCtor?: typeof SpeechSynthesisUtterance;
    onEnd?: () => void;
  },
): Promise<TtsSpeakResult> {
  const { spokenText, fullText, truncated } = truncateForSpeech(
    text,
    options?.maxChars ?? MAX_SPOKEN_CHARS,
  );
  if (!spokenText) {
    return {
      spoken: false,
      spokenText: '',
      fullText,
      truncated: false,
      reason: 'EMPTY_TEXT',
      settingsUri: WINDOWS_SPEECH_SETTINGS_URI,
    };
  }

  const preferredVoice = options?.preferredVoice;
  if (preferredVoice && isPiperVoiceId(preferredVoice)) {
    const piperId = stripPiperVoicePrefix(preferredVoice);
    const ok = await speakWithPiperVoice(piperId, spokenText, {
      style: options?.style,
      onEnd: options?.onEnd,
    });
    if (ok) {
      return {
        spoken: true,
        spokenText,
        fullText,
        truncated,
        voiceName: piperId,
        reason: 'OK',
        settingsUri: WINDOWS_SPEECH_SETTINGS_URI,
      };
    }
  }

  return speakLocalText(text, {
    ...options,
    preferredVoice: isPiperVoiceId(options?.preferredVoice) ? '' : options?.preferredVoice,
  });
}
