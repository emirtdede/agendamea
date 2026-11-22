import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  CheckCircle2,
  ChevronDown,
  Copy,
  Cpu,
  Download,
  Keyboard,
  Send,
  Terminal,
  Webhook,
} from 'lucide-react';
import { api } from '../api/client';
import { useI18n } from '../i18n/I18nContext';
import type { WebhookTestResult } from '../types';

interface DocsSettingsSectionProps {
  shortcuts: Array<{ keys: string; label: string }>;
  webhookEnabled: boolean;
  webhookUrl: string;
  webhookSecret: string;
  onSaveWebhook: (patch: {
    webhookEnabled: boolean;
    webhookUrl: string;
    webhookSecret: string;
  }) => Promise<void>;
}

const MCP_TOOLS = [
  'agendamea_status',
  'agendamea_list_tasks',
  'agendamea_get_task',
  'agendamea_add_task',
  'agendamea_update_task',
  'agendamea_complete_task',
  'agendamea_pin_task',
  'agendamea_delete_task',
  'agendamea_clear_completed',
  'agendamea_manage_subtask',
  'agendamea_list_categories',
  'agendamea_manage_category',
  'agendamea_list_trash',
  'agendamea_manage_trash',
  'agendamea_eisenhower_matrix',
  'agendamea_views',
  'agendamea_get_settings',
  'agendamea_update_settings',
  'agendamea_backup_and_sync',
  'agendamea_webhook_and_server',
] as const;

export const DocsSettingsSection = React.memo(function DocsSettingsSection({
  shortcuts,
  webhookEnabled,
  webhookUrl,
  webhookSecret,
  onSaveWebhook,
}: DocsSettingsSectionProps) {
  const { t } = useI18n();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showAllCli, setShowAllCli] = useState<boolean>(false);
  const [execPath, setExecPath] = useState<string>('C:\\Program Files\\Agendamea\\Agendamea.exe');
  const [mcpPath, setMcpPath] = useState<string>(
    'C:\\Program Files\\Agendamea\\resources\\app.asar.unpacked\\mcp\\server.cjs',
  );
  const [runtimePort, setRuntimePort] = useState<number>(38721);
  const [cliInstalled, setCliInstalled] = useState<boolean>(false);
  const [isInstallingCli, setIsInstallingCli] = useState<boolean>(false);

  const [enabledDraft, setEnabledDraft] = useState<boolean>(webhookEnabled);
  const [urlDraft, setUrlDraft] = useState<string>(webhookUrl);
  const [secretDraft, setSecretDraft] = useState<string>(webhookSecret);
  const [isSavingWebhook, setIsSavingWebhook] = useState<boolean>(false);
  const [webhookSaved, setWebhookSaved] = useState<boolean>(false);
  const [isTestingWebhook, setIsTestingWebhook] = useState<boolean>(false);
  const [webhookTestResult, setWebhookTestResult] = useState<WebhookTestResult | null>(null);

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
        if (diag.execPath) setExecPath(diag.execPath);
        if (diag.mcpPath) setMcpPath(diag.mcpPath);
        if (typeof diag.runtimePort === 'number' && diag.runtimePort > 0) {
          setRuntimePort(diag.runtimePort);
        }
        if (typeof diag.cliInstalled === 'boolean') {
          setCliInstalled(diag.cliInstalled);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const cliCommands = useMemo(
    () => [
      { id: 'list', cmd: 'ag', desc: t.docsCmdListDesc },
      { id: 'add', cmd: t.docsCmdAddExample, desc: t.docsCmdAddDesc },
      { id: 'done', cmd: 'ag ok 1', desc: t.docsCmdDoneDesc },
      { id: 'del', cmd: 'ag rm 2', desc: t.docsCmdDelDesc },
      { id: 'search', cmd: t.docsCmdSearchExample, desc: t.docsCmdSearchDesc },
      { id: 'undo', cmd: t.docsCmdUndoExample, desc: t.docsCmdUndoDesc },
      { id: 'status', cmd: 'ag stat', desc: t.docsCmdStatusDesc },
    ],
    [
      t.docsCmdListDesc,
      t.docsCmdAddExample,
      t.docsCmdAddDesc,
      t.docsCmdDoneDesc,
      t.docsCmdDelDesc,
      t.docsCmdSearchExample,
      t.docsCmdSearchDesc,
      t.docsCmdUndoExample,
      t.docsCmdUndoDesc,
      t.docsCmdStatusDesc,
    ],
  );

  const advancedCliCommands = useMemo(
    () => [
      { id: 'show', cmd: t.docsCmdShowExample, desc: t.docsCmdShowDesc },
      { id: 'edit', cmd: t.docsCmdEditExample, desc: t.docsCmdEditDesc },
      { id: 'sub', cmd: t.docsCmdSubExample, desc: t.docsCmdSubDesc },
      { id: 'cat', cmd: t.docsCmdCatExample, desc: t.docsCmdCatDesc },
      { id: 'trash', cmd: t.docsCmdTrashExample, desc: t.docsCmdTrashDesc },
      { id: 'matrix', cmd: t.docsCmdMatrixExample, desc: t.docsCmdMatrixDesc },
      { id: 'backup', cmd: t.docsCmdBackupExample, desc: t.docsCmdBackupDesc },
      { id: 'config', cmd: t.docsCmdConfigExample, desc: t.docsCmdConfigDesc },
      { id: 'serve', cmd: t.docsCmdServeExample, desc: t.docsCmdServeDesc },
    ],
    [
      t.docsCmdShowExample,
      t.docsCmdShowDesc,
      t.docsCmdEditExample,
      t.docsCmdEditDesc,
      t.docsCmdSubExample,
      t.docsCmdSubDesc,
      t.docsCmdCatExample,
      t.docsCmdCatDesc,
      t.docsCmdTrashExample,
      t.docsCmdTrashDesc,
      t.docsCmdMatrixExample,
      t.docsCmdMatrixDesc,
      t.docsCmdBackupExample,
      t.docsCmdBackupDesc,
      t.docsCmdConfigExample,
      t.docsCmdConfigDesc,
      t.docsCmdServeExample,
      t.docsCmdServeDesc,
    ],
  );

  const mcpConfigJson = useMemo(
    () =>
      JSON.stringify(
        cliInstalled
          ? {
              mcpServers: {
                agendamea: {
                  command: 'ag',
                  args: ['mcp'],
                },
              },
            }
          : {
              mcpServers: {
                agendamea: {
                  command: execPath,
                  args: [mcpPath],
                  env: { ELECTRON_RUN_AS_NODE: '1' },
                },
              },
            },
        null,
        2,
      ),
    [cliInstalled, execPath, mcpPath],
  );

  const incomingWebhookCmd = useMemo(
    () =>
      `curl -X POST http://127.0.0.1:${runtimePort}/api/webhook/incoming -H "Content-Type: application/json" -d "{\\"title\\":\\"Yeni gorev\\",\\"priority\\":\\"high\\"}"`,
    [runtimePort],
  );

  const handleCopy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      window.setTimeout(() => {
        setCopiedId((prev) => (prev === id ? null : prev));
      }, 2200);
    } catch {
      // Ignore clipboard permission errors
    }
  };

  const handleInstallCli = async () => {
    if (isInstallingCli || !window.agendameaWindow?.installCliShims) return;
    setIsInstallingCli(true);
    try {
      const res = await window.agendameaWindow.installCliShims();
      if (res?.ok) {
        setCliInstalled(true);
      }
    } catch {
      // Ignore shim install errors
    } finally {
      setIsInstallingCli(false);
    }
  };

  const handleSaveWebhookConfig = async () => {
    if (isSavingWebhook) return;
    setIsSavingWebhook(true);
    setWebhookTestResult(null);
    try {
      await onSaveWebhook({
        webhookEnabled: enabledDraft,
        webhookUrl: urlDraft.trim(),
        webhookSecret: secretDraft.trim(),
      });
      setWebhookSaved(true);
      window.setTimeout(() => setWebhookSaved(false), 2400);
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
    <div className="space-y-6" data-testid="settings-docs-section">
      {/* Terminal & Short CLI Commands (ag) */}
      <section aria-label={t.docsCliTitle} className="space-y-2.5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <Terminal className="h-3.5 w-3.5 text-[var(--accent)]" />
              <h3 className="font-display text-xs font-semibold text-[var(--text-muted)]">
                {t.docsCliTitle}
              </h3>
            </div>
            <p className="mt-0.5 text-xs text-[var(--text-muted)]">{t.docsCliDesc}</p>
          </div>
          {window.agendameaWindow?.installCliShims && (
            <div className="flex flex-wrap items-center gap-1.5 shrink-0">
              <button
                type="button"
                data-testid="docs-install-cli-btn"
                disabled={isInstallingCli}
                onClick={() => void handleInstallCli()}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 disabled:opacity-50 ${
                  cliInstalled
                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                    : 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text-primary)] hover:opacity-90'
                }`}
              >
                {cliInstalled ? (
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                ) : (
                  <Download className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />
                )}
                <span>{cliInstalled ? t.docsCliInstalledBadge : t.docsCliInstallButton}</span>
              </button>
              {window.agendameaWindow?.openCliTerminal && (
                <button
                  type="button"
                  data-testid="docs-try-terminal-btn"
                  onClick={() => void window.agendameaWindow?.openCliTerminal?.().catch(() => {})}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors whitespace-nowrap shrink-0"
                >
                  <Terminal className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />
                  <span>{t.docsCliTryTerminalButton}</span>
                </button>
              )}
            </div>
          )}
        </div>

        <div className="divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
          {cliCommands.map((item) => {
            const isCopied = copiedId === item.id;
            return (
              <div
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5"
              >
                <div className="min-w-0 flex-1 space-y-0.5">
                  <code className="block truncate font-mono-tabular text-xs font-semibold text-[var(--text-primary)]">
                    {item.cmd}
                  </code>
                  <p className="text-[11px] text-[var(--text-muted)]">{item.desc}</p>
                </div>
                <button
                  type="button"
                  data-testid={`docs-copy-cli-${item.id}`}
                  onClick={() => void handleCopy(item.id, item.cmd)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--canvas)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors whitespace-nowrap shrink-0"
                >
                  {isCopied ? (
                    <Check className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                  ) : (
                    <Copy className="h-3.5 w-3.5 text-[var(--accent)] shrink-0" />
                  )}
                  <span>{isCopied ? t.docsCopiedLabel : t.docsCopyButton}</span>
                </button>
              </div>
            );
          })}

          <div className="bg-[var(--surface-subtle)]/50">
            <button
              type="button"
              data-testid="docs-all-commands-toggle"
              aria-expanded={showAllCli}
              onClick={() => setShowAllCli((prev) => !prev)}
              className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors"
            >
              <span className="truncate">{t.docsCliAllCommandsToggle}</span>
              <ChevronDown
                className={`h-3.5 w-3.5 shrink-0 text-[var(--text-muted)] transition-transform ${
                  showAllCli ? 'rotate-180' : ''
                }`}
              />
            </button>
            {showAllCli && (
              <div
                data-testid="docs-all-commands-panel"
                className="divide-y divide-[var(--border)] border-t border-[var(--border)] bg-[var(--canvas)]/60"
              >
                <div className="px-4 py-2 text-[11px] text-[var(--text-muted)]">
                  {t.docsCliAllCommandsHint}
                </div>
                {advancedCliCommands.map((item) => {
                  const isCopied = copiedId === item.id;
                  return (
                    <div
                      key={item.id}
                      className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5"
                    >
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <code className="block truncate font-mono-tabular text-xs font-semibold text-[var(--text-primary)]">
                          {item.cmd}
                        </code>
                        <p className="text-[11px] text-[var(--text-muted)]">{item.desc}</p>
                      </div>
                      <button
                        type="button"
                        data-testid={`docs-copy-cli-${item.id}`}
                        onClick={() => void handleCopy(item.id, item.cmd)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors whitespace-nowrap shrink-0"
                      >
                        {isCopied ? (
                          <Check className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                        ) : (
                          <Copy className="h-3.5 w-3.5 text-[var(--accent)] shrink-0" />
                        )}
                        <span>{isCopied ? t.docsCopiedLabel : t.docsCopyButton}</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="bg-[var(--surface-subtle)]/60 px-4 py-2 text-[11px] text-[var(--text-muted)]">
            {t.docsCliInstallHint}
          </div>
        </div>
      </section>

      {/* MCP Server Configuration */}
      <section aria-label={t.docsMcpTitle} className="space-y-2.5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-1.5">
              <Cpu className="h-3.5 w-3.5 text-[var(--accent)]" />
              <h3 className="font-display text-xs font-semibold text-[var(--text-muted)]">
                {t.docsMcpTitle}
              </h3>
            </div>
            <p className="mt-0.5 text-xs text-[var(--text-muted)]">{t.docsMcpDesc}</p>
          </div>
          <button
            type="button"
            data-testid="docs-copy-mcp-btn"
            onClick={() => void handleCopy('mcp-json', mcpConfigJson)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors whitespace-nowrap shrink-0"
          >
            {copiedId === 'mcp-json' ? (
              <Check className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
            ) : (
              <Copy className="h-3.5 w-3.5 text-[var(--accent)] shrink-0" />
            )}
            <span>{copiedId === 'mcp-json' ? t.docsCopiedLabel : t.docsCopyButton}</span>
          </button>
        </div>

        <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
          <pre
            data-testid="docs-mcp-json"
            className="overflow-x-auto bg-[var(--canvas)] px-4 py-3.5 font-mono-tabular text-[11.5px] leading-relaxed text-[var(--text-primary)] select-text"
          >
            {mcpConfigJson}
          </pre>
          <div className="flex flex-wrap items-center gap-1.5 border-t border-[var(--border)] px-4 py-3">
            {MCP_TOOLS.map((toolName) => (
              <span
                key={toolName}
                className="rounded-md border border-[var(--border)] bg-[var(--canvas)] px-2 py-0.5 font-mono-tabular text-[11px] text-[var(--text-secondary)]"
              >
                {toolName}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Bi-Directional Webhooks (Outgoing Alerts + Local Incoming Trigger) */}
      <section aria-label={t.docsWebhookTitle} className="space-y-2.5" data-testid="docs-webhook-section">
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
            className={`inline-flex items-center rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors shrink-0 ${
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
                <span>{webhookSaved ? t.docsCopiedLabel : t.docsWebhookSaveButton}</span>
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

      {/* Keyboard Shortcuts Reference */}
      <section aria-label={t.keyboardShortcutsTitle} className="space-y-2.5">
        <div className="flex items-center gap-1.5">
          <Keyboard className="h-3.5 w-3.5 text-[var(--accent)]" />
          <h3 className="font-display text-xs font-semibold text-[var(--text-muted)]">
            {t.keyboardShortcutsTitle}
          </h3>
        </div>
        <div className="divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
          {shortcuts.map((item) => (
            <div
              key={item.keys}
              className="flex items-center justify-between gap-3 px-4 py-2.5 text-xs"
            >
              <span className="text-[var(--text-secondary)]">{item.label}</span>
              <kbd className="rounded-md border border-[var(--border)] bg-[var(--canvas)] px-2 py-0.5 font-mono-tabular text-[11px] text-[var(--text-primary)] whitespace-nowrap">
                {item.keys}
              </kbd>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
});
