import { build } from 'esbuild';

await build({
  entryPoints: ['server.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  external: ['better-sqlite3', 'vite', 'node-llama-cpp', '@fugood/whisper.node', 'pino', 'zod'],
  banner: {
    js: "import { createRequire } from 'node:module'; import { fileURLToPath as __agFileURLToPath } from 'node:url'; import { dirname as __agDirname } from 'node:path'; const require = createRequire(import.meta.url); const __filename = __agFileURLToPath(import.meta.url); const __dirname = __agDirname(__filename);",
  },
  outfile: 'dist-server/server.mjs',
});
