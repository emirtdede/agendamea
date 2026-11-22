import React, { useEffect, useMemo, useState } from 'react';
import { Check, Copy, Cpu, Keyboard, Terminal } from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';

interface DocsSettingsSectionProps {
  shortcuts: Array<{ keys: string; label: string }>;
}

const MCP_TOOLS = [
  'agendamea_status',
  'agendamea_list_tasks',
  'agendamea_add_task',
  'agendamea_complete_task',
  'agendamea_delete_task',
  'agendamea_list_categories',
] as const;

export const DocsSettingsSection = React.memo(function DocsSettingsSection({
  shortcuts,
}: DocsSettingsSectionProps) {
  const { t } = useI18n();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [mcpPath, setMcpPath] = useState<string>('C:\\Program Files\\Agendamea\\resources\\app.asar.unpacked\\mcp\\server.cjs');
  const [cliPath, setCliPath] = useState<string>('C:\\Program Files\\Agendamea\\resources\\app.asar.unpacked\\cli\\agendamea.cjs');

  useEffect(() => {
    let active = true;
    void window.agendameaWindow
      ?.getDiagnostics?.()
      .then((diag) => {
        if (!active || !diag) return;
        if (diag.mcpPath) setMcpPath(diag.mcpPath);
        if (diag.cliPath) setCliPath(diag.cliPath);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const cliCommands = useMemo(
    () => [
      { id: 'list', cmd: 'agendamea list --today', desc: t.docsCmdListDesc },
      { id: 'add', cmd: 'agendamea add "Sprint demo" --today --high', desc: t.docsCmdAddDesc },
      { id: 'done', cmd: 'agendamea done <id>', desc: t.docsCmdDoneDesc },
      { id: 'del', cmd: 'agendamea del <id>', desc: t.docsCmdDelDesc },
      { id: 'status', cmd: 'agendamea status', desc: t.docsCmdStatusDesc },
    ],
    [t.docsCmdListDesc, t.docsCmdAddDesc, t.docsCmdDoneDesc, t.docsCmdDelDesc, t.docsCmdStatusDesc],
  );

  const directRunCommand = useMemo(() => `node "${cliPath}" list`, [cliPath]);

  const mcpConfigJson = useMemo(
    () =>
      JSON.stringify(
        {
          mcpServers: {
            agendamea: {
              command: 'node',
              args: [mcpPath],
            },
          },
        },
        null,
        2,
      ),
    [mcpPath],
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

  return (
    <div className="space-y-6" data-testid="settings-docs-section">
      {/* Terminal & CLI Commands */}
      <section aria-label={t.docsCliTitle} className="space-y-2.5">
        <div>
          <div className="flex items-center gap-1.5">
            <Terminal className="h-3.5 w-3.5 text-[var(--accent)]" />
            <h3 className="font-display text-xs font-semibold text-[var(--text-muted)]">
              {t.docsCliTitle}
            </h3>
          </div>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">{t.docsCliDesc}</p>
        </div>

        <div className="divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
          {cliCommands.map((item) => {
            const isCopied = copiedId === item.id;
            return (
              <div
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
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

          <div className="flex flex-wrap items-center justify-between gap-3 bg-[var(--surface-subtle)]/60 px-4 py-2.5">
            <code
              className="min-w-0 flex-1 truncate font-mono-tabular text-[11px] text-[var(--text-secondary)]"
              title={directRunCommand}
            >
              {directRunCommand}
            </code>
            <button
              type="button"
              onClick={() => void handleCopy('direct-cli', directRunCommand)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--canvas)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors whitespace-nowrap shrink-0"
            >
              {copiedId === 'direct-cli' ? (
                <Check className="h-3 w-3 text-emerald-500 shrink-0" />
              ) : (
                <Copy className="h-3 w-3 text-[var(--accent)] shrink-0" />
              )}
              <span>{copiedId === 'direct-cli' ? t.docsCopiedLabel : t.docsCopyButton}</span>
            </button>
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
