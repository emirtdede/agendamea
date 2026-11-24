import { BookOpen, Cpu, Search, Server, Terminal, X } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api/client';
import { useI18n } from '../i18n/I18nContext';
import type { McpClientStatus, McpProbeResult } from '../types';
import { DocsCliTab } from './settings/docs/DocsCliTab';
import { DocsMcpSection } from './settings/docs/DocsMcpSection';
import { DocsRestApiTab } from './settings/docs/DocsRestApiTab';
import { DocsUserGuideTab } from './settings/docs/DocsUserGuideTab';

type DocsSubTabId = 'guide' | 'cli' | 'mcp' | 'api';

export const DocsSettingsSection = React.memo(function DocsSettingsSection() {
  const { t } = useI18n();
  const [activeSubTab, setActiveSubTab] = useState<DocsSubTabId>('guide');
  const [searchQuery, setSearchQuery] = useState('');
  const [cliInstalled, setCliInstalled] = useState<boolean>(false);
  const [cliExePath, setCliExePath] = useState<string>('');
  const [runtimePort, setRuntimePort] = useState<number>(3000);
  const [installingCli, setInstallingCli] = useState<boolean>(false);
  const [installFeedback, setInstallFeedback] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [mcpClients, setMcpClients] = useState<McpClientStatus[]>([]);
  const [mcpBusyId, setMcpBusyId] = useState<string | null>(null);
  const [mcpActionMsg, setMcpActionMsg] = useState<string | null>(null);
  const [mcpProbe, setMcpProbe] = useState<McpProbeResult | null>(null);
  const [mcpProbing, setMcpProbing] = useState<boolean>(false);
  const [mcpFormat, setMcpFormat] = useState<'standard' | 'vscode' | 'cli' | 'http'>('standard');
  const copyTimerRef = useRef<number | null>(null);

  const hasDesktopBridge =
    typeof window !== 'undefined' && Boolean(window.agendameaWindow?.installCliShims);

  const refreshMcpClients = useCallback(async () => {
    try {
      const res = await window.agendameaWindow?.listMcpClients?.();
      if (res?.ok && Array.isArray(res.clients)) {
        setMcpClients(res.clients);
      }
    } catch {
      // Ignore in web mode
    }
  }, []);

  useEffect(() => {
    let active = true;
    void api
      .getSystemInfo()
      .then((info) => {
        if (active && typeof info?.runtimePort === 'number' && info.runtimePort > 0) {
          setRuntimePort(info.runtimePort);
        }
      })
      .catch(() => {
        /* ignore */
      });
    const loadDiag = async () => {
      try {
        const diag = await window.agendameaWindow?.getDiagnostics?.();
        if (!active || !diag) return;
        setCliInstalled(Boolean(diag.cliInstalled));
        setCliExePath(diag.cliExePath || '');
        if (typeof diag.runtimePort === 'number' && diag.runtimePort > 0) {
          setRuntimePort(diag.runtimePort);
        }
      } catch {
        // Ignore in web mode
      }
    };
    void loadDiag();
    void refreshMcpClients();
    return () => {
      active = false;
      if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
    };
  }, [refreshMcpClients]);

  const handleCopy = useCallback(async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopiedKey(key);
    if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
    copyTimerRef.current = window.setTimeout(() => {
      setCopiedKey(null);
      copyTimerRef.current = null;
    }, 1800);
  }, []);

  const handleInstallCli = useCallback(async () => {
    if (!window.agendameaWindow?.installCliShims) return;
    setInstallingCli(true);
    setInstallFeedback(null);
    try {
      const res = await window.agendameaWindow.installCliShims();
      if (res?.ok) {
        setCliInstalled(true);
        if (res.executablePath) setCliExePath(res.executablePath);
        setInstallFeedback(t.docsCliInstalledBadge);
      } else {
        setInstallFeedback(res?.error || t.operationFailedToast);
      }
    } catch {
      setInstallFeedback(t.operationFailedToast);
    } finally {
      setInstallingCli(false);
    }
  }, [t.docsCliInstalledBadge, t.operationFailedToast]);

  const handleOpenTerminal = useCallback(async () => {
    if (!window.agendameaWindow?.openCliTerminal) return;
    await window.agendameaWindow.openCliTerminal();
  }, []);

  const handleInstallMcpClient = useCallback(
    async (clientId: string) => {
      if (!window.agendameaWindow?.installMcpClient) return;
      setMcpBusyId(clientId);
      setMcpActionMsg(null);
      try {
        const res = await window.agendameaWindow.installMcpClient(clientId);
        if (res?.ok) {
          setMcpActionMsg(
            res.requiresRestart
              ? `${res.name || clientId}: ${t.docsMcpClientRestartHint}`
              : `${res.name || clientId}: ${t.docsMcpInstalledOk}`,
          );
          await refreshMcpClients();
        } else {
          setMcpActionMsg(res?.error || t.operationFailedToast);
        }
      } catch {
        setMcpActionMsg(t.operationFailedToast);
      } finally {
        setMcpBusyId(null);
      }
    },
    [refreshMcpClients, t.docsMcpInstalledOk, t.docsMcpClientRestartHint, t.operationFailedToast],
  );

  const handleUninstallMcpClient = useCallback(
    async (clientId: string) => {
      if (!window.agendameaWindow?.uninstallMcpClient) return;
      setMcpBusyId(clientId);
      setMcpActionMsg(null);
      try {
        const res = await window.agendameaWindow.uninstallMcpClient(clientId);
        if (res?.ok) {
          setMcpActionMsg(t.docsMcpRemovedOk);
          await refreshMcpClients();
        } else {
          setMcpActionMsg(res?.error || t.operationFailedToast);
        }
      } catch {
        setMcpActionMsg(t.operationFailedToast);
      } finally {
        setMcpBusyId(null);
      }
    },
    [refreshMcpClients, t.docsMcpRemovedOk, t.operationFailedToast],
  );

  const handleTestMcp = useCallback(async () => {
    if (!window.agendameaWindow?.testMcpServer) return;
    setMcpProbing(true);
    setMcpProbe(null);
    try {
      const result = await window.agendameaWindow.testMcpServer();
      setMcpProbe(result);
    } catch {
      setMcpProbe({ ok: false, latencyMs: 0, error: t.operationFailedToast });
    } finally {
      setMcpProbing(false);
    }
  }, [t.operationFailedToast]);

  const mcpStdioCommand = cliExePath || 'ag';
  const activeMcpJson = useMemo(() => {
    if (mcpFormat === 'vscode') {
      return JSON.stringify(
        { servers: { agendamea: { type: 'stdio', command: mcpStdioCommand, args: ['mcp'] } } },
        null,
        2,
      );
    }
    if (mcpFormat === 'cli') {
      return `# Claude Code CLI\nclaude mcp add agendamea -- "${mcpStdioCommand}" mcp\n\n# OpenAI Codex CLI\ncodex mcp add agendamea -- "${mcpStdioCommand}" mcp`;
    }
    if (mcpFormat === 'http') {
      return JSON.stringify(
        {
          mcpServers: {
            agendamea: { type: 'streamable-http', url: `http://127.0.0.1:${runtimePort}/api/mcp` },
          },
        },
        null,
        2,
      );
    }
    return JSON.stringify(
      { mcpServers: { agendamea: { command: mcpStdioCommand, args: ['mcp'] } } },
      null,
      2,
    );
  }, [mcpFormat, mcpStdioCommand, runtimePort]);

  const subTabs: Array<{
    id: DocsSubTabId;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    { id: 'guide', label: t.docsSubTabGuide, icon: BookOpen },
    { id: 'cli', label: t.docsSubTabCli, icon: Terminal },
    { id: 'mcp', label: t.docsSubTabMcp, icon: Cpu },
    { id: 'api', label: t.docsSubTabApi, icon: Server },
  ];

  return (
    <section
      aria-label={t.settingsTabDocs}
      className="space-y-4"
      data-testid="docs-settings-section"
    >
      {/* Audience-Separated Sub-Tabs + Instant Docs Search */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div
          role="tablist"
          aria-label={t.settingsTabDocs}
          className="inline-flex flex-wrap gap-1 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1"
        >
          {subTabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeSubTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                data-testid={`docs-subtab-${tab.id}`}
                onClick={() => setActiveSubTab(tab.id)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  active
                    ? 'bg-[var(--accent)] text-[var(--accent-fg)]'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]'
                }`}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        <div className="relative min-w-[200px] sm:w-56">
          <Search className="pointer-events-none absolute start-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            type="text"
            data-testid="docs-search-input"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t.docsSearchPlaceholder}
            aria-label={t.docsSearchPlaceholder}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] py-1.5 ps-8 pe-7 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)]"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              aria-label={t.clearSearch}
              className="absolute end-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {activeSubTab === 'guide' && <DocsUserGuideTab searchQuery={searchQuery} />}
      {activeSubTab === 'cli' && (
        <DocsCliTab
          searchQuery={searchQuery}
          cliInstalled={cliInstalled}
          installingCli={installingCli}
          installFeedback={installFeedback}
          hasDesktopBridge={hasDesktopBridge}
          onInstallCli={() => void handleInstallCli()}
          onOpenTerminal={() => void handleOpenTerminal()}
          copiedKey={copiedKey}
          onCopy={(k, text) => void handleCopy(k, text)}
        />
      )}
      {activeSubTab === 'mcp' && (
        <DocsMcpSection
          searchQuery={searchQuery}
          hasDesktopBridge={hasDesktopBridge}
          mcpClients={mcpClients}
          mcpBusyId={mcpBusyId}
          mcpActionMsg={mcpActionMsg}
          mcpProbe={mcpProbe}
          mcpProbing={mcpProbing}
          mcpFormat={mcpFormat}
          runtimePort={runtimePort}
          activeMcpJson={activeMcpJson}
          copiedKey={copiedKey}
          onRefreshClients={() => void refreshMcpClients()}
          onTestMcp={() => void handleTestMcp()}
          onInstallMcpClient={(id) => void handleInstallMcpClient(id)}
          onUninstallMcpClient={(id) => void handleUninstallMcpClient(id)}
          onSelectFormat={setMcpFormat}
          onCopy={(k, text) => void handleCopy(k, text)}
        />
      )}
      {activeSubTab === 'api' && (
        <DocsRestApiTab
          searchQuery={searchQuery}
          runtimePort={runtimePort}
          copiedKey={copiedKey}
          onCopy={(k, text) => void handleCopy(k, text)}
        />
      )}
    </section>
  );
});
