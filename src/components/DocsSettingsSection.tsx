import { Cpu, Search, Server, Terminal, Webhook, X } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api/client';
import { useI18n } from '../i18n/I18nContext';
import type { McpClientStatus, McpProbeResult } from '../types';
import { DocsCliTab } from './settings/docs/DocsCliTab';
import { DocsMcpSection } from './settings/docs/DocsMcpSection';
import { DocsRestApiTab } from './settings/docs/DocsRestApiTab';

export type DocsSubTabId = 'cli' | 'mcp' | 'api' | 'webhooks';

interface DocsSettingsSectionProps {
  webhookNode?: React.ReactNode;
  requestedSubTab?: DocsSubTabId;
  subTabSeq?: number;
}

export const DocsSettingsSection = React.memo(function DocsSettingsSection({
  webhookNode,
  requestedSubTab,
  subTabSeq,
}: DocsSettingsSectionProps) {
  const { t } = useI18n();
  const [activeSubTab, setActiveSubTab] = useState<DocsSubTabId>(requestedSubTab ?? 'cli');
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
  const [customMcpPath, setCustomMcpPath] = useState<string | null>(null);
  const [mcpProbe, setMcpProbe] = useState<McpProbeResult | null>(null);
  const [mcpProbing, setMcpProbing] = useState<boolean>(false);
  const [mcpFormat, setMcpFormat] = useState<
    'standard' | 'vscode' | 'codex' | 'opencode' | 'cli' | 'http'
  >('standard');
  const copyTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (subTabSeq !== undefined && requestedSubTab) {
      setActiveSubTab(requestedSubTab);
    }
  }, [requestedSubTab, subTabSeq]);

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

  const handleInstallCustomMcp = useCallback(async () => {
    if (!window.agendameaWindow?.installCustomMcpFile) return;
    setMcpBusyId('custom');
    setMcpActionMsg(null);
    try {
      const res = await window.agendameaWindow.installCustomMcpFile();
      if (res?.canceled) return;
      if (res?.ok && res.configPath) {
        setCustomMcpPath(res.configPath);
        setMcpActionMsg(`${res.name || 'MCP'}: ${t.docsMcpInstalledOk}`);
        await refreshMcpClients();
      } else {
        setMcpActionMsg(res?.error || t.operationFailedToast);
      }
    } catch {
      setMcpActionMsg(t.operationFailedToast);
    } finally {
      setMcpBusyId(null);
    }
  }, [refreshMcpClients, t.docsMcpInstalledOk, t.operationFailedToast]);

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
    if (mcpFormat === 'codex') {
      const cmdToml = mcpStdioCommand.includes("'")
        ? JSON.stringify(mcpStdioCommand)
        : `'${mcpStdioCommand}'`;
      return `# ~/.codex/config.toml\n[mcp_servers.agendamea]\ncommand = ${cmdToml}\nargs = ['mcp']`;
    }
    if (mcpFormat === 'opencode') {
      return JSON.stringify(
        {
          $schema: 'https://opencode.ai/config.json',
          mcp: {
            agendamea: {
              type: 'local',
              command: [mcpStdioCommand, 'mcp'],
              enabled: true,
            },
          },
        },
        null,
        2,
      );
    }
    if (mcpFormat === 'cli') {
      return `# Claude Code CLI\nclaude mcp add agendamea -- "${mcpStdioCommand}" mcp\n\n# ChatGPT Codex CLI\ncodex mcp add agendamea -- "${mcpStdioCommand}" mcp`;
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
    { id: 'cli', label: t.docsSubTabCli, icon: Terminal },
    { id: 'mcp', label: t.docsSubTabMcp, icon: Cpu },
    { id: 'api', label: t.docsSubTabApi, icon: Server },
    ...(webhookNode
      ? [{ id: 'webhooks' as const, label: t.settingsTabWebhooks, icon: Webhook }]
      : []),
  ];

  return (
    <section
      aria-label={t.settingsTabAutomation}
      data-setting-id="docs-main"
      className="space-y-6 pb-4"
      data-testid="docs-settings-section"
    >
      {/* 4-Way Developer Hairline Underline Switcher (zero chunky box, zero nested tablist) */}
      <div className="space-y-3.5">
        <fieldset
          aria-label={t.settingsTabAutomation}
          className="flex flex-wrap items-center gap-x-5 gap-y-1 border-b border-[var(--border)]"
        >
          {subTabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeSubTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                aria-pressed={active}
                data-testid={`docs-subtab-${tab.id}`}
                onClick={() => setActiveSubTab(tab.id)}
                className={`-mb-px inline-flex items-center gap-1.5 border-b-2 pb-2.5 pt-0.5 text-xs font-medium transition-colors whitespace-nowrap ${
                  active
                    ? 'border-[var(--text-primary)] text-[var(--text-primary)]'
                    : 'border-transparent text-[var(--text-muted)] ag-hover-glow hover:text-[var(--text-primary)]'
                }`}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </fieldset>

        {activeSubTab !== 'webhooks' && (
          <div className="relative w-full">
            <Search className="pointer-events-none absolute start-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              type="text"
              data-testid="docs-search-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t.docsSearchPlaceholder}
              aria-label={t.docsSearchPlaceholder}
              className="w-full rounded-lg border border-[var(--border)] bg-transparent py-1.5 ps-8 pe-7 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--text-secondary)]"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label={t.clearSearch}
                className="absolute end-1.5 top-1/2 -translate-y-1/2 p-0.5 text-[var(--text-muted)] ag-hover-glow hover:text-[var(--text-primary)]"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        )}
      </div>

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
          customMcpPath={customMcpPath}
          mcpProbe={mcpProbe}
          mcpProbing={mcpProbing}
          mcpFormat={mcpFormat}
          runtimePort={runtimePort}
          activeMcpJson={activeMcpJson}
          copiedKey={copiedKey}
          onRefreshClients={() => void refreshMcpClients()}
          onTestMcp={() => void handleTestMcp()}
          onInstallMcpClient={(id) => void handleInstallMcpClient(id)}
          onInstallCustomMcp={() => void handleInstallCustomMcp()}
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
      {activeSubTab === 'webhooks' && webhookNode}
    </section>
  );
});
