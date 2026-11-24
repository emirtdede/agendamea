import crypto from 'node:crypto';
import webhookEngine from '../../shared/webhookEngine.cjs';
import type { TodoDatabase } from '../../src/db/database.ts';

export function createWebhookService(options: {
  db: TodoDatabase;
  appVersion: string;
  getActiveListenPort: () => number;
}) {
  const { db, appVersion, getActiveListenPort } = options;

  function parseWebhookUrls(rawUrl: string, allowLocalNetwork = true): string[] {
    return webhookEngine.parseWebhookUrls(rawUrl, {
      allowLocalNetwork,
      activeListenPort: getActiveListenPort(),
    });
  }

  function isWebhookEventAllowed(configuredEvents: string | undefined, event: string): boolean {
    return webhookEngine.isWebhookEventAllowed(configuredEvents, event);
  }

  async function deliverSingleWebhookWithRetry(
    targetUrl: string,
    secret: string,
    event: string,
    data: unknown,
    maxAttempts = 2,
    opts?: {
      format?: 'auto' | 'generic' | 'discord' | 'slack';
      allowLocalNetwork?: boolean;
      enqueueOnFailure?: boolean;
      eventId?: string;
    },
  ): Promise<{
    ok: boolean;
    statusCode?: number;
    latencyMs: number;
    attempts: number;
    error?: string;
  }> {
    const startedAt = Date.now();
    const allowLocalNetwork = opts?.allowLocalNetwork !== false;
    const format = opts?.format ?? 'auto';
    const activeListenPort = getActiveListenPort();
    const syntax = webhookEngine.validateWebhookUrlSyntax(targetUrl, {
      allowLocalNetwork,
      activeListenPort,
    });
    if (!syntax.ok) {
      return {
        ok: false,
        latencyMs: 0,
        attempts: 1,
        error: syntax.error || 'Geçersiz webhook URL adresi (http/https).',
      };
    }

    const eventId = opts?.eventId || `msg_${crypto.randomUUID().replace(/-/g, '')}`;
    const built = webhookEngine.buildWebhookPayload({
      event,
      data,
      targetUrl,
      format,
      appVersion,
      eventId,
    });
    const rawBody = JSON.stringify(built.body);

    let lastResult: {
      ok: boolean;
      retriable: boolean;
      statusCode?: number;
      latencyMs: number;
      attempts: number;
      retryAfterMs?: number | null;
      error?: string;
    } = {
      ok: false,
      retriable: true,
      latencyMs: 0,
      attempts: 1,
      error: 'Webhook gönderilemedi.',
    };

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const res = await webhookEngine.deliverWebhookOnce({
        targetUrl: targetUrl.trim(),
        secret,
        event,
        data,
        rawBodyOverride: rawBody,
        eventId,
        format,
        appVersion,
        allowLocalNetwork,
        activeListenPort,
        timeoutMs: 4000,
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
      if (res.ok || !res.retriable) {
        break;
      }
      if (attempt < maxAttempts) {
        const waitMs =
          res.retryAfterMs !== null && res.retryAfterMs !== undefined
            ? Math.min(2000, res.retryAfterMs)
            : 250;
        await new Promise((r) => setTimeout(r, waitMs));
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

    if (!lastResult.ok && event !== 'webhook.test' && opts?.enqueueOnFailure !== false) {
      try {
        const delayMs =
          lastResult.retryAfterMs !== null && lastResult.retryAfterMs !== undefined
            ? lastResult.retryAfterMs
            : webhookEngine.computeFullJitterBackoffMs(lastResult.attempts);
        db.enqueueWebhookOutbox({
          eventId,
          event,
          targetUrl: targetUrl.trim(),
          format: built.format as 'auto' | 'generic' | 'discord' | 'slack',
          payloadJson: rawBody,
          status: lastResult.retriable ? 'pending' : 'dead_letter',
          attempts: lastResult.attempts,
          maxAttempts: 6,
          nextAttemptAt: new Date(Date.now() + delayMs).toISOString(),
          lastStatusCode: lastResult.statusCode ?? null,
          lastError: lastResult.error ?? '',
        });
      } catch {
        // Non-fatal outbox enqueue failure
      }
    }

    return {
      ok: lastResult.ok,
      statusCode: lastResult.statusCode,
      latencyMs: lastResult.latencyMs,
      attempts: lastResult.attempts,
      error: lastResult.error,
    };
  }

  async function deliverWebhookRequest(
    targetUrlsRaw: string,
    secret: string,
    event: string,
    data: unknown,
    opts?: {
      format?: 'auto' | 'generic' | 'discord' | 'slack';
      allowLocalNetwork?: boolean;
      enqueueOnFailure?: boolean;
      endpointOverrides?: Record<
        string,
        {
          secret?: string;
          events?: string;
          format?: 'auto' | 'generic' | 'discord' | 'slack';
          enabled?: boolean;
        }
      >;
      globalEvents?: string;
    },
  ): Promise<{
    ok: boolean;
    statusCode?: number;
    latencyMs: number;
    attempts?: number;
    error?: string;
    results?: Array<{ url: string; ok: boolean; statusCode?: number; error?: string }>;
  }> {
    const allowLocalNetwork = opts?.allowLocalNetwork !== false;
    const urls = parseWebhookUrls(targetUrlsRaw, allowLocalNetwork);
    if (urls.length === 0) {
      return { ok: false, latencyMs: 0, error: 'Geçersiz webhook URL adresi (http/https).' };
    }

    const overrides = opts?.endpointOverrides ?? {};
    const eligibleUrls = urls.filter((url) => {
      if (event === 'webhook.test') return true;
      const ov = overrides[url];
      if (ov?.enabled === false) return false;
      const effectiveEvents = ov?.events?.trim() ? ov.events : (opts?.globalEvents ?? '*');
      return isWebhookEventAllowed(effectiveEvents, event);
    });
    if (eligibleUrls.length === 0) {
      return { ok: true, statusCode: 204, latencyMs: 0, attempts: 0 };
    }

    const resolveTargetOpts = (url: string) => {
      const ov = overrides[url];
      const effectiveSecret = ov?.secret && ov.secret.trim().length > 0 ? ov.secret.trim() : secret;
      const effectiveFormat = ov?.format ?? opts?.format ?? 'auto';
      return { effectiveSecret, effectiveFormat };
    };

    if (eligibleUrls.length === 1) {
      const target = eligibleUrls[0];
      if (!target) {
        return { ok: false, latencyMs: 0, error: 'Webhook URL is required.' };
      }
      const { effectiveSecret, effectiveFormat } = resolveTargetOpts(target);
      return deliverSingleWebhookWithRetry(target, effectiveSecret, event, data, 2, {
        ...opts,
        format: effectiveFormat,
      });
    }
    const startedAt = Date.now();
    const results = await Promise.all(
      eligibleUrls.map(async (url) => {
        const { effectiveSecret, effectiveFormat } = resolveTargetOpts(url);
        const res = await deliverSingleWebhookWithRetry(url, effectiveSecret, event, data, 2, {
          ...opts,
          format: effectiveFormat,
        });
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
      const overrides = settings.webhookEndpointOverrides ?? {};
      const hasPerUrlEventOverride = Object.values(overrides).some((ov) =>
        Boolean(ov?.events?.trim()),
      );
      if (!hasPerUrlEventOverride && !isWebhookEventAllowed(settings.webhookEvents, event)) return;
      void deliverWebhookRequest(settings.webhookUrl, settings.webhookSecret ?? '', event, data, {
        format: settings.webhookFormat ?? 'auto',
        allowLocalNetwork: settings.webhookAllowLocalNetwork !== false,
        enqueueOnFailure: true,
        endpointOverrides: overrides,
        globalEvents: settings.webhookEvents ?? '*',
      });
    } catch {
      // Never block primary mutation on webhook errors
    }
  }

  let outboxTickBusy = false;
  async function processWebhookOutboxTick(): Promise<void> {
    if (outboxTickBusy) return;
    outboxTickBusy = true;
    try {
      const settings = db.getSettings();
      const due = db.getDueWebhookOutbox(new Date().toISOString(), 10);
      const activeListenPort = getActiveListenPort();
      for (const item of due) {
        const ov = settings.webhookEndpointOverrides?.[item.targetUrl];
        const effectiveSecret = ov?.secret?.trim() || settings.webhookSecret || '';
        const res = await webhookEngine.deliverWebhookOnce({
          targetUrl: item.targetUrl,
          secret: effectiveSecret,
          event: item.event,
          rawBodyOverride: item.payloadJson,
          eventId: item.eventId,
          format: item.format || ov?.format || settings.webhookFormat || 'auto',
          appVersion,
          allowLocalNetwork: settings.webhookAllowLocalNetwork !== false,
          activeListenPort,
          timeoutMs: 5000,
        });
        const nextAttempts = item.attempts + 1;
        const exhausted = nextAttempts >= item.maxAttempts;
        const nextStatus: 'delivered' | 'pending' | 'dead_letter' = res.ok
          ? 'delivered'
          : !res.retriable || exhausted
            ? 'dead_letter'
            : 'pending';
        const waitMs =
          res.retryAfterMs !== null && res.retryAfterMs !== undefined
            ? res.retryAfterMs
            : webhookEngine.computeFullJitterBackoffMs(nextAttempts);
        db.updateWebhookOutboxEntry(item.id, {
          status: nextStatus,
          attempts: nextAttempts,
          nextAttemptAt: new Date(Date.now() + waitMs).toISOString(),
          lastStatusCode: res.statusCode ?? null,
          lastError: res.error ?? '',
        });
        db.recordWebhookLog({
          direction: 'outgoing',
          event: item.event,
          targetUrl: item.targetUrl,
          statusCode: res.statusCode ?? null,
          ok: res.ok,
          attempts: nextAttempts,
          latencyMs: res.latencyMs,
          error: res.error ?? '',
        });
      }
    } catch {
      // Non-fatal background worker tick error
    } finally {
      outboxTickBusy = false;
    }
  }

  function processWebhookRemindersTick(): void {
    try {
      const settings = db.getSettings();
      if (!settings.webhookEnabled || !settings.webhookUrl) return;
      const overrides = settings.webhookEndpointOverrides ?? {};
      const overrideList = Object.values(overrides);
      const allowUpcoming =
        isWebhookEventAllowed(settings.webhookEvents, 'todo.upcoming') ||
        overrideList.some(
          (ov) =>
            ov?.enabled !== false &&
            typeof ov?.events === 'string' &&
            ov.events.trim().length > 0 &&
            isWebhookEventAllowed(ov.events, 'todo.upcoming'),
        );
      const allowDue =
        isWebhookEventAllowed(settings.webhookEvents, 'todo.due') ||
        overrideList.some(
          (ov) =>
            ov?.enabled !== false &&
            typeof ov?.events === 'string' &&
            ov.events.trim().length > 0 &&
            isWebhookEventAllowed(ov.events, 'todo.due'),
        );
      if (!allowUpcoming && !allowDue) return;

      const leadMs =
        Math.max(1, Math.min(180, Number(settings.notificationLeadMinutes) || 15)) * 60_000;
      const nowMs = Date.now();
      const stalePastBoundMs = nowMs - 15 * 60_000;
      const todos = db.getTodos();
      let dispatchedThisTick = 0;

      for (const todo of todos) {
        if (dispatchedThisTick >= 20) break;
        if (todo.completed || !todo.dueDate || !todo.dueTime) continue;
        const [year, month, day] = todo.dueDate.split('-').map(Number);
        const [hour, minute] = todo.dueTime.split(':').map(Number);
        if (
          year === undefined ||
          month === undefined ||
          day === undefined ||
          hour === undefined ||
          minute === undefined
        ) {
          continue;
        }
        const targetDt = new Date(year, month - 1, day, hour, minute, 0, 0);
        const targetMs = targetDt.getTime();
        if (Number.isNaN(targetMs)) continue;
        const scheduleKey = `${todo.dueDate}T${todo.dueTime}`;

        if (allowDue && targetMs <= nowMs && targetMs >= stalePastBoundMs) {
          if (db.claimReminderDispatch(todo.id, 'due', scheduleKey)) {
            dispatchConfiguredWebhook('todo.due', { ...todo, scheduleKey });
            dispatchedThisTick += 1;
          }
        } else if (allowUpcoming && targetMs > nowMs && targetMs - nowMs <= leadMs) {
          if (db.claimReminderDispatch(todo.id, 'upcoming', scheduleKey)) {
            dispatchConfiguredWebhook('todo.upcoming', {
              ...todo,
              scheduleKey,
              leadMinutes: Math.round((targetMs - nowMs) / 60_000),
            });
            dispatchedThisTick += 1;
          }
        }
      }
    } catch {
      // Non-fatal background reminder scheduler error
    }
  }

  return {
    parseWebhookUrls,
    isWebhookEventAllowed,
    deliverSingleWebhookWithRetry,
    deliverWebhookRequest,
    dispatchConfiguredWebhook,
    processWebhookOutboxTick,
    processWebhookRemindersTick,
  };
}

export type WebhookService = ReturnType<typeof createWebhookService>;
