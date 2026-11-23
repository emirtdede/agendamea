import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, CheckCircle2, Copy, Send, Webhook } from 'lucide-react';
import { api } from '../../api/client';
import { useI18n } from '../../i18n/I18nContext';
import type { WebhookTestResult } from '../../types';

export interface WebhooksSettingsTabProps {
  webhookEnabled: boolean;
  webhookUrl: string;
  webhookSecret: string;
  onSaveWebhook: (patch: {
    webhookEnabled: boolean;
    webhookUrl: string;
    webhookSecret: string;
  }) => Promise<void>;
}

export const WebhooksSettingsTab = React.memo(function WebhooksSettingsTab({
  webhookEnabled,
  webhookUrl,
  webhookSecret,
  onSaveWebhook,
}: WebhooksSettingsTabProps) {
  const { t } = useI18n();
  const [runtimePort, setRuntimePort] = useState<number>(38721);
  const [enabledDraft, setEnabledDraft] = useState<boolean>(webhookEnabled);
  const [urlDraft, setUrlDraft] = useState<string>(webhookUrl);
  const [secretDraft, setSecretDraft] = useState<string>(webhookSecret);
  const [isSavingWebhook, setIsSavingWebhook] = useState<boolean>(false);
  const [webhookSaved, setWebhookSaved] = useState<boolean>(false);
  const [lastSavedWebhookUrl, setLastSavedWebhookUrl] = useState<string>('');
  const [isTestingWebhook, setIsTestingWebhook] = useState<boolean>(false);
  const [webhookTestResult, setWebhookTestResult] = useState<WebhookTestResult | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const copyTimerRef = useRef<number | null>(null);
  const webhookSavedTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
      if (webhookSavedTimerRef.current !== null) window.clearTimeout(webhookSavedTimerRef.current);
    };
  }, []);

  useEffect(() => {
    setEnabledDraft(webhookEnabled);
  }, [webhookEnabled]);

  useEffect(() => {
    setUrlDraft(webhookUrl);
  }, [webhookUrl]);

  useEffect(() => {
    setSecretDraft(webhookSecret);
  }, [webhookSecret]);

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
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const incomingWebhookCmd = useMemo(() => {
    const sampleTitle = (t.shortcutNewTask || 'New task').replace(/["\\]/g, '');
    return `curl -X POST http://127.0.0.1:${runtimePort}/api/webhook/incoming -H "Content-Type: application/json; charset=utf-8" -d "{\\"title\\":\\"${sampleTitle}\\",\\"priority\\":\\"high\\"}"`;
  }, [runtimePort, t.shortcutNewTask]);

  const handleCopy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
      setCopiedId(id);
      copyTimerRef.current = window.setTimeout(() => {
        copyTimerRef.current = null;
        setCopiedId((prev) => (prev === id ? null : prev));
      }, 2200);
    } catch {
      // Ignore clipboard restrictions
    }
  };

  const handleSaveWebhookConfig = async () => {
    if (isSavingWebhook) return;
    setIsSavingWebhook(true);
    setWebhookTestResult(null);
    const trimmedUrl = urlDraft.trim();
    const trimmedSecret = secretDraft.trim();
    try {
      await onSaveWebhook({
        webhookEnabled: enabledDraft,
        webhookUrl: trimmedUrl,
        webhookSecret: trimmedSecret,
      });
      setLastSavedWebhookUrl(trimmedUrl);
      setWebhookSaved(true);
      if (webhookSavedTimerRef.current !== null) window.clearTimeout(webhookSavedTimerRef.current);
      webhookSavedTimerRef.current = window.setTimeout(() => {
        webhookSavedTimerRef.current = null;
        setWebhookSaved(false);
      }, 6000);
    } finally {
      setIsSavingWebhook(false);
    }
  };

  const handleTestWebhook = async () => {
    if (isTestingWebhook || !urlDraft.trim()) return;
    setIsTestingWebhook(true);
    setWebhookTestResult(null);
    try {
      const res = await api.testWebhook({
        url: urlDraft.trim(),
        secret: secretDraft.trim(),
      });
      setWebhookTestResult(res);
    } catch (err) {
      setWebhookTestResult({
        ok: false,
        error: err instanceof Error ? err.message : 'Error',
      });
    } finally {
      setIsTestingWebhook(false);
    }
  };

  return (
    <section
      aria-label={t.docsWebhookTitle}
      className="space-y-3"
      data-testid="docs-webhook-section"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
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
            void onSaveWebhook({
              webhookEnabled: next,
              webhookUrl: urlDraft.trim(),
              webhookSecret: secretDraft.trim(),
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
        <div className="p-4 space-y-2.5">
          <input
            type="url"
            data-testid="docs-webhook-url-input"
            value={urlDraft}
            onChange={(e) => setUrlDraft(e.target.value)}
            placeholder={t.docsWebhookUrlPlaceholder}
            aria-label={t.docsWebhookTitle}
            className="h-9 w-full rounded-lg border border-[var(--border)] bg-[var(--canvas)] px-3 font-mono-tabular text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none"
          />
          <input
            type="password"
            data-testid="docs-webhook-secret-input"
            value={secretDraft}
            onChange={(e) => setSecretDraft(e.target.value)}
            placeholder={t.docsWebhookSecretPlaceholder}
            aria-label={t.docsWebhookSecretPlaceholder}
            className="h-9 w-full rounded-lg border border-[var(--border)] bg-[var(--canvas)] px-3 font-mono-tabular text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none"
          />

          <div className="grid grid-cols-2 gap-2 pt-0.5">
            <button
              type="button"
              data-testid="docs-webhook-save-btn"
              disabled={isSavingWebhook}
              onClick={() => void handleSaveWebhookConfig()}
              className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-medium transition-opacity disabled:opacity-45"
              style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-fg)' }}
            >
              {webhookSaved ? <Check className="h-3.5 w-3.5" /> : null}
              <span>{t.docsWebhookSaveButton}</span>
            </button>
            <button
              type="button"
              data-testid="docs-webhook-test-btn"
              disabled={isTestingWebhook || !urlDraft.trim()}
              onClick={() => void handleTestWebhook()}
              className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--canvas)] px-3 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)] disabled:opacity-40 transition-colors"
            >
              <Send className="h-3.5 w-3.5 text-[var(--accent)]" />
              <span>{t.docsWebhookTestButton}</span>
            </button>
          </div>

          {webhookSaved && (
            <div
              role="status"
              data-testid="docs-webhook-saved-status"
              className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-600 dark:text-emerald-400"
            >
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">
                {lastSavedWebhookUrl
                  ? `${t.docsWebhookSaveButton}: ${lastSavedWebhookUrl}`
                  : `${t.docsWebhookSaveButton}: OK`}
              </span>
            </div>
          )}

          {webhookTestResult && (
            <div
              role="status"
              className={`rounded-lg border px-3 py-2 text-xs font-medium ${
                webhookTestResult.ok
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                  : 'border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400'
              }`}
            >
              {webhookTestResult.ok
                ? `${t.docsWebhookTestOk} (HTTP ${webhookTestResult.statusCode ?? 200} · ${webhookTestResult.latencyMs ?? 0}ms)`
                : webhookTestResult.error}
            </div>
          )}
        </div>

        <div className="bg-[var(--surface-subtle)]/60 px-4 py-3 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold text-[var(--text-secondary)]">
              {t.docsWebhookIncomingTitle}
            </p>
            <button
              type="button"
              onClick={() => void handleCopy('incoming-webhook', incomingWebhookCmd)}
              className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--canvas)] px-2 py-0.5 text-[11px] font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors"
            >
              {copiedId === 'incoming-webhook' ? (
                <Check className="h-3 w-3 text-emerald-500" />
              ) : (
                <Copy className="h-3 w-3 text-[var(--accent)]" />
              )}
              <span>{copiedId === 'incoming-webhook' ? t.docsCopiedLabel : t.docsCopyButton}</span>
            </button>
          </div>
          <code
            className="block truncate font-mono-tabular text-[11px] text-[var(--text-muted)]"
            title={incomingWebhookCmd}
          >
            {incomingWebhookCmd}
          </code>
        </div>
      </div>
    </section>
  );
});
