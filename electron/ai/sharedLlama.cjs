'use strict';

/**
 * Shared ref-counted node-llama-cpp runtime manager.
 * Prevents LLM and Embedding services from spawning duplicate Vulkan/CPU Llama runtimes
 * and cleanly calls `llama.dispose()` when both services unload on idle (reclaiming 50-180 MB RAM/VRAM).
 */

let sharedModule = null;
let sharedLlama = null;
let sharedGpuFallbackUsed = false;
let refCount = 0;
let initPromise = null;

async function acquireSharedLlama(importer) {
  if (sharedLlama) {
    refCount += 1;
    return { mod: sharedModule, llama: sharedLlama, gpuFallbackUsed: sharedGpuFallbackUsed };
  }
  if (!initPromise) {
    initPromise = (async () => {
      const mod = sharedModule || (await importer());
      if (!mod || typeof mod.getLlama !== 'function') {
        throw new Error('LLAMA_ENGINE_UNAVAILABLE');
      }
      sharedModule = mod;
      try {
        sharedLlama = await mod.getLlama({ gpu: 'vulkan' });
        sharedGpuFallbackUsed = false;
      } catch {
        sharedLlama = await mod.getLlama({ gpu: false });
        sharedGpuFallbackUsed = true;
      }
      return { mod: sharedModule, llama: sharedLlama, gpuFallbackUsed: sharedGpuFallbackUsed };
    })().finally(() => {
      initPromise = null;
    });
  }
  const res = await initPromise;
  refCount += 1;
  return res;
}

async function releaseSharedLlama() {
  if (refCount > 0) {
    refCount -= 1;
  }
  if (refCount === 0 && sharedLlama) {
    const toDispose = sharedLlama;
    sharedLlama = null;
    sharedGpuFallbackUsed = false;
    if (typeof toDispose.dispose === 'function') {
      try {
        await toDispose.dispose();
      } catch {
        // Ignore dispose failure on shutdown
      }
    }
  }
}

module.exports = {
  acquireSharedLlama,
  releaseSharedLlama,
};
