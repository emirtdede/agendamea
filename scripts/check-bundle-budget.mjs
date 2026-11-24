import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const distDir = path.join(rootDir, 'dist');
const assetsDir = path.join(distDir, 'assets');
const serverOut = path.join(rootDir, 'dist-server', 'server.mjs');
const indexHtmlPath = path.join(distDir, 'index.html');

const BUDGETS = {
  i18nCoreRawKb: 130,
  i18nCoreGzipKb: 45,
  mainEntryRawKb: 500,
  mainEntryGzipKb: 115,
  serverBundleRawKb: 2800,
};

function fail(msg) {
  console.error(`[bundle-budget] FAIL: ${msg}`);
  process.exit(1);
}

if (!fs.existsSync(assetsDir) || !fs.existsSync(indexHtmlPath)) {
  fail('dist/ assets not found. Run `npm run build` before checking bundle budgets.');
}
if (!fs.existsSync(serverOut)) {
  fail('dist-server/server.mjs not found. Run `npm run build:server` first.');
}

const files = fs.readdirSync(assetsDir);
const checkChunk = (prefix, maxRawKb, maxGzipKb) => {
  const match = files.find((f) => f.startsWith(prefix) && f.endsWith('.js'));
  if (!match) fail(`Expected chunk "${prefix}*.js" not found in dist/assets`);
  const buf = fs.readFileSync(path.join(assetsDir, match));
  const rawKb = buf.length / 1024;
  const gzipKb = zlib.gzipSync(buf).length / 1024;
  console.log(
    `[bundle-budget] ${match}: ${rawKb.toFixed(1)} KB raw (max ${maxRawKb} KB) | ${gzipKb.toFixed(1)} KB gzip (max ${maxGzipKb} KB)`,
  );
  if (rawKb > maxRawKb) fail(`${match} raw size ${rawKb.toFixed(1)} KB exceeds ${maxRawKb} KB`);
  if (gzipKb > maxGzipKb)
    fail(`${match} gzip size ${gzipKb.toFixed(1)} KB exceeds ${maxGzipKb} KB`);
};

checkChunk('i18n-core-', BUDGETS.i18nCoreRawKb, BUDGETS.i18nCoreGzipKb);
checkChunk('main-', BUDGETS.mainEntryRawKb, BUDGETS.mainEntryGzipKb);

const serverRawKb = fs.statSync(serverOut).size / 1024;
console.log(
  `[bundle-budget] dist-server/server.mjs: ${serverRawKb.toFixed(1)} KB raw (max ${BUDGETS.serverBundleRawKb} KB)`,
);
if (serverRawKb > BUDGETS.serverBundleRawKb) {
  fail(
    `dist-server/server.mjs ${serverRawKb.toFixed(1)} KB exceeds ${BUDGETS.serverBundleRawKb} KB`,
  );
}

// Verify zero non-core locale chunks are eagerly preloaded in index.html
const indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');
const preloads = [...indexHtml.matchAll(/href="\/assets\/([^"]+\.js)"/g)].map((m) => m[1]);
const leakedLocales = preloads.filter((f) => /^[a-z]{2}(?:-[A-Z]{2})?-[A-Za-z0-9_-]+\.js$/.test(f));
if (leakedLocales.length > 0) {
  fail(`Non-core locale chunks eagerly preloaded in dist/index.html: ${leakedLocales.join(', ')}`);
}

console.log(`[bundle-budget] PASS (${preloads.length} preloaded core scripts, 0 locale leaks).`);
