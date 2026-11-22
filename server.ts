import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import http from 'node:http';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { TodoDatabase, ValidationError } from './src/db/database.ts';
import type { CloudProviderId, DetectedCloudProvider, OneDriveStatus } from './src/types.ts';
import { getLocalDateString } from './src/utils/todoLogic.ts';
import releaseUtils from './shared/releaseUtils.cjs';
import hardwareProfiler from './shared/hardwareProfiler.cjs';
import aiCatalog from './shared/aiCatalog.cjs';
import modelManagerMod from './shared/modelManager.cjs';
import embeddingWorkerMod from './electron/ai/embeddingWorker.cjs';
import sttServiceMod from './electron/ai/sttService.cjs';
import llmServiceMod from './electron/ai/llmService.cjs';
import voiceOrchestratorMod from './electron/ai/voiceOrchestrator.cjs';
import versionMod from './shared/version.cjs';

const APP_VERSION = versionMod.APP_VERSION;
const GITHUB_RELEASES_API = 'https://api.github.com/repos/emirtdede/agendamea/releases/latest';
const GITHUB_RELEASES_HTML = 'https://github.com/emirtdede/agendamea/releases/latest';

function assertSafeLocalSyncFolder(rawPath: string): string {
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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isLoopbackAddress(remoteAddress: string | undefined): boolean {
  if (!remoteAddress) return false;
  return (
    remoteAddress === '127.0.0.1' ||
    remoteAddress === '::1' ||
    remoteAddress === '::ffff:127.0.0.1'
  );
}

function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return normalized === '127.0.0.1' || normalized === 'localhost' || normalized === '::1' || normalized === '[::1]';
}

function parseHostHeaderHostname(hostHeader: string | undefined): string | null {
  if (!hostHeader) return null;
  try {
    return new URL(`http://${hostHeader}`).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function sendRouteError(
  res: express.Response,
  routeLabel: string,
  err: unknown,
  fallbackMessage: string,
): void {
  if (err instanceof ValidationError) {
    res.status(400).json({ error: err.message });
    return;
  }
  console.error(`${routeLabel} error:`, err);
  res.status(500).json({ error: fallbackMessage });
}

async function startServer() {
  const app = express();
  const httpServer = http.createServer(app);
  const db = new TodoDatabase();
  const PORT = Number(process.env.PORT) || 3000;
  let activeListenPort = PORT;

  function findFirstExistingDir(candidates: Array<string | undefined>): string | null {
    for (const candidate of candidates) {
      if (typeof candidate !== 'string' || !candidate.trim()) continue;
      try {
        if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
          return candidate;
        }
      } catch {
        // Ignore inaccessible paths
      }
    }
    return null;
  }

  function detectCloudProviders(): DetectedCloudProvider[] {
    const home = os.homedir();

    const oneDriveRoot = findFirstExistingDir([
      process.env.OneDriveConsumer,
      process.env.OneDrive,
      process.env.OneDriveCommercial,
      path.join(home, 'OneDrive'),
    ]);

    // Google Drive for Desktop creates either a virtual drive (e.g. G:\My Drive or G:\Drive'ım) or user-home folder
    const googleCandidates: string[] = [
      path.join(home, 'Google Drive'),
      path.join(home, 'My Drive'),
      path.join(home, "Drive'ım"),
    ];
    if (process.platform === 'win32') {
      for (const letter of ['G', 'H', 'I', 'D', 'E', 'F', 'J', 'K', 'M', 'Z']) {
        googleCandidates.push(`${letter}:\\My Drive`);
        googleCandidates.push(`${letter}:\\Drive'ım`);
        googleCandidates.push(`${letter}:\\Mon Drive`);
        googleCandidates.push(`${letter}:\\Meine Ablage`);
        googleCandidates.push(`${letter}:\\Mi unidad`);
      }
    }
    const googleDriveRoot = findFirstExistingDir(googleCandidates);

    const iCloudRoot = findFirstExistingDir([
      path.join(home, 'iCloudDrive'),
      path.join(home, 'iCloud Drive'),
      path.join(home, 'Library', 'Mobile Documents', 'com~apple~CloudDocs'),
    ]);

    const dropboxCandidates: Array<string | undefined> = [
      path.join(home, 'Dropbox'),
      path.join(home, 'Dropbox (Personal)'),
    ];
    for (const infoBase of [process.env.LOCALAPPDATA, process.env.APPDATA]) {
      if (!infoBase) continue;
      try {
        const infoPath = path.join(infoBase, 'Dropbox', 'info.json');
        if (fs.existsSync(infoPath)) {
          const parsed = JSON.parse(fs.readFileSync(infoPath, 'utf8')) as {
            personal?: { path?: string };
            business?: { path?: string };
          };
          if (parsed?.personal?.path) dropboxCandidates.unshift(parsed.personal.path);
          if (parsed?.business?.path) dropboxCandidates.push(parsed.business.path);
        }
      } catch {
        // Ignore unreadable Dropbox metadata
      }
    }
    const dropboxRoot = findFirstExistingDir(dropboxCandidates);

    return [
      {
        id: 'onedrive',
        label: 'OneDrive',
        folderPath: oneDriveRoot
          ? path.join(oneDriveRoot, 'Agendamea')
          : path.join(home, 'OneDrive', 'Agendamea'),
        detected: Boolean(oneDriveRoot),
      },
      {
        id: 'googledrive',
        label: 'Google Drive',
        folderPath: googleDriveRoot
          ? path.join(googleDriveRoot, 'Agendamea')
          : path.join(home, 'Google Drive', 'Agendamea'),
        detected: Boolean(googleDriveRoot),
      },
      {
        id: 'icloud',
        label: 'iCloud Drive',
        folderPath: iCloudRoot
          ? path.join(iCloudRoot, 'Agendamea')
          : path.join(home, 'iCloudDrive', 'Agendamea'),
        detected: Boolean(iCloudRoot),
      },
      {
        id: 'dropbox',
        label: 'Dropbox',
        folderPath: dropboxRoot
          ? path.join(dropboxRoot, 'Agendamea')
          : path.join(home, 'Dropbox', 'Agendamea'),
        detected: Boolean(dropboxRoot),
      },
    ];
  }

  function detectProviderForFolder(
    folderPath: string,
    providers: DetectedCloudProvider[],
  ): CloudProviderId | 'custom' {
    const normalized = path.resolve(folderPath).toLowerCase();
    for (const p of providers) {
      const pNorm = path.resolve(p.folderPath).toLowerCase();
      const pParent = path.dirname(pNorm);
      if (normalized === pNorm || normalized.startsWith(`${pParent}${path.sep}`)) {
        return p.id;
      }
    }
    if (normalized.includes('onedrive')) return 'onedrive';
    if (normalized.includes('google drive') || normalized.includes('my drive') || normalized.includes("drive'ım")) {
      return 'googledrive';
    }
    if (normalized.includes('icloud')) return 'icloud';
    if (normalized.includes('dropbox')) return 'dropbox';
    return 'custom';
  }

  function detectDefaultOneDriveRoot(): string {
    const providers = detectCloudProviders();
    const firstDetected = providers.find((p) => p.detected);
    if (firstDetected) {
      return firstDetected.folderPath;
    }
    const baseDataDir = process.env.AGENDAMEA_DATA_DIR
      ? path.resolve(process.env.AGENDAMEA_DATA_DIR)
      : path.join(process.cwd(), 'data');
    return path.join(baseDataDir, 'OneDrive-Agendamea');
  }

  function listOneDriveBackupCandidateFiles(folderPath: string): string[] {
    try {
      if (!fs.existsSync(folderPath)) return [];
      const entries = fs.readdirSync(folderPath);
      const primary = 'agendamea-onedrive-sync.json';
      const previous = 'agendamea-onedrive-previous.json';
      const rolling = entries
        .filter((f) => /^agendamea-backup-\d{4}-\d{2}-\d{2}\.json$/i.test(f))
        .sort()
        .reverse();
      const ordered: string[] = [];
      if (entries.includes(primary)) ordered.push(path.join(folderPath, primary));
      if (entries.includes(previous)) ordered.push(path.join(folderPath, previous));
      for (const r of rolling) {
        ordered.push(path.join(folderPath, r));
      }
      return ordered;
    } catch {
      return [];
    }
  }

  function readValidOneDriveBackup(folderPath: string): {
    filePath: string;
    mtimeIso: string;
    todoCount: number;
    categoryCount: number;
    payload: Record<string, unknown>;
  } | null {
    const candidates = listOneDriveBackupCandidateFiles(folderPath);
    for (const filePath of candidates) {
      try {
        const raw = fs.readFileSync(filePath, 'utf8');
        if (!raw || !raw.trim()) continue;
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) continue;
        const todosArr = Array.isArray(parsed.todos) ? parsed.todos : null;
        const catsArr = Array.isArray(parsed.categories) ? parsed.categories : null;
        if (!todosArr && !catsArr) continue;
        const stat = fs.statSync(filePath);
        return {
          filePath,
          mtimeIso: stat.mtime.toISOString(),
          todoCount: todosArr ? todosArr.length : 0,
          categoryCount: catsArr ? catsArr.length : 0,
          payload: parsed,
        };
      } catch {
        // Automatically skip corrupted / half-synced file and fall back to previous snapshot
      }
    }
    return null;
  }

  function resolveOneDriveStatus(): OneDriveStatus {
    const settings = db.getSettings();
    const detectedProviders = detectCloudProviders();
    const customPath = (settings.onedriveCustomPath ?? '').trim();
    const connected = customPath.length > 0;
    const folderPath = connected ? customPath : detectDefaultOneDriveRoot();
    const syncFilePath = path.join(folderPath, 'agendamea-onedrive-sync.json');
    const candidates = listOneDriveBackupCandidateFiles(folderPath);
    const validBackup = readValidOneDriveBackup(folderPath);

    return {
      available: true,
      connected,
      mode: connected ? 'folder' : 'none',
      folderPath,
      syncFilePath,
      accountEmail: null,
      lastSyncedAt: validBackup ? validBackup.mtimeIso : null,
      autoSync: Boolean(settings.onedriveAutoSync),
      hasRemoteBackup: Boolean(validBackup),
      remoteTodoCount: validBackup ? validBackup.todoCount : 0,
      remoteCategoryCount: validBackup ? validBackup.categoryCount : 0,
      backupFilesCount: candidates.length,
      activeProvider: connected ? detectProviderForFolder(folderPath, detectedProviders) : null,
      detectedProviders,
    };
  }

  function atomicWriteJsonFile(targetPath: string, jsonText: string): void {
    const tmpPath = `${targetPath}.tmp-${process.pid}`;
    fs.writeFileSync(tmpPath, jsonText, 'utf8');
    try {
      fs.renameSync(tmpPath, targetPath);
    } catch {
      // Fallback if Windows OneDrive sync client briefly locks targetPath during rename
      fs.copyFileSync(tmpPath, targetPath);
      try {
        fs.rmSync(tmpPath, { force: true });
      } catch {
        // Ignore cleanup failure
      }
    }
  }

  function writeOneDriveSyncSnapshot(targetFolder?: string, allowEmptyOverwrite = false): OneDriveStatus {
    const configuredPath = (db.getSettings().onedriveCustomPath ?? '').trim();
    const folder = targetFolder
      ? path.resolve(targetFolder)
      : configuredPath.length > 0
        ? configuredPath
        : detectDefaultOneDriveRoot();
    fs.mkdirSync(folder, { recursive: true });
    const syncFile = path.join(folder, 'agendamea-onedrive-sync.json');
    const prevFile = path.join(folder, 'agendamea-onedrive-previous.json');
    const dailyFile = path.join(folder, `agendamea-backup-${getLocalDateString()}.json`);

    const snapshot = db.getBootstrap();
    const isLocalEmpty =
      snapshot.todos.length === 0 &&
      snapshot.categories.length === 0 &&
      snapshot.trashedTodos.length === 0 &&
      snapshot.trashedCategories.length === 0;

    // Never silently clobber a non-empty OneDrive backup with a completely empty DB during background auto-sync
    const existingValid = readValidOneDriveBackup(folder);
    if (
      isLocalEmpty &&
      !allowEmptyOverwrite &&
      existingValid &&
      (existingValid.todoCount > 0 || existingValid.categoryCount > 0)
    ) {
      return resolveOneDriveStatus();
    }

    // Preserve previous valid sync file before writing new snapshot
    if (fs.existsSync(syncFile) && existingValid && existingValid.filePath === syncFile) {
      try {
        fs.copyFileSync(syncFile, prevFile);
      } catch {
        // Ignore copy error
      }
    }

    const activeProvider = detectProviderForFolder(folder, detectCloudProviders());
    const providerDisplayName =
      activeProvider === 'onedrive'
        ? 'OneDrive'
        : activeProvider === 'googledrive'
          ? 'Google Drive'
          : activeProvider === 'icloud'
            ? 'iCloud Drive'
            : activeProvider === 'dropbox'
              ? 'Dropbox'
              : 'Custom Cloud Folder';

    const payload = {
      exportedAt: new Date().toISOString(),
      app: 'Agendamea',
      provider: providerDisplayName,
      ...snapshot,
    };
    const jsonText = JSON.stringify(payload, null, 2);
    atomicWriteJsonFile(syncFile, jsonText);

    if (!isLocalEmpty) {
      try {
        atomicWriteJsonFile(dailyFile, jsonText);
        // Keep last 15 rolling daily snapshots
        const entries = fs
          .readdirSync(folder)
          .filter((f) => /^agendamea-backup-\d{4}-\d{2}-\d{2}\.json$/i.test(f))
          .sort()
          .reverse();
        for (const oldFile of entries.slice(15)) {
          try {
            fs.rmSync(path.join(folder, oldFile), { force: true });
          } catch {
            // Ignore old snapshot removal failure
          }
        }
      } catch {
        // Rolling snapshot failure must not break primary sync
      }
    }

    return resolveOneDriveStatus();
  }

  let autoSyncTimer: ReturnType<typeof setTimeout> | null = null;

  // Lightweight SSE subscribers so external CLI / MCP / Webhook mutations & AI downloads refresh open UI live
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

  function isValidWebhookTargetUrl(rawUrl: string): boolean {
    try {
      const parsed = new URL(rawUrl.trim());
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
      const host = parsed.hostname.toLowerCase();
      // Block cloud metadata SSRF endpoints
      if (host === '169.254.169.254' || host === 'metadata.google.internal' || host === '[fd00:ec2::254]') {
        return false;
      }
      // Block self-recursive webhook loops targeting this running Agendamea server port
      const targetPort = parsed.port ? Number(parsed.port) : parsed.protocol === 'https:' ? 443 : 80;
      if (isLoopbackHostname(host) && activeListenPort > 0 && targetPort === activeListenPort) {
        return false;
      }
      return true;
    } catch {
      return false;
    }
  }

  function parseWebhookUrls(rawUrl: string): string[] {
    return String(rawUrl || '')
      .split(/[\r\n,]+/)
      .map((u) => u.trim())
      .filter((u) => isValidWebhookTargetUrl(u));
  }

  function isWebhookEventAllowed(configuredEvents: string | undefined, event: string): boolean {
    if (event === 'webhook.test') return true;
    const raw = String(configuredEvents || '').trim();
    if (!raw || raw === '*') return true;
    const allowed = raw
      .split(/[\s,]+/)
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    if (allowed.length === 0 || allowed.includes('*')) return true;
    const lowerEvent = event.toLowerCase();
    return allowed.some((pattern) =>
      pattern.endsWith('.*') ? lowerEvent.startsWith(pattern.slice(0, -1)) : lowerEvent === pattern,
    );
  }

  async function deliverSingleWebhookWithRetry(
    targetUrl: string,
    secret: string,
    event: string,
    data: unknown,
    maxAttempts = 2,
  ): Promise<{ ok: boolean; statusCode?: number; latencyMs: number; attempts: number; error?: string }> {
    const startedAt = Date.now();
    if (!isValidWebhookTargetUrl(targetUrl)) {
      return { ok: false, latencyMs: 0, attempts: 1, error: 'Geçersiz webhook URL adresi (http/https).' };
    }
    const titlePreview =
      data && typeof data === 'object' && 'title' in data && typeof (data as { title?: unknown }).title === 'string'
        ? `: ${(data as { title: string }).title}`
        : data && typeof data === 'object' && 'name' in data && typeof (data as { name?: unknown }).name === 'string'
          ? `: ${(data as { name: string }).name}`
          : '';
    const summaryLine = `[Agendamea] ${event}${titlePreview}`;
    const bodyJson = JSON.stringify({
      event,
      timestamp: new Date().toISOString(),
      app: 'Agendamea',
      version: APP_VERSION,
      content: summaryLine,
      text: summaryLine,
      data,
    });

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': `Agendamea-Webhook/${APP_VERSION}`,
      'X-Agendamea-Event': event,
    };
    const cleanSecret = secret.trim();
    if (cleanSecret) {
      const sig = crypto.createHmac('sha256', cleanSecret).update(bodyJson).digest('hex');
      headers['X-Agendamea-Signature'] = `sha256=${sig}`;
    }

    let lastResult: { ok: boolean; statusCode?: number; latencyMs: number; attempts: number; error?: string } = {
      ok: false,
      latencyMs: 0,
      attempts: 1,
      error: 'Webhook gönderilemedi.',
    };

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4000);
      try {
        const response = await fetch(targetUrl.trim(), {
          method: 'POST',
          headers,
          body: bodyJson,
          signal: controller.signal,
        });
        lastResult = {
          ok: response.ok,
          statusCode: response.status,
          latencyMs: Date.now() - startedAt,
          attempts: attempt,
          error: response.ok ? undefined : `HTTP ${response.status}`,
        };
        if (response.ok || (response.status >= 400 && response.status < 500)) {
          break;
        }
      } catch (err) {
        lastResult = {
          ok: false,
          latencyMs: Date.now() - startedAt,
          attempts: attempt,
          error: err instanceof Error ? err.message : 'Webhook gönderilemedi.',
        };
      } finally {
        clearTimeout(timer);
      }
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 250));
      }
    }

    try {
      db.recordWebhookLog({
        direction: 'outgoing',
        event,
        targetUrl: targetUrl.trim(),
        statusCode: lastResult.statusCode ?? null,
        ok: lastResult.ok,
        attempts: lastResult.attempts,
        latencyMs: lastResult.latencyMs,
        error: lastResult.error ?? '',
      });
    } catch {
      // Never fail webhook delivery if log insert fails
    }
    return lastResult;
  }

  async function deliverWebhookRequest(
    targetUrlsRaw: string,
    secret: string,
    event: string,
    data: unknown,
  ): Promise<{ ok: boolean; statusCode?: number; latencyMs: number; attempts?: number; error?: string; results?: Array<{ url: string; ok: boolean; statusCode?: number; error?: string }> }> {
    const urls = parseWebhookUrls(targetUrlsRaw);
    if (urls.length === 0) {
      return { ok: false, latencyMs: 0, error: 'Geçersiz webhook URL adresi (http/https).' };
    }
    if (urls.length === 1) {
      return deliverSingleWebhookWithRetry(urls[0], secret, event, data, 2);
    }
    const startedAt = Date.now();
    const results = await Promise.all(
      urls.map(async (url) => {
        const res = await deliverSingleWebhookWithRetry(url, secret, event, data, 2);
        return { url, ok: res.ok, statusCode: res.statusCode, error: res.error };
      }),
    );
    const allOk = results.every((r) => r.ok);
    const firstFail = results.find((r) => !r.ok);
    return {
      ok: allOk,
      statusCode: results[0]?.statusCode,
      latencyMs: Date.now() - startedAt,
      error: firstFail?.error,
      results,
    };
  }

  function dispatchConfiguredWebhook(event: string, data: unknown): void {
    try {
      const settings = db.getSettings();
      if (!settings.webhookEnabled || !settings.webhookUrl) return;
      if (!isWebhookEventAllowed(settings.webhookEvents, event)) return;
      void deliverWebhookRequest(settings.webhookUrl, settings.webhookSecret ?? '', event, data);
    } catch {
      // Never block primary mutation on webhook errors
    }
  }

  function flushOneDriveAutoSync(): void {
    if (autoSyncTimer) {
      clearTimeout(autoSyncTimer);
      autoSyncTimer = null;
    }
    try {
      const settings = db.getSettings();
      if (settings.onedriveAutoSync && (settings.onedriveCustomPath ?? '').trim().length > 0) {
        writeOneDriveSyncSnapshot();
      }
    } catch {
      // Background auto-sync must never fail primary user mutation
    }
  }

  function triggerOneDriveAutoSync(): void {
    if (autoSyncTimer) {
      clearTimeout(autoSyncTimer);
    }
    autoSyncTimer = setTimeout(() => {
      autoSyncTimer = null;
      flushOneDriveAutoSync();
    }, 200);
  }
  // Bind loopback on Windows desktop by default; 0.0.0.0 in Linux containers unless HOST is set
  const HOST = process.env.HOST || (process.platform === 'win32' ? '127.0.0.1' : '0.0.0.0');

  app.disable('x-powered-by');
  const isLoopbackServer = isLoopbackHostname(HOST);
  app.use((req, res, next) => {
    // Prevent DNS rebinding when bound to local desktop loopback
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
        "default-src 'self'; script-src 'self' 'unsafe-inline'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'self'; form-action 'self'",
      );
    }
    next();
  });

  app.use(
    express.json({
      limit: '5mb',
      verify: (req, _res, buf) => {
        (req as express.Request & { rawBody?: string }).rawBody = buf.toString('utf8');
      },
    }),
  );
  app.use('/api', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');

    const isMutation =
      req.method === 'POST' ||
      req.method === 'PATCH' ||
      req.method === 'PUT' ||
      req.method === 'DELETE';

    if (isMutation) {
      // Block cross-site browser requests (CSRF / simple-request protection on localhost API)
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
      !req.path.startsWith('/ai/')
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

  // Lightweight health probe for Electron / Windows launcher startup checks
  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      app: 'Agendamea',
      version: APP_VERSION,
      pid: process.pid,
      headless: process.env.AGENDAMEA_HEADLESS_DAEMON === '1',
    });
  });

  // Lightweight settings-only read endpoint (avoids full /api/bootstrap download in Voice Overlay)
  app.get('/api/settings', (_req, res) => {
    try {
      res.json(db.getSettings());
    } catch (err) {
      sendRouteError(res, 'GET /api/settings', err, 'Ayarlar yüklenemedi.');
    }
  });

  // Live change notification stream for external CLI / MCP / Webhook mutations
  app.get('/api/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();
    res.write(': connected\n\n');
    sseClients.add(res);
    const keepalive = setInterval(() => {
      try {
        res.write(': ping\n\n');
      } catch {
        clearInterval(keepalive);
        sseClients.delete(res);
      }
    }, 25_000);
    req.on('close', () => {
      clearInterval(keepalive);
      sseClients.delete(res);
    });
  });

  // Bootstrap all active + trashed state and settings in one round-trip
  app.get('/api/bootstrap', (_req, res) => {
    try {
      res.json(db.getBootstrap());
    } catch (err) {
      sendRouteError(res, 'GET /api/bootstrap', err, 'Veriler yüklenemedi.');
    }
  });

  // Categories
  app.post('/api/categories', (req, res) => {
    try {
      const { id, name, color, pinned } = req.body ?? {};
      if (typeof name !== 'string' || !name.trim()) {
        res.status(400).json({ error: 'Kategori adı gereklidir.' });
        return;
      }
      const created = db.createCategory({
        id: typeof id === 'string' ? id : undefined,
        name,
        color: typeof color === 'string' ? color : undefined,
        pinned: typeof pinned === 'boolean' ? pinned : undefined,
      });
      dispatchConfiguredWebhook('category.created', created);
      res.status(201).json(created);
    } catch (err) {
      sendRouteError(res, 'POST /api/categories', err, 'Kategori oluşturulamadı.');
    }
  });

  app.patch('/api/categories/reorder', (req, res) => {
    try {
      const { orderedIds } = req.body ?? {};
      if (!Array.isArray(orderedIds)) {
        res.status(400).json({ error: 'Geçersiz kategori sıralama listesi.' });
        return;
      }
      db.reorderCategories(orderedIds.filter((x): x is string => typeof x === 'string'));
      res.json({ ok: true });
    } catch (err) {
      sendRouteError(res, 'PATCH /api/categories/reorder', err, 'Kategori sıralaması kaydedilemedi.');
    }
  });

  app.patch('/api/categories/:id', (req, res) => {
    try {
      const body = req.body ?? {};
      const updated = db.updateCategory(req.params.id, {
        name: typeof body.name === 'string' ? body.name : undefined,
        color: typeof body.color === 'string' ? body.color : undefined,
        pinned: typeof body.pinned === 'boolean' ? body.pinned : undefined,
      });
      if (!updated) {
        res.status(404).json({ error: 'Kategori bulunamadı.' });
        return;
      }
      dispatchConfiguredWebhook('category.updated', updated);
      res.json(updated);
    } catch (err) {
      sendRouteError(res, 'PATCH /api/categories/:id', err, 'Kategori güncellenemedi.');
    }
  });

  // Soft delete category -> moves to trash
  app.delete('/api/categories/:id', (req, res) => {
    try {
      const trashed = db.softDeleteCategory(req.params.id);
      if (!trashed) {
        res.status(404).json({ error: 'Kategori bulunamadı.' });
        return;
      }
      dispatchConfiguredWebhook('category.deleted', trashed);
      res.json(trashed);
    } catch (err) {
      sendRouteError(res, 'DELETE /api/categories/:id', err, 'Kategori çöp kutusuna taşınamadı.');
    }
  });

  app.post('/api/categories/:id/restore', (req, res) => {
    try {
      const restored = db.restoreCategory(req.params.id);
      if (!restored) {
        res.status(404).json({ error: 'Kategori çöp kutusunda bulunamadı.' });
        return;
      }
      dispatchConfiguredWebhook('category.restored', restored);
      res.json(restored);
    } catch (err) {
      sendRouteError(res, 'POST /api/categories/:id/restore', err, 'Kategori geri yüklenemedi.');
    }
  });

  app.delete('/api/categories/:id/permanent', (req, res) => {
    try {
      const deleted = db.permanentDeleteCategory(req.params.id);
      if (!deleted) {
        res.status(404).json({ error: 'Kategori çöp kutusunda bulunamadı.' });
        return;
      }
      res.json({ ok: true });
    } catch (err) {
      sendRouteError(
        res,
        'DELETE /api/categories/:id/permanent',
        err,
        'Kategori kalıcı olarak silinemedi.',
      );
    }
  });

  // Todos
  app.post('/api/todos', (req, res) => {
    try {
      const body = req.body ?? {};
      if (typeof body.title !== 'string' || !body.title.trim()) {
        res.status(400).json({ error: 'Görev başlığı gereklidir.' });
        return;
      }
      const created = db.createTodo({
        id: typeof body.id === 'string' ? body.id : undefined,
        title: body.title,
        notes: typeof body.notes === 'string' ? body.notes : undefined,
        completed: typeof body.completed === 'boolean' ? body.completed : undefined,
        important: typeof body.important === 'boolean' ? body.important : undefined,
        pinned: typeof body.pinned === 'boolean' ? body.pinned : undefined,
        priority: body.priority,
        startDate:
          body.startDate === null || typeof body.startDate === 'string'
            ? body.startDate
            : undefined,
        dueDate:
          body.dueDate === null || typeof body.dueDate === 'string' ? body.dueDate : undefined,
        dueTime:
          body.dueTime === null || typeof body.dueTime === 'string' ? body.dueTime : undefined,
        tags: Array.isArray(body.tags) ? body.tags : undefined,
        categoryId:
          body.categoryId === null || typeof body.categoryId === 'string'
            ? body.categoryId
            : undefined,
        subtasks: Array.isArray(body.subtasks) ? body.subtasks : undefined,
      });
      dispatchConfiguredWebhook('todo.created', created);
      res.status(201).json(created);
    } catch (err) {
      sendRouteError(res, 'POST /api/todos', err, 'Görev eklenemedi.');
    }
  });

  app.patch('/api/todos/reorder', (req, res) => {
    try {
      const { orderedIds } = req.body ?? {};
      if (!Array.isArray(orderedIds)) {
        res.status(400).json({ error: 'Geçersiz sıralama listesi.' });
        return;
      }
      db.reorderTodos(orderedIds.filter((x): x is string => typeof x === 'string'));
      res.json({ ok: true });
    } catch (err) {
      sendRouteError(res, 'PATCH /api/todos/reorder', err, 'Sıralama kaydedilemedi.');
    }
  });

  // Soft delete completed todos -> moves to trash
  app.delete('/api/todos/completed', (req, res) => {
    try {
      const categoryId =
        typeof req.query.categoryId === 'string' && req.query.categoryId.length > 0
          ? req.query.categoryId
          : null;
      const trashedTodos = db.clearCompleted(categoryId);
      dispatchConfiguredWebhook('todos.cleared_completed', { clearedCount: trashedTodos.length, categoryId });
      res.json({ ok: true, trashedTodos });
    } catch (err) {
      sendRouteError(
        res,
        'DELETE /api/todos/completed',
        err,
        'Tamamlananlar çöp kutusuna taşınamadı.',
      );
    }
  });

  app.patch('/api/todos/:id', (req, res) => {
    try {
      const body = req.body ?? {};
      const updated = db.updateTodo(req.params.id, {
        title: typeof body.title === 'string' ? body.title : undefined,
        notes: typeof body.notes === 'string' ? body.notes : undefined,
        completed: typeof body.completed === 'boolean' ? body.completed : undefined,
        important: typeof body.important === 'boolean' ? body.important : undefined,
        pinned: typeof body.pinned === 'boolean' ? body.pinned : undefined,
        priority: body.priority,
        startDate:
          body.startDate === null || typeof body.startDate === 'string'
            ? body.startDate
            : undefined,
        dueDate:
          body.dueDate === null || typeof body.dueDate === 'string' ? body.dueDate : undefined,
        dueTime:
          body.dueTime === null || typeof body.dueTime === 'string' ? body.dueTime : undefined,
        tags: Array.isArray(body.tags) ? body.tags : undefined,
        categoryId:
          body.categoryId === null || typeof body.categoryId === 'string'
            ? body.categoryId
            : undefined,
      });
      if (!updated) {
        res.status(404).json({ error: 'Görev bulunamadı.' });
        return;
      }
      dispatchConfiguredWebhook(
        typeof body.completed === 'boolean' && body.completed ? 'todo.completed' : 'todo.updated',
        updated,
      );
      res.json(updated);
    } catch (err) {
      sendRouteError(res, 'PATCH /api/todos/:id', err, 'Görev güncellenemedi.');
    }
  });

  // Soft delete todo -> moves to trash
  app.delete('/api/todos/:id', (req, res) => {
    try {
      const trashed = db.softDeleteTodo(req.params.id);
      if (!trashed) {
        res.status(404).json({ error: 'Görev bulunamadı.' });
        return;
      }
      dispatchConfiguredWebhook('todo.deleted', trashed);
      res.json(trashed);
    } catch (err) {
      sendRouteError(res, 'DELETE /api/todos/:id', err, 'Görev çöp kutusuna taşınamadı.');
    }
  });

  app.post('/api/todos/:id/restore', (req, res) => {
    try {
      const restored = db.restoreTodo(req.params.id);
      if (!restored) {
        res.status(404).json({ error: 'Görev çöp kutusunda bulunamadı.' });
        return;
      }
      dispatchConfiguredWebhook('todo.restored', restored);
      res.json(restored);
    } catch (err) {
      sendRouteError(res, 'POST /api/todos/:id/restore', err, 'Görev geri yüklenemedi.');
    }
  });

  app.delete('/api/todos/:id/permanent', (req, res) => {
    try {
      const deleted = db.permanentDeleteTodo(req.params.id);
      if (!deleted) {
        res.status(404).json({ error: 'Görev çöp kutusunda bulunamadı.' });
        return;
      }
      res.json({ ok: true });
    } catch (err) {
      sendRouteError(res, 'DELETE /api/todos/:id/permanent', err, 'Görev kalıcı olarak silinemedi.');
    }
  });

  // Empty entire trash permanently
  app.delete('/api/trash', (_req, res) => {
    try {
      const result = db.emptyTrash();
      dispatchConfiguredWebhook('trash.emptied', result);
      res.json({ ok: true, ...result });
    } catch (err) {
      sendRouteError(res, 'DELETE /api/trash', err, 'Çöp kutusu boşaltılamadı.');
    }
  });

  // Subtasks
  app.post('/api/todos/:id/subtasks', (req, res) => {
    try {
      const { title } = req.body ?? {};
      if (typeof title !== 'string' || !title.trim()) {
        res.status(400).json({ error: 'Alt görev başlığı gereklidir.' });
        return;
      }
      const created = db.createSubtask(req.params.id, title);
      if (!created) {
        res.status(404).json({ error: 'Üst görev bulunamadı.' });
        return;
      }
      dispatchConfiguredWebhook('subtask.created', created);
      res.status(201).json(created);
    } catch (err) {
      sendRouteError(res, 'POST /api/todos/:id/subtasks', err, 'Alt görev eklenemedi.');
    }
  });

  app.patch('/api/subtasks/:id', (req, res) => {
    try {
      const body = req.body ?? {};
      const updated = db.updateSubtask(req.params.id, {
        title: typeof body.title === 'string' ? body.title : undefined,
        completed: typeof body.completed === 'boolean' ? body.completed : undefined,
      });
      if (!updated) {
        res.status(404).json({ error: 'Alt görev bulunamadı.' });
        return;
      }
      dispatchConfiguredWebhook('subtask.updated', updated);
      res.json(updated);
    } catch (err) {
      sendRouteError(res, 'PATCH /api/subtasks/:id', err, 'Alt görev güncellenemedi.');
    }
  });

  app.delete('/api/subtasks/:id', (req, res) => {
    try {
      const deleted = db.deleteSubtask(req.params.id);
      if (!deleted) {
        res.status(404).json({ error: 'Alt görev bulunamadı.' });
        return;
      }
      dispatchConfiguredWebhook('subtask.deleted', { id: req.params.id });
      res.json({ ok: true });
    } catch (err) {
      sendRouteError(res, 'DELETE /api/subtasks/:id', err, 'Alt görev silinemedi.');
    }
  });

  // Settings (theme mode, color theme, drag lock, sidebar, language, webhooks & autoUpdateCheck persisted to SQLite)
  app.patch('/api/settings', (req, res) => {
    try {
      const updated = db.updateSettings(req.body ?? {});
      res.json(updated);
    } catch (err) {
      sendRouteError(res, 'PATCH /api/settings', err, 'Ayarlar kaydedilemedi.');
    }
  });

  // Outgoing & Incoming Webhook Logs
  app.get('/api/webhooks/logs', (req, res) => {
    try {
      const limit = Number(req.query.limit) || 30;
      res.json(db.getWebhookLogs(limit));
    } catch (err) {
      sendRouteError(res, 'GET /api/webhooks/logs', err, 'Webhook kayıtları alınamadı.');
    }
  });

  app.delete('/api/webhooks/logs', (_req, res) => {
    try {
      const cleared = db.clearWebhookLogs();
      res.json({ ok: true, cleared });
    } catch (err) {
      sendRouteError(res, 'DELETE /api/webhooks/logs', err, 'Webhook kayıtları temizlenemedi.');
    }
  });

  // Outgoing Webhook Live Test Endpoint (Discord, Slack, n8n, Zapier, Make, custom HTTP/HTTPS)
  app.post('/api/webhooks/test', async (req, res) => {
    try {
      const settings = db.getSettings();
      const body = req.body ?? {};
      const targetUrl =
        typeof body.url === 'string' && body.url.trim().length > 0
          ? body.url.trim()
          : (settings.webhookUrl ?? '');
      const secret =
        typeof body.secret === 'string' ? body.secret : (settings.webhookSecret ?? '');
      if (!targetUrl) {
        res.status(400).json({ ok: false, error: 'Webhook URL adresi gereklidir.' });
        return;
      }
      const result = await deliverWebhookRequest(targetUrl, secret, 'webhook.test', {
        title: 'Agendamea Webhook Test',
        message: 'Connection verified successfully.',
      });
      res.json(result);
    } catch (err) {
      sendRouteError(res, 'POST /api/webhooks/test', err, 'Webhook testi başarısız oldu.');
    }
  });

  // Full Incoming Webhook Automation Endpoint (supports secret OR HMAC-SHA256 signature & all actions)
  app.post('/api/webhook/incoming', (req, res) => {
    const startedAt = Date.now();
    const recordIncoming = (event: string, statusCode: number, ok: boolean, error = '') => {
      try {
        db.recordWebhookLog({
          direction: 'incoming',
          event,
          targetUrl: '/api/webhook/incoming',
          statusCode,
          ok,
          attempts: 1,
          latencyMs: Date.now() - startedAt,
          error,
        });
      } catch {
        // Ignore logging error
      }
    };

    try {
      // Prevent self-recursive webhook loops (e.g., outgoing webhook pointed back at incoming endpoint)
      if (req.headers['x-agendamea-event']) {
        recordIncoming('incoming.loop_blocked', 400, false, 'Self-loop blocked');
        res.status(400).json({ error: 'Döngüsel webhook isteği engellendi.' });
        return;
      }

      const settings = db.getSettings();
      const configuredSecret = (settings.webhookSecret ?? '').trim();
      const isLocalCaller = isLoopbackAddress(req.socket.remoteAddress);

      if (!isLocalCaller && !configuredSecret) {
        recordIncoming('incoming.secret_required', 403, false, 'Secret required for remote access');
        res.status(403).json({
          error: 'Uzak gelen webhook istekleri için gizli anahtar (webhookSecret) zorunludur.',
        });
        return;
      }

      if (!settings.webhookEnabled && !configuredSecret) {
        recordIncoming('incoming.disabled', 403, false, 'Webhook disabled');
        res.status(403).json({
          error: 'Gelen webhook erişimi için Webhook otomasyonunu etkinleştirin veya gizli anahtar tanımlayın.',
        });
        return;
      }

      if (configuredSecret) {
        const providedSecret = String(
          req.headers['x-agendamea-secret'] ?? req.body?.secret ?? '',
        ).trim();
        const providedSig = String(req.headers['x-agendamea-signature'] ?? '').trim();
        let authorized = false;

        if (providedSecret) {
          const a = Buffer.from(providedSecret, 'utf8');
          const b = Buffer.from(configuredSecret, 'utf8');
          authorized = a.length === b.length && crypto.timingSafeEqual(a, b);
        } else if (providedSig.startsWith('sha256=')) {
          const rawBody = (req as express.Request & { rawBody?: string }).rawBody ?? JSON.stringify(req.body ?? {});
          const expected = `sha256=${crypto.createHmac('sha256', configuredSecret).update(rawBody).digest('hex')}`;
          const a = Buffer.from(providedSig, 'utf8');
          const b = Buffer.from(expected, 'utf8');
          authorized = a.length === b.length && crypto.timingSafeEqual(a, b);
        }

        if (!authorized) {
          recordIncoming('incoming.unauthorized', 401, false, 'Unauthorized');
          res.status(401).json({ error: 'Geçersiz webhook gizli anahtarı veya HMAC imzası.' });
          return;
        }
      }

      const body = req.body ?? {};
      const action = typeof body.action === 'string' ? body.action.trim().toLowerCase() : 'add';
      const normText = (s: unknown) => String(s ?? '').toLocaleLowerCase('tr-TR').trim();
      const findCategoryBySelector = (selector: string) => {
        const cats = db.getCategories();
        const q = normText(selector);
        return (
          cats.find((c) => c.id === selector) ??
          cats.find((c) => normText(c.name) === q) ??
          cats.find((c) => c.id.startsWith(selector) || normText(c.name).includes(q)) ??
          null
        );
      };
      const findTodoBySelector = (selector: string) => db.findTodoBySelector(selector);

      if (action === 'add' || action === 'create') {
        const title = typeof body.title === 'string' ? body.title.trim() : '';
        if (!title) {
          recordIncoming('incoming.add', 400, false, 'Missing title');
          res.status(400).json({ error: 'Görev başlığı (title) gereklidir.' });
          return;
        }
        let resolvedCategoryId = typeof body.categoryId === 'string' ? body.categoryId : undefined;
        if (!resolvedCategoryId && typeof body.category === 'string' && body.category.trim()) {
          resolvedCategoryId = findCategoryBySelector(body.category.trim())?.id;
        }
        const subtasks = Array.isArray(body.subtasks)
          ? body.subtasks
              .map((s: unknown) =>
                typeof s === 'string'
                  ? { title: s.trim(), completed: false }
                  : s && typeof s === 'object' && 'title' in s
                    ? { title: String((s as { title: unknown }).title), completed: Boolean((s as { completed?: unknown }).completed) }
                    : null,
              )
              .filter((x: unknown): x is { title: string; completed: boolean } => Boolean(x && (x as { title: string }).title))
          : undefined;
        const created = db.createTodo({
          title,
          notes: typeof body.notes === 'string' ? body.notes : undefined,
          startDate: typeof body.startDate === 'string' ? body.startDate : undefined,
          dueDate: typeof body.dueDate === 'string' ? body.dueDate : undefined,
          dueTime: typeof body.dueTime === 'string' ? body.dueTime : undefined,
          priority: body.priority,
          important: typeof body.important === 'boolean' ? body.important : undefined,
          pinned: typeof body.pinned === 'boolean' ? body.pinned : undefined,
          tags: Array.isArray(body.tags) ? body.tags : undefined,
          categoryId: resolvedCategoryId,
          subtasks,
        });
        dispatchConfiguredWebhook('todo.created', created);
        recordIncoming('incoming.add', 201, true);
        res.status(201).json({ ok: true, action: 'add', todo: created });
        return;
      }

      if (action === 'update' || action === 'edit') {
        const sel = String(body.id ?? body.target ?? '').trim();
        if (!sel) {
          recordIncoming('incoming.update', 400, false, 'Missing id');
          res.status(400).json({ error: 'Görev kimliği (id) gereklidir.' });
          return;
        }
        const found = findTodoBySelector(sel);
        if (!found) {
          recordIncoming('incoming.update', 404, false, 'Task not found');
          res.status(404).json({ error: 'Görev bulunamadı.' });
          return;
        }
        let categoryId =
          body.categoryId === null || typeof body.categoryId === 'string' ? body.categoryId : undefined;
        if (categoryId === undefined && typeof body.category === 'string') {
          categoryId = body.category.trim() ? (findCategoryBySelector(body.category.trim())?.id ?? null) : null;
        }
        const updated = db.updateTodo(found.id, {
          title: typeof body.title === 'string' ? body.title : undefined,
          notes: typeof body.notes === 'string' ? body.notes : undefined,
          completed: typeof body.completed === 'boolean' ? body.completed : undefined,
          important: typeof body.important === 'boolean' ? body.important : undefined,
          pinned: typeof body.pinned === 'boolean' ? body.pinned : undefined,
          priority: body.priority,
          startDate: body.startDate === null || typeof body.startDate === 'string' ? body.startDate : undefined,
          dueDate: body.dueDate === null || typeof body.dueDate === 'string' ? body.dueDate : undefined,
          dueTime: body.dueTime === null || typeof body.dueTime === 'string' ? body.dueTime : undefined,
          tags: Array.isArray(body.tags) ? body.tags : undefined,
          categoryId,
        });
        dispatchConfiguredWebhook(updated?.completed ? 'todo.completed' : 'todo.updated', updated);
        recordIncoming('incoming.update', 200, true);
        res.json({ ok: true, action: 'update', todo: updated });
        return;
      }

      if (action === 'complete' || action === 'done' || action === 'pin') {
        const sel = String(body.id ?? body.target ?? '').trim();
        if (!sel) {
          recordIncoming(`incoming.${action}`, 400, false, 'Missing id');
          res.status(400).json({ error: 'Görev kimliği (id) gereklidir.' });
          return;
        }
        const found = findTodoBySelector(sel);
        if (!found) {
          recordIncoming(`incoming.${action}`, 404, false, 'Task not found');
          res.status(404).json({ error: 'Görev bulunamadı.' });
          return;
        }
        const patch =
          action === 'pin'
            ? { pinned: body.pinned === undefined ? !found.pinned : Boolean(body.pinned) }
            : { completed: body.completed === undefined ? true : Boolean(body.completed) };
        const updated = db.updateTodo(found.id, patch);
        dispatchConfiguredWebhook(
          action !== 'pin' && patch.completed ? 'todo.completed' : 'todo.updated',
          updated,
        );
        recordIncoming(`incoming.${action}`, 200, true);
        res.json({ ok: true, action: action === 'pin' ? 'pin' : 'complete', todo: updated });
        return;
      }

      if (action === 'delete' || action === 'trash') {
        const sel = String(body.id ?? body.target ?? '').trim();
        if (!sel) {
          recordIncoming('incoming.delete', 400, false, 'Missing id');
          res.status(400).json({ error: 'Görev kimliği (id) gereklidir.' });
          return;
        }
        const found = findTodoBySelector(sel);
        if (!found) {
          recordIncoming('incoming.delete', 404, false, 'Task not found');
          res.status(404).json({ error: 'Görev bulunamadı.' });
          return;
        }
        const trashed = db.softDeleteTodo(found.id);
        dispatchConfiguredWebhook('todo.deleted', trashed);
        recordIncoming('incoming.delete', 200, true);
        res.json({ ok: true, action: 'delete', todo: trashed });
        return;
      }

      if (action === 'restore') {
        const sel = String(body.id ?? body.target ?? '').trim();
        const trashedTodos = db.getTrashedTodos();
        const trashedCats = db.getTrashedCategories();
        const matchedTodo = sel
          ? (trashedTodos.find((t) => t.id === sel || t.id.startsWith(sel) || normText(t.title).includes(normText(sel))) ?? null)
          : (trashedTodos[0] ?? null);
        if (matchedTodo) {
          const restored = db.restoreTodo(matchedTodo.id);
          dispatchConfiguredWebhook('todo.restored', restored);
          recordIncoming('incoming.restore', 200, true);
          res.json({ ok: true, action: 'restore', kind: 'todo', item: restored });
          return;
        }
        const matchedCat = sel
          ? (trashedCats.find((c) => c.id === sel || c.id.startsWith(sel) || normText(c.name).includes(normText(sel))) ?? null)
          : (trashedCats[0] ?? null);
        if (matchedCat) {
          const restored = db.restoreCategory(matchedCat.id);
          dispatchConfiguredWebhook('category.restored', restored);
          recordIncoming('incoming.restore', 200, true);
          res.json({ ok: true, action: 'restore', kind: 'category', item: restored });
          return;
        }
        recordIncoming('incoming.restore', 404, false, 'Trash item not found');
        res.status(404).json({ error: 'Çöp kutusunda eşleşen öğe bulunamadı.' });
        return;
      }

      if (action === 'clear_completed') {
        const catId =
          typeof body.category === 'string' && body.category.trim()
            ? (findCategoryBySelector(body.category.trim())?.id ?? null)
            : typeof body.categoryId === 'string' && body.categoryId.trim()
              ? body.categoryId.trim()
              : null;
        const trashedTodos = db.clearCompleted(catId);
        dispatchConfiguredWebhook('todos.cleared_completed', { clearedCount: trashedTodos.length, categoryId: catId });
        recordIncoming('incoming.clear_completed', 200, true);
        res.json({ ok: true, action: 'clear_completed', clearedCount: trashedTodos.length });
        return;
      }

      if (action === 'subtask.add' || action === 'subtask.toggle' || action === 'subtask.update' || action === 'subtask.delete') {
        const taskSel = String(body.taskId ?? body.id ?? '').trim();
        const task = taskSel ? findTodoBySelector(taskSel) : null;
        if (!task) {
          recordIncoming(`incoming.${action}`, 404, false, 'Parent task not found');
          res.status(404).json({ error: 'Üst görev bulunamadı.' });
          return;
        }
        if (action === 'subtask.add') {
          const subTitle = typeof body.title === 'string' ? body.title.trim() : '';
          if (!subTitle) {
            recordIncoming('incoming.subtask.add', 400, false, 'Missing subtask title');
            res.status(400).json({ error: 'Alt görev başlığı gereklidir.' });
            return;
          }
          const created = db.createSubtask(task.id, subTitle);
          dispatchConfiguredWebhook('subtask.created', created);
          recordIncoming('incoming.subtask.add', 201, true);
          res.status(201).json({ ok: true, action, subtask: created });
          return;
        }
        const subSel = String(body.subtaskId ?? body.subtask ?? '').trim();
        const sub =
          task.subtasks.find((s) => s.id === subSel || s.id.startsWith(subSel) || normText(s.title).includes(normText(subSel))) ??
          null;
        if (!sub) {
          recordIncoming(`incoming.${action}`, 404, false, 'Subtask not found');
          res.status(404).json({ error: 'Alt görev bulunamadı.' });
          return;
        }
        if (action === 'subtask.delete') {
          db.deleteSubtask(sub.id);
          dispatchConfiguredWebhook('subtask.deleted', { id: sub.id, todoId: task.id });
          recordIncoming('incoming.subtask.delete', 200, true);
          res.json({ ok: true, action, id: sub.id });
          return;
        }
        const updatedSub = db.updateSubtask(sub.id, {
          title: typeof body.title === 'string' ? body.title : undefined,
          completed:
            action === 'subtask.toggle'
              ? body.completed === undefined
                ? !sub.completed
                : Boolean(body.completed)
              : typeof body.completed === 'boolean'
                ? body.completed
                : undefined,
        });
        dispatchConfiguredWebhook('subtask.updated', updatedSub);
        recordIncoming(`incoming.${action}`, 200, true);
        res.json({ ok: true, action, subtask: updatedSub });
        return;
      }

      if (action === 'category.create' || action === 'category.update' || action === 'category.delete') {
        if (action === 'category.create') {
          const name = typeof body.name === 'string' ? body.name.trim() : '';
          if (!name) {
            recordIncoming('incoming.category.create', 400, false, 'Missing category name');
            res.status(400).json({ error: 'Kategori adı gereklidir.' });
            return;
          }
          const created = db.createCategory({
            name,
            color: typeof body.color === 'string' ? body.color : undefined,
            pinned: typeof body.pinned === 'boolean' ? body.pinned : undefined,
          });
          dispatchConfiguredWebhook('category.created', created);
          recordIncoming('incoming.category.create', 201, true);
          res.status(201).json({ ok: true, action, category: created });
          return;
        }
        const catSel = String(body.id ?? body.category ?? body.target ?? '').trim();
        const foundCat = catSel ? findCategoryBySelector(catSel) : null;
        if (!foundCat) {
          recordIncoming(`incoming.${action}`, 404, false, 'Category not found');
          res.status(404).json({ error: 'Kategori bulunamadı.' });
          return;
        }
        if (action === 'category.delete') {
          const trashed = db.softDeleteCategory(foundCat.id);
          dispatchConfiguredWebhook('category.deleted', trashed);
          recordIncoming('incoming.category.delete', 200, true);
          res.json({ ok: true, action, category: trashed });
          return;
        }
        const updatedCat = db.updateCategory(foundCat.id, {
          name: typeof body.name === 'string' ? body.name : undefined,
          color: typeof body.color === 'string' ? body.color : undefined,
          pinned: typeof body.pinned === 'boolean' ? body.pinned : undefined,
        });
        dispatchConfiguredWebhook('category.updated', updatedCat);
        recordIncoming('incoming.category.update', 200, true);
        res.json({ ok: true, action, category: updatedCat });
        return;
      }

      if (action === 'trash.empty') {
        const result = db.emptyTrash();
        dispatchConfiguredWebhook('trash.emptied', result);
        recordIncoming('incoming.trash.empty', 200, true);
        res.json({ ok: true, action, ...result });
        return;
      }

      recordIncoming(`incoming.${action}`, 400, false, 'Unsupported action');
      res.status(400).json({
        error:
          'Desteklenmeyen webhook eylemi (add, update, complete, pin, delete, restore, clear_completed, subtask.*, category.*, trash.empty).',
      });
    } catch (err) {
      recordIncoming('incoming.error', 500, false, err instanceof Error ? err.message : 'Error');
      sendRouteError(res, 'POST /api/webhook/incoming', err, 'Gelen webhook işlenemedi.');
    }
  });

  // Version & Update Check (cached 30s to protect GitHub unauthenticated rate limits; ?force=1 bypasses)
  let updateCheckCache: { expiresAt: number; payload: Record<string, unknown> } | null = null;
  app.get('/api/update-check', async (req, res) => {
    const force = req.query.force === '1' || req.query.force === 'true';
    if (!force && updateCheckCache && Date.now() < updateCheckCache.expiresAt) {
      res.json(updateCheckCache.payload);
      return;
    }
    const checkedAt = new Date().toISOString();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(GITHUB_RELEASES_API, {
        signal: controller.signal,
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': `Agendamea/${APP_VERSION} (Vellium)`,
        },
      });
      if (!response.ok) {
        res.json({
          ok: false,
          currentVersion: APP_VERSION,
          latestVersion: APP_VERSION,
          updateAvailable: false,
          releaseName: `Agendamea v${APP_VERSION}`,
          releaseNotes: '',
          publishedAt: null,
          releaseUrl: GITHUB_RELEASES_HTML,
          setupUrl: null,
          portableUrl: null,
          msixUrl: null,
          checkedAt,
        });
        return;
      }
      const data = (await response.json()) as Record<string, unknown>;
      const resultPayload = releaseUtils.parseGitHubRelease(
        data,
        APP_VERSION,
        GITHUB_RELEASES_HTML,
        checkedAt,
      );
      updateCheckCache = {
        expiresAt: Date.now() + 30_000,
        payload: resultPayload,
      };
      res.json(resultPayload);
    } catch {
      res.json({
        ok: false,
        currentVersion: APP_VERSION,
        latestVersion: APP_VERSION,
        updateAvailable: false,
        releaseName: `Agendamea v${APP_VERSION}`,
        releaseNotes: '',
        publishedAt: null,
        releaseUrl: GITHUB_RELEASES_HTML,
        setupUrl: null,
        portableUrl: null,
        msixUrl: null,
        checkedAt,
      });
    } finally {
      clearTimeout(timer);
    }
  });

  // Windows 10/11 native minimize fallback (loopback-only + concurrency guard; bypassed inside Windows Store MSIX)
  let isMinimizing = false;
  app.post('/api/window/minimize', (req, res) => {
    const isWinStore = Boolean((process as NodeJS.Process & { windowsStore?: boolean }).windowsStore);
    if (process.platform !== 'win32' || isWinStore) {
      res.json({ ok: true, supported: false });
      return;
    }
    if (!isLoopbackAddress(req.socket.remoteAddress)) {
      res.status(403).json({ error: 'Yalnızca yerel erişime izin verilir.' });
      return;
    }
    if (isMinimizing) {
      res.json({ ok: true, supported: true });
      return;
    }

    isMinimizing = true;
    const psScript =
      'Add-Type -TypeDefinition "using System; using System.Runtime.InteropServices; public class Win32Min { [DllImport(\\"user32.dll\\")] public static extern IntPtr GetForegroundWindow(); [DllImport(\\"user32.dll\\")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow); }"; $h = [Win32Min]::GetForegroundWindow(); if ($h -ne [IntPtr]::Zero) { [void][Win32Min]::ShowWindow($h, 6) }';

    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', psScript],
      { timeout: 3000 },
      (err) => {
        isMinimizing = false;
        if (err) {
          res.json({ ok: false, supported: true });
          return;
        }
        res.json({ ok: true, supported: true });
      },
    );
  });

  // JSON Backup Export
  app.get('/api/export', (req, res) => {
    try {
      const snapshot = db.getBootstrap();
      const payload = {
        exportedAt: new Date().toISOString(),
        app: 'Agendamea',
        ...snapshot,
      };
      const reqLang = typeof req.query.lang === 'string' ? req.query.lang : snapshot.settings.language;
      const fileSlug = reqLang === 'tr' ? 'yedek' : 'backup';
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="agendamea-${fileSlug}-${getLocalDateString()}.json"`,
      );
      res.send(JSON.stringify(payload, null, 2));
    } catch (err) {
      sendRouteError(res, 'GET /api/export', err, 'Yedek oluşturulamadı.');
    }
  });

  // JSON Backup Import (atomic restore; never leaks internal SQLite errors)
  app.post('/api/import', (req, res) => {
    try {
      const restored = db.importBackup(req.body ?? {});
      dispatchConfiguredWebhook('backup.imported', {
        todos: restored.todos.length,
        categories: restored.categories.length,
      });
      res.json(restored);
    } catch (err) {
      sendRouteError(res, 'POST /api/import', err, 'Yedek dosyası içe aktarılamadı.');
    }
  });

  // Clean Start / Reset All Data (atomic wipe of tasks, subtasks, categories & trash; optional settings reset)
  app.post('/api/reset', (req, res) => {
    try {
      const resetSettings = Boolean(req.body?.resetSettings);
      const freshBootstrap = db.resetAllData({ resetSettings });
      dispatchConfiguredWebhook('data.reset', { resetSettings });
      res.json(freshBootstrap);
    } catch (err) {
      sendRouteError(res, 'POST /api/reset', err, 'Veriler sıfırlanamadı.');
    }
  });

  // Zero-Cost OneDrive Cloud Sync Endpoints
  app.get('/api/onedrive/status', (_req, res) => {
    try {
      res.json(resolveOneDriveStatus());
    } catch (err) {
      sendRouteError(res, 'GET /api/onedrive/status', err, 'OneDrive durumu alınamadı.');
    }
  });

  app.post('/api/onedrive/connect', (req, res) => {
    try {
      if (!isLoopbackAddress(req.socket.remoteAddress)) {
        res.status(403).json({ error: 'Yalnızca yerel erişime izin verilir.' });
        return;
      }
      const body = req.body ?? {};
      const requestedPath =
        typeof body.folderPath === 'string' && body.folderPath.trim().length > 0
          ? assertSafeLocalSyncFolder(body.folderPath)
          : detectDefaultOneDriveRoot();
      const autoSync = typeof body.autoSync === 'boolean' ? body.autoSync : true;
      db.updateSettings({
        onedriveCustomPath: requestedPath,
        onedriveAutoSync: autoSync,
      });

      // Format/fresh-install safeguard: if local DB is empty and OneDrive already has a valid backup, restore it instead of overwriting!
      const localSnap = db.getBootstrap();
      const isLocalEmpty =
        localSnap.todos.length === 0 &&
        localSnap.categories.length === 0 &&
        localSnap.trashedTodos.length === 0 &&
        localSnap.trashedCategories.length === 0;
      const existingRemote = readValidOneDriveBackup(requestedPath);

      if (
        isLocalEmpty &&
        existingRemote &&
        (existingRemote.todoCount > 0 || existingRemote.categoryCount > 0)
      ) {
        const restoredBootstrap = db.importBackup(existingRemote.payload);
        res.json({
          ...resolveOneDriveStatus(),
          restoredBootstrap,
        });
        return;
      }

      if (isLocalEmpty && !existingRemote) {
        fs.mkdirSync(requestedPath, { recursive: true });
        res.json(resolveOneDriveStatus());
        return;
      }

      const status = writeOneDriveSyncSnapshot(requestedPath, true);
      res.json(status);
    } catch (err) {
      sendRouteError(res, 'POST /api/onedrive/connect', err, 'OneDrive bağlantısı kurulamadı.');
    }
  });

  app.post('/api/onedrive/disconnect', (req, res) => {
    try {
      if (!isLoopbackAddress(req.socket.remoteAddress)) {
        res.status(403).json({ error: 'Yalnızca yerel erişime izin verilir.' });
        return;
      }
      db.updateSettings({
        onedriveCustomPath: '',
        onedriveAutoSync: false,
      });
      res.json(resolveOneDriveStatus());
    } catch (err) {
      sendRouteError(res, 'POST /api/onedrive/disconnect', err, 'OneDrive bağlantısı kesilemedi.');
    }
  });

  app.post('/api/onedrive/sync-push', (req, res) => {
    try {
      if (!isLoopbackAddress(req.socket.remoteAddress)) {
        res.status(403).json({ error: 'Yalnızca yerel erişime izin verilir.' });
        return;
      }
      const current = resolveOneDriveStatus();
      if (!current.connected && current.folderPath) {
        db.updateSettings({ onedriveCustomPath: current.folderPath, onedriveAutoSync: true });
      }
      const status = writeOneDriveSyncSnapshot(undefined, true);
      res.json(status);
    } catch (err) {
      sendRouteError(res, 'POST /api/onedrive/sync-push', err, 'OneDrive eşitlemesi başarısız oldu.');
    }
  });

  app.post('/api/onedrive/sync-pull', (req, res) => {
    try {
      if (!isLoopbackAddress(req.socket.remoteAddress)) {
        res.status(403).json({ error: 'Yalnızca yerel erişime izin verilir.' });
        return;
      }
      const current = resolveOneDriveStatus();
      const folder = current.folderPath ?? detectDefaultOneDriveRoot();
      const validBackup = readValidOneDriveBackup(folder);
      if (!validBackup) {
        throw new ValidationError('OneDrive yedek dosyası bulunamadı.');
      }
      if (!current.connected) {
        db.updateSettings({
          onedriveCustomPath: folder,
          onedriveAutoSync: true,
        });
      }
      const bootstrap = db.importBackup(validBackup.payload);
      res.json({
        status: resolveOneDriveStatus(),
        bootstrap,
      });
    } catch (err) {
      sendRouteError(res, 'POST /api/onedrive/sync-pull', err, 'OneDrive verisi geri yüklenemedi.');
    }
  });

  app.post('/api/onedrive/open-folder', (req, res) => {
    try {
      if (!isLoopbackAddress(req.socket.remoteAddress)) {
        res.status(403).json({ error: 'Yalnızca yerel erişime izin verilir.' });
        return;
      }
      const current = resolveOneDriveStatus();
      const folder = current.folderPath ?? detectDefaultOneDriveRoot();
      fs.mkdirSync(folder, { recursive: true });
      if (process.platform === 'win32') {
        execFile('explorer.exe', [folder], { timeout: 5000 }, () => {});
      }
      res.json({ ok: true, path: folder });
    } catch (err) {
      sendRouteError(res, 'POST /api/onedrive/open-folder', err, 'OneDrive klasörü açılamadı.');
    }
  });

  // Local AI, Model Manager, Chunked Hybrid RAG & Voice Orchestrator Endpoints (v1.1.0)
  const aiDataDir = process.env.AGENDAMEA_DATA_DIR
    ? path.resolve(process.env.AGENDAMEA_DATA_DIR)
    : path.join(process.cwd(), 'data');
  const aiModelsDir = path.join(aiDataDir, 'models');
  const modelManager = new modelManagerMod.ModelManager({
    modelsDir: aiModelsDir,
    onProgressEvent: (prog: Record<string, unknown>) => {
      broadcastSseEvent({ type: 'ai.download.progress', ...prog });
    },
  });
  const embeddingService = new embeddingWorkerMod.EmbeddingService();
  const sttService = new sttServiceMod.SttService();
  const llmService = new llmServiceMod.LlmService();
  const voiceOrchestrator = new voiceOrchestratorMod.VoiceOrchestrator();

  let cachedHardwareProfile: Record<string, unknown> | null = null;
  let cachedHardwareAt = 0;
  let cachedExternalBackends: Record<string, unknown> | null = null;
  let cachedExternalAt = 0;
  let ragSyncTimer: ReturnType<typeof setTimeout> | null = null;

  function scheduleBackgroundRagSync() {
    if (ragSyncTimer) clearTimeout(ragSyncTimer);
    ragSyncTimer = setTimeout(() => {
      ragSyncTimer = null;
      try {
        syncAiRuntimeFromSettings();
        if (embeddingService.isAvailable()) {
          void embeddingService.syncTodosIndex(db.getRawDb(), db.getTodos()).catch(() => {});
        }
      } catch {
        // Non-blocking background RAG sync
      }
    }, 1500);
    if (typeof ragSyncTimer.unref === 'function') ragSyncTimer.unref();
  }

  async function getHardwareProfileCached(force = false) {
    if (!force && cachedHardwareProfile && Date.now() - cachedHardwareAt < 60_000) {
      return cachedHardwareProfile;
    }
    const profile = await hardwareProfiler.profileHardware({ targetDir: aiDataDir });
    cachedHardwareProfile = profile;
    cachedHardwareAt = Date.now();
    return profile;
  }

  async function getExternalBackendsCached(force = false) {
    if (!force && cachedExternalBackends && Date.now() - cachedExternalAt < 30_000) {
      return cachedExternalBackends;
    }
    const external = await aiCatalog.detectExternalBackends();
    cachedExternalBackends = external;
    cachedExternalAt = Date.now();
    return external;
  }

  function syncAiRuntimeFromSettings(defaultTier = 'tier-light') {
    const s = db.getSettings();
    const tier = s.aiTier || defaultTier || 'tier-light';
    const bundle = aiCatalog.getTierBundle(
      tier === 'tier-light' || tier === 'tier-medium' || tier === 'tier-strong'
        ? tier
        : 'tier-light',
    );
    const sttId = s.aiSttModelId || bundle.sttModelId;
    const llmId = s.aiLlmModelId || bundle.llmModelId;
    const embedId = s.aiEmbedModelId || bundle.embedModelId;

    const sttStatus = aiCatalog.MODELS_BY_ID[sttId] ? modelManager.getModelStatus(sttId) : null;
    const llmStatus = aiCatalog.MODELS_BY_ID[llmId] ? modelManager.getModelStatus(llmId) : null;
    const embedStatus = aiCatalog.MODELS_BY_ID[embedId] ? modelManager.getModelStatus(embedId) : null;

    sttService.configureModel({
      modelId: sttId,
      modelPath: sttStatus?.present ? sttStatus.modelPath : null,
    });
    embeddingService.configureModel({
      modelId: embedId,
      modelPath: embedStatus?.present ? embedStatus.modelPath : null,
    });
    const useExternal = Boolean(
      s.aiUseExternalOllama || tier === 'external-ollama' || tier === 'external-lmstudio',
    );
    const externalKind = tier === 'external-lmstudio' ? 'lmstudio' : 'ollama';
    const extCache = cachedExternalBackends as {
      externalOllama?: { models?: string[] };
      externalLmStudio?: { models?: string[] };
    } | null;
    const fallbackExternalModel =
      externalKind === 'lmstudio'
        ? extCache?.externalLmStudio?.models?.[0] || ''
        : extCache?.externalOllama?.models?.[0] || '';
    const resolvedExternalModel = s.aiOllamaModel || fallbackExternalModel || '';

    llmService.configure({
      modelId: llmId,
      modelPath: llmStatus?.present ? llmStatus.modelPath : null,
      useExternalOllama: useExternal,
      externalKind,
      externalBaseUrl:
        externalKind === 'lmstudio'
          ? String(process.env.AGENDAMEA_LMSTUDIO_URL || 'http://127.0.0.1:1234').replace(/\/+$/, '')
          : String(process.env.AGENDAMEA_OLLAMA_URL || 'http://127.0.0.1:11434').replace(/\/+$/, ''),
      externalModel: resolvedExternalModel,
    });

    return {
      aiEnabled: s.aiEnabled !== false,
      aiTier: tier,
      aiLlmModelId: llmId,
      aiSttModelId: sttId,
      aiEmbedModelId: embedId,
      aiUseExternalOllama: useExternal,
      aiOllamaModel: resolvedExternalModel,
      voiceShortcut: s.voiceShortcut || 'CommandOrControl+Alt+Space',
      voiceAutoStopMs: s.voiceAutoStopMs ?? 1500,
      voiceTtsEnabled: s.voiceTtsEnabled !== false,
      voiceTtsVoice: s.voiceTtsVoice || '',
      voiceMicDeviceId: s.voiceMicDeviceId || '',
      voiceNoiseSuppression: s.voiceNoiseSuppression !== false,
      voiceSensitivity: s.voiceSensitivity || 'auto',
    };
  }

  function resolveTodoByVoiceSelector(selector: string) {
    return db.resolveTodoByVoiceSelector(selector);
  }

  function createVoiceStoreAdapter() {
    return {
      getTodoById: (id: string) => db.getTodoById(id),
      listToday: () => {
        const today = getLocalDateString();
        return db
          .getTodos()
          .filter(
            (t) =>
              !t.completed &&
              ((t.dueDate && t.dueDate <= today) ||
                (t.startDate && t.startDate <= today && (!t.dueDate || t.dueDate >= today))),
          );
      },
      addTask: (input: Record<string, unknown>) => {
        let categoryId: string | null = null;
        if (typeof input.category === 'string' && input.category.trim()) {
          const wanted = input.category.trim().toLocaleLowerCase('tr-TR');
          const foundCat = db
            .getCategories()
            .find((c) => c.name.toLocaleLowerCase('tr-TR') === wanted);
          if (foundCat) categoryId = foundCat.id;
        }
        const created = db.createTodo({
          title: String(input.title || ''),
          notes: typeof input.notes === 'string' ? input.notes : '',
          dueDate: typeof input.dueDate === 'string' ? input.dueDate : null,
          dueTime: typeof input.dueTime === 'string' ? input.dueTime : null,
          priority:
            input.priority === 'high' || input.priority === 'low' || input.priority === 'normal'
              ? input.priority
              : 'normal',
          important: Boolean(input.important),
          pinned: Boolean(input.pinned),
          tags: Array.isArray(input.tags)
            ? input.tags.filter((x): x is string => typeof x === 'string')
            : [],
          categoryId,
        });
        dispatchConfiguredWebhook('todo.created', created);
        return created;
      },
      completeTask: (selector: string, completed = true) => {
        const target = resolveTodoByVoiceSelector(selector);
        if (!target) throw new Error('Gorev bulunamadi.');
        const updated = db.updateTodo(target.id, { completed });
        if (!updated) throw new Error('Gorev bulunamadi.');
        dispatchConfiguredWebhook('todo.updated', updated);
        return updated;
      },
      deleteTask: (selector: string) => {
        const target = resolveTodoByVoiceSelector(selector);
        if (!target) throw new Error('Gorev bulunamadi.');
        const trashed = db.softDeleteTodo(target.id);
        if (trashed) dispatchConfiguredWebhook('todo.deleted', trashed);
        return trashed;
      },
      undoTrash: () => {
        const trashedTodos = db.getTrashedTodos();
        if (trashedTodos.length > 0) {
          const restored = db.restoreTodo(trashedTodos[0].id);
          return { kind: 'todo', item: restored };
        }
        const trashedCats = db.getTrashedCategories();
        if (trashedCats.length > 0) {
          const restored = db.restoreCategory(trashedCats[0].id);
          return { kind: 'category', item: restored };
        }
        throw new Error('Trash is empty.');
      },
      clearCompleted: () => db.clearCompleted(),
      emptyTrash: () => db.emptyTrash(),
    };
  }

  async function runHybridRagQuery(query: string, opts?: { topK?: number; minScore?: number }) {
    syncAiRuntimeFromSettings();
    let vectorHits: Array<{ todoId: string; chunkIndex: number; chunkText: string; cosine: number }> = [];
    if (embeddingService.isAvailable()) {
      try {
        vectorHits = await embeddingService.searchVectors(db.getRawDb(), query, {
          topK: Math.max(10, Number(opts?.topK) || 5),
        });
      } catch {
        vectorHits = [];
      }
    }
    return db.searchHybridRag(query, {
      topK: opts?.topK ?? 5,
      minScore: opts?.minScore ?? 0.35,
      vectorHits,
    });
  }

  app.get('/api/ai/hardware', async (req, res) => {
    try {
      const force = req.query.force === '1' || req.query.force === 'true';
      const hardware = await getHardwareProfileCached(force);
      res.json(hardware);
    } catch (err) {
      sendRouteError(res, 'GET /api/ai/hardware', err, 'Donanım profili alınamadı.');
    }
  });

  app.get('/api/ai/status', async (req, res) => {
    try {
      const force = req.query.force === '1' || req.query.force === 'true';
      const [hardware, external] = await Promise.all([
        getHardwareProfileCached(force),
        getExternalBackendsCached(force),
      ]);
      const recommendation = aiCatalog.selectTierRecommendation(hardware, external);
      const settings = syncAiRuntimeFromSettings(recommendation.primaryOptionId);
      const fitMap = new Map(recommendation.models.map((m: { id: string; fitsHardware: boolean; warningCode: string | null }) => [m.id, m]));
      const models = modelManager.listModelsStatus().map((st: { id: string }) => {
        const fit = fitMap.get(st.id) as { fitsHardware?: boolean; warningCode?: string | null } | undefined;
        return {
          ...st,
          fitsHardware: fit?.fitsHardware ?? true,
          warningCode: fit?.warningCode ?? null,
        };
      });
      res.json({
        hardware,
        recommendation,
        models,
        installedDiskBytes: modelManager.getInstalledDiskUsageBytes(),
        ragIndexedChunks: db.getRagChunkCount(),
        engines: {
          stt: sttService.getStatus(),
          llm: llmService.getStatus(),
          embedding: embeddingService.getStatus(),
        },
        settings,
      });
    } catch (err) {
      sendRouteError(res, 'GET /api/ai/status', err, 'Yapay zeka durumu alınamadı.');
    }
  });

  app.get('/api/ai/models', (_req, res) => {
    try {
      res.json({
        modelsDir: aiModelsDir,
        installedDiskBytes: modelManager.getInstalledDiskUsageBytes(),
        models: modelManager.listModelsStatus(),
      });
    } catch (err) {
      sendRouteError(res, 'GET /api/ai/models', err, 'Model listesi alınamadı.');
    }
  });

  app.post('/api/ai/models/:id/download', async (req, res) => {
    try {
      const modelId = req.params.id;
      if (!aiCatalog.MODELS_BY_ID[modelId]) {
        res.status(404).json({ ok: false, code: 'UNKNOWN_MODEL', error: 'Model bulunamadı.' });
        return;
      }
      const syncWait = req.query.sync === '1' || Boolean(req.body?.sync);
      if (syncWait) {
        const result = await modelManager.downloadModel(modelId);
        res.status(result.ok ? 200 : 400).json(result);
        return;
      }
      void modelManager.downloadModel(modelId).catch(() => {});
      res.status(202).json({
        ok: true,
        started: true,
        modelId,
        status: modelManager.getModelStatus(modelId),
      });
    } catch (err) {
      sendRouteError(res, 'POST /api/ai/models/:id/download', err, 'Model indirilemedi.');
    }
  });

  app.post('/api/ai/models/:id/cancel', (req, res) => {
    try {
      const result = modelManager.cancelDownload(req.params.id, {
        cleanPart: Boolean(req.body?.cleanPart),
      });
      res.json(result);
    } catch (err) {
      sendRouteError(res, 'POST /api/ai/models/:id/cancel', err, 'İndirme iptal edilemedi.');
    }
  });

  app.delete('/api/ai/models/:id', async (req, res) => {
    try {
      const targetId = req.params.id;
      if (targetId === 'all') {
        await Promise.all([
          sttService.unload().catch(() => {}),
          llmService.unload().catch(() => {}),
          embeddingService.unload().catch(() => {}),
        ]);
        res.json(modelManager.deleteAllModels());
        return;
      }
      if (!aiCatalog.MODELS_BY_ID[targetId]) {
        res.status(404).json({ ok: false, error: 'Model bulunamadı.' });
        return;
      }
      if (sttService.modelId === targetId) await sttService.unload().catch(() => {});
      if (llmService.modelId === targetId) await llmService.unload().catch(() => {});
      if (embeddingService.modelId === targetId) await embeddingService.unload().catch(() => {});
      res.json(modelManager.deleteModel(targetId));
    } catch (err) {
      sendRouteError(res, 'DELETE /api/ai/models/:id', err, 'Model silinemedi.');
    }
  });

  app.post('/api/ai/rag/reindex', async (_req, res) => {
    try {
      syncAiRuntimeFromSettings();
      db.rebuildSearchIndex();
      const result = await embeddingService.syncTodosIndex(db.getRawDb(), db.getTodos());
      res.json(result);
    } catch (err) {
      sendRouteError(res, 'POST /api/ai/rag/reindex', err, 'RAG indeksi güncellenemedi.');
    }
  });

  app.get('/api/ai/rag/search', async (req, res) => {
    try {
      const q = typeof req.query.q === 'string' ? req.query.q : '';
      const topK = Number(req.query.topK) || 5;
      const minScore = req.query.minScore !== undefined ? Number(req.query.minScore) : 0.35;
      const result = await runHybridRagQuery(q, { topK, minScore });
      res.json(result);
    } catch (err) {
      sendRouteError(res, 'GET /api/ai/rag/search', err, 'RAG araması yapılamadı.');
    }
  });

  app.post('/api/ai/rag/search', async (req, res) => {
    try {
      const q = typeof req.body?.query === 'string' ? req.body.query : '';
      const topK = Number(req.body?.topK) || 5;
      const minScore = req.body?.minScore !== undefined ? Number(req.body.minScore) : 0.35;
      const result = await runHybridRagQuery(q, { topK, minScore });
      res.json(result);
    } catch (err) {
      sendRouteError(res, 'POST /api/ai/rag/search', err, 'RAG araması yapılamadı.');
    }
  });

  app.post('/api/ai/ask', async (req, res) => {
    try {
      const body = req.body ?? {};
      const text = typeof body.text === 'string' ? body.text : '';
      const language =
        typeof body.language === 'string' && body.language.trim()
          ? body.language.trim()
          : db.getSettings().language || 'tr';
      const readOnly = Boolean(body.readOnly);
      const confirmToken = typeof body.confirmToken === 'string' ? body.confirmToken : null;
      const selectedTodoId = typeof body.selectedTodoId === 'string' ? body.selectedTodoId : null;

      const aiRuntime = syncAiRuntimeFromSettings();
      // If Ollama / LM Studio mode is active but no model was saved yet (e.g. Ollama was started after selecting the card),
      // probe live external backends once and auto-select the first available model!
      if (aiRuntime.aiUseExternalOllama && !aiRuntime.aiOllamaModel) {
        await getExternalBackendsCached(true);
        syncAiRuntimeFromSettings();
      }
      const result = await voiceOrchestrator.handleUtterance({
        text,
        language,
        readOnly,
        confirmToken,
        selectedTodoId,
        storeAdapter: createVoiceStoreAdapter(),
        ragSearchFn: (q: string, opts?: { topK?: number; minScore?: number }) =>
          runHybridRagQuery(q, opts),
        llmService,
      });

      if (result.mutated) {
        broadcastExternalChange('POST /api/ai/ask');
        triggerOneDriveAutoSync();
        scheduleBackgroundRagSync();
      }
      res.json(result);
    } catch (err) {
      sendRouteError(res, 'POST /api/ai/ask', err, 'Sesli/metin komutu işlenemedi.');
    }
  });

  app.post('/api/ai/transcribe', async (req, res) => {
    try {
      const body = req.body ?? {};
      const language =
        typeof body.language === 'string' && body.language.trim()
          ? body.language.trim()
          : db.getSettings().language || 'tr';

      let samples: Float32Array | null = null;
      if (typeof body.pcmBase64 === 'string' && body.pcmBase64.length > 0) {
        const rawBuf = Buffer.from(body.pcmBase64, 'base64');
        samples = sttServiceMod.toFloat32Array(rawBuf);
      } else if (Array.isArray(body.pcm)) {
        samples = sttServiceMod.toFloat32Array(body.pcm);
      }
      if (!samples) {
        res.status(400).json({ ok: false, code: 'INVALID_AUDIO', error: 'Geçersiz ses verisi.' });
        return;
      }

      syncAiRuntimeFromSettings();
      const sttRes = await sttService.transcribePcm(samples, language);
      res.json(sttRes);
    } catch (err) {
      sendRouteError(res, 'POST /api/ai/transcribe', err, 'Ses deşifre edilemedi.');
    }
  });

  // Headless daemon clean shutdown endpoint (loopback-only, strictly active only when AGENDAMEA_HEADLESS_DAEMON=1)
  if (process.env.AGENDAMEA_HEADLESS_DAEMON === '1') {
    app.post('/api/server/shutdown', (req, res) => {
      if (!isLoopbackAddress(req.socket.remoteAddress)) {
        res.status(403).json({ error: 'Yalnızca yerel erişime izin verilir.' });
        return;
      }
      res.json({ ok: true, stopping: true, pid: process.pid });
      setTimeout(() => shutdown(), 40);
    });
  }

  // Unknown API routes return clean JSON 404 instead of SPA index.html
  app.all('/api/*', (_req, res) => {
    res.status(404).json({ error: 'API uç noktası bulunamadı.' });
  });

  // Clean JSON error handler (handles malformed JSON, 413 payload limit, and prevents stack trace leaks)
  app.use(
    (
      err: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      if (err instanceof SyntaxError && 'body' in err) {
        res.status(400).json({ error: 'Geçersiz JSON formatı.' });
        return;
      }
      const typedErr = err as { type?: string; status?: number };
      if (typedErr?.type === 'entity.too.large' || typedErr?.status === 413) {
        res.status(413).json({ error: 'İstek boyutu çok büyük (en fazla 5 MB).' });
        return;
      }
      console.error('Unhandled Express error:', err);
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
  const isProd = process.env.NODE_ENV === 'production' && fs.existsSync(distDir);

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

    // Preload all dist assets into RAM at startup so Windows Portable %TEMP% cleanup
    // can never cause ENOENT on index.html or JS/CSS bundles while the app is running
    const inMemoryAssets = new Map<string, InMemoryAsset>();
    const preloadDir = (dir: string, prefix = '') => {
      try {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const fullPath = path.join(dir, entry.name);
          const relKey = prefix ? `${prefix}/${entry.name}` : entry.name;
          if (entry.isDirectory()) {
            preloadDir(fullPath, relKey);
          } else if (entry.isFile()) {
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
    preloadDir(distDir);

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
      // If request is for a static asset path (e.g. /assets/* or has a file extension), return 404 cleanly
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

    app.use(express.static(distDir));

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
    // Dynamic import keeps devDependency 'vite' out of production/Electron startup path
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
      // Vite 8 injects /@vite/client even when hmr/ws are disabled, causing client-side
      // WebSocket connection errors behind proxies. Serve a zero-WebSocket shim with the
      // standard Vite client exports required by CSS/HMR transforms.
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
        '  if (style) {',
        '    style.remove();',
        '    sheetsMap.delete(id);',
        '  }',
        '}',
        'export function createHotContext() {',
        '  return {',
        '    data: {},',
        '    accept() {},',
        '    acceptExports() {},',
        '    dispose() {},',
        '    prune() {},',
        '    decline() {},',
        '    invalidate() {},',
        '    on() {},',
        '    off() {},',
        '    send() {},',
        '  };',
        '}',
        'export function injectQuery(url, queryToInject) {',
        '  if (url[0] !== "." && url[0] !== "/") return url;',
        '  const pathname = url.replace(/[?#].*$/, "");',
        '  const { search, hash } = new URL(url, "http://vite.dev");',
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
    console.error('Agendamea HTTP server error:', err);
    try {
      db.close();
    } catch {
      // Ignore already-closed handle
    }
    process.exit(1);
  });

  const isHeadlessDaemon = process.env.AGENDAMEA_HEADLESS_DAEMON === '1';
  const daemonDataDir = process.env.AGENDAMEA_DATA_DIR
    ? path.resolve(process.env.AGENDAMEA_DATA_DIR)
    : path.join(process.cwd(), 'data');
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
    console.log(`Agendamea server running on http://${HOST}:${actualPort}`);
  });

  let shuttingDown = false;
  const shutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    if (ragSyncTimer) {
      clearTimeout(ragSyncTimer);
      ragSyncTimer = null;
    }
    for (const activeId of Array.from(modelManager.activeControllers.keys())) {
      modelManager.cancelDownload(activeId, { cleanPart: false });
    }
    const unloadPromise = Promise.allSettled([
      sttService.unload(),
      llmService.unload(),
      embeddingService.unload(),
    ]);
    flushOneDriveAutoSync();
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

    server.closeIdleConnections?.();
    server.close(() => {
      const finish = () => {
        clearTimeout(forceExit);
        try {
          db.close();
        } catch {
          // Ignore already-closed handle
        }
        process.exit(0);
      };
      void unloadPromise.finally(() => {
        if (viteServer) {
          void viteServer.close().catch(() => {}).finally(finish);
        } else {
          finish();
        }
      });
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  process.on('message', (msg) => {
    if (msg === 'shutdown') {
      shutdown();
    }
  });
  process.on('disconnect', () => {
    shutdown();
  });
}

startServer().catch((err) => {
  console.error('Failed to start Agendamea server:', err);
  process.exit(1);
});
