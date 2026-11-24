import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'public', 'voice-assets');

const ASSETS = [
  {
    src: path.join(
      ROOT,
      'node_modules',
      '@sapphi-red',
      'web-noise-suppressor',
      'dist',
      'rnnoise.wasm',
    ),
    dest: path.join(OUT_DIR, 'rnnoise.wasm'),
  },
  {
    src: path.join(
      ROOT,
      'node_modules',
      '@sapphi-red',
      'web-noise-suppressor',
      'dist',
      'rnnoise_simd.wasm',
    ),
    dest: path.join(OUT_DIR, 'rnnoise_simd.wasm'),
  },
  {
    src: path.join(
      ROOT,
      'node_modules',
      '@sapphi-red',
      'web-noise-suppressor',
      'dist',
      'rnnoise',
      'workletProcessor.js',
    ),
    dest: path.join(OUT_DIR, 'rnnoise-worklet.js'),
  },
  {
    src: path.join(ROOT, 'node_modules', '@ricky0123', 'vad-web', 'dist', 'silero_vad_v5.onnx'),
    dest: path.join(OUT_DIR, 'silero_vad_v5.onnx'),
  },
  {
    src: path.join(ROOT, 'node_modules', 'onnxruntime-web', 'dist', 'ort-wasm-simd-threaded.wasm'),
    dest: path.join(OUT_DIR, 'ort-wasm-simd-threaded.wasm'),
  },
  {
    src: path.join(ROOT, 'node_modules', 'onnxruntime-web', 'dist', 'ort-wasm-simd-threaded.mjs'),
    dest: path.join(OUT_DIR, 'ort-wasm-simd-threaded.mjs'),
  },
  {
    src: path.join(
      ROOT,
      'node_modules',
      '@diffusionstudio',
      'piper-wasm',
      'build',
      'piper_phonemize.js',
    ),
    dest: path.join(OUT_DIR, 'piper_phonemize.js'),
  },
  {
    src: path.join(
      ROOT,
      'node_modules',
      '@diffusionstudio',
      'piper-wasm',
      'build',
      'piper_phonemize.wasm',
    ),
    dest: path.join(OUT_DIR, 'piper_phonemize.wasm'),
  },
  {
    src: path.join(
      ROOT,
      'node_modules',
      '@diffusionstudio',
      'piper-wasm',
      'build',
      'piper_phonemize.data',
    ),
    dest: path.join(OUT_DIR, 'piper_phonemize.data'),
  },
];

fs.mkdirSync(OUT_DIR, { recursive: true });

let copied = 0;
let totalBytes = 0;
for (const asset of ASSETS) {
  if (!fs.existsSync(asset.src)) {
    throw new Error(`Missing voice asset source: ${asset.src}`);
  }
  const srcStat = fs.statSync(asset.src);
  const needsCopy = !fs.existsSync(asset.dest) || fs.statSync(asset.dest).size !== srcStat.size;
  if (needsCopy) {
    fs.copyFileSync(asset.src, asset.dest);
    copied += 1;
  }
  totalBytes += srcStat.size;
}

console.log(
  `[sync-voice-assets] Ready: ${ASSETS.length} local offline assets (${(totalBytes / (1024 * 1024)).toFixed(2)} MB, ${copied} updated) -> public/voice-assets`,
);
