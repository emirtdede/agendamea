import type { UiDictionary } from '../i18n/translations';

export type OpenSourceCategoryId = 'core' | 'data' | 'ai' | 'models';

export interface OpenSourceComponentEntry {
  name: string;
  version: string;
  license: string;
  url: string;
  category: OpenSourceCategoryId;
}

export interface OpenSourceCategoryGroup {
  id: OpenSourceCategoryId;
  titleKey: keyof UiDictionary;
  items: readonly OpenSourceComponentEntry[];
}

/**
 * Audited open-source runtime components, voice/AI engines, and optional local models.
 * Synced directly against package.json, package-lock.json, shared/aiCatalog.cjs,
 * and shared/piperVoices.cjs. Zero GPL/AGPL/LGPL runtime dependencies.
 */
export const OPEN_SOURCE_COMPONENTS: readonly OpenSourceComponentEntry[] = [
  // Core Desktop & UI Runtime
  {
    name: 'Electron',
    version: '45.4.1',
    license: 'MIT',
    url: 'https://www.electronjs.org',
    category: 'core',
  },
  {
    name: 'React & React DOM',
    version: '19.3.1',
    license: 'MIT',
    url: 'https://react.dev',
    category: 'core',
  },
  {
    name: 'Tailwind CSS & @tailwindcss/vite',
    version: '4.3.5',
    license: 'MIT',
    url: 'https://tailwindcss.com',
    category: 'core',
  },
  {
    name: 'Lucide React',
    version: '0.546.0',
    license: 'ISC',
    url: 'https://lucide.dev',
    category: 'core',
  },
  {
    name: 'Vite',
    version: '8.3.8',
    license: 'MIT',
    url: 'https://vite.dev',
    category: 'core',
  },
  {
    name: '@vitejs/plugin-react',
    version: '6.3.0',
    license: 'MIT',
    url: 'https://github.com/vitejs/vite-plugin-react',
    category: 'core',
  },
  {
    name: 'Vite Plugin PWA',
    version: '2.0.0',
    license: 'MIT',
    url: 'https://vite-pwa-org.netlify.app',
    category: 'core',
  },
  {
    name: 'Electron Updater',
    version: '6.8.11',
    license: 'MIT',
    url: 'https://www.electron.build',
    category: 'core',
  },
  {
    name: '.NET 10 WPF (Windows Setup)',
    version: '10.0',
    license: 'MIT',
    url: 'https://github.com/dotnet/wpf',
    category: 'core',
  },

  // Local Data, Loopback Server & Validation
  {
    name: 'Better-SQLite3',
    version: '13.2.0',
    license: 'MIT',
    url: 'https://github.com/WiseLibs/better-sqlite3',
    category: 'data',
  },
  {
    name: 'SQLite',
    version: '3.x',
    license: 'Public Domain',
    url: 'https://www.sqlite.org',
    category: 'data',
  },
  {
    name: 'Express',
    version: '4.22.3',
    license: 'MIT',
    url: 'https://expressjs.com',
    category: 'data',
  },
  {
    name: 'Zod',
    version: '4.6.7',
    license: 'MIT',
    url: 'https://zod.dev',
    category: 'data',
  },
  {
    name: 'Pino',
    version: '10.4.0',
    license: 'MIT',
    url: 'https://getpino.io',
    category: 'data',
  },
  {
    name: 'esbuild',
    version: '0.28.2',
    license: 'MIT',
    url: 'https://esbuild.github.io',
    category: 'data',
  },

  // Local AI & Voice Engines
  {
    name: 'node-llama-cpp',
    version: '3.22.3',
    license: 'MIT',
    url: 'https://node-llama-cpp.withcat.ai',
    category: 'ai',
  },
  {
    name: '@fugood/whisper.node',
    version: '1.2.0-rc.2',
    license: 'MIT',
    url: 'https://github.com/fugood/whisper.node',
    category: 'ai',
  },
  {
    name: 'ONNX Runtime Web',
    version: '1.31.1',
    license: 'MIT',
    url: 'https://onnxruntime.ai',
    category: 'ai',
  },
  {
    name: '@ricky0123/vad-web (Silero VAD v5)',
    version: '0.0.31',
    license: 'ISC / MIT',
    url: 'https://github.com/ricky0123/vad',
    category: 'ai',
  },
  {
    name: '@sapphi-red/web-noise-suppressor (RNNoise)',
    version: '0.4.2',
    license: 'MIT / BSD-3-Clause',
    url: 'https://github.com/sapphi-red/web-noise-suppressor',
    category: 'ai',
  },
  {
    name: '@diffusionstudio/piper-wasm',
    version: '1.0.0',
    license: 'MIT',
    url: 'https://github.com/diffusionstudio/vits-web',
    category: 'ai',
  },

  // Optional On-Device AI Models & Voice Packs
  {
    name: 'Whisper.cpp (Base / Small / Large v3 Turbo)',
    version: 'GGML Q5',
    license: 'MIT',
    url: 'https://huggingface.co/ggerganov/whisper.cpp',
    category: 'models',
  },
  {
    name: 'Qwen3 (0.6B / 1.7B / 4B / 8B)',
    version: 'GGUF',
    license: 'Apache-2.0',
    url: 'https://huggingface.co/Qwen',
    category: 'models',
  },
  {
    name: 'Multilingual E5 Small (384d)',
    version: 'Q8_0',
    license: 'MIT',
    url: 'https://huggingface.co/cstr/multilingual-e5-small-GGUF',
    category: 'models',
  },
  {
    name: 'Qwen3 Embedding 0.6B (1024d)',
    version: 'Q8_0',
    license: 'Apache-2.0',
    url: 'https://huggingface.co/Qwen/Qwen3-Embedding-0.6B-GGUF',
    category: 'models',
  },
  {
    name: 'Piper TTS Voice: Ilkiz (tr-TR)',
    version: 'ONNX Medium',
    license: 'MIT',
    url: 'https://huggingface.co/ilkeraktuna/piper-tts-tr-ilkiz-medium',
    category: 'models',
  },
  {
    name: 'Piper TTS Voices: Fahrettin / Fettah / Joe',
    version: 'ONNX Medium',
    license: 'CC0-1.0',
    url: 'https://huggingface.co/rhasspy/piper-voices',
    category: 'models',
  },
  {
    name: 'Piper TTS Voice: Kristin (en-US)',
    version: 'ONNX Medium',
    license: 'Public Domain',
    url: 'https://huggingface.co/rhasspy/piper-voices',
    category: 'models',
  },
];

export const OPEN_SOURCE_GROUPS: readonly OpenSourceCategoryGroup[] = [
  {
    id: 'core',
    titleKey: 'aboutHealthRuntimeLabel',
    items: OPEN_SOURCE_COMPONENTS.filter((c) => c.category === 'core'),
  },
  {
    id: 'data',
    titleKey: 'aboutHealthDatabaseLabel',
    items: OPEN_SOURCE_COMPONENTS.filter((c) => c.category === 'data'),
  },
  {
    id: 'ai',
    titleKey: 'settingsTabAi',
    items: OPEN_SOURCE_COMPONENTS.filter((c) => c.category === 'ai'),
  },
  {
    id: 'models',
    titleKey: 'aiModelsSectionTitle',
    items: OPEN_SOURCE_COMPONENTS.filter((c) => c.category === 'models'),
  },
];
