'use strict';

/**
 * WBS-4.3: Zero-License-Risk OS TTS Helper (Windows OneCore / Chromium speechSynthesis)
 * - Strictly zero GPLv3 / zero Piper / zero espeak-ng
 * - Enforces 400-character spoken limit while preserving fullText for visual card display
 * - Provides Windows Speech Settings URI (ms-settings:speech) when OS voice pack is absent
 */

const MAX_SPOKEN_CHARS = 400;
const WINDOWS_SPEECH_SETTINGS_URI = 'ms-settings:speech';

function prepareSpokenSummary(rawText, maxChars = MAX_SPOKEN_CHARS) {
  const fullText = String(rawText || '')
    .replace(/\s+/g, ' ')
    .trim();
  const limit = Math.max(40, Number(maxChars) || MAX_SPOKEN_CHARS);
  if (fullText.length <= limit) {
    return {
      spokenText: fullText,
      fullText,
      truncated: false,
      charLimit: limit,
    };
  }

  // Prefer natural sentence boundary inside limit; fallback to clean word boundary
  const slice = fullText.slice(0, limit);
  const sentenceBreak = Math.max(
    slice.lastIndexOf('. '),
    slice.lastIndexOf('! '),
    slice.lastIndexOf('? '),
  );
  let cut;
  if (sentenceBreak >= Math.floor(limit * 0.55)) {
    cut = slice.slice(0, sentenceBreak + 1).trim();
  } else {
    const wordBreak = slice.lastIndexOf(' ');
    cut = (wordBreak >= Math.floor(limit * 0.6) ? slice.slice(0, wordBreak) : slice).trim();
    if (cut.length > limit - 3) {
      cut = cut.slice(0, limit - 3).trim();
    }
    cut = `${cut}...`;
  }

  return {
    spokenText: cut.slice(0, limit),
    fullText,
    truncated: true,
    charLimit: limit,
  };
}

function selectPreferredVoice(voices, uiLang = 'tr', preferredVoiceUri = '') {
  const list = Array.isArray(voices) ? voices : [];
  if (list.length === 0) {
    return {
      voice: null,
      hasLanguageVoice: false,
      settingsUri: WINDOWS_SPEECH_SETTINGS_URI,
    };
  }
  if (preferredVoiceUri) {
    const exact = list.find(
      (v) => v?.voiceURI === preferredVoiceUri || v?.name === preferredVoiceUri,
    );
    if (exact) {
      return { voice: exact, hasLanguageVoice: true, settingsUri: WINDOWS_SPEECH_SETTINGS_URI };
    }
  }
  const baseLang = String(uiLang || 'tr')
    .toLowerCase()
    .split('-')[0];
  const langMatches = list.filter((v) =>
    String(v?.lang || '')
      .toLowerCase()
      .startsWith(baseLang),
  );
  if (langMatches.length === 0) {
    return {
      voice: null,
      hasLanguageVoice: false,
      settingsUri: WINDOWS_SPEECH_SETTINGS_URI,
    };
  }
  // Prefer local Windows OneCore / Natural voices first
  const localMatch = langMatches.find((v) => v.localService !== false) || langMatches[0];
  return {
    voice: localMatch,
    hasLanguageVoice: true,
    settingsUri: WINDOWS_SPEECH_SETTINGS_URI,
  };
}

module.exports = {
  MAX_SPOKEN_CHARS,
  WINDOWS_SPEECH_SETTINGS_URI,
  prepareSpokenSummary,
  selectPreferredVoice,
};
