'use strict';

/**
 * Production Webhook Engine for Agendamea:
 * - Standard Webhooks signing (webhook-id, webhook-timestamp, webhook-signature v1,<base64>)
 *   + backward-compatible X-Agendamea-* headers
 * - Platform-aware payload formatters (Discord Embeds, Slack Block Kit, Standard JSON)
 *   strictly respecting official platform character & block limits
 * - SSRF & DNS-rebinding defense (metadata/link-local always blocked; optional strict public-only mode;
 *   IP-pinned http/https lookup preserving TLS SNI & Host headers)
 * - Exponential backoff with Full Jitter + Retry-After parsing + retriable vs dead-letter classification
 */

const crypto = require('node:crypto');
const dns = require('node:dns');
const http = require('node:http');
const https = require('node:https');
const net = require('node:net');
const { getAppLogger } = require('./logger.cjs');

const webhookLog = () => getAppLogger('webhook-engine');

const DEFAULT_TIMEOUT_MS = 8000;
const REPLAY_WINDOW_SECONDS = 300;
const BASE_BACKOFF_MS = 2000;
const MAX_BACKOFF_MS = 10 * 60 * 1000;

function extractMappedIpv4(ip) {
  const clean = String(ip || '')
    .toLowerCase()
    .replace(/^\[|\]$/g, '');
  if (!clean.startsWith('::ffff:')) return null;
  const tail = clean.slice(7);
  if (net.isIPv4(tail)) return tail;
  // WHATWG URL normalizes [::ffff:127.0.0.1] -> [::ffff:7f00:1] (two 16-bit hex groups)
  const hexMatch = /^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(tail);
  if (hexMatch) {
    const hi = Number.parseInt(hexMatch[1], 16);
    const lo = Number.parseInt(hexMatch[2], 16);
    if (Number.isFinite(hi) && Number.isFinite(lo)) {
      return `${(hi >> 8) & 255}.${hi & 255}.${(lo >> 8) & 255}.${lo & 255}`;
    }
  }
  return null;
}

function isLoopbackHost(hostname) {
  const h = String(hostname || '')
    .toLowerCase()
    .replace(/^\[|\]$/g, '');
  const mappedV4 = extractMappedIpv4(h);
  if (mappedV4) {
    return mappedV4 === '0.0.0.0' || mappedV4.startsWith('127.');
  }
  return h === 'localhost' || h === '::1' || h === '0.0.0.0' || h.startsWith('127.');
}

function isMetadataOrLinkLocalIp(ip) {
  const clean = String(ip || '')
    .toLowerCase()
    .replace(/^\[|\]$/g, '');
  const mappedV4 = extractMappedIpv4(clean);
  if (mappedV4) {
    return isMetadataOrLinkLocalIp(mappedV4);
  }
  if (net.isIPv4(clean)) {
    const parts = clean.split('.').map(Number);
    if (parts[0] === 169 && parts[1] === 254) return true; // Cloud metadata / APIPA
    if (parts[0] === 0) return true; // 0.0.0.0/8
    return false;
  }
  if (net.isIPv6(clean)) {
    if (clean === '::' || clean.startsWith('fe80:') || clean === 'fd00:ec2::254') return true;
    return false;
  }
  return false;
}

function isPrivateOrLoopbackIp(ip) {
  const clean = String(ip || '')
    .toLowerCase()
    .replace(/^\[|\]$/g, '');
  if (isMetadataOrLinkLocalIp(clean)) return true;
  const mappedV4 = extractMappedIpv4(clean);
  if (mappedV4) {
    return isPrivateOrLoopbackIp(mappedV4);
  }
  if (net.isIPv4(clean)) {
    const parts = clean.split('.').map(Number);
    if (parts[0] === 10) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
    if (parts[0] === 127) return true;
    if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return true; // CGNAT
    return false;
  }
  if (net.isIPv6(clean)) {
    if (clean === '::1' || clean.startsWith('fc') || clean.startsWith('fd')) return true;
    return false;
  }
  return false;
}

function validateWebhookUrlSyntax(rawUrl, options = {}) {
  const allowLocalNetwork = options.allowLocalNetwork !== false;
  const activeListenPort = Number(options.activeListenPort) || 0;
  try {
    const parsed = new URL(String(rawUrl || '').trim());
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { ok: false, error: 'Only http:// and https:// URLs are allowed.' };
    }
    const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (!host) {
      return { ok: false, error: 'Webhook hostname is missing.' };
    }
    if (
      host === '169.254.169.254' ||
      host === 'metadata.google.internal' ||
      host === 'metadata.azure.internal' ||
      host === 'fd00:ec2::254' ||
      isMetadataOrLinkLocalIp(host)
    ) {
      return { ok: false, error: 'Blocked metadata/link-local SSRF destination.' };
    }

    const targetPort = parsed.port ? Number(parsed.port) : parsed.protocol === 'https:' ? 443 : 80;
    if (isLoopbackHost(host) && activeListenPort > 0 && targetPort === activeListenPort) {
      return { ok: false, error: 'Blocked self-recursive webhook targeting Agendamea port.' };
    }

    if (
      !allowLocalNetwork &&
      (isLoopbackHost(host) || (net.isIP(host) && isPrivateOrLoopbackIp(host)))
    ) {
      return {
        ok: false,
        error: 'Blocked local/private network target (enable local network access to allow).',
      };
    }

    return { ok: true, parsed };
  } catch {
    return { ok: false, error: 'Invalid webhook URL syntax (http/https required).' };
  }
}

function parseWebhookUrls(rawUrls, options = {}) {
  return String(rawUrls || '')
    .split(/[\r\n,]+/)
    .map((u) => u.trim())
    .filter((u) => Boolean(u) && validateWebhookUrlSyntax(u, options).ok);
}

function isWebhookEventAllowed(configuredEvents, event) {
  if (event === 'webhook.test') return true;
  const raw = String(configuredEvents || '').trim();
  if (!raw || raw === '*') return true;
  const allowed = raw
    .split(/[\s,]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (allowed.length === 0 || allowed.includes('*')) return true;
  const lowerEvent = String(event || '').toLowerCase();
  return allowed.some((pattern) =>
    pattern.endsWith('.*') ? lowerEvent.startsWith(pattern.slice(0, -1)) : lowerEvent === pattern,
  );
}

function detectPlatformFormat(targetUrl, requestedFormat = 'auto') {
  const fmt = String(requestedFormat || 'auto')
    .trim()
    .toLowerCase();
  if (fmt === 'discord' || fmt === 'slack' || fmt === 'generic') return fmt;
  try {
    const parsed = new URL(String(targetUrl || '').trim());
    const host = parsed.hostname.toLowerCase();
    const p = parsed.pathname.toLowerCase();
    if (
      (host === 'discord.com' || host.endsWith('.discord.com') || host === 'discordapp.com') &&
      p.includes('/api/webhooks/')
    ) {
      return 'discord';
    }
    if (host === 'hooks.slack.com' && p.startsWith('/services/')) {
      return 'slack';
    }
  } catch {
    // Ignore
  }
  return 'generic';
}

function truncateText(text, maxLen) {
  const clean = String(text || '').trim();
  if (clean.length <= maxLen) return clean;
  return `${clean.slice(0, Math.max(0, maxLen - 3))}...`;
}

function priorityColorInt(priority) {
  if (priority === 'high') return 0xef4444;
  if (priority === 'low') return 0x6b7280;
  return 0x3b82f6;
}

/**
 * @param {{
 *   event: string,
 *   data?: unknown,
 *   targetUrl: string,
 *   format?: string,
 *   appVersion?: string,
 *   eventId?: string | null,
 *   timestampIso?: string | null,
 * }} params
 */
function buildWebhookPayload({
  event,
  data,
  targetUrl,
  format = 'auto',
  appVersion = '1.1.0',
  eventId,
  timestampIso,
}) {
  const resolvedFormat = detectPlatformFormat(targetUrl, format);
  const ts = timestampIso || new Date().toISOString();
  const id = eventId || `msg_${crypto.randomUUID().replace(/-/g, '')}`;
  /** @type {Record<string, any>} */
  const obj = data && typeof data === 'object' ? data : {};
  const title =
    typeof obj.title === 'string' && obj.title.trim()
      ? obj.title.trim()
      : typeof obj.name === 'string' && obj.name.trim()
        ? obj.name.trim()
        : '';
  const summaryLine = truncateText(`[Agendamea] ${event}${title ? `: ${title}` : ''}`, 1900);

  if (resolvedFormat === 'discord') {
    const fields = [];
    if (obj.priority)
      fields.push({
        name: 'Priority',
        value: truncateText(String(obj.priority), 1024),
        inline: true,
      });
    if (obj.dueDate) {
      const sched = obj.dueTime ? `${obj.dueDate} ${obj.dueTime}` : String(obj.dueDate);
      fields.push({ name: 'Due', value: truncateText(sched, 1024), inline: true });
    }
    if (typeof obj.completed === 'boolean') {
      fields.push({ name: 'Status', value: obj.completed ? 'Completed' : 'Active', inline: true });
    }
    if (Array.isArray(obj.tags) && obj.tags.length > 0) {
      fields.push({ name: 'Tags', value: truncateText(obj.tags.join(', '), 1024), inline: false });
    }

    const embedTitle = truncateText(title ? `${event}: ${title}` : `Agendamea - ${event}`, 256);
    const rawDesc =
      typeof obj.notes === 'string' && obj.notes.trim() ? obj.notes.trim() : summaryLine;
    // Enforce Discord 6,000 total embed char budget cleanly
    const fieldsLen = fields.reduce((acc, f) => acc + f.name.length + f.value.length, 0);
    const footerText = `Agendamea ${appVersion} - ${id}`;
    const descBudget = Math.max(
      120,
      Math.min(4000, 5800 - embedTitle.length - fieldsLen - footerText.length),
    );
    const embed = {
      title: embedTitle,
      description: truncateText(rawDesc, descBudget),
      color: priorityColorInt(obj.priority),
      timestamp: ts,
      fields: fields.slice(0, 25),
      footer: { text: truncateText(footerText, 2048) },
    };
    return {
      format: 'discord',
      eventId: id,
      body: {
        content: summaryLine,
        embeds: [embed],
      },
    };
  }

  if (resolvedFormat === 'slack') {
    const headerText = truncateText(title ? `${event}: ${title}` : `Agendamea - ${event}`, 150);
    const detailParts = [];
    if (obj.priority) detailParts.push(`*Priority:* ${obj.priority}`);
    if (obj.dueDate)
      detailParts.push(`*Due:* ${obj.dueDate}${obj.dueTime ? ` ${obj.dueTime}` : ''}`);
    if (typeof obj.completed === 'boolean')
      detailParts.push(`*Status:* ${obj.completed ? 'Completed' : 'Active'}`);
    if (Array.isArray(obj.tags) && obj.tags.length > 0)
      detailParts.push(`*Tags:* ${obj.tags.join(', ')}`);
    if (typeof obj.notes === 'string' && obj.notes.trim()) detailParts.push(obj.notes.trim());
    const sectionText = truncateText(detailParts.join('\n') || summaryLine, 3000);

    return {
      format: 'slack',
      eventId: id,
      body: {
        text: summaryLine,
        blocks: [
          { type: 'header', text: { type: 'plain_text', text: headerText, emoji: false } },
          { type: 'section', text: { type: 'mrkdwn', text: sectionText } },
          {
            type: 'context',
            elements: [
              {
                type: 'mrkdwn',
                text: truncateText(`Agendamea ${appVersion} | ${id} | ${ts}`, 250),
              },
            ],
          },
        ],
      },
    };
  }

  return {
    format: 'generic',
    eventId: id,
    body: {
      id,
      event,
      type: event,
      timestamp: ts,
      app: 'Agendamea',
      version: appVersion,
      content: summaryLine,
      text: summaryLine,
      data,
    },
  };
}

function decodeStandardWebhookKey(secret) {
  const clean = String(secret || '').trim();
  if (clean.startsWith('whsec_')) {
    return Buffer.from(clean.slice(6), 'base64');
  }
  return Buffer.from(clean, 'utf8');
}

function buildWebhookHeaders({
  event,
  eventId,
  timestampSec,
  rawBody,
  secret,
  appVersion = '1.1.0',
}) {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'User-Agent': `Agendamea-Webhook/${appVersion}`,
    'X-Agendamea-Event': event,
    'X-Agendamea-Timestamp': String(timestampSec),
    'webhook-id': eventId,
    'webhook-timestamp': String(timestampSec),
  };

  const cleanSecret = String(secret || '').trim();
  if (cleanSecret) {
    // 1. Legacy Agendamea HMAC-SHA256 hex signature
    const legacyHex = crypto.createHmac('sha256', cleanSecret).update(rawBody).digest('hex');
    headers['X-Agendamea-Signature'] = `sha256=${legacyHex}`;

    // 2. Standard Webhooks v1 HMAC-SHA256 base64 signature over `${id}.${timestamp}.${rawBody}`
    const keyBuf = decodeStandardWebhookKey(cleanSecret);
    const signedPayload = `${eventId}.${timestampSec}.${rawBody}`;
    const v1Base64 = crypto.createHmac('sha256', keyBuf).update(signedPayload).digest('base64');
    headers['webhook-signature'] = `v1,${v1Base64}`;
  }
  return headers;
}

function timingSafeCompareStr(a, b) {
  const bufA = Buffer.from(String(a || ''), 'utf8');
  const bufB = Buffer.from(String(b || ''), 'utf8');
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Verifies incoming webhook authentication across:
 * 1. Direct secret header (`X-Agendamea-Secret` or body.secret)
 * 2. Legacy HMAC header (`X-Agendamea-Signature: sha256=<hex>`)
 * 3. Standard Webhooks headers (`webhook-id`, `webhook-timestamp`, `webhook-signature: v1,<b64>`)
 * Enforces +/- 300s replay window whenever `webhook-timestamp` or `X-Agendamea-Timestamp` is sent.
 */
function verifyIncomingWebhookAuth({
  headers = {},
  body = {},
  rawBody = '',
  configuredSecret = '',
  nowMs = Date.now(),
}) {
  const cleanSecret = String(configuredSecret || '').trim();
  if (!cleanSecret) {
    return { ok: true, method: 'none' };
  }

  const tsRaw = String(
    headers['webhook-timestamp'] ?? headers['x-agendamea-timestamp'] ?? '',
  ).trim();
  if (tsRaw) {
    const tsSec = Number.parseInt(tsRaw, 10);
    const nowSec = Math.floor(nowMs / 1000);
    if (!Number.isFinite(tsSec) || Math.abs(nowSec - tsSec) > REPLAY_WINDOW_SECONDS) {
      return { ok: false, reason: 'stale_timestamp' };
    }
  }

  const bodyObj = /** @type {Record<string, any>} */ (body && typeof body === 'object' ? body : {});
  const providedSecret = String(headers['x-agendamea-secret'] ?? bodyObj.secret ?? '').trim();
  if (providedSecret) {
    return timingSafeCompareStr(providedSecret, cleanSecret)
      ? { ok: true, method: 'secret' }
      : { ok: false, reason: 'invalid_secret' };
  }

  const bodyStr =
    typeof rawBody === 'string' && rawBody.length > 0 ? rawBody : JSON.stringify(body ?? {});
  const stdSig = String(headers['webhook-signature'] ?? '').trim();
  const stdId = String(headers['webhook-id'] ?? '').trim();
  if (stdSig && stdId && tsRaw) {
    const keyBuf = decodeStandardWebhookKey(cleanSecret);
    const expected = crypto
      .createHmac('sha256', keyBuf)
      .update(`${stdId}.${tsRaw}.${bodyStr}`)
      .digest('base64');
    const candidates = stdSig.split(/\s+/).filter(Boolean);
    for (const token of candidates) {
      if (token.startsWith('v1,') && timingSafeCompareStr(token.slice(3), expected)) {
        return { ok: true, method: 'standard_webhooks_v1' };
      }
    }
    return { ok: false, reason: 'invalid_standard_signature' };
  }

  const legacySig = String(headers['x-agendamea-signature'] ?? '').trim();
  if (legacySig.startsWith('sha256=')) {
    const expected = `sha256=${crypto.createHmac('sha256', cleanSecret).update(bodyStr).digest('hex')}`;
    return timingSafeCompareStr(legacySig, expected)
      ? { ok: true, method: 'legacy_hmac' }
      : { ok: false, reason: 'invalid_signature' };
  }

  return { ok: false, reason: 'missing_credentials' };
}

function isRetriableHttpStatus(statusCode) {
  const code = Number(statusCode);
  return code === 408 || code === 429 || (code >= 500 && code <= 599);
}

function parseRetryAfterMs(headerValue, nowMs = Date.now()) {
  if (!headerValue) return null;
  const raw = String(headerValue).trim();
  if (!raw) return null;
  const secs = Number(raw);
  if (Number.isFinite(secs) && secs >= 0) {
    return Math.min(MAX_BACKOFF_MS, Math.round(secs * 1000));
  }
  const dateMs = Date.parse(raw);
  if (!Number.isNaN(dateMs)) {
    return Math.min(MAX_BACKOFF_MS, Math.max(0, dateMs - nowMs));
  }
  return null;
}

function computeFullJitterBackoffMs(
  attemptIndex,
  baseMs = BASE_BACKOFF_MS,
  capMs = MAX_BACKOFF_MS,
) {
  const exp = Math.min(capMs, baseMs * 2 ** Math.max(0, Number(attemptIndex) || 0));
  return Math.max(200, Math.floor(Math.random() * exp));
}

async function resolveAndPinHost(hostname, options = {}) {
  const allowLocalNetwork = options.allowLocalNetwork !== false;
  const cleanHost = String(hostname || '')
    .toLowerCase()
    .replace(/^\[|\]$/g, '');
  if (net.isIP(cleanHost)) {
    if (isMetadataOrLinkLocalIp(cleanHost)) {
      throw new Error(`SSRF Blocked: ${cleanHost} is link-local/metadata IP.`);
    }
    if (!allowLocalNetwork && isPrivateOrLoopbackIp(cleanHost)) {
      throw new Error(`SSRF Blocked: ${cleanHost} is private/loopback IP.`);
    }
    return { address: cleanHost, family: net.isIPv6(cleanHost) ? 6 : 4 };
  }

  const records = await dns.promises.lookup(cleanHost, { all: true });
  if (!records || records.length === 0) {
    throw new Error(`DNS resolution failed for ${cleanHost}`);
  }
  for (const rec of records) {
    if (isMetadataOrLinkLocalIp(rec.address)) {
      throw new Error(`SSRF/DNS-Rebinding Blocked: ${cleanHost} resolved to ${rec.address}`);
    }
    if (!allowLocalNetwork && isPrivateOrLoopbackIp(rec.address)) {
      throw new Error(
        `SSRF/DNS-Rebinding Blocked: ${cleanHost} resolved to private IP ${rec.address}`,
      );
    }
  }
  return { address: records[0].address, family: records[0].family };
}

/**
 * @param {{
 *   targetUrl: string,
 *   secret?: string,
 *   event: string,
 *   data?: unknown,
 *   rawBodyOverride?: string | null,
 *   eventId?: string | null,
 *   format?: string,
 *   appVersion?: string,
 *   allowLocalNetwork?: boolean,
 *   activeListenPort?: number,
 *   timeoutMs?: number,
 * }} params
 */
async function deliverWebhookOnce({
  targetUrl,
  secret = '',
  event,
  data,
  rawBodyOverride = null,
  eventId = null,
  format = 'auto',
  appVersion = '1.1.0',
  allowLocalNetwork = true,
  activeListenPort = 0,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) {
  const startedAt = Date.now();
  const syntax = validateWebhookUrlSyntax(targetUrl, { allowLocalNetwork, activeListenPort });
  if (!syntax.ok) {
    return {
      ok: false,
      retriable: false,
      statusCode: null,
      latencyMs: 0,
      error: syntax.error,
      eventId: eventId || `msg_${crypto.randomUUID().replace(/-/g, '')}`,
    };
  }

  const parsed = syntax.parsed;
  const resolvedEventId = eventId || `msg_${crypto.randomUUID().replace(/-/g, '')}`;
  const timestampSec = Math.floor(Date.now() / 1000);
  const built = rawBodyOverride
    ? {
        format: detectPlatformFormat(targetUrl, format),
        eventId: resolvedEventId,
        rawBody: rawBodyOverride,
      }
    : (() => {
        const p = buildWebhookPayload({
          event,
          data,
          targetUrl,
          format,
          appVersion,
          eventId: resolvedEventId,
        });
        return { format: p.format, eventId: p.eventId, rawBody: JSON.stringify(p.body) };
      })();

  let pinned;
  try {
    pinned = await resolveAndPinHost(parsed.hostname, { allowLocalNetwork });
  } catch (err) {
    const rawMsg = err instanceof Error ? err.message : 'DNS validation failed';
    const isSecurityBlock = rawMsg.includes('SSRF');
    if (!isSecurityBlock) {
      webhookLog().error({ event, err }, 'Webhook DNS validation failed');
    }
    return {
      ok: false,
      retriable: !isSecurityBlock,
      statusCode: null,
      latencyMs: Date.now() - startedAt,
      error: isSecurityBlock ? 'Blocked by SSRF policy.' : 'Webhook DNS lookup failed.',
      eventId: built.eventId,
      format: built.format,
    };
  }

  const bodyBuf = Buffer.from(built.rawBody, 'utf8');
  const isHostedChatWebhook =
    (built.format === 'discord' || built.format === 'slack') &&
    (parsed.hostname.toLowerCase() === 'discord.com' ||
      parsed.hostname.toLowerCase().endsWith('.discord.com') ||
      parsed.hostname.toLowerCase() === 'discordapp.com' ||
      parsed.hostname.toLowerCase() === 'hooks.slack.com');
  const headers = buildWebhookHeaders({
    event,
    eventId: built.eventId,
    timestampSec,
    rawBody: built.rawBody,
    secret: isHostedChatWebhook ? '' : secret,
    appVersion,
  });
  headers['Content-Length'] = String(bodyBuf.length);

  const isHttps = parsed.protocol === 'https:';
  const transport = isHttps ? https : http;
  const pinnedLookup = (_hostname, opts, cb) => {
    const callback = typeof opts === 'function' ? opts : cb;
    if (opts && typeof opts === 'object' && opts.all) {
      callback(null, [{ address: pinned.address, family: pinned.family }]);
      return;
    }
    callback(null, pinned.address, pinned.family);
  };

  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve({
        ...result,
        latencyMs: Date.now() - startedAt,
        eventId: built.eventId,
        format: built.format,
      });
    };

    const req = transport.request(
      {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port || (isHttps ? 443 : 80),
        path: `${parsed.pathname}${parsed.search}`,
        method: 'POST',
        headers,
        lookup: pinnedLookup,
        timeout: timeoutMs,
      },
      (res) => {
        const code = res.statusCode || 0;
        const ok = code >= 200 && code < 300;
        const MAX_ERR_BYTES = 512;
        const chunks = [];
        let collected = 0;
        if (ok) {
          res.resume();
        } else {
          res.on('data', (chunk) => {
            if (collected >= MAX_ERR_BYTES) return;
            const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), 'utf8');
            const slice = buf.subarray(0, MAX_ERR_BYTES - collected);
            chunks.push(slice);
            collected += slice.length;
          });
        }
        res.on('end', () => {
          const retryAfterMs = parseRetryAfterMs(res.headers['retry-after']);
          let snippet = '';
          if (!ok && chunks.length > 0) {
            snippet = Buffer.concat(chunks)
              .toString('utf8')
              .replace(/[\r\n\t]+/g, ' ')
              .replace(/\s{2,}/g, ' ')
              .trim()
              .slice(0, 280);
          }
          finish({
            ok,
            retriable: !ok && isRetriableHttpStatus(code),
            statusCode: code,
            retryAfterMs,
            responseBody: snippet || undefined,
            error: ok ? undefined : snippet ? `HTTP ${code}: ${snippet}` : `HTTP ${code}`,
          });
        });
      },
    );

    req.on('timeout', () => {
      req.destroy(new Error('Webhook request timed out.'));
    });
    req.on('error', (err) => {
      const isTimeout = err instanceof Error && err.message === 'Webhook request timed out.';
      if (!isTimeout) {
        webhookLog().error({ event, err }, 'Webhook network request failed');
      }
      const rawCode = /** @type {NodeJS.ErrnoException} */ (err)?.code;
      const errCode = typeof rawCode === 'string' && /^[A-Z0-9_]+$/i.test(rawCode) ? rawCode : '';
      finish({
        ok: false,
        retriable: true,
        statusCode: null,
        retryAfterMs: null,
        error: isTimeout
          ? 'Webhook request timed out.'
          : errCode
            ? `Webhook network error (${errCode}).`
            : 'Webhook network error.',
      });
    });

    req.write(bodyBuf);
    req.end();
  });
}

module.exports = {
  REPLAY_WINDOW_SECONDS,
  BASE_BACKOFF_MS,
  MAX_BACKOFF_MS,
  isLoopbackHost,
  isMetadataOrLinkLocalIp,
  isPrivateOrLoopbackIp,
  validateWebhookUrlSyntax,
  parseWebhookUrls,
  isWebhookEventAllowed,
  detectPlatformFormat,
  buildWebhookPayload,
  buildWebhookHeaders,
  verifyIncomingWebhookAuth,
  isRetriableHttpStatus,
  parseRetryAfterMs,
  computeFullJitterBackoffMs,
  deliverWebhookOnce,
};
