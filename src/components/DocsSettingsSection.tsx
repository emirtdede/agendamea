import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  CheckCircle2,
  ChevronDown,
  Copy,
  Cpu,
  Download,
  Terminal,
} from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';

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
  'agendamea_semantic_search',
  'agendamea_ai_status',
] as const;

export const DocsSettingsSection = React.memo(function DocsSettingsSection() {
  const { t } = useI18n();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showAllCli, setShowAllCli] = useState<boolean>(false);
  const isNonWindowsClient =
    typeof navigator !== 'undefined' &&
    !/win/i.test(navigator.platform || navigator.userAgent || '');
  const [execPath, setExecPath] = useState<string>(
    isNonWindowsClient
      ? '/Applications/Agendamea.app/Contents/MacOS/Agendamea'
      : 'C:\\Program Files\\Agendamea\\Agendamea.exe',
  );
  const [mcpPath, setMcpPath] = useState<string>(
    isNonWindowsClient
      ? '/Applications/Agendamea.app/Contents/Resources/app.asar.unpacked/mcp/server.cjs'
      : 'C:\\Program Files\\Agendamea\\resources\\app.asar.unpacked\\mcp\\server.cjs',
  );
  const [cliInstalled, setCliInstalled] = useState<boolean>(false);
  const [isInstallingCli, setIsInstallingCli] = useState<boolean>(false);
  const [cliInstallError, setCliInstallError] = useState<string | null>(null);
  const copyTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
    };
  }, []);

  useEffect(() => {
    let active = true;
    void window.agendameaWindow
      ?.getDiagnostics?.()
      .then((diag) => {
        if (!active || !diag) return;
        if (diag.execPath) setExecPath(diag.execPath);
        if (diag.mcpPath) setMcpPath(diag.mcpPath);
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
      { id: 'ai', cmd: 'ag ai status', desc: t.aiHardwareCardTitle },
      { id: 'rag', cmd: 'ag rag "q4"', desc: `${t.settingsTabAi} (${t.aiRagChunksLabel})` },
      { id: 'ask', cmd: 'ag ask "..."', desc: t.aiSectionSubtitle },
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
      t.aiHardwareCardTitle,
      t.settingsTabAi,
      t.aiRagChunksLabel,
      t.aiSectionSubtitle,
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
      // Ignore clipboard permission errors
    }
  };

  const handleInstallCli = async () => {
    if (isInstallingCli || !window.agendameaWindow?.installCliShims) return;
    setIsInstallingCli(true);
    setCliInstallError(null);
    try {
      const res = await window.agendameaWindow.installCliShims();
      if (res?.ok) {
        setCliInstalled(true);
      } else {
        setCliInstallError(t.operationFailedToast);
      }
    } catch {
      setCliInstallError(t.operationFailedToast);
    } finally {
      setIsInstallingCli(false);
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
          {cliCommands.map((item) => (
            <div
              key={item.id}
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-4 py-2.5"
            >
              <div className="min-w-0 space-y-0.5">
                <code className="block font-mono-tabular text-xs font-semibold text-[var(--text-primary)] break-all">
                  {item.cmd}
                </code>
                <p className="text-[11px] text-[var(--text-muted)]">{item.desc}</p>
              </div>
              <button
                type="button"
                data-testid={`docs-copy-cli-${item.id}`}
                onClick={() => void handleCopy(`cli-${item.id}`, item.cmd)}
                className="inline-flex items-center gap-1 self-start sm:self-center rounded-md border border-[var(--border)] bg-[var(--canvas)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors whitespace-nowrap shrink-0"
              >
                {copiedId === `cli-${item.id}` ? (
                  <Check className="h-3 w-3 text-emerald-500" />
                ) : (
                  <Copy className="h-3 w-3 text-[var(--accent)]" />
                )}
                <span>
                  {copiedId === `cli-${item.id}` ? t.docsCopiedLabel : t.docsCopyButton}
                </span>
              </button>
            </div>
          ))}

          {/* Expandable Full 100% Headless CLI Reference */}
          <div>
            <button
              type="button"
              data-testid="docs-all-commands-toggle"
              aria-expanded={showAllCli}
              onClick={() => setShowAllCli((prev) => !prev)}
              className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors"
            >
              <span className="min-w-0">
                <span className="block">{t.docsCliAllCommandsToggle}</span>
                <span className="block text-[11px] font-normal text-[var(--text-muted)]">
                  {t.docsCliAllCommandsHint}
                </span>
              </span>
              <ChevronDown
                className={`h-4 w-4 shrink-0 text-[var(--text-muted)] transition-transform ${
                  showAllCli ? 'rotate-180' : ''
                }`}
              />
            </button>

            {showAllCli && (
              <div
                data-testid="docs-advanced-cli-list"
                className="divide-y divide-[var(--border)] border-t border-[var(--border)] bg-[var(--canvas)]/45"
              >
                {advancedCliCommands.map((item) => (
                  <div
                    key={item.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-4 py-2"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <code className="block font-mono-tabular text-[11.5px] font-semibold text-[var(--text-primary)] break-all">
                        {item.cmd}
                      </code>
                      <p className="text-[11px] text-[var(--text-muted)]">{item.desc}</p>
                    </div>
                    <button
                      type="button"
                      data-testid={`docs-copy-cli-${item.id}`}
                      onClick={() => void handleCopy(`cli-${item.id}`, item.cmd)}
                      className="inline-flex items-center gap-1 self-start sm:self-center rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors whitespace-nowrap shrink-0"
                    >
                      {copiedId === `cli-${item.id}` ? (
                        <Check className="h-3 w-3 text-emerald-500" />
                      ) : (
                        <Copy className="h-3 w-3 text-[var(--accent)]" />
                      )}
                      <span>
                        {copiedId === `cli-${item.id}` ? t.docsCopiedLabel : t.docsCopyButton}
                      </span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-[var(--surface-subtle)]/60 px-4 py-2 text-[11px] text-[var(--text-muted)]">
            {t.docsCliInstallHint}
          </div>
          {cliInstallError && (
            <p role="alert" className="px-4 py-2 text-xs font-medium text-red-500">
              {cliInstallError}
            </p>
          )}
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
    </div>
  );
});
