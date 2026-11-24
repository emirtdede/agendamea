import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Plus,
  Send,
  SlidersHorizontal,
  Trash2,
  X,
} from 'lucide-react';
import type React from 'react';
import { useI18n } from '../../../i18n/I18nContext';
import type { WebhookEndpointOverride, WebhookFormat, WebhookTestResult } from '../../../types';
import { SelectField } from '../../SelectField';
import { ToggleSwitch } from '../../ToggleSwitch';
import {
  EVENT_OPTIONS,
  generateSecureWebhookKey,
  isUrlFormatValid,
  nextUrlRowId,
  type UrlDraftRow,
} from './webhookUtils';

interface OutgoingWebhookSectionProps {
  urlRowsDraft: UrlDraftRow[];
  setUrlRowsDraft: React.Dispatch<React.SetStateAction<UrlDraftRow[]>>;
  overridesDraft: Record<string, WebhookEndpointOverride>;
  setOverridesDraft: React.Dispatch<React.SetStateAction<Record<string, WebhookEndpointOverride>>>;
  expandedUrlId: string | null;
  setExpandedUrlId: React.Dispatch<React.SetStateAction<string | null>>;
  formatDraft: WebhookFormat;
  setFormatDraft: (fmt: WebhookFormat) => void;
  secretDraft: string;
  setSecretDraft: (val: string) => void;
  revealOutgoingSecret: boolean;
  setRevealOutgoingSecret: React.Dispatch<React.SetStateAction<boolean>>;
  selectedEventSet: Set<string>;
  toggleEventChip: (ev: string) => void;
  allowLocalDraft: boolean;
  setAllowLocalDraft: React.Dispatch<React.SetStateAction<boolean>>;
  hasUnsavedChanges: boolean;
  isSavingWebhook: boolean;
  isTestingWebhook: boolean;
  cleanedJoinedUrls: string;
  webhookSaved: boolean;
  setWebhookSaved: (val: boolean) => void;
  lastSavedSummary: string;
  webhookTestResult: WebhookTestResult | null;
  setWebhookTestResult: (res: WebhookTestResult | null) => void;
  copiedId: string | null;
  onCopy: (id: string, text: string) => Promise<void>;
  onSaveConfig: () => Promise<void>;
  onTestWebhook: (singleUrl?: string) => Promise<void>;
}

export function OutgoingWebhookSection({
  urlRowsDraft,
  setUrlRowsDraft,
  overridesDraft,
  setOverridesDraft,
  expandedUrlId,
  setExpandedUrlId,
  formatDraft,
  setFormatDraft,
  secretDraft,
  setSecretDraft,
  revealOutgoingSecret,
  setRevealOutgoingSecret,
  selectedEventSet,
  toggleEventChip,
  allowLocalDraft,
  setAllowLocalDraft,
  hasUnsavedChanges,
  isSavingWebhook,
  isTestingWebhook,
  cleanedJoinedUrls,
  webhookSaved,
  setWebhookSaved,
  lastSavedSummary,
  webhookTestResult,
  setWebhookTestResult,
  copiedId,
  onCopy,
  onSaveConfig,
  onTestWebhook,
}: OutgoingWebhookSectionProps) {
  const { t } = useI18n();

  return (
    <div className="p-4 space-y-3">
      <div className="space-y-2">
        {urlRowsDraft.map((row, idx) => {
          const urlVal = row.url;
          const valid = isUrlFormatValid(urlVal);
          const trimmedUrl = urlVal.trim();
          const endpointOv = trimmedUrl ? overridesDraft[trimmedUrl] : undefined;
          const isUrlPaused = endpointOv?.enabled === false;
          const hasOverride = Boolean(
            endpointOv?.secret?.trim() ||
              endpointOv?.events?.trim() ||
              endpointOv?.format ||
              isUrlPaused,
          );
          const isExpanded = expandedUrlId === row.id;
          return (
            <div key={row.id} className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <input
                  type="url"
                  data-testid={
                    idx === 0 ? 'docs-webhook-url-input' : `docs-webhook-url-input-${idx}`
                  }
                  value={urlVal}
                  onChange={(e) => {
                    const prevKey = row.url.trim();
                    const nextVal = e.target.value;
                    setUrlRowsDraft((prev) =>
                      prev.map((item) => (item.id === row.id ? { ...item, url: nextVal } : item)),
                    );
                    if (prevKey && overridesDraft[prevKey]) {
                      const nextOv = { ...overridesDraft };
                      const existing = nextOv[prevKey];
                      delete nextOv[prevKey];
                      if (nextVal.trim() && existing) nextOv[nextVal.trim()] = existing;
                      setOverridesDraft(nextOv);
                    }
                  }}
                  placeholder={t.docsWebhookUrlPlaceholder}
                  aria-label={t.docsWebhookTitle}
                  className={`h-9 min-w-0 flex-1 rounded-lg border bg-[var(--canvas)] px-3 font-mono-tabular text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none ${
                    valid
                      ? 'border-[var(--border)] focus:border-[var(--accent)]'
                      : 'border-red-500/60 focus:border-red-500'
                  }`}
                />
                {trimmedUrl && valid && (
                  <button
                    type="button"
                    aria-label={t.webhookEndpointOverrideBtn}
                    title={t.webhookEndpointOverrideBtn}
                    onClick={() => setExpandedUrlId(isExpanded ? null : row.id)}
                    className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition-colors ${
                      hasOverride || isExpanded
                        ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]'
                        : 'border-[var(--border)] bg-[var(--canvas)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    <SlidersHorizontal className="h-3.5 w-3.5" />
                  </button>
                )}
                {trimmedUrl && valid && (
                  <button
                    type="button"
                    disabled={isTestingWebhook}
                    aria-label={t.docsWebhookTestButton}
                    onClick={() => void onTestWebhook(trimmedUrl)}
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--canvas)] text-[var(--accent)] hover:bg-[var(--surface-hover)] disabled:opacity-40 transition-colors"
                  >
                    <Send className="h-3.5 w-3.5" />
                  </button>
                )}
                {urlRowsDraft.length > 1 && (
                  <button
                    type="button"
                    aria-label={t.webhookRemoveUrlLabel}
                    onClick={() => {
                      if (trimmedUrl && overridesDraft[trimmedUrl]) {
                        const nextOv = { ...overridesDraft };
                        delete nextOv[trimmedUrl];
                        setOverridesDraft(nextOv);
                      }
                      if (expandedUrlId === row.id) setExpandedUrlId(null);
                      setUrlRowsDraft((prev) => prev.filter((item) => item.id !== row.id));
                    }}
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--canvas)] text-[var(--text-muted)] hover:text-red-500 hover:border-red-500/40 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              {isExpanded && trimmedUrl && (
                <div className="space-y-2 rounded-lg border border-[var(--border)] bg-[var(--canvas)]/70 p-2.5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="password"
                      value={endpointOv?.secret ?? ''}
                      onChange={(e) => {
                        setOverridesDraft((prev) => ({
                          ...prev,
                          [trimmedUrl]: { ...prev[trimmedUrl], secret: e.target.value },
                        }));
                      }}
                      placeholder={t.webhookEndpointSecretPlaceholder}
                      className="h-8 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 font-mono-tabular text-[11px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none"
                    />
                    <input
                      type="text"
                      value={endpointOv?.events ?? ''}
                      onChange={(e) => {
                        setOverridesDraft((prev) => ({
                          ...prev,
                          [trimmedUrl]: { ...prev[trimmedUrl], events: e.target.value },
                        }));
                      }}
                      placeholder={t.webhookEndpointEventsPlaceholder}
                      className="h-8 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 font-mono-tabular text-[11px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none"
                    />
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <SelectField
                      data-testid={`webhook-endpoint-format-${idx}`}
                      value={endpointOv?.format ?? formatDraft}
                      onChange={(e) => {
                        const fmt = e.target.value as WebhookFormat;
                        setOverridesDraft((prev) => ({
                          ...prev,
                          [trimmedUrl]: { ...prev[trimmedUrl], format: fmt },
                        }));
                      }}
                      wrapperClassName="w-40"
                      selectClassName="h-8 text-[11px]"
                    >
                      <option value="auto">{t.webhookFormatAuto}</option>
                      <option value="discord">{t.webhookFormatDiscord}</option>
                      <option value="slack">{t.webhookFormatSlack}</option>
                      <option value="generic">{t.webhookFormatGeneric}</option>
                    </SelectField>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-medium text-[var(--text-secondary)]">
                        {!isUrlPaused ? t.enabledBadge : t.webhookEndpointPausedBadge}
                      </span>
                      <ToggleSwitch
                        size="sm"
                        checked={!isUrlPaused}
                        onChange={() => {
                          setOverridesDraft((prev) => ({
                            ...prev,
                            [trimmedUrl]: {
                              ...prev[trimmedUrl],
                              enabled: isUrlPaused,
                            },
                          }));
                        }}
                        label={trimmedUrl}
                        testId={`webhook-endpoint-enabled-${idx}`}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        <button
          type="button"
          data-testid="docs-webhook-add-url-btn"
          onClick={() => setUrlRowsDraft((prev) => [...prev, { id: nextUrlRowId(), url: '' }])}
          className="inline-flex items-center gap-1 rounded-md border border-dashed border-[var(--border)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--text-primary)] transition-colors"
        >
          <Plus className="h-3 w-3 text-[var(--accent)]" />
          <span>{t.webhookAddUrlBtn}</span>
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <div className="space-y-1">
          <label
            htmlFor="webhook-format-select"
            className="block text-[11px] font-medium text-[var(--text-muted)]"
          >
            {t.webhookFormatLabel}
          </label>
          <SelectField
            id="webhook-format-select"
            data-testid="docs-webhook-format-select"
            value={formatDraft}
            onChange={(e) => setFormatDraft(e.target.value as WebhookFormat)}
            wrapperClassName="w-full"
            selectClassName="h-9"
          >
            <option value="auto">{t.webhookFormatAuto}</option>
            <option value="discord">{t.webhookFormatDiscord}</option>
            <option value="slack">{t.webhookFormatSlack}</option>
            <option value="generic">{t.webhookFormatGeneric}</option>
          </SelectField>
        </div>
        <div className="space-y-1">
          <label
            htmlFor="webhook-secret-input"
            className="block text-[11px] font-medium text-[var(--text-muted)]"
          >
            {t.docsWebhookSecretPlaceholder}
          </label>
          <div className="flex items-center gap-1.5">
            <input
              id="webhook-secret-input"
              type={revealOutgoingSecret ? 'text' : 'password'}
              data-testid="docs-webhook-secret-input"
              value={secretDraft}
              onChange={(e) => setSecretDraft(e.target.value)}
              placeholder="whsec_..."
              className="h-9 min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-[var(--canvas)] px-3 font-mono-tabular text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none"
            />
            <button
              type="button"
              aria-label={t.webhookRevealSecretLabel}
              onClick={() => setRevealOutgoingSecret((prev) => !prev)}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--canvas)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] transition-colors"
            >
              {revealOutgoingSecret ? (
                <EyeOff className="h-3.5 w-3.5" />
              ) : (
                <Eye className="h-3.5 w-3.5" />
              )}
            </button>
            {secretDraft.trim() && (
              <button
                type="button"
                aria-label={t.docsCopyButton}
                onClick={() => void onCopy('outgoing-secret', secretDraft.trim())}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--canvas)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] transition-colors"
              >
                {copiedId === 'outgoing-secret' ? (
                  <Check className="h-3.5 w-3.5 text-emerald-500" />
                ) : (
                  <Copy className="h-3.5 w-3.5 text-[var(--accent)]" />
                )}
              </button>
            )}
            <button
              type="button"
              title={t.webhookGenerateSecretBtn}
              aria-label={t.webhookGenerateSecretBtn}
              onClick={() => setSecretDraft(generateSecureWebhookKey())}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--canvas)] text-[var(--accent)] hover:bg-[var(--surface-hover)] transition-colors"
            >
              <KeyRound className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-1.5 pt-1">
        <p className="text-[11px] font-medium text-[var(--text-muted)]">{t.webhookEventsTitle}</p>
        <div className="flex flex-wrap gap-1.5" data-testid="docs-webhook-events-chips">
          <button
            type="button"
            onClick={() => toggleEventChip('*')}
            className={`rounded-md border px-2 py-1 text-[11px] font-medium transition-colors ${
              selectedEventSet.has('*')
                ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text-primary)]'
                : 'border-[var(--border)] bg-[var(--canvas)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            {t.webhookEventsAll}
          </button>
          {EVENT_OPTIONS.map((ev) => {
            const active = !selectedEventSet.has('*') && selectedEventSet.has(ev);
            return (
              <button
                key={ev}
                type="button"
                data-testid={`docs-webhook-event-${ev}`}
                onClick={() => toggleEventChip(ev)}
                className={`rounded-md border px-2 py-1 font-mono-tabular text-[11px] transition-colors ${
                  active
                    ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text-primary)] font-semibold'
                    : 'border-[var(--border)] bg-[var(--canvas)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              >
                {ev}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-start justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--canvas)]/60 px-3 py-2">
        <div className="min-w-0">
          <p className="text-xs font-medium text-[var(--text-primary)]">
            {t.webhookAllowLocalLabel}
          </p>
          <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">{t.webhookAllowLocalDesc}</p>
        </div>
        <ToggleSwitch
          checked={allowLocalDraft}
          onChange={setAllowLocalDraft}
          label={t.webhookAllowLocalLabel}
          testId="docs-webhook-allow-local-toggle"
        />
      </div>

      {hasUnsavedChanges && (
        <div
          role="status"
          data-testid="docs-webhook-unsaved-banner"
          className="flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11.5px] font-medium text-amber-700 dark:text-amber-300"
        >
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span>{t.webhookUnsavedBanner}</span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 pt-0.5">
        <button
          type="button"
          data-testid="docs-webhook-save-btn"
          disabled={isSavingWebhook}
          onClick={() => void onSaveConfig()}
          className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-medium transition-opacity disabled:opacity-45"
          style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-fg)' }}
        >
          {webhookSaved ? <Check className="h-3.5 w-3.5" /> : null}
          <span>{t.docsWebhookSaveButton}</span>
        </button>
        <button
          type="button"
          data-testid="docs-webhook-test-btn"
          disabled={isTestingWebhook || !cleanedJoinedUrls}
          onClick={() => void onTestWebhook()}
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
          className="flex items-center justify-between gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-600 dark:text-emerald-400 animate-fade-in"
        >
          <div className="flex min-w-0 items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate" title={`${t.docsWebhookSaveButton}: ${lastSavedSummary}`}>
              {`${t.docsWebhookSaveButton}: ${lastSavedSummary}`}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setWebhookSaved(false)}
            aria-label={t.closeMenu}
            className="shrink-0 rounded p-0.5 opacity-75 hover:opacity-100"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {webhookTestResult && (
        <div
          role={webhookTestResult.ok ? 'status' : 'alert'}
          className={`flex items-start justify-between gap-2 rounded-lg border px-3 py-2 text-xs font-medium leading-snug animate-fade-in ${
            webhookTestResult.ok
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
              : 'border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400'
          }`}
        >
          <span className="min-w-0 flex-1 break-words">
            {webhookTestResult.ok
              ? `${t.docsWebhookTestOk} (HTTP ${webhookTestResult.statusCode ?? 200} · ${webhookTestResult.latencyMs ?? 0}ms)`
              : webhookTestResult.error}
          </span>
          <button
            type="button"
            onClick={() => setWebhookTestResult(null)}
            aria-label={t.closeMenu}
            className="shrink-0 rounded p-0.5 opacity-75 hover:opacity-100"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
