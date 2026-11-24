import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import test from 'node:test';
import aiCatalog from '../../shared/aiCatalog.cjs';
import hardwareProfiler from '../../shared/hardwareProfiler.cjs';
import { SUPPORTED_LANGUAGES } from '../../src/i18n/languages';
import { getDictionary } from '../../src/i18n/localesWorld';

const GIB = 1024 * 1024 * 1024;

test('WBS-1.1: 64-bit VRAM (12 GB RTX), 8 GB iGPU, and hung PowerShell 3s fallback', async () => {
  // 1. 12 GB RTX via 64-bit qwMemorySize + 32 GB RAM -> tier-strong
  const rtxExec = (
    _file: string,
    _args: string[],
    _opts: unknown,
    cb: (err: Error | null, stdout: string) => void,
  ) => {
    cb(
      null,
      JSON.stringify({
        regGpus: [{ name: 'NVIDIA GeForce RTX 4070', qwMemorySize: 12884901888 }],
        cimGpus: [{ name: 'NVIDIA GeForce RTX 4070', adapterRam: 4293918720, vendor: 'NVIDIA' }],
      }),
    );
  };
  const rtxProfile = await hardwareProfiler.profileHardware({
    platform: 'win32',
    totalMemBytes: 32 * GIB,
    cpuList: Array.from({ length: 16 }, () => ({ model: 'AMD Ryzen 7 7800X3D' })),
    execFn: rtxExec,
    statfsFn: () => ({ bavail: 200 * 1024 * 256, bsize: 4096 }),
  });
  assert.equal(rtxProfile.vramGb, 12);
  assert.equal(rtxProfile.vramSource, 'registry-64bit');
  assert.equal(rtxProfile.recommendedTier, 'tier-strong');

  // 2. 8 GB RAM + 1 GB iGPU -> tier-light
  const igpuExec = (
    _file: string,
    _args: string[],
    _opts: unknown,
    cb: (err: Error | null, stdout: string) => void,
  ) => {
    cb(
      null,
      JSON.stringify({
        regGpus: [],
        cimGpus: [
          { name: 'Intel UHD Graphics', adapterRam: 1073741824, vendor: 'Intel Corporation' },
        ],
      }),
    );
  };
  const igpuProfile = await hardwareProfiler.profileHardware({
    platform: 'win32',
    totalMemBytes: 8 * GIB,
    cpuList: Array.from({ length: 4 }, () => ({ model: 'Intel Core i5-1135G7' })),
    execFn: igpuExec,
    statfsFn: () => ({ bavail: 50 * 1024 * 256, bsize: 4096 }),
  });
  assert.equal(igpuProfile.vramGb, 1);
  assert.equal(igpuProfile.recommendedTier, 'tier-light');

  // 3. Hung PowerShell (> 5s) aborts cleanly within timeoutMs and returns conservative tier-light
  const hungExec = () => ({
    kill() {
      /* noop */
    },
  });
  const t0 = performance.now();
  const fallbackProfile = await hardwareProfiler.profileHardware({
    platform: 'win32',
    totalMemBytes: 16 * GIB,
    timeoutMs: 250,
    execFn: hungExec,
  });
  const elapsed = performance.now() - t0;
  assert.ok(elapsed < 1200, `Timeout fallback took too long: ${elapsed}ms`);
  assert.equal(fallbackProfile.fallbackReason, 'powershell_timeout');
  assert.equal(fallbackProfile.recommendedTier, 'tier-light');
});

test('WBS-1.2: Catalog integrity (100% Apache 2.0 / MIT, 9 single-file models) & live Ollama detection', async () => {
  assert.equal(aiCatalog.MODEL_CATALOG.length, 9);
  const integrity = aiCatalog.validateCatalogIntegrity();
  assert.equal(integrity.ok, true, `Catalog errors: ${integrity.errors.join('; ')}`);

  for (const m of aiCatalog.MODEL_CATALOG) {
    assert.ok(
      m.license === 'mit' || m.license === 'apache-2.0',
      `Disallowed license on ${m.id}: ${m.license}`,
    );
    assert.match(m.commit, /^[a-f0-9]{40}$/i);
    assert.match(m.sha256, /^[a-f0-9]{64}$/i);
    assert.ok(m.bytes > 0);
    assert.equal(m.split, false);
  }

  // Fail-closed license rejection guard (R-03)
  assert.throws(
    () =>
      aiCatalog.assertAllowedModelLicense({
        id: 'bad-gpl',
        license: 'gpl-3.0',
        commit: 'a'.repeat(40),
        sha256: 'b'.repeat(64),
        split: false,
      }),
    /DISALLOWED_LICENSE/,
  );

  // Mock 127.0.0.1 Ollama /api/tags server
  const fakeOllama = http.createServer((req, res) => {
    if (req.url === '/api/tags') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ models: [{ name: 'qwen3:4b' }, { name: 'llama3.2:3b' }] }));
      return;
    }
    res.writeHead(404).end();
  });
  await new Promise<void>((resolve) => fakeOllama.listen(0, '127.0.0.1', () => resolve()));
  const ollamaPort = (fakeOllama.address() as { port: number }).port;
  try {
    const ext = await aiCatalog.detectExternalBackends({
      ollamaBaseUrl: `http://127.0.0.1:${ollamaPort}`,
      lmStudioBaseUrl: 'http://127.0.0.1:1',
      timeoutMs: 800,
    });
    assert.equal(ext.externalOllama.detected, true);
    assert.deepEqual(ext.externalOllama.models, ['qwen3:4b', 'llama3.2:3b']);

    const rec = aiCatalog.selectTierRecommendation(
      { ramGb: 16, vramGb: 6, recommendedTier: 'tier-medium' },
      ext,
    );
    assert.equal(rec.preferExternalOllama, true);
    assert.equal(rec.primaryOptionId, 'external-ollama');
    assert.equal(rec.recommendedOptions[0]?.id, 'external-ollama');
    assert.equal(rec.recommendedOptions[0]?.downloadBytes, 0);
  } finally {
    fakeOllama.close();
  }
});

test('WBS-5.3 & WBS-6.1: 73-language AI keys, zero Turkish leakage in new TSX, zero em/en dashes, MSIX microphone & CUDA exclusion', () => {
  // 1. All 73 languages have non-empty AI & Overlay dictionary keys with zero em/en dashes
  for (const lang of SUPPORTED_LANGUAGES) {
    const dict = getDictionary(lang.code);
    assert.ok(dict.settingsTabAi.length > 0, `Missing settingsTabAi in ${lang.code}`);
    assert.ok(
      dict.aiTierRecommendedBadge.length > 0,
      `Missing aiTierRecommendedBadge in ${lang.code}`,
    );
    assert.ok(
      dict.overlayListeningLabel.length > 0,
      `Missing overlayListeningLabel in ${lang.code}`,
    );
    for (const [k, v] of Object.entries(dict)) {
      assert.equal(
        /[\u2013\u2014]/.test(String(v)),
        false,
        `Em/en dash found in ${lang.code}.${k}`,
      );
    }
  }

  // 2. Zero Turkish characters in new TSX components
  for (const rel of [
    'src/components/settings/AiVoiceSettingsTab.tsx',
    'src/overlay/VoiceOverlayApp.tsx',
  ]) {
    const src = fs.readFileSync(path.join(process.cwd(), rel), 'utf8');
    assert.equal(/[ğüşıöçĞÜŞİÖÇ]/.test(src), false, `Turkish leakage detected in ${rel}`);
    assert.equal(/[\u2013\u2014]/.test(src), false, `Em/en dash detected in ${rel}`);
  }

  // 3. electron-builder.yml includes microphone capability & excludes CUDA + llama source tree
  const builderYml = fs.readFileSync(path.join(process.cwd(), 'electron-builder.yml'), 'utf8');
  assert.ok(builderYml.includes('- microphone'), 'MSIX must declare microphone capability');
  assert.ok(builderYml.includes('- internetClient'), 'MSIX must declare internetClient capability');
  assert.ok(
    builderYml.includes('!node_modules/node-llama-cpp/llama/gitRelease.bundle'),
    'Must exclude 37 MB llama C++ gitRelease.bundle while preserving binariesGithubRelease.json & grammars',
  );
  assert.equal(builderYml.includes('win-x64-cuda'), false, 'CUDA binaries must never be bundled');
});
