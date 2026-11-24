'use strict';

const crypto = require('node:crypto');
const { APP_VERSION, loadLazy, resolveApiBaseUrl, httpRequest } = require('./httpTransport.cjs');
const { withOfflineDb, getBootstrap } = require('./offlineDb.cjs');

const getWebhookEngine = () => loadLazy('webhookEngine', () => require('../webhookEngine.cjs'));

const BLOCKED_WEBHOOK_HOSTS_OFFLINE = new Set([
  '169.254.169.254',
  'metadata.google.internal',
  '[fd00:ec2::254]',
]);

function isValidWebhookUrlOffline(raw) {
  if (!raw) return false;
  try {
    const p = new URL(raw);
    if (p.protocol !== 'http:' && p.protocol !== 'https:') return false;
    const host = p.hostname.toLowerCase();
    if (BLOCKED_WEBHOOK_HOSTS_OFFLINE.has(host) || host.startsWith('169.254.')) return false;
    return true;
  } catch {
    return false;
  }
}

function isWebhookEventAllowedOffline(configuredEvents, event) {
  if (event === 'webhook.test') return true;
  const raw = String(configuredEvents || '').trim();
  if (!raw || raw === '*') return true;
  const allowed = raw
    .split(/[\s,]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (allowed.length === 0 || allowed.includes('*')) return true;
  const lower = String(event || '').toLowerCase();
  return allowed.some((pat) =>
    pat.endsWith('.*') ? lower.startsWith(pat.slice(0, -1)) : lower === pat,
  );
}

function recordWebhookLogOffline(entry) {
  try {
    withOfflineDb((db) => {
      const id = `whlog-${crypto.randomUUID()}`;
      const createdAt = new Date().toISOString();
      db.prepare(
        `INSERT INTO webhook_logs (id, direction, event, target_url, status_code, ok, attempts, latency_ms, error, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        entry.direction === 'incoming' ? 'incoming' : 'outgoing',
        String(entry.event || 'unknown').slice(0, 100),
        String(entry.targetUrl || '').slice(0, 500),
        typeof entry.statusCode === 'number' ? entry.statusCode : null,
        entry.ok ? 1 : 0,
        Math.max(1, Number(entry.attempts) || 1),
        Math.max(0, Math.round(Number(entry.latencyMs) || 0)),
        String(entry.error || '').slice(0, 500),
        createdAt,
      );
      db.prepare(
        'DELETE FROM webhook_logs WHERE id NOT IN (SELECT id FROM webhook_logs ORDER BY created_at DESC LIMIT 200)',
      ).run();
    });
  } catch {
    // Ignore logging errors
  }
}

async function deliverSingleWebhookOffline(
  targetUrl,
  secret,
  event,
  data,
  maxAttempts = 2,
  options = {},
) {
  const wh = getWebhookEngine();
  const format = options.format || 'auto';
  const allowLocalNetwork = options.allowLocalNetwork !== false;
  const eventId = options.eventId || `msg_${crypto.randomUUID().replace(/-/g, '')}`;
  const built = wh.buildWebhookPayload({
    event,
    data,
    targetUrl,
    format,
    appVersion: APP_VERSION,
    eventId,
  });
  const rawBody = JSON.stringify(built.body);
  const startedAt = Date.now();
  /** @type {Record<string, any>} */
  let lastResult = {
    ok: false,
    retriable: true,
    latencyMs: 0,
    attempts: 1,
    error: 'Webhook failed',
  };

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const res = await wh.deliverWebhookOnce({
      targetUrl,
      secret,
      event,
      data,
      rawBodyOverride: rawBody,
      eventId,
      format,
      appVersion: APP_VERSION,
      allowLocalNetwork,
      timeoutMs: 3500,
    });
    lastResult = {
      ok: res.ok,
      retriable: res.retriable,
      statusCode: res.statusCode ?? undefined,
      latencyMs: Date.now() - startedAt,
      attempts: attempt,
      retryAfterMs: res.retryAfterMs,
      error: res.error,
    };
    if (res.ok || !res.retriable) break;
    if (attempt < maxAttempts) {
      const delayMs =
        res.retryAfterMs !== null && res.retryAfterMs !== undefined
          ? Math.min(2000, res.retryAfterMs)
          : 200;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  recordWebhookLogOffline({
    direction: 'outgoing',
    event,
    targetUrl: String(targetUrl).trim(),
    statusCode: lastResult.statusCode ?? null,
    ok: lastResult.ok,
    attempts: lastResult.attempts,
    latencyMs: lastResult.latencyMs,
    error: lastResult.error || '',
  });

  if (!lastResult.ok && event !== 'webhook.test' && options.enqueueOnFailure !== false) {
    try {
      withOfflineDb((db) => {
        const nowIso = new Date().toISOString();
        const nextIso = new Date(
          Date.now() + wh.computeFullJitterBackoffMs(lastResult.attempts),
        ).toISOString();
        db.prepare(
          `INSERT INTO webhook_outbox
            (id, event_id, event, target_url, format, payload_json, status, attempts, max_attempts, next_attempt_at, last_status_code, last_error, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          `whout-${crypto.randomUUID()}`,
          eventId,
          event,
          String(targetUrl).trim(),
          built.format,
          rawBody,
          lastResult.retriable ? 'pending' : 'dead_letter',
          lastResult.attempts,
          6,
          nextIso,
          lastResult.statusCode ?? null,
          String(lastResult.error || '').slice(0, 500),
          nowIso,
          nowIso,
        );
      });
    } catch {
      // Never block primary mutation if outbox insert fails
    }
  }

  return lastResult;
}

async function deliverWebhookOffline(targetUrlsRaw, secret, event, data, options = {}) {
  const wh = getWebhookEngine();
  const allowLocalNetwork = options.allowLocalNetwork !== false;
  const urls = wh.parseWebhookUrls(targetUrlsRaw, { allowLocalNetwork });
  if (urls.length === 0) {
    return { ok: false, latencyMs: 0, error: 'Invalid webhook URL (http/https required).' };
  }
  if (urls.length === 1) {
    return deliverSingleWebhookOffline(urls[0], secret, event, data, 2, options);
  }
  const startedAt = Date.now();
  const results = await Promise.all(
    urls.map(async (url) => {
      const r = await deliverSingleWebhookOffline(url, secret, event, data, 2, options);
      return { url, ok: r.ok, statusCode: r.statusCode, error: r.error };
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

async function dispatchConfiguredWebhookOffline(settings, event, data) {
  if (!settings?.webhookEnabled || !settings?.webhookUrl) return;
  const wh = getWebhookEngine();
  const allowLocalNetwork = settings.webhookAllowLocalNetwork !== false;
  const urls = wh.parseWebhookUrls(settings.webhookUrl, { allowLocalNetwork });
  if (urls.length === 0) return;
  const overrides =
    settings.webhookEndpointOverrides && typeof settings.webhookEndpointOverrides === 'object'
      ? settings.webhookEndpointOverrides
      : {};
  try {
    await Promise.all(
      urls.map(async (url) => {
        const ov = overrides[url];
        if (ov && ov.enabled === false) return;
        const effectiveEvents =
          ov && typeof ov.events === 'string' && ov.events.trim()
            ? ov.events
            : settings.webhookEvents;
        if (!isWebhookEventAllowedOffline(effectiveEvents, event)) return;
        const effectiveSecret =
          ov && typeof ov.secret === 'string' && ov.secret.trim()
            ? ov.secret
            : settings.webhookSecret || '';
        const effectiveFormat =
          ov &&
          (ov.format === 'auto' ||
            ov.format === 'generic' ||
            ov.format === 'discord' ||
            ov.format === 'slack')
            ? ov.format
            : settings.webhookFormat || 'auto';
        await deliverSingleWebhookOffline(url, effectiveSecret, event, data, 2, {
          format: effectiveFormat,
          allowLocalNetwork,
        });
      }),
    );
  } catch {
    // Never fail primary offline mutation on webhook error
  }
}

async function testWebhook(urlOverride, secretOverride) {
  const baseUrl = await resolveApiBaseUrl();
  if (baseUrl) {
    return httpRequest(baseUrl, 'POST', '/api/webhooks/test', {
      ...(urlOverride ? { url: urlOverride } : {}),
      ...(secretOverride !== undefined ? { secret: secretOverride } : {}),
    });
  }
  const { bootstrap } = await getBootstrap();
  const settings = bootstrap.settings;
  const targetUrl = (urlOverride || settings.webhookUrl || '').trim();
  const secret = (
    secretOverride !== undefined ? secretOverride : settings.webhookSecret || ''
  ).trim();
  if (!targetUrl) {
    throw new Error('No webhook URL configured. Run: ag hook set <url>');
  }
  return deliverWebhookOffline(targetUrl, secret, 'webhook.test', {
    title: 'Agendamea Webhook Test',
    mode: 'offline-cli',
  });
}

async function getWebhookLogs(limit = 30) {
  const safeLimit = Math.max(1, Math.min(200, Math.round(Number(limit) || 30)));
  const baseUrl = await resolveApiBaseUrl();
  if (baseUrl) {
    return httpRequest(baseUrl, 'GET', `/api/webhooks/logs?limit=${safeLimit}`);
  }
  return withOfflineDb((db) => {
    const rows = db
      .prepare('SELECT * FROM webhook_logs ORDER BY created_at DESC LIMIT ?')
      .all(safeLimit);
    return rows.map((r) => ({
      id: r.id,
      direction: r.direction === 'incoming' ? 'incoming' : 'outgoing',
      event: r.event,
      targetUrl: r.target_url,
      statusCode: r.status_code,
      ok: Boolean(r.ok),
      attempts: Number(r.attempts) || 1,
      latencyMs: Number(r.latency_ms) || 0,
      error: r.error || '',
      createdAt: r.created_at,
    }));
  });
}

async function clearWebhookLogs() {
  const baseUrl = await resolveApiBaseUrl();
  if (baseUrl) {
    return httpRequest(baseUrl, 'DELETE', '/api/webhooks/logs');
  }
  return withOfflineDb((db) => {
    const cleared = db.prepare('DELETE FROM webhook_logs').run().changes;
    return { ok: true, cleared };
  });
}

async function getWebhookOutbox(limit = 30) {
  const safeLimit = Math.max(1, Math.min(200, Math.round(Number(limit) || 30)));
  const baseUrl = await resolveApiBaseUrl();
  if (baseUrl) {
    return httpRequest(baseUrl, 'GET', `/api/webhooks/outbox?limit=${safeLimit}`);
  }
  return withOfflineDb((db) => {
    const rows = db
      .prepare('SELECT * FROM webhook_outbox ORDER BY created_at DESC LIMIT ?')
      .all(safeLimit);
    return rows.map((r) => ({
      id: r.id,
      eventId: r.event_id,
      event: r.event,
      targetUrl: r.target_url,
      format: r.format || 'auto',
      status: r.status,
      attempts: Number(r.attempts) || 0,
      maxAttempts: Number(r.max_attempts) || 6,
      nextAttemptAt: r.next_attempt_at,
      lastStatusCode: r.last_status_code,
      lastError: r.last_error || '',
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  });
}

async function replayWebhookOutbox(outboxId) {
  const cleanId = String(outboxId || '').trim();
  if (!cleanId) throw new Error('Outbox entry ID is required.');
  const baseUrl = await resolveApiBaseUrl();
  if (baseUrl) {
    return httpRequest(baseUrl, 'POST', `/api/webhooks/replay/${encodeURIComponent(cleanId)}`, {});
  }
  const { bootstrap } = await getBootstrap();
  const settings = bootstrap.settings;
  const row = withOfflineDb((db) =>
    db.prepare('SELECT * FROM webhook_outbox WHERE id = ?').get(cleanId),
  );
  if (!row) throw new Error(`Webhook outbox item not found: ${cleanId}`);
  const wh = getWebhookEngine();
  const res = await wh.deliverWebhookOnce({
    targetUrl: row.target_url,
    secret: settings.webhookSecret || '',
    event: row.event,
    rawBodyOverride: row.payload_json,
    eventId: row.event_id,
    format: row.format || settings.webhookFormat || 'auto',
    appVersion: APP_VERSION,
    allowLocalNetwork: settings.webhookAllowLocalNetwork !== false,
  });
  const nowIso = new Date().toISOString();
  withOfflineDb((db) => {
    db.prepare(
      `UPDATE webhook_outbox
       SET status = ?, attempts = attempts + 1, last_status_code = ?, last_error = ?, updated_at = ?
       WHERE id = ?`,
    ).run(
      res.ok ? 'delivered' : res.retriable ? 'pending' : 'dead_letter',
      res.statusCode ?? null,
      res.error || '',
      nowIso,
      cleanId,
    );
  });
  recordWebhookLogOffline({
    direction: 'outgoing',
    event: row.event,
    targetUrl: row.target_url,
    statusCode: res.statusCode ?? null,
    ok: res.ok,
    attempts: (Number(row.attempts) || 0) + 1,
    latencyMs: res.latencyMs,
    error: res.error || '',
  });
  return { ok: res.ok, id: cleanId, statusCode: res.statusCode ?? null, error: res.error };
}

module.exports = {
  isValidWebhookUrlOffline,
  isWebhookEventAllowedOffline,
  recordWebhookLogOffline,
  deliverSingleWebhookOffline,
  deliverWebhookOffline,
  dispatchConfiguredWebhookOffline,
  testWebhook,
  getWebhookLogs,
  clearWebhookLogs,
  getWebhookOutbox,
  replayWebhookOutbox,
};
