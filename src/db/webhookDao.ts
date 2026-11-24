import crypto from 'node:crypto';
import type Database from 'better-sqlite3';
import type { WebhookFormat, WebhookLogEntry, WebhookOutboxEntry } from '../types.ts';

interface WebhookLogRow {
  id: string;
  direction: string;
  event: string;
  target_url: string;
  status_code: number | null;
  ok: number;
  attempts: number;
  latency_ms: number;
  error: string;
  created_at: string;
}

interface WebhookOutboxRow {
  id: string;
  event_id: string;
  event: string;
  target_url: string;
  format: string;
  payload_json?: string;
  status: string;
  attempts: number;
  max_attempts: number;
  next_attempt_at: string;
  last_status_code: number | null;
  last_error: string;
  created_at: string;
  updated_at: string;
}

function normalizeWebhookFormat(raw: string): WebhookFormat {
  return raw === 'discord' || raw === 'slack' || raw === 'generic' ? raw : 'auto';
}

function normalizeOutboxStatus(raw: string): 'pending' | 'delivered' | 'dead_letter' {
  return raw === 'delivered' || raw === 'dead_letter' ? raw : 'pending';
}

function mapOutboxRow(r: WebhookOutboxRow): WebhookOutboxEntry {
  return {
    id: r.id,
    eventId: r.event_id,
    event: r.event,
    targetUrl: r.target_url,
    format: normalizeWebhookFormat(r.format),
    status: normalizeOutboxStatus(r.status),
    attempts: Number(r.attempts) || 0,
    maxAttempts: Number(r.max_attempts) || 6,
    nextAttemptAt: r.next_attempt_at,
    lastStatusCode: r.last_status_code,
    lastError: r.last_error || '',
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function recordWebhookLogDao(
  db: Database.Database,
  entry: {
    direction: 'outgoing' | 'incoming';
    event: string;
    targetUrl?: string;
    statusCode?: number | null;
    ok: boolean;
    attempts?: number;
    latencyMs?: number;
    error?: string;
  },
): WebhookLogEntry {
  const id = `whlog-${crypto.randomUUID()}`;
  const createdAt = new Date().toISOString();
  const row: WebhookLogEntry = {
    id,
    direction: entry.direction === 'incoming' ? 'incoming' : 'outgoing',
    event: String(entry.event || 'unknown').slice(0, 100),
    targetUrl: String(entry.targetUrl || '').slice(0, 500),
    statusCode: typeof entry.statusCode === 'number' ? entry.statusCode : null,
    ok: Boolean(entry.ok),
    attempts: Math.max(1, Math.min(10, Number(entry.attempts) || 1)),
    latencyMs: Math.max(0, Math.round(Number(entry.latencyMs) || 0)),
    error: String(entry.error || '').slice(0, 500),
    createdAt,
  };
  db.prepare(
    `INSERT INTO webhook_logs (id, direction, event, target_url, status_code, ok, attempts, latency_ms, error, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    row.id,
    row.direction,
    row.event,
    row.targetUrl,
    row.statusCode,
    row.ok ? 1 : 0,
    row.attempts,
    row.latencyMs,
    row.error,
    row.createdAt,
  );
  db.prepare(
    'DELETE FROM webhook_logs WHERE id NOT IN (SELECT id FROM webhook_logs ORDER BY created_at DESC LIMIT 200)',
  ).run();
  return row;
}

export function getWebhookLogsDao(db: Database.Database, limit = 30): WebhookLogEntry[] {
  const safeLimit = Math.max(1, Math.min(200, Math.round(Number(limit) || 30)));
  const rows = db
    .prepare('SELECT * FROM webhook_logs ORDER BY created_at DESC LIMIT ?')
    .all(safeLimit) as WebhookLogRow[];
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
}

export function clearWebhookLogsDao(db: Database.Database): number {
  return db.prepare('DELETE FROM webhook_logs').run().changes;
}

export function enqueueWebhookOutboxDao(
  db: Database.Database,
  entry: {
    eventId: string;
    event: string;
    targetUrl: string;
    format: WebhookFormat;
    payloadJson: string;
    status?: 'pending' | 'delivered' | 'dead_letter';
    attempts?: number;
    maxAttempts?: number;
    nextAttemptAt?: string;
    lastStatusCode?: number | null;
    lastError?: string;
  },
): WebhookOutboxEntry {
  const id = `whout-${crypto.randomUUID()}`;
  const nowIso = new Date().toISOString();
  const status = entry.status ?? 'pending';
  const attempts = Math.max(0, Number(entry.attempts ?? 0));
  const maxAttempts = Math.max(1, Math.min(12, Number(entry.maxAttempts ?? 6)));
  const nextAttemptAt = entry.nextAttemptAt || nowIso;
  const lastStatusCode = typeof entry.lastStatusCode === 'number' ? entry.lastStatusCode : null;
  const lastError = String(entry.lastError ?? '').slice(0, 500);
  db.prepare(
    `INSERT INTO webhook_outbox
      (id, event_id, event, target_url, format, payload_json, status, attempts, max_attempts, next_attempt_at, last_status_code, last_error, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    entry.eventId,
    String(entry.event || 'unknown').slice(0, 100),
    String(entry.targetUrl || '').slice(0, 500),
    entry.format || 'auto',
    entry.payloadJson,
    status,
    attempts,
    maxAttempts,
    nextAttemptAt,
    lastStatusCode,
    lastError,
    nowIso,
    nowIso,
  );
  db.prepare(
    'DELETE FROM webhook_outbox WHERE id NOT IN (SELECT id FROM webhook_outbox ORDER BY created_at DESC LIMIT 300)',
  ).run();
  return {
    id,
    eventId: entry.eventId,
    event: entry.event,
    targetUrl: entry.targetUrl,
    format: entry.format || 'auto',
    status,
    attempts,
    maxAttempts,
    nextAttemptAt,
    lastStatusCode,
    lastError,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

export function getWebhookOutboxDao(db: Database.Database, limit = 30): WebhookOutboxEntry[] {
  const safeLimit = Math.max(1, Math.min(200, Math.round(Number(limit) || 30)));
  const rows = db
    .prepare('SELECT * FROM webhook_outbox ORDER BY created_at DESC LIMIT ?')
    .all(safeLimit) as WebhookOutboxRow[];
  return rows.map(mapOutboxRow);
}

export function getDueWebhookOutboxDao(
  db: Database.Database,
  nowIso: string,
  limit = 15,
): Array<WebhookOutboxEntry & { payloadJson: string }> {
  const rows = db
    .prepare(
      `SELECT * FROM webhook_outbox
       WHERE status = 'pending' AND next_attempt_at <= ?
       ORDER BY next_attempt_at ASC
       LIMIT ?`,
    )
    .all(nowIso, limit) as Array<WebhookOutboxRow & { payload_json: string }>;
  return rows.map((r) => ({
    ...mapOutboxRow(r),
    status: 'pending' as const,
    payloadJson: r.payload_json,
  }));
}

export function getWebhookOutboxRowByIdDao(
  db: Database.Database,
  id: string,
): (WebhookOutboxEntry & { payloadJson: string }) | null {
  const r = db.prepare('SELECT * FROM webhook_outbox WHERE id = ?').get(id) as
    | (WebhookOutboxRow & { payload_json: string })
    | undefined;
  if (!r) return null;
  return {
    ...mapOutboxRow(r),
    payloadJson: r.payload_json,
  };
}

export function updateWebhookOutboxEntryDao(
  db: Database.Database,
  id: string,
  patch: {
    status: 'pending' | 'delivered' | 'dead_letter';
    attempts: number;
    nextAttemptAt: string;
    lastStatusCode: number | null;
    lastError: string;
  },
): void {
  db.prepare(
    `UPDATE webhook_outbox
     SET status = ?, attempts = ?, next_attempt_at = ?, last_status_code = ?, last_error = ?, updated_at = ?
     WHERE id = ?`,
  ).run(
    patch.status,
    patch.attempts,
    patch.nextAttemptAt,
    patch.lastStatusCode,
    String(patch.lastError || '').slice(0, 500),
    new Date().toISOString(),
    id,
  );
}

export function claimReminderDispatchDao(
  db: Database.Database,
  todoId: string,
  kind: 'upcoming' | 'due',
  scheduleKey: string,
): boolean {
  const res = db
    .prepare(
      `INSERT OR IGNORE INTO webhook_reminder_dispatches (todo_id, kind, schedule_key, fired_at)
       VALUES (?, ?, ?, ?)`,
    )
    .run(todoId, kind, scheduleKey, new Date().toISOString());
  return res.changes > 0;
}
