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
import { registerWebhookRoutes } from './server/routes/webhooks.ts';
import { createAiRuntimeService } from './server/services/aiRuntime.ts';
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
  };

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
    }

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
    const MAX_PRELOAD_FILE_BYTES = 2 * 1024 * 1024;
    const inMemoryAssets = new Map<string, InMemoryAsset>();

    const preloadDir = (dir: string, prefix = '') => {
      try {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const fullPath = path.join(dir, entry.name);
          const relKey = prefix ? `${prefix}/${entry.name}` : entry.name;
          if (entry.isDirectory()) {
            if (relKey === 'voice-assets') continue;
            preloadDir(fullPath, relKey);
          } else if (entry.isFile()) {
            const stat = fs.statSync(fullPath);
            if (stat.size > MAX_PRELOAD_FILE_BYTES) continue;
            const ext = path.extname(entry.name).toLowerCase();
            const contentType = MIME_BY_EXT[ext] ?? 'application/octet-stream';
            const raw = fs.readFileSync(fullPath);
            const shouldGzip = COMPRESSIBLE_EXT.has(ext) && raw.length >= 512;
            inMemoryAssets.set(relKey, {
              raw,
              gzip: shouldGzip ? zlib.gzipSync(raw, { level: 6 }) : null,
              contentType,
              immutable:
                relKey.startsWith('assets/') &&
                !relKey.endsWith('index.html') &&
                !relKey.endsWith('sw.js'),
            });
          }
        }
      } catch {
        // Ignore directory read errors
      }
    };
    if (hasDistDir) {
      preloadDir(distDir);
    }

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
      if (entry.gzip && acceptEnc.includes('gzip')) {
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
      const memEntry = inMemoryAssets.get(relKey);
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

    app.get('*', (req, res) => {
      const indexEntry = inMemoryAssets.get('index.html');
      if (indexEntry) {
        serveInMemoryEntry(req, res, indexEntry);
        return;
      }
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
