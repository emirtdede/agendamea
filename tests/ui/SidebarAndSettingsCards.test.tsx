import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Sidebar } from '../../src/components/Sidebar';
import { CloudSyncCard } from '../../src/components/settings/data/CloudSyncCard';
import { ResetDataSection } from '../../src/components/settings/data/ResetDataSection';
import { DocsMcpSection } from '../../src/components/settings/docs/DocsMcpSection';
import { I18nProvider } from '../../src/i18n/I18nContext';
import type { Category, DetectedCloudProvider, OneDriveStatus } from '../../src/types';
import { VoiceVadController } from '../../src/voice/voiceVadController';

const CATS: Category[] = [
  {
    id: 'cat-1',
    name: 'Engineering',
    color: '#2563eb',
    pinned: true,
    sortOrder: 0,
    createdAt: '2026-11-01T10:00:00.000Z',
    deletedAt: null,
  },
];

describe('Sidebar, Data/Docs Settings Cards & VoiceVadController', () => {
  it('navigates smart views, searches tasks, and triggers Settings open in Sidebar', async () => {
    const user = userEvent.setup();
    const onSelectView = vi.fn();
    const onSearchChange = vi.fn();
    const onOpenSettings = vi.fn();
    const searchRef = React.createRef<HTMLInputElement>();

    render(
      <I18nProvider lang="en" onChangeLanguage={vi.fn()}>
        <Sidebar
          activeView={{ type: 'smart', id: 'all' }}
          onSelectView={onSelectView}
          categories={CATS}
          counts={{
            smart: { all: 4, today: 2, important: 1, completed: 3 },
            categories: { 'cat-1': 2 },
          }}
          dragLocked={false}
          isCollapsed={false}
          onToggleCollapse={vi.fn()}
          searchQuery=""
          onSearchChange={onSearchChange}
          searchInputRef={searchRef}
          onOpenSettings={onOpenSettings}
          onCreateCategory={vi.fn().mockResolvedValue(undefined)}
          onUpdateCategory={vi.fn().mockResolvedValue(undefined)}
          onTogglePinCategory={vi.fn().mockResolvedValue(undefined)}
          onDeleteCategory={vi.fn().mockResolvedValue(undefined)}
          onReorderCategories={vi.fn()}
          isOpenMobile={false}
          onCloseMobile={vi.fn()}
        />
      </I18nProvider>,
    );

    await user.click(screen.getByRole('button', { name: /Today/i }));
    expect(onSelectView).toHaveBeenCalledWith({ type: 'smart', id: 'today' });

    const engBtn = screen.getAllByRole('button', { name: /^Engineering$/i })[0];
    expect(engBtn).toBeDefined();
    if (engBtn) await user.click(engBtn);
    expect(onSelectView).toHaveBeenCalledWith({ type: 'category', id: 'cat-1' });

    await user.click(screen.getByRole('button', { name: /Settings/i }));
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });

  it('renders CloudSyncCard, ResetDataSection, and DocsMcpSection interactive controls', async () => {
    const user = userEvent.setup();
    const onConnectOrSync = vi.fn();
    const onToggleAutoSync = vi.fn();
    const onConfirmReset = vi.fn();
    const onChangeFormat = vi.fn();
    const onCopy = vi.fn();

    const status: OneDriveStatus = {
      available: true,
      connected: true,
      mode: 'folder',
      autoSync: true,
      folderPath: 'C:\\Cloud\\Agendamea',
      syncFilePath: 'C:\\Cloud\\Agendamea\\agendamea-backup.json',
      accountEmail: null,
      hasRemoteBackup: true,
      lastSyncedAt: '2026-11-23T10:00:00.000Z',
      remoteTodoCount: 5,
      remoteCategoryCount: 2,
      activeProvider: 'onedrive',
    };
    const providers: DetectedCloudProvider[] = [
      { id: 'onedrive', label: 'OneDrive', folderPath: 'C:\\Cloud', detected: true },
      { id: 'dropbox', label: 'Dropbox', folderPath: '', detected: false },
    ];

    render(
      <I18nProvider lang="en" onChangeLanguage={vi.fn()}>
        <CloudSyncCard
          oneDriveStatus={status}
          cloudProviders={providers}
          isOneDriveBusy={false}
          formatTimestamp={(v) => v ?? ''}
          onConnectOrSync={onConnectOrSync}
          onRestore={vi.fn()}
          onPickFolder={vi.fn()}
          onOpenFolder={vi.fn()}
          onSelectProvider={vi.fn()}
          onToggleAutoSync={onToggleAutoSync}
          onDisconnect={vi.fn()}
        />
        <ResetDataSection
          confirmResetOpen={true}
          resetIncludeSettings={false}
          isResettingData={false}
          isImporting={false}
          onOpenConfirm={vi.fn()}
          onCancelConfirm={vi.fn()}
          onToggleIncludeSettings={vi.fn()}
          onConfirmReset={onConfirmReset}
        />
        <DocsMcpSection
          hasDesktopBridge={true}
          copiedKey={null}
          mcpFormat="standard"
          runtimePort={3000}
          activeMcpJson='{"mcpServers":{"agendamea":{}}}'
          mcpClients={[
            {
              id: 'claude-desktop',
              name: 'Claude Desktop',
              configPath: 'C:\\cfg.json',
              rootKey: 'mcpServers',
              detected: true,
              configExists: true,
              configured: true,
              usesLegacyCmd: false,
              parseError: null,
              requiresRestart: false,
              command: 'ag.exe',
            },
          ]}
          mcpBusyId={null}
          mcpActionMsg="Connected"
          mcpProbing={false}
          mcpProbe={{ ok: true, latencyMs: 18, toolCount: 23 }}
          onRefreshClients={vi.fn()}
          onSelectFormat={onChangeFormat}
          onCopy={onCopy}
          onTestMcp={vi.fn()}
          onInstallMcpClient={vi.fn()}
          onUninstallMcpClient={vi.fn()}
        />
      </I18nProvider>,
    );

    await user.click(screen.getByRole('switch'));
    expect(onToggleAutoSync).toHaveBeenCalledTimes(1);

    await user.click(screen.getByTestId('reset-all-data-confirm-btn'));
    expect(onConfirmReset).toHaveBeenCalledTimes(1);

    await user.click(screen.getByTestId('docs-mcp-format-vscode'));
    expect(onChangeFormat).toHaveBeenCalledWith('vscode');

    await user.click(screen.getByTestId('docs-copy-mcp-btn'));
    expect(onCopy).toHaveBeenCalledWith('mcp-standard', '{"mcpServers":{"agendamea":{}}}');

    // MCP one-click client grid starts collapsed and expands on click
    expect(screen.queryByTestId('mcp-client-claude-desktop')).toBeNull();
    await user.click(screen.getByTestId('mcp-clients-accordion-toggle'));
    expect(screen.getByTestId('mcp-client-claude-desktop')).toBeInTheDocument();
  });

  it('tracks speech onset, trailing silence auto-stop, and speech ratio in VoiceVadController', () => {
    const vad = new VoiceVadController({
      sampleRate: 16000,
      autoStopMs: 800,
      adaptiveNoiseFloor: true,
      sensitivity: 'auto',
    });
    const silence = new Float32Array(1600);
    const speech = new Float32Array(1600).fill(0.25);

    expect(vad.pushFrame(silence, 0.05).action).toBe('continue');
    expect(vad.pushFrame(speech, 0.92).action).toBe('continue');
    expect(vad.pushFrame(speech, 0.95).hasSpoken).toBe(true);

    let last = vad.pushFrame(silence, 0.02);
    for (let i = 0; i < 10 && last.action === 'continue'; i += 1) {
      last = vad.pushFrame(silence, 0.02);
    }
    expect(last.action).toBe('auto_stop_silence');

    const merged = vad.getMergedPcm();
    expect(merged.length).toBeGreaterThan(0);
    expect(VoiceVadController.hasEnoughSpeech(speech).ok).toBe(true);
    expect(VoiceVadController.hasEnoughSpeech(silence).ok).toBe(false);
  });
});
