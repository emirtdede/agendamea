import { Activity, AlertTriangle, Check, Copy, Eye, EyeOff, Info, KeyRound, X } from 'lucide-react';
import type React from 'react';
import { useI18n } from '../../../i18n/I18nContext';
import {
  generateSecureWebhookKey,
  INCOMING_ACTION_TABS,
  type IncomingActionTab,
} from './webhookUtils';

interface IncomingWebhookSectionProps {
  runtimePort: number;
  incomingEnabledDraft: boolean;
  isIncomingActive: boolean;
  incomingSecretDraft: string;
  setIncomingSecretDraft: (val: string) => void;
  revealIncomingSecret: boolean;
  setRevealIncomingSecret: React.Dispatch<React.SetStateAction<boolean>>;
  incomingActionTab: IncomingActionTab;
  setIncomingActionTab: (tab: IncomingActionTab) => void;
  incomingShellTab: 'curl' | 'powershell';
  setIncomingShellTab: (tab: 'curl' | 'powershell') => void;
  incomingCommandSnippet: string;
  isTestingIncoming: boolean;
  incomingTestResult: { ok: boolean; text: string } | null;
  setIncomingTestResult: (res: { ok: boolean; text: string } | null) => void;
  copiedId: string | null;
  onCopy: (id: string, text: string) => Promise<void>;
  onTestIncoming: () => Promise<void>;
  onToggleIncoming: (next: boolean) => void;
  onGenerateIncomingSecret: (key: string) => void;
}

export function IncomingWebhookSection({
  runtimePort,
  incomingEnabledDraft,
  isIncomingActive,
  incomingSecretDraft,
  setIncomingSecretDraft,
  revealIncomingSecret,
  setRevealIncomingSecret,
  incomingActionTab,
  setIncomingActionTab,
  incomingShellTab,
  setIncomingShellTab,
  incomingCommandSnippet,
  isTestingIncoming,
  incomingTestResult,
  setIncomingTestResult,
  copiedId,
  onCopy,
  onTestIncoming,
  onToggleIncoming,
  onGenerateIncomingSecret,
}: IncomingWebhookSectionProps) {
  const { t } = useI18n();

  return (
    <div className="bg-[var(--canvas)]/50 p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-[var(--text-primary)]">
            {t.docsWebhookIncomingTitle}
          </span>
          <span
            dir="ltr"
            className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 font-mono-tabular text-[10px] font-semibold text-emerald-600 dark:text-emerald-400"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            {`127.0.0.1:${runtimePort} · ${t.webhookIncomingOnlineBadge}`}
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            data-testid="docs-webhook-incoming-test-btn"
            disabled={isTestingIncoming}
            onClick={() => void onTestIncoming()}
            className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)] disabled:opacity-45 transition-colors whitespace-nowrap"
          >
            <Activity className="h-3 w-3 text-[var(--accent)]" />
            <span>{t.webhookIncomingTestBtn}</span>
          </button>
          <button
            type="button"
            role="switch"
            aria-checked={incomingEnabledDraft}
            data-testid="docs-webhook-incoming-toggle"
            onClick={() => onToggleIncoming(!incomingEnabledDraft)}
            className={`inline-flex items-center rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 ${
              incomingEnabledDraft
                ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text-primary)]'
                : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)]'
            }`}
          >
            {incomingEnabledDraft ? t.enabledBadge : t.disabledBadge}
          </button>
        </div>
      </div>

      {incomingTestResult && (
        <div
          role={incomingTestResult.ok ? 'status' : 'alert'}
          data-testid="docs-webhook-incoming-test-result"
          className={`flex items-start justify-between gap-2 rounded-lg border px-3 py-2 text-xs font-medium leading-snug animate-fade-in ${
            incomingTestResult.ok
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
              : 'border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400'
          }`}
        >
          <span className="min-w-0 flex-1 break-words">{incomingTestResult.text}</span>
          <button
            type="button"
            onClick={() => setIncomingTestResult(null)}
            aria-label={t.closeMenu}
            className="shrink-0 rounded p-0.5 opacity-75 hover:opacity-100"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {!isIncomingActive && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11.5px] text-amber-700 dark:text-amber-300"
        >
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>{t.webhookIncomingDisabledWarn}</span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        <input
          type={revealIncomingSecret ? 'text' : 'password'}
          data-testid="docs-webhook-incoming-secret-input"
          value={incomingSecretDraft}
          onChange={(e) => setIncomingSecretDraft(e.target.value)}
          placeholder={t.webhookIncomingSecretPlaceholder}
          className="h-9 min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 font-mono-tabular text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none"
        />
        <button
          type="button"
          aria-label={t.webhookRevealSecretLabel}
          onClick={() => setRevealIncomingSecret((prev) => !prev)}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] transition-colors"
        >
          {revealIncomingSecret ? (
            <EyeOff className="h-3.5 w-3.5" />
          ) : (
            <Eye className="h-3.5 w-3.5" />
          )}
        </button>
        <button
          type="button"
          data-testid="docs-webhook-generate-secret-btn"
          onClick={() => onGenerateIncomingSecret(generateSecureWebhookKey())}
          className="inline-flex h-9 items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 text-[11px] font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors whitespace-nowrap shrink-0"
        >
          <KeyRound className="h-3.5 w-3.5 text-[var(--accent)]" />
          <span>{t.webhookGenerateSecretBtn}</span>
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1 overflow-x-auto">
          {INCOMING_ACTION_TABS.map((act) => (
            <button
              key={act}
              type="button"
              onClick={() => setIncomingActionTab(act)}
              className={`rounded-md border px-2 py-0.5 font-mono-tabular text-[11px] transition-colors ${
                incomingActionTab === act
                  ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text-primary)] font-semibold'
                  : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              {act}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setIncomingShellTab('curl')}
            className={`rounded-md border px-2 py-0.5 text-[11px] font-medium transition-colors ${
              incomingShellTab === 'curl'
                ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text-primary)]'
                : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)]'
            }`}
          >
            {t.webhookShellCurl}
          </button>
          <button
            type="button"
            onClick={() => setIncomingShellTab('powershell')}
            className={`rounded-md border px-2 py-0.5 text-[11px] font-medium transition-colors ${
              incomingShellTab === 'powershell'
                ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text-primary)]'
                : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)]'
            }`}
          >
            {t.webhookShellPowerShell}
          </button>
          <button
            type="button"
            data-testid="docs-copy-incoming-webhook-btn"
            onClick={() => void onCopy('incoming-webhook', incomingCommandSnippet)}
            className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-0.5 text-[11px] font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors whitespace-nowrap"
          >
            {copiedId === 'incoming-webhook' ? (
              <Check className="h-3 w-3 text-emerald-500" />
            ) : (
              <Copy className="h-3 w-3 text-[var(--accent)]" />
            )}
            <span>{copiedId === 'incoming-webhook' ? t.docsCopiedLabel : t.docsCopyButton}</span>
          </button>
        </div>
      </div>

      <code
        dir="ltr"
        data-testid="docs-webhook-incoming-snippet"
        className="block overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-start font-mono-tabular text-[11px] text-[var(--text-secondary)] select-text whitespace-pre-wrap break-all"
      >
        {incomingCommandSnippet}
      </code>

      <div className="space-y-1">
        <p className="text-[10.5px] font-medium text-[var(--text-muted)]">
          {t.webhookIncomingResponsePreviewLabel}
        </p>
        <pre
          dir="ltr"
          className="overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 font-mono-tabular text-[10.5px] text-[var(--text-muted)]"
        >
          {`{ "ok": true, "action": "${incomingActionTab}", "port": ${runtimePort} }`}
        </pre>
      </div>

      <div className="flex items-start gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[11px] text-[var(--text-muted)]">
        <Info className="h-3.5 w-3.5 shrink-0 mt-0.5 text-[var(--accent)]" />
        <span>{t.webhookLocalhostHint}</span>
      </div>
    </div>
  );
}
