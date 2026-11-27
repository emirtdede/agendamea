import crypto from 'node:crypto';
import path from 'node:path';
import express from 'express';
import serverMessagesMod from '../../shared/serverMessages.cjs';
import type { TodoDatabase } from '../../src/db/database.ts';
import { ValidationError } from '../../src/db/database.ts';
import { decodeJsonRequestBuffer } from '../../src/utils/jsonBodyDecoder.ts';
import { serverLogger } from '../services/logger.ts';

const SERVER_TR_TO_KEY = new Map<string, string>(
  Object.entries(serverMessagesMod.getServerMessages('tr') as Record<string, string>).map(
    ([k, v]) => [v, k],
  ),
);

const SERVER_TR_FALLBACK_ALIASES = new Map<string, string>([
  ['Ayarlar kaydedilemedi.', 'settingsLoadFailed'],
  ['Model indirilemedi.', 'aiModelsListFailed'],
  ['Model silinemedi.', 'aiModelsListFailed'],
  ['Ses paketleri listelenemedi.', 'aiVoiceConfigReadFailed'],
  ['Ses paketi indirilemedi.', 'aiVoiceModelReadFailed'],
  ['Ses paketi silinemedi.', 'aiVoiceModelReadFailed'],
]);

const SUBTASK_LIMIT_TR_RE = /^Bir görevde en fazla (\d+) alt görev bulunabilir\.$/;

export function assertSafeLocalSyncFolder(rawPath: string): string {
  const trimmed = rawPath.trim();
  if (!trimmed || trimmed.startsWith('\\\\') || trimmed.includes('\0')) {
    throw new ValidationError('Geçersiz bulut eşitleme klasör yolu.');
  }
  const resolved = path.resolve(trimmed);
  const root = path.parse(resolved).root;
  if (resolved.toLowerCase() === root.toLowerCase()) {
    throw new ValidationError('Kök dizin eşitleme klasörü olarak seçilemez.');
  }
  if (process.platform === 'win32') {
    const winDir = (process.env.SystemRoot || 'C:\\Windows').toLowerCase();
    if (
      resolved.toLowerCase() === winDir ||
      resolved.toLowerCase().startsWith(`${winDir}${path.sep}`)
    ) {
      throw new ValidationError('Sistem klasörü eşitleme hedefi olamaz.');
    }
  }
  return resolved;
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function isLoopbackAddress(remoteAddress: string | undefined): boolean {
  if (!remoteAddress) return false;
  return (
    remoteAddress === '127.0.0.1' || remoteAddress === '::1' || remoteAddress === '::ffff:127.0.0.1'
  );
}

export function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return (
    normalized === '127.0.0.1' ||
    normalized === 'localhost' ||
    normalized === '::1' ||
    normalized === '[::1]'
  );
}

export function timingSafeCompareStrings(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length === 0 || bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function createMemoryRateLimiter(opts: {
  windowMs: number;
  maxRequests: number;
  maxKeys?: number;
}) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  const maxKeys = opts.maxKeys ?? 1024;
  return (key: string): boolean => {
    const now = Date.now();
    const existing = hits.get(key);
    if (!existing || now >= existing.resetAt) {
      if (hits.size >= maxKeys) {
        for (const [k, v] of hits.entries()) {
          if (now >= v.resetAt) hits.delete(k);
        }
        if (hits.size >= maxKeys) {
          const oldest = hits.keys().next().value;
          if (oldest !== undefined) hits.delete(oldest);
        }
      }
      hits.set(key, { count: 1, resetAt: now + opts.windowMs });
      return true;
    }
    if (existing.count >= opts.maxRequests) {
      return false;
    }
    existing.count += 1;
    return true;
  };
}

export function parseHostHeaderHostname(hostHeader: string | undefined): string | null {
  if (!hostHeader) return null;
  try {
    return new URL(`http://${hostHeader}`).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function sendRouteError(
  res: express.Response,
  routeLabel: string,
  err: unknown,
  fallbackMessage: string,
): void {
  if (err instanceof ValidationError) {
    res.status(400).json({ error: err.message });
    return;
  }
  serverLogger.error({ route: routeLabel, err }, 'Route error');
  res.status(500).json({ error: fallbackMessage });
}

export function registerSecurityMiddleware(options: {
  app: express.Express;
  db: TodoDatabase;
  host: string;
  triggerOneDriveAutoSync: () => void;
  scheduleBackgroundRagSync: () => void;
  broadcastExternalChange: (reason: string) => void;
}): void {
  const {
    app,
    db,
    host,
    triggerOneDriveAutoSync,
    scheduleBackgroundRagSync,
    broadcastExternalChange,
  } = options;

  app.disable('x-powered-by');

  // Non-mutating localized error message middleware (73 languages), scoped strictly to /api
  app.use('/api', (req, res, next) => {
    const origJson = res.json.bind(res);
    const resolveReqLang = (): string => {
      const hdrLang =
        typeof req.headers['x-agendamea-lang'] === 'string' ? req.headers['x-agendamea-lang'] : '';
      let lang = hdrLang.trim();
      if (!lang) {
        try {
          lang = String(db.getSettings().language || '').trim();
        } catch {
          lang = '';
        }
      }
      if (!lang && typeof req.headers['accept-language'] === 'string') {
        const firstLang = req.headers['accept-language'].split(',')[0] ?? '';
        lang = (firstLang.split(';')[0] ?? '').trim();
      }
      return lang || 'en';
    };

    res.json = ((body: unknown) => {
      if (body && typeof body === 'object' && !Array.isArray(body)) {
        const rec = body as Record<string, unknown>;
        if (typeof rec.error === 'string') {
          const errKey = SERVER_TR_TO_KEY.get(rec.error);
          if (errKey) {
            const lang = resolveReqLang();
            const translated = serverMessagesMod.getServerMessage(lang, errKey);
            return origJson({ ...rec, error: translated });
          }
          const aliasKey = SERVER_TR_FALLBACK_ALIASES.get(rec.error);
          if (aliasKey) {
            const lang = resolveReqLang();
            if (!lang.toLowerCase().startsWith('tr')) {
              const translated = serverMessagesMod.getServerMessage(lang, aliasKey);
              return origJson({ ...rec, error: translated });
            }
            return origJson(body);
          }
          const subtaskMatch = SUBTASK_LIMIT_TR_RE.exec(rec.error);
          if (subtaskMatch) {
            const lang = resolveReqLang();
            const template = serverMessagesMod.getServerMessage(
              lang,
              'subtaskLimitPerTaskExceeded',
            );
            const translated = template.replace('{max}', subtaskMatch[1]);
            return origJson({ ...rec, error: translated });
          }
        }
      }
      return origJson(body);
    }) as express.Response['json'];
    next();
  });

  const isLoopbackServer = isLoopbackHostname(host);
  const checkSensitiveEndpointRateLimit = createMemoryRateLimiter({
    windowMs: 10_000,
    maxRequests: 120,
  });

  if (!isLoopbackServer) {
    const configuredApiToken = (process.env.AGENDAMEA_API_TOKEN || '').trim();
    app.use('/api', (req, res, next) => {
      if (req.path === '/health' || req.path === '/webhook/incoming' || req.path === '/mcp') {
        next();
        return;
      }
      if (!isLoopbackAddress(req.socket.remoteAddress)) {
        const auth = String(req.headers.authorization || '').trim();
        const provided = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
        if (!configuredApiToken || !timingSafeCompareStrings(provided, configuredApiToken)) {
          res.status(401).json({ error: 'Yetkisiz API erişimi.' });
          return;
        }
      }
      next();
    });
  }

  app.use('/api', (req, res, next) => {
    if (req.path === '/mcp' || req.path === '/webhook/incoming' || req.path.startsWith('/ai/')) {
      const rateKey = `${req.socket.remoteAddress || 'unknown'}:${req.path.startsWith('/ai/') ? '/ai' : req.path}`;
      if (!checkSensitiveEndpointRateLimit(rateKey)) {
        res
          .status(429)
          .json({ error: 'Çok fazla istek gönderildi. Lütfen kısa bir süre bekleyin.' });
        return;
      }
    }
    next();
  });

  app.use((req, res, next) => {
    if (isLoopbackServer) {
      const hostName = parseHostHeaderHostname(req.headers.host);
      if (hostName && !isLoopbackHostname(hostName)) {
        res.status(403).json({ error: 'Geçersiz ana bilgisayar başlığı.' });
        return;
      }
    }
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (!process.env.CSP_HEADER_VALUE) {
      res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    }
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(self), geolocation=()');
    if (process.env.NODE_ENV === 'production' && !process.env.CSP_HEADER_VALUE) {
      res.setHeader(
        'Content-Security-Policy',
        "default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self' data: blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'self'; form-action 'self'",
      );
    }
    next();
  });

  app.use(
    express.raw({
      type: (req) => {
        const ct = String(req.headers['content-type'] ?? '').toLowerCase();
        return ct.includes('application/json') || ct.includes('+json');
      },
      limit: '5mb',
    }),
  );

  app.use((req, res, next) => {
    if (Buffer.isBuffer(req.body)) {
      const rawText = decodeJsonRequestBuffer(
        req.body,
        typeof req.headers['content-type'] === 'string' ? req.headers['content-type'] : undefined,
      );
      (req as express.Request & { rawBody?: string }).rawBody = rawText;
      if (!rawText.trim()) {
        req.body = {};
      } else {
        try {
          req.body = JSON.parse(rawText);
        } catch {
          res.status(400).json({ error: 'Geçersiz JSON istek gövdesi.' });
          return;
        }
      }
    }
    next();
  });

  app.use('/api', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');

    const isMutation =
      req.method === 'POST' ||
      req.method === 'PATCH' ||
      req.method === 'PUT' ||
      req.method === 'DELETE';

    if (isMutation) {
      const fetchSite = req.headers['sec-fetch-site'];
      if (typeof fetchSite === 'string' && fetchSite.toLowerCase() === 'cross-site') {
        res.status(403).json({ error: 'Siteler arası API isteği reddedildi.' });
        return;
      }
      const origin = req.headers.origin;
      if (typeof origin === 'string' && origin.length > 0) {
        try {
          const originUrl = new URL(origin);
          const reqHost = parseHostHeaderHostname(req.headers.host);
          const originHost = originUrl.hostname.toLowerCase();
          if (!isLoopbackHostname(originHost) && originHost !== reqHost) {
            res.status(403).json({ error: 'Yetkisiz kaynak üzerinden istek reddedildi.' });
            return;
          }
        } catch {
          res.status(403).json({ error: 'Geçersiz Origin başlığı.' });
          return;
        }
      }
    }

    if (
      (req.method === 'POST' || req.method === 'PATCH' || req.method === 'PUT') &&
      req.path !== '/mcp' &&
      req.body !== undefined &&
      !isPlainObject(req.body)
    ) {
      res.status(400).json({ error: 'Geçersiz istek gövdesi.' });
      return;
    }

    if (
      isMutation &&
      !req.path.startsWith('/onedrive/') &&
      !req.path.startsWith('/window/') &&
      !req.path.startsWith('/webhooks/') &&
      !req.path.startsWith('/ai/') &&
      req.path !== '/mcp'
    ) {
      const sourceHeader = String(req.headers['x-agendamea-source'] ?? '').toLowerCase();
      res.on('finish', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          if (req.path !== '/reset') {
            triggerOneDriveAutoSync();
          }
          if (
            req.path.startsWith('/todos') ||
            req.path.startsWith('/subtasks') ||
            req.path === '/webhook/incoming' ||
            req.path === '/import' ||
            req.path === '/reset'
          ) {
            scheduleBackgroundRagSync();
          }
          if (sourceHeader !== 'ui') {
            broadcastExternalChange(`${req.method} ${req.path}`);
          }
        }
      });
    }
    next();
  });
}
