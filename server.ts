import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';
import express from 'express';
import { registerRequestLogger } from './server/middleware/requestLogger.ts';
import { isLoopbackAddress, registerSecurityMiddleware } from './server/middleware/security.ts';
import { registerAiRoutes } from './server/routes/ai.ts';
import { registerCoreRoutes } from './server/routes/core.ts';
import { registerMcpRoutes } from './server/routes/mcp.ts';
import { registerOneDriveRoutes } from './server/routes/onedrive.ts';
import { registerSecurityRoutes } from './server/routes/security.ts';
import { registerWebhookRoutes } from './server/routes/webhooks.ts';
import { createAiRuntimeService } from './server/services/aiRuntime.ts';
import { createAppLockService } from './server/services/appLock.ts';
import { createCloudSyncService } from './server/services/cloudSync.ts';
import { closeServerLogs, serverLogger } from './server/services/logger.ts';
import { createWebhookService } from './server/services/webhooks.ts';
import type { ServerContext } from './server/types.ts';
import sharedConstants from './shared/constants.cjs';
import crashDiagnostics from './shared/crashDiagnostics.cjs';
import versionMod from './shared/version.cjs';
import { TodoDatabase } from './src/db/database.ts';

const APP_VERSION = versionMod.APP_VERSION;
const GITHUB_RELEASES_API = sharedConstants.GITHUB_RELEASES_API;
const GITHUB_RELEASES_HTML = sharedConstants.GITHUB_RELEASES_HTML;
const MAX_SSE_CLIENTS = 32;

async function startServer() {
  const app = express();
  const httpServer = http.createServer(app);
  const db = new TodoDatabase();
  const PORT = Number(process.env.PORT) || 3000;
  const HOST = process.env.HOST || '127.0.0.1';
  let activeListenPort = PORT;

  const sseClients = new Set<express.Response>();
  function broadcastSseEvent(eventPayload: Record<string, unknown>): void {
    if (sseClients.size === 0) return;
    const payload = `data: ${JSON.stringify({ ...eventPayload, at: Date.now() })}\n\n`;
    for (const client of sseClients) {
      try {
        client.write(payload);
      } catch {
        sseClients.delete(client);
      }
    }
  }
  function broadcastExternalChange(reason: string): void {
    broadcastSseEvent({ type: 'changed', reason });
  }

  const aiDataDir = process.env.AGENDAMEA_DATA_DIR
    ? path.resolve(process.env.AGENDAMEA_DATA_DIR)
    : path.join(process.cwd(), 'data');

  const cloudSync = createCloudSyncService(db);
  const webhooks = createWebhookService({
    db,
    appVersion: APP_VERSION,
    getActiveListenPort: () => activeListenPort,
  });
  const aiRuntime = createAiRuntimeService({
    db,
    aiDataDir,
    broadcastSseEvent,
    dispatchConfiguredWebhook: webhooks.dispatchConfiguredWebhook,
  });
  const appLock = createAppLockService(db);

  registerRequestLogger(app);

  registerSecurityMiddleware({
    app,
    db,
    host: HOST,
    triggerOneDriveAutoSync: cloudSync.triggerOneDriveAutoSync,
    scheduleBackgroundRagSync: aiRuntime.scheduleBackgroundRagSync,
    broadcastExternalChange,
  });

  const ctx: ServerContext = {
    app,
    db,
    dataDir: aiDataDir,
    appVersion: APP_VERSION,
    githubReleasesApi: GITHUB_RELEASES_API,
    githubReleasesHtml: GITHUB_RELEASES_HTML,
    getActiveListenPort: () => activeListenPort,
    sseClients,
    maxSseClients: MAX_SSE_CLIENTS,
    broadcastSseEvent,
    broadcastExternalChange,
    cloudSync,
    webhooks,
    aiRuntime,
    appLock,
  };

  registerSecurityRoutes(ctx);
  const disposeCoreRoutes = registerCoreRoutes(ctx);
  registerWebhookRoutes(ctx);
  registerMcpRoutes(ctx);
  registerOneDriveRoutes(ctx);
  registerAiRoutes(ctx);

  let shutdownHandler: () => void = () => {
    // Reassigned once HTTP server starts listening
  };
  if (process.env.AGENDAMEA_HEADLESS_DAEMON === '1') {
    app.post('/api/server/shutdown', (req, res) => {
      if (!isLoopbackAddress(req.socket.remoteAddress)) {
        res.status(403).json({ error: 'Yalnızca yerel erişime izin verilir.' });
        return;
      }
      res.json({ ok: true, stopping: true, pid: process.pid });
      setTimeout(() => shutdownHandler(), 40);
    });
  }

  app.all('/api/*', (_req, res) => {
    res.status(404).json({ error: 'API uç noktası bulunamadı.' });
  });

  app.use(
    (err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      if (err instanceof SyntaxError && 'body' in err) {
        res.status(400).json({ error: 'Geçersiz JSON formatı.' });
        return;
      }
      const typedErr = err as { type?: string; status?: number };
      if (typedErr?.type === 'entity.too.large' || typedErr?.status === 413) {
        res.status(413).json({ error: 'İstek boyutu çok büyük (en fazla 5 MB).' });
        return;
      }
      serverLogger.error({ err }, 'Unhandled Express error');
      crashDiagnostics.writeCrashReport({
        source: 'express-middleware',
        error: err,
        dataDir: aiDataDir,
      });
      res.status(500).json({ error: 'Beklenmeyen bir sunucu hatası oluştu.' });
    },
  );

  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const appRoot = process.env.AGENDAMEA_APP_ROOT
    ? path.resolve(process.env.AGENDAMEA_APP_ROOT)
    : fs.existsSync(path.resolve(currentDir, 'dist'))
      ? currentDir
      : path.resolve(currentDir, '..');
  const distDir = path.join(appRoot, 'dist');
  const hasDistDir = fs.existsSync(distDir);
  const isProd =
    process.env.NODE_ENV === 'production' || process.env.AGENDAMEA_HEADLESS_DAEMON === '1';

  let viteServer: { close: () => Promise<void> } | null = null;

  if (isProd) {
    interface InMemoryAsset {
      raw: Buffer;
      gzip: Buffer | null;
      contentType: string;
      immutable: boolean;
      compressible: boolean;
    }

    const RTL_LANGS = new Set(['ar', 'fa', 'he', 'ur']);
    const MIME_BY_EXT: Record<string, string> = {
      '.html': 'text/html; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.mjs': 'application/javascript; charset=utf-8',
      '.wasm': 'application/wasm',
      '.onnx': 'application/octet-stream',
      '.data': 'application/octet-stream',
      '.css': 'text/css; charset=utf-8',
      '.svg': 'image/svg+xml',
      '.json': 'application/json; charset=utf-8',
      '.webmanifest': 'application/manifest+json; charset=utf-8',
      '.xml': 'application/xml; charset=utf-8',
      '.png': 'image/png',
      '.ico': 'image/x-icon',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.webp': 'image/webp',
      '.woff2': 'font/woff2',
      '.woff': 'font/woff',
      '.txt': 'text/plain; charset=utf-8',
    };
    const COMPRESSIBLE_EXT = new Set([
      '.html',
      '.js',
      '.mjs',
      '.css',
      '.svg',
      '.json',
      '.webmanifest',
      '.xml',
      '.txt',
    ]);
    const MAX_CACHE_FILE_BYTES = 2 * 1024 * 1024;
    const MAX_CACHED_ASSETS = 64;
    const inMemoryAssets = new Map<string, InMemoryAsset>();

    const loadCachedAsset = (relKey: string): InMemoryAsset | null => {
      const existing = inMemoryAssets.get(relKey);
      if (existing) return existing;
      if (!hasDistDir || relKey.startsWith('voice-assets/')) return null;
      const diskPath = path.resolve(distDir, relKey);
      if (!diskPath.startsWith(distDir + path.sep)) return null;
      try {
        const stat = fs.statSync(diskPath);
        if (!stat.isFile() || stat.size > MAX_CACHE_FILE_BYTES) return null;
        const ext = path.extname(diskPath).toLowerCase();
        const raw = fs.readFileSync(diskPath);
        const entry: InMemoryAsset = {
          raw,
          gzip: null,
          contentType: MIME_BY_EXT[ext] ?? 'application/octet-stream',
          immutable:
            (relKey.startsWith('assets/') || relKey.startsWith('fonts/')) &&
            !relKey.endsWith('index.html') &&
            !relKey.endsWith('overlay.html') &&
            !relKey.endsWith('sw.js'),
          compressible: COMPRESSIBLE_EXT.has(ext) && raw.length >= 512,
        };
        if (inMemoryAssets.size >= MAX_CACHED_ASSETS) {
          const oldestKey = inMemoryAssets.keys().next().value;
          if (oldestKey) inMemoryAssets.delete(oldestKey);
        }
        inMemoryAssets.set(relKey, entry);
        return entry;
      } catch {
        return null;
      }
    };

    // Pre-index hashed locale chunk filenames once so index.html can modulepreload strictly the active locale
    const localeChunkByLang = new Map<string, string>();
    const assetsDir = path.join(distDir, 'assets');
    if (hasDistDir && fs.existsSync(assetsDir)) {
      try {
        for (const file of fs.readdirSync(assetsDir)) {
          const match = /^([a-z]{2}(?:-[A-Z]{2})?)-[A-Za-z0-9_-]+\.js$/.exec(file);
          if (match?.[1]) {
            localeChunkByLang.set(match[1], file);
          }
        }
      } catch {
        // Non-fatal: dynamic import still resolves locale chunks normally
      }
    }

    const renderBootHtmlWithActiveLocale = (
      htmlTemplate: Buffer,
      preloadActiveLocale: boolean,
    ): string => {
      const rawLang = String(db.getSettings().language || 'tr').trim() || 'tr';
      const activeLang = /^[a-z]{2}(?:-[A-Z]{2})?$/.test(rawLang) ? rawLang : 'tr';
      const dir = RTL_LANGS.has(activeLang) ? 'rtl' : 'ltr';
      const localeChunk = preloadActiveLocale ? localeChunkByLang.get(activeLang) : undefined;
      const preloadTag = localeChunk
        ? `<link rel="modulepreload" href="/assets/${localeChunk}" crossorigin>`
        : '';
      const initialLockStatus = appLock.getStatus();
      const bootScript = `${preloadTag}<script>window.__AGENDAMEA_INITIAL_LANG__=${JSON.stringify(activeLang)};window.__AGENDAMEA_INITIAL_LOCK__=${JSON.stringify(initialLockStatus)};</script>`;
      let html = htmlTemplate.toString('utf8');
      html = html.replace(/<html\b[^>]*>/i, `<html lang="${activeLang}" dir="${dir}">`);
      const headIdx = html.search(/<head\b[^>]*>/i);
      if (headIdx !== -1) {
        const openEnd = html.indexOf('>', headIdx);
        if (openEnd !== -1) {
          return `${html.slice(0, openEnd + 1)}${bootScript}${html.slice(openEnd + 1)}`;
        }
      }
      return `${bootScript}${html}`;
    };

    const serveBootHtml = (res: express.Response, fileName: 'index.html' | 'overlay.html') => {
      const entry = loadCachedAsset(fileName);
      if (!entry) return false;
      const html = renderBootHtmlWithActiveLocale(entry.raw, fileName === 'index.html');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.send(html);
      return true;
    };

    const serveInMemoryEntry = (
      req: express.Request,
      res: express.Response,
      entry: InMemoryAsset,
    ) => {
      res.setHeader('Content-Type', entry.contentType);
      res.setHeader(
        'Cache-Control',
        entry.immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
      );
      const acceptEnc = String(req.headers['accept-encoding'] ?? '');
      const onLoopback = isLoopbackAddress(req.socket.remoteAddress);
      if (!onLoopback && entry.compressible && acceptEnc.includes('gzip')) {
        if (!entry.gzip) {
          entry.gzip = zlib.gzipSync(entry.raw, { level: 6 });
        }
        res.setHeader('Content-Encoding', 'gzip');
        res.setHeader('Vary', 'Accept-Encoding');
        res.send(entry.gzip);
        return;
      }
      res.send(entry.raw);
    };

    app.use((req, res, next) => {
      if ((req.method !== 'GET' && req.method !== 'HEAD') || req.path.startsWith('/api/')) {
        next();
        return;
      }
      const relKey = req.path === '/' ? 'index.html' : req.path.replace(/^\/+/, '');
      if (relKey === 'index.html' || relKey === 'overlay.html') {
        if (serveBootHtml(res, relKey)) return;
      }
      const memEntry = loadCachedAsset(relKey);
      if (memEntry) {
        serveInMemoryEntry(req, res, memEntry);
        return;
      }
      if (relKey.startsWith('assets/') || /\.[a-z0-9]{2,12}$/i.test(relKey)) {
        const diskPath = path.resolve(distDir, relKey);
        if (
          diskPath.startsWith(distDir + path.sep) &&
          fs.existsSync(diskPath) &&
          fs.statSync(diskPath).isFile()
        ) {
          next();
          return;
        }
        res.status(404).end();
        return;
      }
      next();
    });

    if (hasDistDir) {
      app.use(
        express.static(distDir, {
          setHeaders: (res, filePath) => {
            const ext = path.extname(filePath).toLowerCase();
            if (ext === '.wasm') {
              res.setHeader('Content-Type', 'application/wasm');
              res.setHeader('Cache-Control', 'public, max-age=86400');
            } else if (ext === '.mjs' || ext === '.js') {
              res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
            } else if (ext === '.onnx' || ext === '.data') {
              res.setHeader('Content-Type', 'application/octet-stream');
              res.setHeader('Cache-Control', 'public, max-age=86400');
            }
          },
        }),
      );
    }

    app.get('*', (_req, res) => {
      if (serveBootHtml(res, 'index.html')) return;
      const indexPath = path.join(distDir, 'index.html');
      if (fs.existsSync(indexPath)) {
        res.setHeader('Cache-Control', 'no-cache');
        res.sendFile(indexPath);
        return;
      }
      res.status(503).type('html').send('<!doctype html><html><body>Agendamea</body></html>');
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const hmrDisabled = process.env.DISABLE_HMR === 'true';
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: hmrDisabled ? false : { server: httpServer },
        ...(hmrDisabled ? { ws: false as const } : {}),
        watch: hmrDisabled ? null : {},
      },
      appType: 'spa',
    });
    viteServer = vite;

    if (hmrDisabled) {
      const noopViteClient = [
        'const sheetsMap = new Map();',
        'export function updateStyle(id, content) {',
        '  let style = sheetsMap.get(id);',
        '  if (!style) {',
        '    style = document.createElement("style");',
        '    style.setAttribute("type", "text/css");',
        '    style.setAttribute("data-vite-dev-id", id);',
        '    style.textContent = content;',
        '    document.head.appendChild(style);',
        '    sheetsMap.set(id, style);',
        '  } else if (style.textContent !== content) {',
        '    style.textContent = content;',
        '  }',
        '}',
        'export function removeStyle(id) {',
        '  const style = sheetsMap.get(id);',
        '  if (style) { style.remove(); sheetsMap.delete(id); }',
        '}',
        'export function createHotContext() {',
        '  return { data: {}, accept() {}, acceptExports() {}, dispose() {}, prune() {}, decline() {}, invalidate() {}, on() {}, off() {}, send() {} };',
        '}',
        'export function injectQuery(url, queryToInject) {',
        '  if (url[0] !== "." && url[0] !== "/") return url;',
        '  const pathname = url.replace(/[?#].*$/, "");',
        '  const { search, hash } = new URL(url, "http://vite.dev");',
        // biome-ignore lint/suspicious/noTemplateCurlyInString: literal JS client shim template string
        '  return `${pathname}?${queryToInject}${search ? "&" + search.slice(1) : ""}${hash || ""}`;',
        '}',
        'export class ErrorOverlay extends HTMLElement {}',
      ].join('\n');

      app.get('/@vite/client', (_req, res) => {
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache');
        res.send(noopViteClient);
      });
    }

    app.use(vite.middlewares);
  }

  httpServer.on('error', (err) => {
    serverLogger.error({ err }, 'Agendamea HTTP server error');
    crashDiagnostics.writeCrashReport({ source: 'http-server', error: err, dataDir: aiDataDir });
    try {
      db.close();
    } catch {
      // Ignore already-closed handle
    }
    closeServerLogs();
    process.exit(1);
  });

  const isHeadlessDaemon = process.env.AGENDAMEA_HEADLESS_DAEMON === '1';
  const daemonDataDir = aiDataDir;
  const daemonPortFile = path.join(daemonDataDir, 'runtime-port.json');

  const removeDaemonPortFileIfOwned = () => {
    if (!isHeadlessDaemon) return;
    try {
      if (fs.existsSync(daemonPortFile)) {
        const parsed = JSON.parse(fs.readFileSync(daemonPortFile, 'utf8')) as { pid?: number };
        if (parsed?.pid === process.pid) {
          fs.rmSync(daemonPortFile, { force: true });
        }
      }
    } catch {
      // Ignore cleanup failure
    }
  };

  const server = httpServer.listen(PORT, HOST, () => {
    const addr = server.address();
    const actualPort = typeof addr === 'object' && addr ? addr.port : PORT;
    activeListenPort = actualPort;
    if (isHeadlessDaemon) {
      try {
        fs.mkdirSync(daemonDataDir, { recursive: true });
        fs.writeFileSync(
          daemonPortFile,
          JSON.stringify(
            {
              port: actualPort,
              pid: process.pid,
              headless: true,
              updatedAt: new Date().toISOString(),
            },
            null,
            2,
          ),
          'utf8',
        );
      } catch {
        // Ignore port file write error
      }
    }
    if (typeof process.send === 'function') {
      try {
        process.send({ type: 'ready', port: actualPort });
      } catch {
        // Ignore disconnected parent IPC
      }
    }
    serverLogger.info(
      { host: HOST, port: actualPort, headless: isHeadlessDaemon },
      'Agendamea server listening',
    );
    console.log(`Agendamea server running on http://${HOST}:${actualPort}`);
  });

  const webhookOutboxTimer = setInterval(() => {
    void webhooks.processWebhookOutboxTick();
  }, 5000);
  webhookOutboxTimer.unref();

  const webhookReminderTimer = setInterval(() => {
    webhooks.processWebhookRemindersTick();
  }, 30_000);
  webhookReminderTimer.unref();

  const initialOutboxTimer = setTimeout(() => {
    void webhooks.processWebhookOutboxTick();
    webhooks.processWebhookRemindersTick();
  }, 1200);
  initialOutboxTimer.unref();

  let shuttingDown = false;
  const shutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    disposeCoreRoutes();
    clearInterval(webhookOutboxTimer);
    clearInterval(webhookReminderTimer);
    clearTimeout(initialOutboxTimer);
    aiRuntime.clearRagSyncTimer();
    for (const activeId of Array.from(aiRuntime.modelManager.activeControllers.keys())) {
      aiRuntime.modelManager.cancelDownload(activeId, { cleanPart: false });
    }
    for (const activeVoiceId of Array.from(aiRuntime.piperVoiceManager.activeControllers.keys())) {
      aiRuntime.piperVoiceManager.cancelDownload(activeVoiceId);
    }
    const unloadPromise = aiRuntime.unloadAll();
    cloudSync.flushOneDriveAutoSync();
    removeDaemonPortFileIfOwned();

    const forceExit = setTimeout(() => {
      try {
        db.close();
      } catch {
        // Ignore already-closed handle
      }
      process.exit(0);
    }, 1500);
    forceExit.unref();

    for (const client of sseClients) {
      try {
        client.end();
      } catch {
        // Ignore already-closed SSE stream
      }
    }
    sseClients.clear();
    server.closeIdleConnections?.();
    server.close(() => {
      const finish = () => {
        clearTimeout(forceExit);
        try {
          db.close();
        } catch {
          // Ignore already-closed handle
        }
        closeServerLogs();
        process.exit(0);
      };
      void unloadPromise.finally(() => {
        if (viteServer) {
          void viteServer
            .close()
            .catch(() => {
              // Ignore Vite shutdown errors
            })
            .finally(finish);
        } else {
          finish();
        }
      });
    });
  };
  shutdownHandler = shutdown;

  process.on('uncaughtException', (err) => {
    serverLogger.error({ err }, 'Uncaught server exception');
    crashDiagnostics.writeCrashReport({
      source: 'server-uncaught',
      error: err,
      dataDir: aiDataDir,
    });
  });
  process.on('unhandledRejection', (reason) => {
    serverLogger.error({ err: reason }, 'Unhandled server rejection');
    crashDiagnostics.writeCrashReport({
      source: 'server-rejection',
      error: reason,
      dataDir: aiDataDir,
    });
  });

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  process.on('message', (msg) => {
    if (msg === 'shutdown') shutdown();
  });
  process.on('disconnect', () => {
    shutdown();
  });
}

startServer().catch((err) => {
  serverLogger.error({ err }, 'Failed to start Agendamea server');
  const fallbackDataDir = process.env.AGENDAMEA_DATA_DIR
    ? path.resolve(process.env.AGENDAMEA_DATA_DIR)
    : path.join(process.cwd(), 'data');
  crashDiagnostics.writeCrashReport({
    source: 'server-startup',
    error: err,
    dataDir: fallbackDataDir,
  });
  closeServerLogs();
  process.exit(1);
});
