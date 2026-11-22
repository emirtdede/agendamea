import { build } from 'esbuild';

await build({
  entryPoints: ['server.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  external: ['better-sqlite3', 'vite', 'node-llama-cpp', '@fugood/whisper.node'],
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
  outfile: 'dist-server/server.mjs',
});
