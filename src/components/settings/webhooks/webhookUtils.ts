import type { WebhookEndpointOverride, WebhookFormat } from '../../../types';

export interface WebhookSettingsPatch {
  webhookEnabled: boolean;
  webhookUrl: string;
  webhookSecret: string;
  webhookEvents?: string;
  webhookFormat?: WebhookFormat;
  webhookIncomingEnabled?: boolean;
  webhookIncomingSecret?: string;
  webhookAllowLocalNetwork?: boolean;
  webhookEndpointOverrides?: Record<string, WebhookEndpointOverride>;
}

export interface WebhooksSettingsTabProps {
  webhookEnabled: boolean;
  webhookUrl: string;
  webhookSecret: string;
  webhookEvents?: string;
  webhookFormat?: WebhookFormat;
  webhookIncomingEnabled?: boolean;
  webhookIncomingSecret?: string;
  webhookAllowLocalNetwork?: boolean;
  webhookEndpointOverrides?: Record<string, WebhookEndpointOverride>;
  onSaveWebhook: (patch: WebhookSettingsPatch) => Promise<void>;
}

export const EVENT_OPTIONS = [
  'todo.created',
  'todo.updated',
  'todo.completed',
  'todo.deleted',
  'todo.restored',
  'todo.upcoming',
  'todo.due',
  'category.*',
  'subtask.*',
] as const;

export type IncomingActionTab =
  | 'ping'
  | 'add'
  | 'update'
  | 'complete'
  | 'pin'
  | 'delete'
  | 'restore'
  | 'clear_completed'
  | 'subtask.add'
  | 'subtask.toggle'
  | 'category.create'
  | 'category.update'
  | 'category.delete'
  | 'trash.empty';

export const INCOMING_ACTION_TABS: IncomingActionTab[] = [
  'ping',
  'add',
  'update',
  'complete',
  'pin',
  'delete',
  'restore',
  'clear_completed',
  'subtask.add',
  'subtask.toggle',
  'category.create',
  'category.update',
  'category.delete',
  'trash.empty',
];

export interface UrlDraftRow {
  id: string;
  url: string;
}

let urlRowSeq = 0;
export function nextUrlRowId(): string {
  urlRowSeq += 1;
  return `wh-url-${urlRowSeq}`;
}

export function splitUrls(raw: string): string[] {
  const list = String(raw || '')
    .split(/[\r\n,]+/)
    .map((u) => u.trim())
    .filter(Boolean);
  return list.length > 0 ? list : [''];
}

export function splitUrlRows(raw: string): UrlDraftRow[] {
  return splitUrls(raw).map((url) => ({ id: nextUrlRowId(), url }));
}

export function isUrlFormatValid(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return true;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function generateSecureWebhookKey(): string {
  const bytes = new Uint8Array(24);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  let bin = '';
  for (const byte of bytes) bin += String.fromCharCode(byte);
  return `whsec_${btoa(bin)}`;
}

export function buildIncomingActionPayload(
  incomingActionTab: IncomingActionTab,
  shortcutNewTaskLabel: string | undefined,
): Record<string, unknown> {
  const sampleTitle = (shortcutNewTaskLabel || 'New task').replace(/["\\]/g, '');
  switch (incomingActionTab) {
    case 'ping':
      return { action: 'ping' };
    case 'update':
      return { action: 'update', id: sampleTitle, priority: 'high', dueTime: '18:00' };
    case 'complete':
      return { action: 'complete', id: sampleTitle, completed: true };
    case 'pin':
      return { action: 'pin', id: sampleTitle, pinned: true };
    case 'delete':
      return { action: 'delete', id: sampleTitle };
    case 'restore':
      return { action: 'restore', id: sampleTitle };
    case 'clear_completed':
      return { action: 'clear_completed' };
    case 'subtask.add':
      return { action: 'subtask.add', taskId: sampleTitle, title: 'Subtask 1' };
    case 'subtask.toggle':
      return { action: 'subtask.toggle', taskId: sampleTitle, subtaskId: '1' };
    case 'category.create':
      return { action: 'category.create', name: 'Automation', color: '#2563eb' };
    case 'category.update':
      return { action: 'category.update', id: 'Automation', pinned: true };
    case 'category.delete':
      return { action: 'category.delete', id: 'Automation' };
    case 'trash.empty':
      return { action: 'trash.empty' };
    default:
      return { action: 'add', title: sampleTitle, priority: 'high', tags: ['api'] };
  }
}

export function buildIncomingCommandSnippet(params: {
  runtimePort: number;
  payload: Record<string, unknown>;
  effectiveIncomingSecret: string;
  revealIncomingSecret: boolean;
  incomingShellTab: 'curl' | 'powershell';
  isWindowsClient: boolean;
}): string {
  const url = `http://127.0.0.1:${params.runtimePort}/api/webhook/incoming`;
  const jsonBody = JSON.stringify(params.payload);
  const displaySecret = params.effectiveIncomingSecret
    ? params.revealIncomingSecret
      ? params.effectiveIncomingSecret
      : '<YOUR_WEBHOOK_SECRET>'
    : '';

  if (params.incomingShellTab === 'powershell') {
    const headersBlock = displaySecret
      ? `@{ 'Content-Type' = 'application/json; charset=utf-8'; 'X-Agendamea-Secret' = '${displaySecret.replace(/'/g, "''")}' }`
      : `@{ 'Content-Type' = 'application/json; charset=utf-8' }`;
    return `$body = [System.Text.Encoding]::UTF8.GetBytes('${jsonBody.replace(/'/g, "''")}'); Invoke-RestMethod -Method Post -Uri '${url}' -Headers ${headersBlock} -Body $body`;
  }

  const escapedCurlBody = jsonBody.replace(/"/g, '\\"');
  const secretHeader = displaySecret ? ` -H "X-Agendamea-Secret: ${displaySecret}"` : '';
  const curlBin = params.isWindowsClient ? 'curl.exe' : 'curl';
  return `${curlBin} -X POST ${url} -H "Content-Type: application/json; charset=utf-8"${secretHeader} -d "${escapedCurlBody}"`;
}
