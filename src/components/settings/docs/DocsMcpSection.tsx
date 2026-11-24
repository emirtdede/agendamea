import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Cpu,
  Download,
  FileCode2,
  FolderOpen,
  Info,
  Play,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../../api/client';
import { useI18n } from '../../../i18n/I18nContext';
import { localizeErrorMessage } from '../../../i18n/translations';
import type { McpClientStatus, McpProbeResult } from '../../../types';
import { matchesLocaleQuery } from '../../../utils/todoLogic';

interface McpToolCatalogItem {
  name: string;
  descKey: keyof import('../../../i18n/translations').UiDictionary;
  readOnly: boolean;
  destructive?: boolean;
  params: string[];
  sampleArgs?: Record<string, unknown>;
}

const MCP_TOOLS_CATALOG: readonly McpToolCatalogItem[] = [
  {
    name: 'agendamea_status',
    descKey: 'docsMcpToolStatus',
    readOnly: true,
    params: [],
    sampleArgs: {},
  },
  {
    name: 'agendamea_list_tasks',
    descKey: 'docsMcpToolListTasks',
    readOnly: true,
    params: ['filter?', 'category?', 'priority?', 'tag?', 'query?', 'limit?'],
    sampleArgs: { filter: 'active', limit: 10 },
  },
  {
    name: 'agendamea_get_task',
    descKey: 'docsMcpToolGetTask',
    readOnly: true,
    params: ['id'],
  },
  {
    name: 'agendamea_add_task',
    descKey: 'docsMcpToolAddTask',
    readOnly: false,
    params: ['title', 'dueDate?', 'dueTime?', 'priority?', 'tags?', 'category?', 'subtasks?'],
  },
  {
    name: 'agendamea_update_task',
    descKey: 'docsMcpToolUpdateTask',
    readOnly: false,
    params: ['id', 'title?', 'dueDate?', 'priority?', 'completed?', 'pinned?', 'position?'],
  },
  {
    name: 'agendamea_complete_task',
    descKey: 'docsMcpToolCompleteTask',
    readOnly: false,
    params: ['id', 'completed?'],
  },
  {
    name: 'agendamea_pin_task',
    descKey: 'docsMcpToolPinTask',
    readOnly: false,
    params: ['id', 'pinned?'],
  },
  {
    name: 'agendamea_delete_task',
    descKey: 'docsMcpToolDeleteTask',
    readOnly: false,
    destructive: true,
    params: ['id'],
  },
  {
    name: 'agendamea_clear_completed',
    descKey: 'docsMcpToolClearCompleted',
    readOnly: false,
    destructive: true,
    params: ['category?'],
  },
  {
    name: 'agendamea_manage_subtask',
    descKey: 'docsMcpToolManageSubtask',
    readOnly: false,
    params: ['action', 'taskId', 'title?', 'subtaskId?', 'completed?'],
  },
  {
    name: 'agendamea_list_categories',
    descKey: 'docsMcpToolListCategories',
    readOnly: true,
    params: [],
    sampleArgs: {},
  },
  {
    name: 'agendamea_manage_category',
    descKey: 'docsMcpToolManageCategory',
    readOnly: false,
    destructive: true,
    params: ['action', 'id?', 'name?', 'color?', 'pinned?'],
  },
  {
    name: 'agendamea_list_trash',
    descKey: 'docsMcpToolListTrash',
    readOnly: true,
    params: ['typeFilter?', 'sortBy?', 'query?'],
    sampleArgs: { typeFilter: 'all' },
  },
  {
    name: 'agendamea_manage_trash',
    descKey: 'docsMcpToolManageTrash',
    readOnly: false,
    destructive: true,
    params: ['action', 'target?', 'itemType?', 'confirm?'],
  },
  {
    name: 'agendamea_eisenhower_matrix',
    descKey: 'docsMcpToolMatrix',
    readOnly: true,
    params: [],
    sampleArgs: {},
  },
  {
    name: 'agendamea_get_settings',
    descKey: 'docsMcpToolGetSettings',
    readOnly: true,
    params: [],
    sampleArgs: {},
  },
  {
    name: 'agendamea_update_settings',
    descKey: 'docsMcpToolUpdateSettings',
    readOnly: false,
    params: ['patch'],
  },
  {
    name: 'agendamea_backup_and_sync',
    descKey: 'docsMcpToolBackupSync',
    readOnly: false,
    destructive: true,
    params: ['action', 'folderPath?', 'confirm?'],
  },
  {
    name: 'agendamea_views',
    descKey: 'docsMcpToolViews',
    readOnly: true,
    params: ['view', 'groupBy?', 'dateFrom?', 'dateTo?'],
    sampleArgs: { view: 'kanban', groupBy: 'priority' },
  },
  {
    name: 'agendamea_webhook_and_server',
    descKey: 'docsMcpToolWebhookServer',
    readOnly: false,
    params: ['action', 'port?', 'limit?', 'outboxId?'],
  },
  {
    name: 'agendamea_semantic_search',
    descKey: 'docsMcpToolSemanticSearch',
    readOnly: true,
    params: ['query', 'topK?', 'minScore?'],
    sampleArgs: { query: 'today', topK: 5 },
  },
  {
    name: 'agendamea_ai_status',
    descKey: 'docsMcpToolAiStatus',
    readOnly: true,
    params: ['force?'],
    sampleArgs: { force: false },
  },
  {
    name: 'agendamea_ask',
    descKey: 'docsMcpToolAsk',
    readOnly: false,
    destructive: true,
    params: ['text', 'language?', 'readOnly?', 'confirmToken?'],
  },
];

const MCP_RESOURCES_URIS = [
  'agendamea://status',
  'agendamea://tasks/today',
  'agendamea://tasks/overdue',
  'agendamea://matrix',
  'agendamea://categories',
];

const MCP_RESOURCE_TEMPLATES = ['agendamea://task/{id}', 'agendamea://category/{name}/tasks'];

const MCP_PROMPTS = ['daily_plan', 'triage_overdue', 'eisenhower_review', 'weekly_summary'];

export interface DocsMcpSectionProps {
  searchQuery?: string;
  hasDesktopBridge: boolean;
  mcpClients: McpClientStatus[];
  mcpBusyId: string | null;
  mcpActionMsg: string | null;
  customMcpPath?: string | null;
  mcpProbe: McpProbeResult | null;
  mcpProbing: boolean;
  mcpFormat: 'standard' | 'vscode' | 'codex' | 'opencode' | 'cli' | 'http';
  runtimePort: number;
  activeMcpJson: string;
  copiedKey: string | null;
  onRefreshClients: () => void;
  onTestMcp: () => void;
  onInstallMcpClient: (clientId: string) => void;
  onInstallCustomMcp?: () => void;
  onUninstallMcpClient: (clientId: string) => void;
  onSelectFormat: (fmt: 'standard' | 'vscode' | 'codex' | 'opencode' | 'cli' | 'http') => void;
  onCopy: (key: string, text: string) => void;
}

export const DocsMcpSection = React.memo(function DocsMcpSection({
  searchQuery = '',
  hasDesktopBridge,
  mcpClients,
  mcpBusyId,
  mcpActionMsg,
  customMcpPath = null,
  mcpProbe,
  mcpProbing,
  mcpFormat,
  runtimePort,
  activeMcpJson,
  copiedKey,
  onRefreshClients,
  onTestMcp,
  onInstallMcpClient,
  onInstallCustomMcp,
  onUninstallMcpClient,
  onSelectFormat,
  onCopy,
}: DocsMcpSectionProps) {
  const { t, lang } = useI18n();
  const [clientsOpen, setClientsOpen] = useState(false);
  const [expandedTool, setExpandedTool] = useState<string | null>(null);
  const [runningTool, setRunningTool] = useState<string | null>(null);
  const [toolOutputs, setToolOutputs] = useState<Record<string, string>>({});
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const q = searchQuery.trim();
  const matchesAnyClient = useMemo(
    () =>
      Boolean(q) &&
      (mcpClients.some((c) => matchesLocaleQuery(c.name, q) || matchesLocaleQuery(c.id, q)) ||
        matchesLocaleQuery('custom', q) ||
        matchesLocaleQuery('toml', q)),
    [mcpClients, q],
  );
  const isClientsExpanded = clientsOpen || Boolean(mcpBusyId) || matchesAnyClient;
  const connectedCount = useMemo(
    () => mcpClients.filter((c) => c.configured).length + (customMcpPath ? 1 : 0),
    [customMcpPath, mcpClients],
  );
  const detectedCount = useMemo(() => mcpClients.filter((c) => c.detected).length, [mcpClients]);
  const totalClientCards = mcpClients.length + (hasDesktopBridge && onInstallCustomMcp ? 1 : 0);
  const filteredTools = useMemo(() => {
    if (!q) return MCP_TOOLS_CATALOG;
    return MCP_TOOLS_CATALOG.filter(
      (tool) =>
        matchesLocaleQuery(tool.name, q) ||
        matchesLocaleQuery(String(t[tool.descKey] ?? ''), q) ||
        tool.params.some((p) => matchesLocaleQuery(p, q)),
    );
  }, [q, t]);

  const handleRunReadOnlyTool = async (tool: McpToolCatalogItem) => {
    if (!tool.readOnly || !tool.sampleArgs) return;
    setRunningTool(tool.name);
    try {
      const res = await api.callMcpTool(tool.name, tool.sampleArgs);
      if (!isMountedRef.current) return;
      setToolOutputs((prev) => ({
        ...prev,
        [tool.name]: JSON.stringify(res, null, 2),
      }));
    } catch (err) {
      if (!isMountedRef.current) return;
      setToolOutputs((prev) => ({
        ...prev,
        [tool.name]: JSON.stringify(
          { error: localizeErrorMessage(err, t.operationFailedToast, lang, t) },
          null,
          2,
        ),
      }));
    } finally {
      if (isMountedRef.current) setRunningTool(null);
    }
  };

  return (
    <div className="space-y-5" data-testid="docs-tab-mcp">
      {/* Main MCP Client Card */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Cpu className="h-4 w-4 text-[var(--accent)]" />
              <span className="font-display text-sm font-semibold text-[var(--text-primary)]">
                {t.docsMcpTitle}
              </span>
              <span className="font-mono-tabular rounded-full border border-[var(--border)] bg-[var(--surface-subtle)] px-2 py-0.5 text-[10px] font-medium text-[var(--text-muted)]">
                2025-11-25 · 23 {t.docsMcpToolsShortLabel}
              </span>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">{t.docsMcpDesc}</p>
          </div>
          {hasDesktopBridge && (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={onRefreshClients}
                aria-label={t.retry}
                className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--canvas)] text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                data-testid="docs-mcp-test-btn"
                onClick={onTestMcp}
                disabled={mcpProbing}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--canvas)] px-2.5 py-1 text-xs font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-hover)] disabled:opacity-50"
              >
                <Play
                  className={`h-3 w-3 ${mcpProbing ? 'animate-pulse text-[var(--accent)]' : ''}`}
                />
                <span>{mcpProbing ? t.docsMcpTestingServerBtn : t.docsMcpTestServerBtn}</span>
              </button>
            </div>
          )}
        </div>

        {!hasDesktopBridge && (
          <div className="flex items-start gap-2 rounded-lg border border-[var(--border)] bg-[var(--canvas)] px-3 py-2 text-xs text-[var(--text-secondary)]">
            <Info className="h-3.5 w-3.5 text-[var(--accent)] shrink-0 mt-0.5" />
            <span>{t.docsDesktopOnlyNotice}</span>
          </div>
        )}

        {/* Live MCP Handshake Probe Result */}
        {mcpProbe && (
          <div
            data-testid="docs-mcp-probe-result"
            className={`rounded-lg border px-3 py-2 text-xs ${
              mcpProbe.ok
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                : 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300'
            }`}
          >
            {mcpProbe.ok ? (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono-tabular">
                <span className="font-semibold">{t.docsMcpTestOk}</span>
                <span>{mcpProbe.latencyMs}ms</span>
                {mcpProbe.protocolVersion && <span>v{mcpProbe.protocolVersion}</span>}
                <span>
                  {mcpProbe.toolCount ?? 23}T / {mcpProbe.resourceCount ?? 5}R /{' '}
                  {mcpProbe.promptCount ?? 4}P
                </span>
                {mcpProbe.mode && <span>({mcpProbe.mode})</span>}
              </div>
            ) : (
              <span>
                {t.docsMcpTestFailed}: {mcpProbe.error || t.operationFailedToast}
              </span>
            )}
          </div>
        )}

        {/* Collapsible One-Click AI Client Installer Grid (12 cards / 6x2, default collapsed) */}
        {mcpClients.length > 0 && (
          <div
            data-testid="mcp-clients-accordion"
            className="rounded-lg border border-[var(--border)] bg-[var(--canvas)]/60 overflow-hidden"
          >
            <button
              type="button"
              data-testid="mcp-clients-accordion-toggle"
              aria-expanded={isClientsExpanded}
              onClick={() => setClientsOpen((prev) => !prev)}
              className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-start transition-colors hover:bg-[var(--surface-hover)]"
            >
              <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                <span className="text-xs font-semibold text-[var(--text-primary)]">
                  {t.docsMcpAutoClientsTitle}
                </span>
                <span className="rounded bg-[var(--surface-subtle)] px-1.5 py-0.5 font-mono-tabular text-[10px] text-[var(--text-muted)]">
                  {connectedCount}/{totalClientCards}
                </span>
                {connectedCount > 0 && (
                  <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                    {connectedCount} {t.docsMcpClientConnectedBadge}
                  </span>
                )}
                {detectedCount > 0 && (
                  <span className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[10px] font-medium text-[var(--accent)]">
                    {detectedCount} {t.docsMcpClientDetectedBadge}
                  </span>
                )}
              </div>
              {isClientsExpanded ? (
                <ChevronDown className="h-4 w-4 text-[var(--text-muted)] shrink-0" />
              ) : (
                <ChevronRight className="h-4 w-4 text-[var(--text-muted)] shrink-0 rtl:rotate-180" />
              )}
            </button>

            {isClientsExpanded && (
              <div className="animate-accordion border-t border-[var(--border)] p-2.5 space-y-2">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {mcpClients.map((c) => {
                    const isBusy = mcpBusyId === c.id;
                    const statusBadge = c.parseError
                      ? {
                          text: t.docsMcpClientErrorBadge,
                          cls: 'bg-red-500/15 text-red-600 dark:text-red-400',
                        }
                      : c.configured && c.usesLegacyCmd
                        ? {
                            text: t.docsMcpClientLegacyBadge,
                            cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
                          }
                        : c.configured
                          ? {
                              text: t.docsMcpClientConnectedBadge,
                              cls: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
                            }
                          : c.detected
                            ? {
                                text: t.docsMcpClientDetectedBadge,
                                cls: 'bg-[var(--accent-soft)] text-[var(--accent)]',
                              }
                            : {
                                text: t.docsMcpClientNotFoundBadge,
                                cls: 'bg-[var(--surface-subtle)] text-[var(--text-muted)]',
                              };
                    return (
                      <div
                        key={c.id}
                        data-testid={`mcp-client-${c.id}`}
                        className="flex items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-xs font-semibold text-[var(--text-primary)]">
                              {c.name}
                            </span>
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${statusBadge.cls}`}
                            >
                              {statusBadge.text}
                            </span>
                          </div>
                          <p className="mt-0.5 truncate font-mono-tabular text-[10px] text-[var(--text-muted)]">
                            {c.configPath}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() =>
                              void window.agendameaWindow?.openFileLocation?.(c.configPath)
                            }
                            aria-label={t.docsMcpOpenConfigFolder}
                            title={t.docsMcpOpenConfigFolder}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--canvas)] text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
                          >
                            <FolderOpen className="h-3.5 w-3.5" />
                          </button>
                          {c.configured && !c.usesLegacyCmd ? (
                            <button
                              type="button"
                              onClick={() => onUninstallMcpClient(c.id)}
                              disabled={isBusy}
                              className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--canvas)] px-2 py-1 text-[11px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-hover)] hover:text-red-500 disabled:opacity-50"
                            >
                              <Trash2 className="h-3 w-3" />
                              <span>{t.docsMcpClientRemoveBtn}</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => onInstallMcpClient(c.id)}
                              disabled={isBusy}
                              className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
                              style={{
                                backgroundColor: 'var(--accent)',
                                color: 'var(--accent-fg)',
                              }}
                            >
                              <Download className="h-3 w-3" />
                              <span>
                                {c.usesLegacyCmd
                                  ? t.docsMcpClientUpdateBtn
                                  : t.docsMcpClientInstallBtn}
                              </span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {/* 12th Card: Custom User-Selected MCP Config (.json / .jsonc / .toml) */}
                  {hasDesktopBridge && onInstallCustomMcp && (
                    <div
                      data-testid="mcp-client-custom"
                      className="flex items-center justify-between gap-2 rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface)]/70 px-3 py-2.5 transition-colors hover:border-[var(--accent)]"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <FileCode2 className="h-3.5 w-3.5 text-[var(--accent)] shrink-0" />
                          <span className="text-xs font-semibold text-[var(--text-primary)]">
                            {t.notificationsProfileCustom} MCP
                          </span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                              customMcpPath
                                ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                                : 'bg-[var(--surface-subtle)] text-[var(--text-muted)]'
                            }`}
                          >
                            {customMcpPath ? t.docsMcpClientConnectedBadge : '.json / .toml'}
                          </span>
                        </div>
                        <p className="mt-0.5 truncate font-mono-tabular text-[10px] text-[var(--text-muted)]">
                          {customMcpPath || 'mcp.json · settings.json · config.toml'}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {customMcpPath && (
                          <button
                            type="button"
                            onClick={() =>
                              void window.agendameaWindow?.openFileLocation?.(customMcpPath)
                            }
                            aria-label={t.docsMcpOpenConfigFolder}
                            title={t.docsMcpOpenConfigFolder}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--canvas)] text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
                          >
                            <FolderOpen className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <button
                          type="button"
                          data-testid="mcp-custom-install-btn"
                          onClick={onInstallCustomMcp}
                          disabled={mcpBusyId === 'custom'}
                          className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--canvas)] px-2.5 py-1 text-[11px] font-semibold text-[var(--text-primary)] transition-colors hover:border-[var(--accent)] hover:bg-[var(--surface-hover)] disabled:opacity-50"
                        >
                          <Download className="h-3 w-3 text-[var(--accent)]" />
                          <span>{t.docsMcpClientInstallBtn}</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                {mcpActionMsg && (
                  <p className="text-xs font-medium text-[var(--accent)]">{mcpActionMsg}</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Format Switcher & Copyable Config Snippet */}
        <div className="space-y-2 border-t border-[var(--border)] pt-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="inline-flex flex-wrap items-center gap-0.5 rounded-lg border border-[var(--border)] bg-[var(--canvas)] p-0.5 text-[10.5px]">
              {(
                [
                  ['standard', t.docsMcpFormatStandard],
                  ['vscode', t.docsMcpFormatVsCode],
                  ['codex', 'Codex (TOML)'],
                  ['opencode', 'OpenCode'],
                  ['cli', t.docsMcpFormatClaudeCli],
                  ['http', t.docsMcpFormatHttp],
                ] as const
              ).map(([fmt, label]) => (
                <button
                  key={fmt}
                  type="button"
                  data-testid={`docs-mcp-format-${fmt}`}
                  onClick={() => onSelectFormat(fmt)}
                  className={`rounded-md px-2 py-1 font-medium transition-colors whitespace-nowrap ${
                    mcpFormat === fmt
                      ? 'bg-[var(--accent)] text-[var(--accent-fg)]'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              type="button"
              data-testid="docs-copy-mcp-btn"
              onClick={() => onCopy(`mcp-${mcpFormat}`, activeMcpJson)}
              className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--canvas)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-hover)] whitespace-nowrap"
            >
              {copiedKey === `mcp-${mcpFormat}` ? (
                <Check className="h-3 w-3 text-emerald-500" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
              <span>{copiedKey === `mcp-${mcpFormat}` ? t.docsCopiedLabel : t.docsCopyButton}</span>
            </button>
          </div>
          {mcpFormat === 'http' && (
            <p className="text-[11px] text-[var(--text-muted)]">
              {t.docsMcpHttpHint} (
              <code className="font-mono-tabular">127.0.0.1:{runtimePort}/api/mcp</code>)
            </p>
          )}
          <pre className="overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--canvas)] p-3 font-mono-tabular text-[11px] leading-relaxed text-[var(--text-secondary)]">
            {activeMcpJson}
          </pre>
        </div>
      </div>

      {/* Interactive 23 MCP Tools Explorer with Live Read-Only JSON Tester */}
      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
        <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-2.5">
          <h4 className="font-display text-xs font-semibold text-[var(--text-primary)]">
            {t.docsMcpToolsTitle} ({filteredTools.length})
          </h4>
          <span className="text-[11px] text-[var(--text-muted)]">{t.docsMcpTryLiveHint}</span>
        </div>
        <div className="divide-y divide-[var(--border)]">
          {filteredTools.map((tool) => {
            const isOpen = expandedTool === tool.name;
            const liveJson = toolOutputs[tool.name];
            return (
              <div key={tool.name}>
                <button
                  type="button"
                  data-testid={`mcp-tool-card-${tool.name}`}
                  aria-expanded={isOpen}
                  onClick={() => setExpandedTool((prev) => (prev === tool.name ? null : tool.name))}
                  className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-start hover:bg-[var(--surface-hover)]/70 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <code className="font-mono-tabular text-[11.5px] font-semibold text-[var(--text-primary)]">
                        {tool.name}
                      </code>
                      {tool.readOnly ? (
                        <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[9.5px] font-semibold text-emerald-600 dark:text-emerald-400">
                          {t.docsMcpBadgeReadOnly}
                        </span>
                      ) : tool.destructive ? (
                        <span className="inline-flex items-center gap-0.5 rounded bg-amber-500/15 px-1.5 py-0.5 text-[9.5px] font-semibold text-amber-700 dark:text-amber-300">
                          <AlertTriangle className="h-2.5 w-2.5" />
                          <span>{t.docsMcpBadgeDestructive}</span>
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
                      {String(t[tool.descKey] ?? '')}
                    </p>
                  </div>
                  {isOpen ? (
                    <ChevronDown className="h-4 w-4 text-[var(--text-muted)] shrink-0" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-[var(--text-muted)] shrink-0" />
                  )}
                </button>

                {isOpen && (
                  <div className="animate-accordion border-t border-[var(--border)]/60 bg-[var(--canvas)] px-4 py-3 space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                        <span className="font-medium text-[var(--text-muted)]">
                          {t.docsMcpParamsLabel}:
                        </span>
                        {tool.params.length === 0 ? (
                          <span className="font-mono-tabular text-[var(--text-muted)]">()</span>
                        ) : (
                          tool.params.map((p) => (
                            <code
                              key={p}
                              className="rounded border border-[var(--border)] bg-[var(--surface)] px-1.5 py-0.5 font-mono-tabular text-[10.5px] text-[var(--text-secondary)]"
                            >
                              {p}
                            </code>
                          ))
                        )}
                      </div>
                      {tool.readOnly && tool.sampleArgs && (
                        <button
                          type="button"
                          data-testid={`mcp-tool-run-${tool.name}`}
                          disabled={runningTool === tool.name}
                          onClick={() => void handleRunReadOnlyTool(tool)}
                          className="inline-flex items-center gap-1 rounded-md border border-[var(--accent)] bg-[var(--accent-soft)] px-2.5 py-1 text-[11px] font-semibold text-[var(--text-primary)] hover:opacity-90 disabled:opacity-50"
                        >
                          <Play className="h-3 w-3 text-[var(--accent)]" />
                          <span>{t.docsMcpRunNowButton}</span>
                        </button>
                      )}
                    </div>
                    {liveJson && (
                      <pre
                        data-testid={`mcp-tool-output-${tool.name}`}
                        className="max-h-52 overflow-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2.5 font-mono-tabular text-[10.5px] text-[var(--text-secondary)]"
                      >
                        {liveJson}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Resources, Resource Templates & Prompts */}
      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 space-y-3">
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold text-[var(--text-secondary)]">
            {t.docsMcpResourcesLabel} ({MCP_RESOURCES_URIS.length})
          </p>
          <div className="flex flex-wrap gap-1.5">
            {MCP_RESOURCES_URIS.map((uri) => (
              <button
                key={uri}
                type="button"
                onClick={() => onCopy(`res-${uri}`, uri)}
                className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--canvas)] px-2 py-1 font-mono-tabular text-[10.5px] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--text-primary)]"
              >
                <span>{uri}</span>
                {copiedKey === `res-${uri}` ? (
                  <Check className="h-3 w-3 text-emerald-500" />
                ) : (
                  <Copy className="h-2.5 w-2.5 opacity-60" />
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5 border-t border-[var(--border)] pt-3">
          <p className="text-[11px] font-semibold text-[var(--text-secondary)]">
            {t.docsMcpTemplatesTitle} ({MCP_RESOURCE_TEMPLATES.length})
          </p>
          <div className="flex flex-wrap gap-1.5">
            {MCP_RESOURCE_TEMPLATES.map((uri) => (
              <button
                key={uri}
                type="button"
                onClick={() => onCopy(`tpl-${uri}`, uri)}
                className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--canvas)] px-2 py-1 font-mono-tabular text-[10.5px] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--text-primary)]"
              >
                <span>{uri}</span>
                {copiedKey === `tpl-${uri}` ? (
                  <Check className="h-3 w-3 text-emerald-500" />
                ) : (
                  <Copy className="h-2.5 w-2.5 opacity-60" />
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5 border-t border-[var(--border)] pt-3">
          <p className="text-[11px] font-semibold text-[var(--text-secondary)]">
            {t.docsMcpPromptsLabel} ({MCP_PROMPTS.length})
          </p>
          <div className="flex flex-wrap gap-1.5">
            {MCP_PROMPTS.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => onCopy(`prompt-${name}`, name)}
                className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--canvas)] px-2 py-1 font-mono-tabular text-[10.5px] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--text-primary)]"
              >
                <span>{name}</span>
                {copiedKey === `prompt-${name}` ? (
                  <Check className="h-3 w-3 text-emerald-500" />
                ) : (
                  <Copy className="h-2.5 w-2.5 opacity-60" />
                )}
              </button>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
});
