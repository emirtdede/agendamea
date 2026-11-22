/**
 * WBS-4.3: Zero-License-Risk OS TTS Player (Windows OneCore / Chromium window.speechSynthesis)
 * - Caps spoken text at <= 400 chars while visual overlay displays full text
 * - Instant cancel (< 100 ms) on Escape or stop click
 * - Graceful silent fallback with ms-settings:speech link if language voice pack is absent
 */

export const MAX_SPOKEN_CHARS = 400;
export const WINDOWS_SPEECH_SETTINGS_URI = 'ms-settings:speech';

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

export function truncateForSpeech(rawText: string, maxChars = MAX_SPOKEN_CHARS): {
  spokenText: string;
  fullText: string;
  truncated: boolean;
} {
  const fullText = String(rawText || '').replace(/\s+/g, ' ').trim();
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
  const matches = voices.filter((v) => String(v.lang || '').toLowerCase().startsWith(baseLang));
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
  const api = synth ?? (typeof window !== 'undefined' ? window.speechSynthesis : null);
  try {
    api?.cancel();
  } catch {
    // Ignore synth cancel errors
  }
}

export function listAvailableTtsVoices(synth?: SpeechSynthesis | null): SpeechSynthesisVoice[] {
  const api = synth ?? (typeof window !== 'undefined' ? window.speechSynthesis : null);
  try {
    return api ? api.getVoices() : [];
  } catch {
    return [];
  }
}

export function speakLocalText(
  text: string,
  options?: {
    language?: string;
    preferredVoice?: string;
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
  const baseLang = String(options?.language || 'tr').toLowerCase().split('-')[0];
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
    utterance.voice = chosen;
    utterance.lang = chosen.lang || options?.language || 'tr-TR';
    utterance.rate = 1.04;
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
