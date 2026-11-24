import { Webhook } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../api/client';
import { useI18n } from '../../i18n/I18nContext';
import { localizeErrorMessage } from '../../i18n/translations';
import type {
  WebhookEndpointOverride,
  WebhookFormat,
  WebhookLogEntry,
  WebhookOutboxEntry,
  WebhookTestResult,
} from '../../types';
import { IncomingWebhookSection } from './webhooks/IncomingWebhookSection';
import { OutgoingWebhookSection } from './webhooks/OutgoingWebhookSection';
import { WebhookLogsOutboxSection } from './webhooks/WebhookLogsOutboxSection';
import {
  buildIncomingActionPayload,
  buildIncomingCommandSnippet,
  type IncomingActionTab,
  splitUrlRows,
  splitUrls,
  type UrlDraftRow,
  type WebhookSettingsPatch,
  type WebhooksSettingsTabProps,
} from './webhooks/webhookUtils';

export type { WebhookSettingsPatch, WebhooksSettingsTabProps };

export const WebhooksSettingsTab = React.memo(function WebhooksSettingsTab({
  webhookEnabled,
  webhookUrl,
  webhookSecret,
  webhookEvents = '*',
  webhookFormat = 'auto',
  webhookIncomingEnabled = false,
  webhookIncomingSecret = '',
  webhookAllowLocalNetwork = true,
  webhookEndpointOverrides = {},
  onSaveWebhook,
}: WebhooksSettingsTabProps) {
  const { t, lang } = useI18n();
  const isWindowsClient =
    typeof navigator === 'undefined' ||
    /win/i.test(navigator.platform || navigator.userAgent || '');
  const [runtimePort, setRuntimePort] = useState<number>(38721);
  const [enabledDraft, setEnabledDraft] = useState<boolean>(webhookEnabled);
  const [urlRowsDraft, setUrlRowsDraft] = useState<UrlDraftRow[]>(() => splitUrlRows(webhookUrl));
  const [secretDraft, setSecretDraft] = useState<string>(webhookSecret);
  const [revealOutgoingSecret, setRevealOutgoingSecret] = useState<boolean>(false);
  const [formatDraft, setFormatDraft] = useState<WebhookFormat>(webhookFormat);
  const [allowLocalDraft, setAllowLocalDraft] = useState<boolean>(webhookAllowLocalNetwork);
  const [eventsDraft, setEventsDraft] = useState<string>(webhookEvents || '*');
  const [overridesDraft, setOverridesDraft] = useState<Record<string, WebhookEndpointOverride>>(
    () => ({ ...webhookEndpointOverrides }),
  );
  const [expandedUrlId, setExpandedUrlId] = useState<string | null>(null);
  const [incomingEnabledDraft, setIncomingEnabledDraft] = useState<boolean>(webhookIncomingEnabled);
  const [incomingSecretDraft, setIncomingSecretDraft] = useState<string>(webhookIncomingSecret);
  const [revealIncomingSecret, setRevealIncomingSecret] = useState<boolean>(false);
  const [incomingActionTab, setIncomingActionTab] = useState<IncomingActionTab>('add');
  const [incomingShellTab, setIncomingShellTab] = useState<'curl' | 'powershell'>(
    isWindowsClient ? 'powershell' : 'curl',
  );
  const [isTestingIncoming, setIsTestingIncoming] = useState<boolean>(false);
  const [incomingTestResult, setIncomingTestResult] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);

  const [isSavingWebhook, setIsSavingWebhook] = useState<boolean>(false);
  const [webhookSaved, setWebhookSaved] = useState<boolean>(false);
  const [lastSavedSummary, setLastSavedSummary] = useState<string>('');
  const [isTestingWebhook, setIsTestingWebhook] = useState<boolean>(false);
  const [webhookTestResult, setWebhookTestResult] = useState<WebhookTestResult | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [logs, setLogs] = useState<WebhookLogEntry[]>([]);
  const [outbox, setOutbox] = useState<WebhookOutboxEntry[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState<boolean>(false);
  const [replayingId, setReplayingId] = useState<string | null>(null);

  const isMountedRef = useRef<boolean>(true);
  const copyTimerRef = useRef<number | null>(null);
  const webhookSavedTimerRef = useRef<number | null>(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
      if (webhookSavedTimerRef.current !== null) window.clearTimeout(webhookSavedTimerRef.current);
    };
  }, []);

  useEffect(() => {
    setEnabledDraft(webhookEnabled);
  }, [webhookEnabled]);
  useEffect(() => {
    setUrlRowsDraft(splitUrlRows(webhookUrl));
    setExpandedUrlId(null);
  }, [webhookUrl]);
  useEffect(() => {
    setSecretDraft(webhookSecret);
  }, [webhookSecret]);
  useEffect(() => {
    setEventsDraft(webhookEvents || '*');
  }, [webhookEvents]);
  useEffect(() => {
    setFormatDraft(webhookFormat);
  }, [webhookFormat]);
  useEffect(() => {
    setIncomingEnabledDraft(webhookIncomingEnabled);
  }, [webhookIncomingEnabled]);
  useEffect(() => {
    setIncomingSecretDraft(webhookIncomingSecret);
  }, [webhookIncomingSecret]);
  useEffect(() => {
    setAllowLocalDraft(webhookAllowLocalNetwork);
  }, [webhookAllowLocalNetwork]);
  useEffect(() => {
    setOverridesDraft({ ...webhookEndpointOverrides });
  }, [webhookEndpointOverrides]);

  const refreshDeliveryData = useCallback(async () => {
    setIsLoadingLogs(true);
    try {
      const [logRows, outboxRows] = await Promise.all([
        api.getWebhookLogs(25).catch(() => []),
        api.getWebhookOutbox(20).catch(() => []),
      ]);
      if (!isMountedRef.current) return;
      setLogs(Array.isArray(logRows) ? logRows : []);
      setOutbox(Array.isArray(outboxRows) ? outboxRows : []);
    } finally {
      if (isMountedRef.current) setIsLoadingLogs(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void window.agendameaWindow
      ?.getDiagnostics?.()
      .then((diag) => {
        if (!active || !diag) return;
        if (typeof diag.runtimePort === 'number' && diag.runtimePort > 0) {
          setRuntimePort(diag.runtimePort);
        }
      })
      .catch(() => {
        /* ignore */
      });
    void refreshDeliveryData();
    return () => {
      active = false;
    };
  }, [refreshDeliveryData]);

  const cleanedJoinedUrls = useMemo(
    () =>
      urlRowsDraft
        .map((row) => row.url.trim())
        .filter(Boolean)
        .join(','),
    [urlRowsDraft],
  );

  const selectedEventSet = useMemo(() => {
    const raw = (eventsDraft || '*').trim();
    if (!raw || raw === '*') return new Set<string>(['*']);
    const items = raw
      .split(/[\s,]+/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    return items.length === 0 || items.includes('*')
      ? new Set<string>(['*'])
      : new Set<string>(items);
  }, [eventsDraft]);

  const toggleEventChip = (ev: string) => {
    if (ev === '*') {
      setEventsDraft('*');
      return;
    }
    const next = new Set(selectedEventSet);
    next.delete('*');
    if (next.has(ev)) next.delete(ev);
    else next.add(ev);
    setEventsDraft(next.size === 0 ? '*' : Array.from(next).join(','));
  };

  const effectiveIncomingSecret = (incomingSecretDraft || secretDraft).trim();
  const isIncomingActive = incomingEnabledDraft === true;

  const hasUnsavedChanges = useMemo(() => {
    const savedUrls = splitUrls(webhookUrl).filter(Boolean).join(',');
    const overridesChanged =
      JSON.stringify(overridesDraft) !== JSON.stringify(webhookEndpointOverrides ?? {});
    return (
      enabledDraft !== webhookEnabled ||
      cleanedJoinedUrls !== savedUrls ||
      secretDraft.trim() !== (webhookSecret || '').trim() ||
      (eventsDraft.trim() || '*') !== ((webhookEvents || '*').trim() || '*') ||
      formatDraft !== webhookFormat ||
      incomingEnabledDraft !== webhookIncomingEnabled ||
      incomingSecretDraft.trim() !== (webhookIncomingSecret || '').trim() ||
      allowLocalDraft !== webhookAllowLocalNetwork ||
      overridesChanged
    );
  }, [
    enabledDraft,
    webhookEnabled,
    cleanedJoinedUrls,
    webhookUrl,
    secretDraft,
    webhookSecret,
    eventsDraft,
    webhookEvents,
    formatDraft,
    webhookFormat,
    incomingEnabledDraft,
    webhookIncomingEnabled,
    incomingSecretDraft,
    webhookIncomingSecret,
    allowLocalDraft,
    webhookAllowLocalNetwork,
    overridesDraft,
    webhookEndpointOverrides,
  ]);

  const incomingActionPayload = useMemo(
    () => buildIncomingActionPayload(incomingActionTab, t.shortcutNewTask),
    [incomingActionTab, t.shortcutNewTask],
  );

  const incomingCommandSnippet = useMemo(
    () =>
      buildIncomingCommandSnippet({
        runtimePort,
        payload: incomingActionPayload,
        effectiveIncomingSecret,
        revealIncomingSecret,
        incomingShellTab,
        isWindowsClient,
      }),
    [
      runtimePort,
      incomingActionPayload,
      effectiveIncomingSecret,
      revealIncomingSecret,
      incomingShellTab,
      isWindowsClient,
    ],
  );

  const buildPatch = (overrides?: Partial<WebhookSettingsPatch>): WebhookSettingsPatch => ({
    webhookEnabled: enabledDraft,
    webhookUrl: cleanedJoinedUrls,
    webhookSecret: secretDraft.trim(),
    webhookEvents: eventsDraft.trim() || '*',
    webhookFormat: formatDraft,
    webhookIncomingEnabled: incomingEnabledDraft,
    webhookIncomingSecret: incomingSecretDraft.trim(),
    webhookAllowLocalNetwork: allowLocalDraft,
    webhookEndpointOverrides: overridesDraft,
    ...overrides,
  });

  const handleTestIncoming = async () => {
    if (isTestingIncoming) return;
    setIsTestingIncoming(true);
    setIncomingTestResult(null);
    try {
      if (hasUnsavedChanges) await onSaveWebhook(buildPatch());
      const res = await api.testIncomingWebhook(effectiveIncomingSecret || undefined);
      if (!isMountedRef.current) return;
      if (res?.ok) {
        setIncomingTestResult({
          ok: true,
          text: `${t.webhookIncomingTestOk} (127.0.0.1:${res.port ?? runtimePort})`,
        });
      } else {
        setIncomingTestResult({
          ok: false,
          text: res?.error
            ? localizeErrorMessage(res.error, t.operationFailedToast, lang, t)
            : t.operationFailedToast,
        });
      }
      await refreshDeliveryData();
    } catch (err) {
      if (!isMountedRef.current) return;
      setIncomingTestResult({
        ok: false,
        text: localizeErrorMessage(err, t.operationFailedToast, lang, t),
      });
      await refreshDeliveryData();
    } finally {
      if (isMountedRef.current) setIsTestingIncoming(false);
    }
  };

  const handleCopy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      if (!isMountedRef.current) return;
      if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
      setCopiedId(id);
      copyTimerRef.current = window.setTimeout(() => {
        copyTimerRef.current = null;
        if (isMountedRef.current) {
          setCopiedId((prev) => (prev === id ? null : prev));
        }
      }, 2200);
    } catch {
      // Ignore clipboard restrictions
    }
  };

  const handleSaveWebhookConfig = async () => {
    if (isSavingWebhook) return;
    setIsSavingWebhook(true);
    setWebhookTestResult(null);
    const patch = buildPatch();
    try {
      await onSaveWebhook(patch);
      if (!isMountedRef.current) return;
      setLastSavedSummary(patch.webhookUrl || 'OK');
      setWebhookSaved(true);
      if (webhookSavedTimerRef.current !== null) window.clearTimeout(webhookSavedTimerRef.current);
      webhookSavedTimerRef.current = window.setTimeout(() => {
        webhookSavedTimerRef.current = null;
        if (isMountedRef.current) setWebhookSaved(false);
      }, 6000);
    } catch (err) {
      if (!isMountedRef.current) return;
      setWebhookTestResult({
        ok: false,
        error: localizeErrorMessage(err, t.operationFailedToast, lang, t),
      });
    } finally {
      if (isMountedRef.current) setIsSavingWebhook(false);
    }
  };

  const handleTestWebhook = async (singleUrl?: string) => {
    const target = (singleUrl ?? cleanedJoinedUrls).trim();
    if (isTestingWebhook || !target) return;
    setIsTestingWebhook(true);
    setWebhookSaved(false);
    setWebhookTestResult(null);
    try {
      const res = await api.testWebhook({
        url: target,
        secret: secretDraft.trim(),
        format: formatDraft,
      });
      if (!isMountedRef.current) return;
      setWebhookTestResult(res);
      await refreshDeliveryData();
    } catch (err) {
      if (!isMountedRef.current) return;
      setWebhookTestResult({
        ok: false,
        error: localizeErrorMessage(err, t.operationFailedToast, lang, t),
      });
    } finally {
      if (isMountedRef.current) setIsTestingWebhook(false);
    }
  };

  const handleClearLogs = async () => {
    try {
      await api.clearWebhookLogs();
      if (!isMountedRef.current) return;
      await refreshDeliveryData();
    } catch {
      // Ignore clear failure
    }
  };

  const handleReplayOutbox = async (id: string) => {
    if (replayingId) return;
    setReplayingId(id);
    try {
      await api.replayWebhookOutbox(id);
      if (!isMountedRef.current) return;
      await refreshDeliveryData();
    } catch {
      // Ignore replay error; delivery table refreshes below
    } finally {
      if (isMountedRef.current) setReplayingId(null);
    }
  };

  const pendingOrDeadOutbox = useMemo(
    () => outbox.filter((item) => item.status !== 'delivered'),
    [outbox],
  );

  return (
    <section
      aria-label={t.docsWebhookTitle}
      className="space-y-4"
      data-testid="docs-webhook-section"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <Webhook className="h-3.5 w-3.5 text-[var(--accent)]" />
            <h3 className="font-display text-xs font-semibold text-[var(--text-muted)]">
              {t.docsWebhookTitle}
            </h3>
          </div>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">{t.docsWebhookDesc}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabledDraft}
          data-testid="docs-webhook-toggle"
          onClick={() => {
            const next = !enabledDraft;
            setEnabledDraft(next);
            void onSaveWebhook(buildPatch({ webhookEnabled: next })).catch(() => {
              /* Error toast is reported by parent store */
            });
          }}
          className={`inline-flex items-center rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
            enabledDraft
              ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text-primary)]'
              : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
          }`}
        >
          {enabledDraft ? t.enabledBadge : t.disabledBadge}
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] divide-y divide-[var(--border)]">
        <OutgoingWebhookSection
          urlRowsDraft={urlRowsDraft}
          setUrlRowsDraft={setUrlRowsDraft}
          overridesDraft={overridesDraft}
          setOverridesDraft={setOverridesDraft}
          expandedUrlId={expandedUrlId}
          setExpandedUrlId={setExpandedUrlId}
          formatDraft={formatDraft}
          setFormatDraft={setFormatDraft}
          secretDraft={secretDraft}
          setSecretDraft={setSecretDraft}
          revealOutgoingSecret={revealOutgoingSecret}
          setRevealOutgoingSecret={setRevealOutgoingSecret}
          selectedEventSet={selectedEventSet}
          toggleEventChip={toggleEventChip}
          allowLocalDraft={allowLocalDraft}
          setAllowLocalDraft={setAllowLocalDraft}
          hasUnsavedChanges={hasUnsavedChanges}
          isSavingWebhook={isSavingWebhook}
          isTestingWebhook={isTestingWebhook}
          cleanedJoinedUrls={cleanedJoinedUrls}
          webhookSaved={webhookSaved}
          setWebhookSaved={setWebhookSaved}
          lastSavedSummary={lastSavedSummary}
          webhookTestResult={webhookTestResult}
          setWebhookTestResult={setWebhookTestResult}
          copiedId={copiedId}
          onCopy={handleCopy}
          onSaveConfig={handleSaveWebhookConfig}
          onTestWebhook={handleTestWebhook}
        />

        <IncomingWebhookSection
          runtimePort={runtimePort}
          incomingEnabledDraft={incomingEnabledDraft}
          isIncomingActive={isIncomingActive}
          incomingSecretDraft={incomingSecretDraft}
          setIncomingSecretDraft={setIncomingSecretDraft}
          revealIncomingSecret={revealIncomingSecret}
          setRevealIncomingSecret={setRevealIncomingSecret}
          incomingActionTab={incomingActionTab}
          setIncomingActionTab={setIncomingActionTab}
          incomingShellTab={incomingShellTab}
          setIncomingShellTab={setIncomingShellTab}
          incomingCommandSnippet={incomingCommandSnippet}
          isTestingIncoming={isTestingIncoming}
          incomingTestResult={incomingTestResult}
          setIncomingTestResult={setIncomingTestResult}
          copiedId={copiedId}
          onCopy={handleCopy}
          onTestIncoming={handleTestIncoming}
          onToggleIncoming={(next) => {
            setIncomingEnabledDraft(next);
            void onSaveWebhook(buildPatch({ webhookIncomingEnabled: next })).catch(() => {
              /* Error toast is reported by parent store */
            });
          }}
          onGenerateIncomingSecret={(key) => {
            setIncomingSecretDraft(key);
            setIncomingEnabledDraft(true);
            void onSaveWebhook(
              buildPatch({ webhookIncomingSecret: key, webhookIncomingEnabled: true }),
            ).catch(() => {
              /* Error toast is reported by parent store */
            });
          }}
        />

        <WebhookLogsOutboxSection
          logs={logs}
          pendingOrDeadOutbox={pendingOrDeadOutbox}
          isLoadingLogs={isLoadingLogs}
          replayingId={replayingId}
          onRefresh={refreshDeliveryData}
          onClearLogs={handleClearLogs}
          onReplayOutbox={handleReplayOutbox}
        />
      </div>
    </section>
  );
});
