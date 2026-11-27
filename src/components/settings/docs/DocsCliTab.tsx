import {
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  Info,
  Play,
  Terminal,
} from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../../../i18n/I18nContext';
import { matchesLocaleQuery } from '../../../utils/todoLogic';

interface DocsCliTabProps {
  searchQuery: string;
  cliInstalled: boolean;
  installingCli: boolean;
  installFeedback: string | null;
  hasDesktopBridge: boolean;
  onInstallCli: () => void;
  onOpenTerminal: () => void;
  copiedKey: string | null;
  onCopy: (key: string, text: string) => void;
}

export const DocsCliTab = React.memo(function DocsCliTab({
  searchQuery,
  cliInstalled,
  installingCli,
  installFeedback,
  hasDesktopBridge,
  onInstallCli,
  onOpenTerminal,
  copiedKey,
  onCopy,
}: DocsCliTabProps) {
  const { t } = useI18n();
  const [commandsOpen, setCommandsOpen] = useState(true);
  const [dryRunning, setDryRunning] = useState<'stat' | 'doctor' | null>(null);
  const [dryOutput, setDryOutput] = useState<{ cmd: string; ok: boolean; text: string } | null>(
    null,
  );
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const groups = useMemo(
    () => [
      {
        title: t.docsCliGroupTasks,
        commands: [
          { cmd: 'ag + Report @today 14:30 ! #work /Office', desc: t.docsCliCmdAdd },
          { cmd: 'ag', desc: t.docsCliCmdList },
          { cmd: 'ag today', desc: t.docsCliCmdToday },
          { cmd: 'ag ok 1 2', desc: t.docsCliCmdDone },
          { cmd: 'ag pin 1', desc: t.docsCliCmdPin },
          { cmd: 'ag edit 1 @tomorrow 10:00 !', desc: t.docsCliCmdEdit },
          { cmd: 'ag show 1', desc: t.docsCliCmdShow },
          { cmd: 'ag rm 1', desc: t.docsCliCmdRemove },
        ],
      },
      {
        title: t.docsCliGroupOrg,
        commands: [
          { cmd: 'ag sub add 1 Draft outline', desc: t.docsCliCmdSubAdd },
          { cmd: 'ag sub ok 1 1', desc: t.docsCliCmdSubToggle },
          { cmd: 'ag cat add Work #2563eb', desc: t.docsCliCmdCatAdd },
          { cmd: 'ag cat pin Work', desc: t.docsCliCmdCatPin },
          { cmd: 'ag cal', desc: t.docsCliCmdCal },
          { cmd: 'ag kanban', desc: t.docsCliCmdKanban },
          { cmd: 'ag matris', desc: t.docsCliCmdMatrix },
        ],
      },
      {
        title: t.docsCliGroupAiAndSystem,
        commands: [
          { cmd: 'ag ask "what is due today?"', desc: t.docsCliCmdAsk },
          { cmd: 'ag rag "budget report"', desc: t.docsCliCmdRag },
          { cmd: 'ag ai status', desc: t.docsCliCmdAiStatus },
          { cmd: 'ag stat', desc: t.docsCliCmdStat },
          { cmd: 'ag doctor', desc: t.docsCliCmdDoctor },
        ],
      },
      {
        title: t.docsCliGroupSyncAndDaemon,
        commands: [
          { cmd: 'ag trash', desc: t.docsCliCmdTrash },
          { cmd: 'ag undo', desc: t.docsCliCmdUndo },
          { cmd: 'ag sync push', desc: t.docsCliCmdSyncPush },
          { cmd: 'ag sync pull', desc: t.docsCliCmdSyncPull },
          { cmd: 'ag serve start', desc: t.docsCliCmdServeStart },
          { cmd: 'ag hook test', desc: t.docsCliCmdHookTest },
          { cmd: 'ag set themeMode dark', desc: t.docsCliCmdSet },
        ],
      },
    ],
    [
      t.docsCliCmdAdd,
      t.docsCliCmdAiStatus,
      t.docsCliCmdAsk,
      t.docsCliCmdCal,
      t.docsCliCmdCatAdd,
      t.docsCliCmdCatPin,
      t.docsCliCmdDoctor,
      t.docsCliCmdDone,
      t.docsCliCmdEdit,
      t.docsCliCmdHookTest,
      t.docsCliCmdKanban,
      t.docsCliCmdList,
      t.docsCliCmdMatrix,
      t.docsCliCmdPin,
      t.docsCliCmdRag,
      t.docsCliCmdRemove,
      t.docsCliCmdServeStart,
      t.docsCliCmdSet,
      t.docsCliCmdShow,
      t.docsCliCmdStat,
      t.docsCliCmdSubAdd,
      t.docsCliCmdSubToggle,
      t.docsCliCmdSyncPull,
      t.docsCliCmdSyncPush,
      t.docsCliCmdToday,
      t.docsCliCmdTrash,
      t.docsCliCmdUndo,
      t.docsCliGroupAiAndSystem,
      t.docsCliGroupOrg,
      t.docsCliGroupSyncAndDaemon,
      t.docsCliGroupTasks,
    ],
  );

  const q = searchQuery.trim();
  const filteredGroups = useMemo(() => {
    if (!q) return groups;
    return groups
      .map((g) => ({
        ...g,
        commands: g.commands.filter(
          (c) => matchesLocaleQuery(c.cmd, q) || matchesLocaleQuery(c.desc, q),
        ),
      }))
      .filter((g) => g.commands.length > 0);
  }, [groups, q]);

  const handleRunDry = async (cmd: 'stat' | 'doctor') => {
    if (!window.agendameaWindow?.runCliDry) return;
    setDryRunning(cmd);
    try {
      const res = await window.agendameaWindow.runCliDry(cmd);
      if (!isMountedRef.current) return;
      setDryOutput({
        cmd: `ag ${cmd}`,
        ok: Boolean(res?.ok),
        text: (res?.stdout || res?.stderr || t.docsCliEmptyOutput).trim(),
      });
    } catch {
      if (!isMountedRef.current) return;
      setDryOutput({ cmd: `ag ${cmd}`, ok: false, text: t.operationFailedToast });
    } finally {
      if (isMountedRef.current) setDryRunning(null);
    }
  };

  return (
    <div className="space-y-5" data-testid="docs-tab-cli">
      {/* Card 1: Desktop CLI Install & Dry-Run Controls (or Web/PWA Notice) */}
      {!hasDesktopBridge ? (
        <div className="flex items-start gap-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface)]/75 p-4 text-xs text-[var(--text-secondary)]">
          <Info className="h-4 w-4 text-[var(--text-muted)] shrink-0 mt-0.5" />
          <span>{t.docsDesktopOnlyNotice}</span>
        </div>
      ) : (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/75 p-4 sm:p-5 space-y-3.5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Terminal className="h-3.5 w-3.5 text-[var(--text-muted)]" />
              <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                {t.docsCliTitle}
              </span>
              {cliInstalled && (
                <span className="text-[11px] font-medium text-[var(--text-secondary)]">
                  · {t.docsCliInstalledBadge}
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                data-testid="docs-install-cli-btn"
                onClick={onInstallCli}
                disabled={installingCli}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium ag-hover-accent-glow disabled:opacity-50"
                style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-fg)' }}
              >
                <Download className="h-3.5 w-3.5" />
                <span>{t.docsCliInstallButton}</span>
              </button>
              <button
                type="button"
                data-testid="docs-open-terminal-btn"
                onClick={onOpenTerminal}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-subtle)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] ag-hover-card-glow"
              >
                <Terminal className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                <span>{t.docsCliTryTerminalButton}</span>
              </button>
            </div>
          </div>

          {installFeedback && (
            <p className="text-xs font-medium text-[var(--text-primary)]">{installFeedback}</p>
          )}

          {/* In-App Safe Dry-Run Runner */}
          <div className="flex flex-wrap items-center gap-4 border-t border-[var(--border)]/70 pt-3">
            <span className="text-[11px] font-medium text-[var(--text-muted)]">
              {t.docsCliDryRunLabel}:
            </span>
            <button
              type="button"
              data-testid="docs-cli-dry-stat"
              disabled={dryRunning !== null}
              onClick={() => void handleRunDry('stat')}
              className="inline-flex items-center gap-1 font-mono-tabular text-xs font-medium text-[var(--text-secondary)] ag-hover-glow hover:text-[var(--text-primary)] disabled:opacity-50"
            >
              <Play className="h-3 w-3 text-[var(--text-muted)]" />
              <span>ag stat</span>
            </button>
            <button
              type="button"
              data-testid="docs-cli-dry-doctor"
              disabled={dryRunning !== null}
              onClick={() => void handleRunDry('doctor')}
              className="inline-flex items-center gap-1 font-mono-tabular text-xs font-medium text-[var(--text-secondary)] ag-hover-glow hover:text-[var(--text-primary)] disabled:opacity-50"
            >
              <Play className="h-3 w-3 text-[var(--text-muted)]" />
              <span>ag doctor</span>
            </button>
          </div>

          {dryOutput && (
            <pre
              data-testid="docs-cli-dry-output"
              className="max-h-48 overflow-auto rounded-lg border border-[var(--border)] bg-[var(--canvas)]/60 p-3 font-mono-tabular text-[11px] leading-relaxed text-[var(--text-secondary)] whitespace-pre-wrap"
            >
              {`$ ${dryOutput.cmd}\n${dryOutput.text}`}
            </pre>
          )}
        </div>
      )}

      {/* Card 2: Categorized CLI Commands + Flags & Piping */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/75 divide-y divide-[var(--border)]/70">
        <div className="p-4 sm:p-5 space-y-5">
          <button
            type="button"
            data-testid="docs-all-commands-toggle"
            aria-expanded={commandsOpen || Boolean(q)}
            onClick={() => setCommandsOpen((prev) => !prev)}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--text-primary)] ag-hover-glow transition-colors"
          >
            {commandsOpen || q ? (
              <ChevronDown className="h-3.5 w-3.5 text-[var(--text-muted)]" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-[var(--text-muted)]" />
            )}
            <span>{t.docsCliAllCommandsToggle}</span>
          </button>

          {(commandsOpen || Boolean(q)) &&
            filteredGroups.map((group) => (
              <section key={group.title} className="space-y-2">
                <h4 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                  {group.title}
                </h4>
                <div className="border-t border-[var(--border)]/70 divide-y divide-[var(--border)]/60">
                  {group.commands.map((item) => (
                    <div
                      key={item.cmd}
                      className="flex items-center justify-between gap-2 py-2.5 ag-row-luminous transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <code className="block font-mono-tabular text-[12px] font-medium text-[var(--text-primary)] break-all">
                          {item.cmd}
                        </code>
                        <span className="block text-[11px] text-[var(--text-muted)]">
                          {item.desc}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => onCopy(`cli-${item.cmd}`, item.cmd)}
                        aria-label={t.docsCopyButton}
                        className="inline-flex h-7 w-7 shrink-0 items-center justify-center text-[var(--text-muted)] ag-hover-glow hover:text-[var(--text-primary)]"
                      >
                        {copiedKey === `cli-${item.cmd}` ? (
                          <Check className="h-3.5 w-3.5 text-[var(--text-primary)]" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            ))}
        </div>

        {/* CLI Flags & Piping Cheat-Sheet */}
        <section className="p-4 sm:p-5 space-y-3">
          <h4 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
            {t.docsCliFlagsTitle}
          </h4>
          <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 text-xs">
            {[
              { flag: '--json', desc: t.docsCliFlagJsonDesc },
              { flag: '--note "..." --sub "..."', desc: t.docsCliFlagNoteSubDesc },
              { flag: 'echo "Task" | ag +', desc: t.docsCliPipeAddDesc },
              { flag: 'ag export > backup.json', desc: t.docsCliPipeExportDesc },
            ].map((f) => (
              <div key={f.flag} className="space-y-0.5">
                <code className="font-mono-tabular text-[11.5px] font-medium text-[var(--text-primary)]">
                  {f.flag}
                </code>
                <p className="text-[11px] text-[var(--text-muted)]">{f.desc}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
});
