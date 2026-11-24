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
      {/* Desktop Controls or Web/PWA Notice */}
      {!hasDesktopBridge ? (
        <div className="flex items-start gap-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-xs text-[var(--text-secondary)]">
          <Info className="h-4 w-4 text-[var(--accent)] shrink-0 mt-0.5" />
          <span>{t.docsDesktopOnlyNotice}</span>
        </div>
      ) : (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Terminal className="h-4 w-4 text-[var(--accent)]" />
              <span className="font-display text-xs font-semibold text-[var(--text-primary)]">
                {t.docsCliTitle}
              </span>
              {cliInstalled && (
                <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10.5px] font-medium text-emerald-600 dark:text-emerald-400">
                  {t.docsCliInstalledBadge}
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                data-testid="docs-install-cli-btn"
                onClick={onInstallCli}
                disabled={installingCli}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--accent)] bg-[var(--accent-soft)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:opacity-90 disabled:opacity-50"
              >
                <Download className="h-3.5 w-3.5 text-[var(--accent)]" />
                <span>{t.docsCliInstallButton}</span>
              </button>
              <button
                type="button"
                data-testid="docs-open-terminal-btn"
                onClick={onOpenTerminal}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--canvas)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)]"
              >
                <Terminal className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                <span>{t.docsCliTryTerminalButton}</span>
              </button>
            </div>
          </div>

          {installFeedback && (
            <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
              {installFeedback}
            </p>
          )}

          {/* In-App Safe Dry-Run Runner */}
          <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border)] pt-3">
            <span className="text-[11px] font-medium text-[var(--text-muted)]">
              {t.docsCliDryRunLabel}:
            </span>
            <button
              type="button"
              data-testid="docs-cli-dry-stat"
              disabled={dryRunning !== null}
              onClick={() => void handleRunDry('stat')}
              className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--canvas)] px-2.5 py-1 font-mono-tabular text-[11px] font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)] disabled:opacity-50"
            >
              <Play className="h-3 w-3 text-[var(--accent)]" />
              <span>ag stat</span>
            </button>
            <button
              type="button"
              data-testid="docs-cli-dry-doctor"
              disabled={dryRunning !== null}
              onClick={() => void handleRunDry('doctor')}
              className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--canvas)] px-2.5 py-1 font-mono-tabular text-[11px] font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)] disabled:opacity-50"
            >
              <Play className="h-3 w-3 text-[var(--accent)]" />
              <span>ag doctor</span>
            </button>
          </div>

          {dryOutput && (
            <pre
              data-testid="docs-cli-dry-output"
              className="max-h-48 overflow-auto rounded-lg border border-[var(--border)] bg-[var(--canvas)] p-3 font-mono-tabular text-[11px] leading-relaxed text-[var(--text-secondary)] whitespace-pre-wrap"
            >
              {`$ ${dryOutput.cmd}\n${dryOutput.text}`}
            </pre>
          )}
        </div>
      )}

      {/* Categorized CLI Commands */}
      <div className="space-y-3">
        <button
          type="button"
          data-testid="docs-all-commands-toggle"
          aria-expanded={commandsOpen || Boolean(q)}
          onClick={() => setCommandsOpen((prev) => !prev)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors"
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
            <section
              key={group.title}
              className="rounded-xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden"
            >
              <div className="border-b border-[var(--border)] px-4 py-2.5">
                <h4 className="font-display text-xs font-semibold text-[var(--text-primary)]">
                  {group.title}
                </h4>
              </div>
              <div className="divide-y divide-[var(--border)]">
                {group.commands.map((item) => (
                  <div
                    key={item.cmd}
                    className="flex items-center justify-between gap-2 px-4 py-2 hover:bg-[var(--surface-hover)]/60 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <code className="block font-mono-tabular text-[11.5px] font-medium text-[var(--text-primary)] break-all">
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
                      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--canvas)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                    >
                      {copiedKey === `cli-${item.cmd}` ? (
                        <Check className="h-3.5 w-3.5 text-emerald-500" />
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
      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 space-y-2.5">
        <h4 className="font-display text-xs font-semibold text-[var(--text-primary)]">
          {t.docsCliFlagsTitle}
        </h4>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 text-xs">
          {[
            { flag: '--json', desc: t.docsCliFlagJsonDesc },
            { flag: '--note "..." --sub "..."', desc: t.docsCliFlagNoteSubDesc },
            { flag: 'echo "Task" | ag +', desc: t.docsCliPipeAddDesc },
            { flag: 'ag export > backup.json', desc: t.docsCliPipeExportDesc },
          ].map((f) => (
            <div
              key={f.flag}
              className="rounded-lg border border-[var(--border)] bg-[var(--canvas)] px-3 py-2"
            >
              <code className="font-mono-tabular text-[11px] font-semibold text-[var(--accent)]">
                {f.flag}
              </code>
              <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
});
