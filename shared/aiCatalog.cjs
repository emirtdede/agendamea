'use strict';

/**
 * WBS-1.2: Live-Verified Immutable Local AI Model Catalog (100% Apache 2.0 / MIT, Single-File)
 * + Hardware Tier Recommendation Engine + Live Ollama / LM Studio Auto-Detection.
 * Zero GPLv3 / zero non-commercial / zero split-GGUF models.
 */

const { classifyHardwareTier } = require('./hardwareProfiler.cjs');

const ALLOWED_LICENSES = new Set(['mit', 'apache-2.0']);

const MODEL_CATALOG = Object.freeze([
  Object.freeze({
    id: 'whisper-base-q5_1',
    role: 'stt',
    tier: 'tier-light',
    label: 'Whisper Base (Q5_1)',
    repo: 'ggerganov/whisper.cpp',
    file: 'ggml-base-q5_1.bin',
    license: 'mit',
    bytes: 59707625,
    commit: '5359861c739e955e79d9a303bcbc70fb988958b1',
    sha256: '422f1ae452ade6f30a004d7e5c6a43195e4433bc370bf23fac9cc591f01a8898',
    split: false,
    minRamGb: 4,
    minVramGb: 0,
    languages: '99+',
  }),
  Object.freeze({
    id: 'qwen3-0.6b-q8_0',
    role: 'llm',
    tier: 'tier-light',
    label: 'Qwen3 0.6B (Q8_0)',
    repo: 'Qwen/Qwen3-0.6B-GGUF',
    file: 'Qwen3-0.6B-Q8_0.gguf',
    license: 'apache-2.0',
    bytes: 639446688,
    commit: '23749fefcc72300e3a2ad315e1317431b06b590a',
    sha256: '9465e63a22add5354d9bb4b99e90117043c7124007664907259bd16d043bb031',
    split: false,
    minRamGb: 4,
    minVramGb: 0,
    languages: '100+',
  }),
  Object.freeze({
    id: 'qwen3-1.7b-q8_0',
    role: 'llm',
    tier: 'tier-light-plus',
    label: 'Qwen3 1.7B (Q8_0)',
    repo: 'Qwen/Qwen3-1.7B-GGUF',
    file: 'Qwen3-1.7B-Q8_0.gguf',
    license: 'apache-2.0',
    bytes: 1834426016,
    commit: '90862c4b9d2787eaed51d12237eafdfe7c5f6077',
    sha256: '061b54daade076b5d3362dac252678d17da8c68f07560be70818cace6590cb1a',
    split: false,
    minRamGb: 8,
    minVramGb: 0,
    languages: '100+',
  }),
  Object.freeze({
    id: 'whisper-small-q5_1',
    role: 'stt',
    tier: 'tier-medium',
    label: 'Whisper Small (Q5_1)',
    repo: 'ggerganov/whisper.cpp',
    file: 'ggml-small-q5_1.bin',
    license: 'mit',
    bytes: 190085487,
    commit: '5359861c739e955e79d9a303bcbc70fb988958b1',
    sha256: 'ae85e4a935d7a567bd102fe55afc16bb595bdb618e11b2fc7591bc08120411bb',
    split: false,
    minRamGb: 8,
    minVramGb: 0,
    languages: '99+',
  }),
  Object.freeze({
    id: 'qwen3-4b-q4_k_m',
    role: 'llm',
    tier: 'tier-medium',
    label: 'Qwen3 4B (Q4_K_M)',
    repo: 'Qwen/Qwen3-4B-GGUF',
    file: 'Qwen3-4B-Q4_K_M.gguf',
    license: 'apache-2.0',
    bytes: 2497280256,
    commit: 'bc640142c66e1fdd12af0bd68f40445458f3869b',
    sha256: '7485fe6f11af29433bc51cab58009521f205840f5b4ae3a32fa7f92e8534fdf5',
    split: false,
    minRamGb: 12,
    minVramGb: 4,
    languages: '100+',
  }),
  Object.freeze({
    id: 'whisper-large-v3-turbo-q5_0',
    role: 'stt',
    tier: 'tier-strong',
    label: 'Whisper Large v3 Turbo (Q5_0)',
    repo: 'ggerganov/whisper.cpp',
    file: 'ggml-large-v3-turbo-q5_0.bin',
    license: 'mit',
    bytes: 574041195,
    commit: '5359861c739e955e79d9a303bcbc70fb988958b1',
    sha256: '394221709cd5ad1f40c46e6031ca61bce88931e6e088c188294c6d5a55ffa7e2',
    split: false,
    minRamGb: 16,
    minVramGb: 4,
    languages: '99+',
  }),
  Object.freeze({
    id: 'qwen3-8b-q4_k_m',
    role: 'llm',
    tier: 'tier-strong',
    label: 'Qwen3 8B (Q4_K_M)',
    repo: 'Qwen/Qwen3-8B-GGUF',
    file: 'Qwen3-8B-Q4_K_M.gguf',
    license: 'apache-2.0',
    bytes: 5027783488,
    commit: '7c41481f57cb95916b40956ab2f0b139b296d974',
    sha256: 'd98cdcbd03e17ce47681435b5150e34c1417f50b5c0019dd560e4882c5745785',
    split: false,
    minRamGb: 16,
    minVramGb: 8,
    languages: '100+',
  }),
  Object.freeze({
    id: 'multilingual-e5-small-q8_0',
    role: 'embed',
    tier: 'tier-light',
    label: 'Multilingual E5 Small (Q8_0, 384d)',
    repo: 'cstr/multilingual-e5-small-GGUF',
    file: 'multilingual-e5-small-q8_0.gguf',
    license: 'mit',
    bytes: 131624960,
    commit: '178420da727e544c2689e89b6648b205ad176eda',
    sha256: '0a34067a40f25d3149b36885faa62bee0e5284d0f9edc102acfc00e115d953e8',
    split: false,
    dims: 384,
    minRamGb: 4,
    minVramGb: 0,
    languages: '90+',
  }),
  Object.freeze({
    id: 'qwen3-embedding-0.6b-q8_0',
    role: 'embed',
    tier: 'tier-strong',
    label: 'Qwen3 Embedding 0.6B (Q8_0, 1024d)',
    repo: 'Qwen/Qwen3-Embedding-0.6B-GGUF',
    file: 'Qwen3-Embedding-0.6B-Q8_0.gguf',
    license: 'apache-2.0',
    bytes: 639150592,
    commit: '370f27d7550e0def9b39c1f16d3fbaa13aa67728',
    sha256: '06507c7b42688469c4e7298b0a1e16deff06caf291cf0a5b278c308249c3e439',
    split: false,
    dims: 1024,
    minRamGb: 16,
    minVramGb: 0,
    languages: '100+',
  }),
]);

/** @type {Record<string, any>} */
const MODELS_BY_ID = Object.freeze(
  MODEL_CATALOG.reduce((/** @type {Record<string, any>} */ acc, model) => {
    acc[model.id] = model;
    return acc;
  }, {}),
);

const TIER_BUNDLES = Object.freeze({
  'tier-light': Object.freeze({
    id: 'tier-light',
    sttModelId: 'whisper-base-q5_1',
    llmModelId: 'qwen3-0.6b-q8_0',
    embedModelId: 'multilingual-e5-small-q8_0',
    minRamGb: 4,
    minVramGb: 0,
  }),
  'tier-medium': Object.freeze({
    id: 'tier-medium',
    sttModelId: 'whisper-small-q5_1',
    llmModelId: 'qwen3-4b-q4_k_m',
    embedModelId: 'multilingual-e5-small-q8_0',
    minRamGb: 12,
    minVramGb: 4,
  }),
  'tier-strong': Object.freeze({
    id: 'tier-strong',
    sttModelId: 'whisper-large-v3-turbo-q5_0',
    llmModelId: 'qwen3-8b-q4_k_m',
    embedModelId: 'qwen3-embedding-0.6b-q8_0',
    minRamGb: 16,
    minVramGb: 8,
  }),
});

/**
 * Hardware-aware ready profiles:
 * - CPU / No-GPU (2 profiles): cpu-light, cpu-balanced
 * - Discrete GPU (5 tiers): gpu-very-weak, gpu-weak, gpu-balanced, gpu-strong, gpu-ultra
 */
const AI_PROFILE_PRESETS = Object.freeze({
  'cpu-light': Object.freeze({
    id: 'cpu-light',
    group: 'cpu',
    legacyTier: 'tier-light',
    sttModelId: 'whisper-base-q5_1',
    llmModelId: 'qwen3-0.6b-q8_0',
    embedModelId: 'multilingual-e5-small-q8_0',
    minRamGb: 4,
    minVramGb: 0,
  }),
  'cpu-balanced': Object.freeze({
    id: 'cpu-balanced',
    group: 'cpu',
    legacyTier: 'tier-light',
    sttModelId: 'whisper-small-q5_1',
    llmModelId: 'qwen3-1.7b-q8_0',
    embedModelId: 'multilingual-e5-small-q8_0',
    minRamGb: 8,
    minVramGb: 0,
  }),
  'gpu-very-weak': Object.freeze({
    id: 'gpu-very-weak',
    group: 'gpu',
    legacyTier: 'tier-light',
    sttModelId: 'whisper-base-q5_1',
    llmModelId: 'qwen3-0.6b-q8_0',
    embedModelId: 'multilingual-e5-small-q8_0',
    minRamGb: 4,
    minVramGb: 2,
  }),
  'gpu-weak': Object.freeze({
    id: 'gpu-weak',
    group: 'gpu',
    legacyTier: 'tier-light',
    sttModelId: 'whisper-small-q5_1',
    llmModelId: 'qwen3-1.7b-q8_0',
    embedModelId: 'multilingual-e5-small-q8_0',
    minRamGb: 8,
    minVramGb: 4,
  }),
  'gpu-balanced': Object.freeze({
    id: 'gpu-balanced',
    group: 'gpu',
    legacyTier: 'tier-medium',
    sttModelId: 'whisper-small-q5_1',
    llmModelId: 'qwen3-4b-q4_k_m',
    embedModelId: 'multilingual-e5-small-q8_0',
    minRamGb: 12,
    minVramGb: 6,
  }),
  'gpu-strong': Object.freeze({
    id: 'gpu-strong',
    group: 'gpu',
    legacyTier: 'tier-medium',
    sttModelId: 'whisper-large-v3-turbo-q5_0',
    llmModelId: 'qwen3-4b-q4_k_m',
    embedModelId: 'qwen3-embedding-0.6b-q8_0',
    minRamGb: 16,
    minVramGb: 8,
  }),
  'gpu-ultra': Object.freeze({
    id: 'gpu-ultra',
    group: 'gpu',
    legacyTier: 'tier-strong',
    sttModelId: 'whisper-large-v3-turbo-q5_0',
    llmModelId: 'qwen3-8b-q4_k_m',
    embedModelId: 'qwen3-embedding-0.6b-q8_0',
    minRamGb: 16,
    minVramGb: 12,
  }),
});

const AI_PROFILE_ORDER = Object.freeze([
  'cpu-light',
  'cpu-balanced',
  'gpu-very-weak',
  'gpu-weak',
  'gpu-balanced',
  'gpu-strong',
  'gpu-ultra',
]);

function buildDownloadUrl(model) {
  if (!model?.repo || !model.commit || !model.file) {
    throw new Error('Invalid model catalog specification.');
  }
  return `https://huggingface.co/${model.repo}/resolve/${model.commit}/${model.file}?download=true`;
}

function assertAllowedModelLicense(model) {
  if (!model || typeof model !== 'object') {
    throw new Error('DISALLOWED_LICENSE: Missing model descriptor.');
  }
  const lic = String(model.license || '').toLowerCase();
  if (!ALLOWED_LICENSES.has(lic)) {
    throw new Error(
      `DISALLOWED_LICENSE: Model "${model.id || 'unknown'}" has disallowed license "${model.license}".`,
    );
  }
  if (model.split === true) {
    throw new Error(
      `SPLIT_MODEL_NOT_ALLOWED: Model "${model.id || 'unknown'}" must be a single file.`,
    );
  }
  if (!/^[a-f0-9]{40}$/i.test(String(model.commit || ''))) {
    throw new Error(`INVALID_COMMIT_PIN: Model "${model.id || 'unknown'}" commit must be 40-hex.`);
  }
  if (!/^[a-f0-9]{64}$/i.test(String(model.sha256 || ''))) {
    throw new Error(`INVALID_SHA256_PIN: Model "${model.id || 'unknown'}" sha256 must be 64-hex.`);
  }
  return true;
}

function validateCatalogIntegrity(catalog = MODEL_CATALOG) {
  const errors = [];
  for (const m of catalog) {
    try {
      assertAllowedModelLicense(m);
      if (!(Number.isInteger(m.bytes) && m.bytes > 0)) {
        errors.push(`Model "${m.id}" has invalid byte count.`);
      }
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }
  return { ok: errors.length === 0, errors };
}

function getTierBundle(tierId) {
  const bundle = TIER_BUNDLES[tierId] || AI_PROFILE_PRESETS[tierId] || TIER_BUNDLES['tier-light'];
  const stt = MODELS_BY_ID[bundle.sttModelId];
  const llm = MODELS_BY_ID[bundle.llmModelId];
  const embed = MODELS_BY_ID[bundle.embedModelId];
  return {
    ...bundle,
    stt,
    llm,
    embed,
    totalBytes: (stt?.bytes || 0) + (llm?.bytes || 0) + (embed?.bytes || 0),
    modelIds: [bundle.sttModelId, bundle.llmModelId, bundle.embedModelId],
  };
}

function getProfilePreset(profileId) {
  const preset = AI_PROFILE_PRESETS[profileId];
  if (!preset) return getTierBundle(profileId);
  const stt = MODELS_BY_ID[preset.sttModelId];
  const llm = MODELS_BY_ID[preset.llmModelId];
  const embed = MODELS_BY_ID[preset.embedModelId];
  return {
    ...preset,
    stt,
    llm,
    embed,
    totalBytes: (stt?.bytes || 0) + (llm?.bytes || 0) + (embed?.bytes || 0),
    modelIds: [preset.sttModelId, preset.llmModelId, preset.embedModelId],
  };
}

function recommendProfileForHardware(profile) {
  const ramGb = Number(profile?.ramGb || 0);
  const vramGb = Number(profile?.vramGb || 0);
  const hasDiscreteGpu = Boolean(profile?.hasDiscreteGpu) && vramGb >= 2;
  if (!hasDiscreteGpu) {
    return {
      group: 'cpu',
      profileId: ramGb >= 10 ? 'cpu-balanced' : 'cpu-light',
    };
  }
  if (vramGb >= 12 && ramGb >= 16) return { group: 'gpu', profileId: 'gpu-ultra' };
  if (vramGb >= 8 && ramGb >= 16) return { group: 'gpu', profileId: 'gpu-strong' };
  if (vramGb >= 6 && ramGb >= 12) return { group: 'gpu', profileId: 'gpu-balanced' };
  if (vramGb >= 4 && ramGb >= 8) return { group: 'gpu', profileId: 'gpu-weak' };
  return { group: 'gpu', profileId: 'gpu-very-weak' };
}

function validateCustomProfileSelection(selection) {
  const sttId = typeof selection?.sttModelId === 'string' ? selection.sttModelId.trim() : '';
  const llmId = typeof selection?.llmModelId === 'string' ? selection.llmModelId.trim() : '';
  const embedId = typeof selection?.embedModelId === 'string' ? selection.embedModelId.trim() : '';

  const stt = sttId ? MODELS_BY_ID[sttId] : null;
  const llm = llmId ? MODELS_BY_ID[llmId] : null;
  const embed = embedId ? MODELS_BY_ID[embedId] : null;

  const missingRoles = [];
  if (stt?.role !== 'stt') missingRoles.push('stt');
  if (llm?.role !== 'llm') missingRoles.push('llm');
  if (embed?.role !== 'embed') missingRoles.push('embed');

  if (missingRoles.length > 0) {
    return {
      ok: false,
      code: 'CUSTOM_PROFILE_INCOMPLETE',
      missingRoles,
      totalBytes: 0,
      modelIds: [],
    };
  }

  return {
    ok: true,
    code: null,
    missingRoles: [],
    sttModelId: stt.id,
    llmModelId: llm.id,
    embedModelId: embed.id,
    stt,
    llm,
    embed,
    totalBytes: (stt.bytes || 0) + (llm.bytes || 0) + (embed.bytes || 0),
    modelIds: [stt.id, llm.id, embed.id],
  };
}

function evaluateModelFit(model, profile) {
  const ramGb = Number(profile?.ramGb || 0);
  const vramGb = Number(profile?.vramGb || 0);
  const freeDiskBytes =
    typeof profile?.freeDiskBytes === 'number' && Number.isFinite(profile.freeDiskBytes)
      ? profile.freeDiskBytes
      : null;

  if (freeDiskBytes !== null && freeDiskBytes < model.bytes * 2) {
    return { fitsHardware: false, warningCode: 'INSUFFICIENT_DISK_SPACE' };
  }
  if (model.minVramGb > 0 && vramGb < model.minVramGb && ramGb < model.minRamGb) {
    return { fitsHardware: false, warningCode: 'INSUFFICIENT_VRAM_AND_RAM' };
  }
  if (ramGb < model.minRamGb) {
    return { fitsHardware: false, warningCode: 'INSUFFICIENT_RAM' };
  }
  if (model.minVramGb > 0 && vramGb < model.minVramGb) {
    return { fitsHardware: true, warningCode: 'CPU_SLOW_WARNING' };
  }
  return { fitsHardware: true, warningCode: null };
}

async function probeJsonUrl(url, fetchFn, timeoutMs = 1200) {
  const fn = fetchFn || globalThis.fetch;
  if (typeof fn !== 'function') return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  if (typeof timer.unref === 'function') timer.unref();
  try {
    const res = await fn(url, {
      method: 'GET',
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!res?.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function detectExternalBackends(options = {}) {
  const ollamaBase = String(
    options.ollamaBaseUrl || process.env.AGENDAMEA_OLLAMA_URL || 'http://127.0.0.1:11434',
  ).replace(/\/+$/, '');
  const lmStudioBase = String(
    options.lmStudioBaseUrl || process.env.AGENDAMEA_LMSTUDIO_URL || 'http://127.0.0.1:1234',
  ).replace(/\/+$/, '');
  const timeoutMs =
    typeof options.timeoutMs === 'number' && options.timeoutMs > 0 ? options.timeoutMs : 1200;

  const [ollamaJson, lmJson] = await Promise.all([
    probeJsonUrl(`${ollamaBase}/api/tags`, options.fetchFn, timeoutMs),
    probeJsonUrl(`${lmStudioBase}/v1/models`, options.fetchFn, timeoutMs),
  ]);

  const ollamaModels = Array.isArray(ollamaJson?.models)
    ? ollamaJson.models.map((m) => String(m?.name || m?.model || '').trim()).filter(Boolean)
    : [];
  const lmStudioModels = Array.isArray(lmJson?.data)
    ? lmJson.data.map((m) => String(m?.id || '').trim()).filter(Boolean)
    : [];

  return {
    externalOllama: {
      detected: ollamaJson !== null,
      baseUrl: ollamaBase,
      models: ollamaModels,
      downloadBytes: 0,
    },
    externalLmStudio: {
      detected: lmJson !== null,
      baseUrl: lmStudioBase,
      models: lmStudioModels,
      downloadBytes: 0,
    },
  };
}

/**
 * @param {any} profile
 * @param {any} [externalBackends]
 */
function selectTierRecommendation(profile, externalBackends = null) {
  const hardwareTier =
    profile?.recommendedTier ||
    classifyHardwareTier(profile || { ramGb: 8, vramGb: 0, hasDiscreteGpu: false });

  const ollamaDetected = Boolean(externalBackends?.externalOllama?.detected);
  const ollamaHasModels =
    ollamaDetected &&
    Array.isArray(externalBackends?.externalOllama?.models) &&
    externalBackends.externalOllama.models.length > 0;
  const lmDetected = Boolean(externalBackends?.externalLmStudio?.detected);
  const lmHasModels =
    lmDetected &&
    Array.isArray(externalBackends?.externalLmStudio?.models) &&
    externalBackends.externalLmStudio.models.length > 0;

  const modelsWithFit = MODEL_CATALOG.map((m) => ({
    ...m,
    url: buildDownloadUrl(m),
    ...evaluateModelFit(m, profile),
  }));

  const tiers = ['tier-light', 'tier-medium', 'tier-strong'].map((tid) => {
    const bundle = getTierBundle(tid);
    const llmFit = evaluateModelFit({ ...bundle.llm, bytes: bundle.totalBytes }, profile);
    return {
      ...bundle,
      recommended: tid === hardwareTier,
      fitsHardware: llmFit.fitsHardware,
      warningCode: llmFit.warningCode,
    };
  });

  const recProfile = recommendProfileForHardware(profile);
  const profiles = AI_PROFILE_ORDER.map((pid) => {
    const preset = getProfilePreset(pid);
    const fit = evaluateModelFit(
      {
        minRamGb: preset.minRamGb,
        minVramGb: preset.group === 'gpu' ? preset.minVramGb : 0,
        bytes: preset.totalBytes,
      },
      profile,
    );
    return {
      id: preset.id,
      group: preset.group,
      legacyTier: preset.legacyTier,
      minRamGb: preset.minRamGb,
      minVramGb: preset.minVramGb,
      sttModelId: preset.sttModelId,
      llmModelId: preset.llmModelId,
      embedModelId: preset.embedModelId,
      totalBytes: preset.totalBytes,
      recommended: preset.id === recProfile.profileId,
      fitsHardware: fit.fitsHardware,
      warningCode: fit.warningCode,
    };
  });

  const recommendedOptions = [];
  if (ollamaHasModels) {
    recommendedOptions.push({
      id: 'external-ollama',
      kind: 'external',
      downloadBytes: 0,
      recommended: true,
      models: externalBackends.externalOllama.models,
    });
  } else if (lmHasModels) {
    recommendedOptions.push({
      id: 'external-lmstudio',
      kind: 'external',
      downloadBytes: 0,
      recommended: true,
      models: externalBackends.externalLmStudio.models,
    });
  }
  for (const t of tiers) {
    recommendedOptions.push({
      id: t.id,
      kind: 'local-gguf',
      downloadBytes: t.totalBytes,
      recommended: !ollamaHasModels && !lmHasModels && t.id === hardwareTier,
      fitsHardware: t.fitsHardware,
      warningCode: t.warningCode,
    });
  }

  return {
    recommendedTier: hardwareTier,
    recommendedProfileId: recProfile.profileId,
    recommendedProfileGroup: recProfile.group,
    primaryOptionId: ollamaHasModels
      ? 'external-ollama'
      : lmHasModels
        ? 'external-lmstudio'
        : hardwareTier,
    preferExternalOllama: ollamaHasModels,
    preferExternalLmStudio: !ollamaHasModels && lmHasModels,
    externalOllama: externalBackends?.externalOllama || {
      detected: false,
      baseUrl: 'http://127.0.0.1:11434',
      models: [],
      downloadBytes: 0,
    },
    externalLmStudio: externalBackends?.externalLmStudio || {
      detected: false,
      baseUrl: 'http://127.0.0.1:1234',
      models: [],
      downloadBytes: 0,
    },
    tiers,
    profiles,
    models: modelsWithFit,
    recommendedOptions,
  };
}

module.exports = {
  ALLOWED_LICENSES,
  MODEL_CATALOG,
  MODELS_BY_ID,
  TIER_BUNDLES,
  AI_PROFILE_PRESETS,
  AI_PROFILE_ORDER,
  buildDownloadUrl,
  assertAllowedModelLicense,
  validateCatalogIntegrity,
  getTierBundle,
  getProfilePreset,
  recommendProfileForHardware,
  validateCustomProfileSelection,
  evaluateModelFit,
  detectExternalBackends,
  selectTierRecommendation,
};
