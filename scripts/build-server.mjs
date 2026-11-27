import { build } from 'esbuild';

await build({
  entryPoints: ['server.ts'],
  bundle: true,
  minify: true,
  treeShaking: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  external: ['better-sqlite3', 'vite', 'node-llama-cpp', '@fugood/whisper.node'],
  banner: {
    js: "import { createRequire } from 'node:module'; import { fileURLToPath as __agFileURLToPath } from 'node:url'; import { dirname as __agDirname } from 'node:path'; const require = createRequire(import.meta.url); const __filename = __agFileURLToPath(import.meta.url); const __dirname = __agDirname(__filename);",
  },
  outfile: 'dist-server/server.mjs',
});
