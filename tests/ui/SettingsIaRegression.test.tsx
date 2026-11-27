import fs from 'node:fs';
import path from 'node:path';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../src/api/client';
import { SettingsModal } from '../../src/components/SettingsModal';
import { AccessibilitySettingsTab } from '../../src/components/settings/AccessibilitySettingsTab';
import { AiVoiceSettingsTab } from '../../src/components/settings/AiVoiceSettingsTab';
import { DataBackupSettingsTab } from '../../src/components/settings/DataBackupSettingsTab';
import { GeneralSettingsTab } from '../../src/components/settings/GeneralSettingsTab';
import { NotificationsSettingsTab } from '../../src/components/settings/NotificationsSettingsTab';
import { SettingsTabHeader } from '../../src/components/settings/SettingsTabHeader';
import type { SettingsRuntimeActions } from '../../src/components/settings/SettingsTabOutlet';
import { ShortcutsSettingsTab } from '../../src/components/settings/ShortcutsSettingsTab';
import { SETTINGS_SEARCH_INDEX } from '../../src/components/settings/settingsSearchIndex';
import { TrashSettingsTab } from '../../src/components/settings/TrashSettingsTab';
import { ToggleSwitch } from '../../src/components/ToggleSwitch';
import { I18nProvider } from '../../src/i18n/I18nContext';
import { EN_DICTIONARY } from '../../src/i18n/translations';
import type { AiStatusPayload, NotificationChannelsMap } from '../../src/types';
import { DEFAULT_CUSTOM_SHORTCUTS } from '../../src/utils/shortcuts';

function createMockActions(): SettingsRuntimeActions {
  return {
    onSendTestNotification: vi.fn(),
    onNotifyVoice: vi.fn(),
    onNotifyCloudSync: vi.fn(),
    onCheckForUpdates: vi.fn().mockResolvedValue(undefined),
    onDownloadAndInstall: vi.fn().mockResolvedValue(undefined),
    onQuitAndInstallUpdate: vi.fn().mockResolvedValue(undefined),
    onClearAllCompleted: vi.fn().mockResolvedValue(undefined),
    onImportBackup: vi.fn().mockResolvedValue(undefined),
    onApplyRestoredBootstrap: vi.fn(),
    onResetAllData: vi.fn().mockResolvedValue(undefined),
    onRestoreTodo: vi.fn().mockResolvedValue(undefined),
    onPermanentDeleteTodo: vi.fn().mockResolvedValue(undefined),
    onRestoreCategory: vi.fn().mockResolvedValue(undefined),
    onPermanentDeleteCategory: vi.fn().mockResolvedValue(undefined),
    onEmptyTrash: vi.fn().mockResolvedValue(undefined),
    onToggleDragLock: vi.fn(),
  };
}

function createMockAiStatus(installedDiskBytes: number): AiStatusPayload {
  return {
    hardware: {
      cpuModel: 'Test CPU',
      cpuCores: 8,
      ramGb: 16,
      gpuName: 'Test GPU',
      vramGb: 8,
      dedicatedGpu: true,
      freeDiskGb: 100,
    },
    recommendation: {
      primaryOptionId: 'tier-medium',
      tiers: [
        {
          id: 'tier-light',
          label: 'Light',
          sttModelId: 'whisper-base',
          llmModelId: 'qwen3-0.6b',
          embedModelId: 'e5-small',
          minRamGb: 4,
          minVramGb: 0,
        },
      ],
      externalOllama: { detected: false, baseUrl: 'http://127.0.0.1:11434', models: [] },
      externalLmStudio: { detected: false, baseUrl: 'http://127.0.0.1:1234', models: [] },
    },
    settings: {
      aiTier: 'tier-light',
      aiUseExternalOllama: false,
      aiOllamaModel: '',
      aiExternalBaseUrl: '',
      aiSttModelId: 'whisper-base',
      aiLlmModelId: 'qwen3-0.6b',
      aiEmbedModelId: 'e5-small',
      voiceAutoStopMs: 2500,
      voiceTtsEnabled: true,
      voiceTtsVoice: '',
      voiceTtsStyle: 'natural',
      voiceChimePreset: 'soft',
      voiceMicDeviceId: '',
      voiceNoiseSuppression: true,
      voiceSensitivity: 'auto',
      voiceDictationLanguage: 'auto',
    },
    models: [
      {
        id: 'whisper-base',
        role: 'stt',
        tier: 'tier-light',
        label: 'Whisper Base',
        license: 'MIT',
        expectedBytes: 147_000_000,
        present: installedDiskBytes > 0,
        verified: installedDiskBytes > 0,
        downloading: false,
        fitsHardware: true,
        warningCode: null,
      },
    ],
    installedDiskBytes,
    ragChunkCount: 12,
  } as unknown as AiStatusPayload;
}

const DEFAULT_CHANNELS: NotificationChannelsMap = {
  taskUpcoming: 'both',
  taskDue: 'both',
  taskCompleted: 'inApp',
  voiceAssistant: 'inApp',
  cloudSync: 'inApp',
  appUpdates: 'inApp',
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Settings IA v2 Regression Suite (T-1.1 .. T-7.3)', () => {
  it('T-1.1: ToggleSwitch handles ARIA switch semantics, disabled guard, RTL mirror, and high-contrast CSS', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    const { rerender } = render(
      <div dir="rtl">
        <ToggleSwitch checked={false} onChange={onChange} label="Test Switch" testId="sw-1" />
      </div>,
    );

    const sw = screen.getByTestId('sw-1');
    expect(sw).toHaveAttribute('role', 'switch');
    expect(sw).toHaveAttribute('aria-checked', 'false');
    expect(sw.querySelector('span')?.className).toContain('rtl:-translate-x-0.5');

    await user.click(sw);
    expect(onChange).toHaveBeenCalledWith(true);

    rerender(
      <div dir="rtl">
        <ToggleSwitch
          checked={true}
          disabled
          onChange={onChange}
          label="Test Switch"
          testId="sw-1"
        />
      </div>,
    );
    const updatedSw = screen.getByTestId('sw-1');
    expect(updatedSw).toHaveAttribute('aria-checked', 'true');
    expect(updatedSw.querySelector('span')?.className).toContain('rtl:-translate-x-4.5');
    await user.click(updatedSw);
    expect(onChange).toHaveBeenCalledTimes(1);

    const css = fs.readFileSync(path.resolve(process.cwd(), 'src/index.css'), 'utf8');
    expect(css).toContain('html.high-contrast [role="switch"]');
  });

  it('T-1.2: SettingsTabHeader renders subtitle, extra actions, and triggers reset callback', async () => {
    const user = userEvent.setup();
    const onReset = vi.fn();

    render(
      <I18nProvider lang="en" onChangeLanguage={vi.fn()}>
        <SettingsTabHeader
          subtitle="Clear tab subtitle"
          onReset={onReset}
          resetTestId="hdr-reset"
          actions={<button type="button">Extra Action</button>}
        />
      </I18nProvider>,
    );

    expect(screen.getByText('Clear tab subtitle')).toBeInTheDocument();
    expect(screen.getByText('Extra Action')).toBeInTheDocument();
    await user.click(screen.getByTestId('hdr-reset'));
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it('T-2.1a/b/c: renders exactly 11 tabs, zero nested tablists across all 11 tabs, keyboard navigation, alias routing & live initialTab re-sync', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'getAiStatus').mockResolvedValue(createMockAiStatus(147_000_000));
    vi.spyOn(api, 'getPiperVoices').mockResolvedValue({ voices: [] });
    vi.spyOn(api, 'getWebhookLogs').mockResolvedValue([]);
    vi.spyOn(api, 'getWebhookOutbox').mockResolvedValue([]);
    vi.spyOn(api, 'getSystemInfo').mockResolvedValue({
      runtimePort: 38721,
      schemaVersion: 5,
      dbSizeBytes: 1024,
      modelsDiskBytes: 0,
      aiTier: 'tier-light',
      crashReportCount: 0,
      activeTodos: 0,
      completedTodos: 0,
      trashedTodos: 0,
      appVersion: '1.1.0',
    } as never);
    vi.spyOn(api, 'getOneDriveStatus').mockResolvedValue(null as never);
    vi.spyOn(api, 'listCloudBackups').mockResolvedValue({ backups: [] } as never);

    const { rerender } = render(
      <I18nProvider lang="en" onChangeLanguage={vi.fn()}>
        <SettingsModal onClose={vi.fn()} initialTab="appearance" actions={createMockActions()} />
      </I18nProvider>,
    );

    const tablist = screen.getByRole('tablist');
    const tabs = within(tablist).getAllByRole('tab');
    expect(tabs).toHaveLength(11);
    expect(screen.getByTestId('settings-tab-guide')).toBeInTheDocument();
    expect(screen.queryByTestId('settings-tab-webhooks')).not.toBeInTheDocument();
    expect(screen.queryByTestId('settings-tab-legal')).not.toBeInTheDocument();

    // Visit every single one of the 10 tabs and verify strictly ONE tablist everywhere (zero nested tablists!)
    for (const tab of tabs) {
      await user.click(tab);
      expect(screen.getAllByRole('tablist')).toHaveLength(1);
    }

    // WAI-ARIA keyboard navigation (Home / ArrowDown / End)
    const firstTab = tabs[0]!;
    await user.click(firstTab);
    await user.keyboard('{ArrowDown}');
    expect(tabs[1]).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{End}');
    expect(tabs[tabs.length - 1]).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{Home}');
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');

    // T-2.1c: Live rerender alias sync while modal is already open
    rerender(
      <I18nProvider lang="en" onChangeLanguage={vi.fn()}>
        <SettingsModal onClose={vi.fn()} initialTab="webhooks" actions={createMockActions()} />
      </I18nProvider>,
    );
    expect(screen.getByTestId('settings-tab-docs')).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByTestId('docs-subtab-webhooks')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByTestId('docs-webhook-section')).toBeInTheDocument();

    rerender(
      <I18nProvider lang="en" onChangeLanguage={vi.fn()}>
        <SettingsModal onClose={vi.fn()} initialTab="legal" actions={createMockActions()} />
      </I18nProvider>,
    );
    expect(screen.getByTestId('settings-tab-about')).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByTestId('about-legal-section')).toBeInTheDocument();
  });

  it('T-2.3: 73-language deep search matches localized German descriptions and resolves 100% of search entries to real DOM targets', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'getAiStatus').mockResolvedValue(createMockAiStatus(147_000_000));
    vi.spyOn(api, 'getPiperVoices').mockResolvedValue({ voices: [] });
    vi.spyOn(api, 'getWebhookLogs').mockResolvedValue([]);
    vi.spyOn(api, 'getWebhookOutbox').mockResolvedValue([]);
    vi.spyOn(api, 'getSystemInfo').mockResolvedValue({
      runtimePort: 38721,
      schemaVersion: 5,
      dbSizeBytes: 1024,
      modelsDiskBytes: 0,
      aiTier: 'tier-light',
      crashReportCount: 0,
      activeTodos: 0,
      completedTodos: 0,
      trashedTodos: 0,
      appVersion: '1.1.0',
    } as never);
    vi.spyOn(api, 'getOneDriveStatus').mockResolvedValue(null as never);
    vi.spyOn(api, 'listCloudBackups').mockResolvedValue({ backups: [] } as never);

    // 1. German description search (verifies descKeys across non-EN/TR locales) + Ctrl+F focus
    const { unmount } = render(
      <I18nProvider lang="de" onChangeLanguage={vi.fn()}>
        <SettingsModal onClose={vi.fn()} initialTab="appearance" actions={createMockActions()} />
      </I18nProvider>,
    );
    await user.keyboard('{Control>}f{/Control}');
    const deInput = screen.getByTestId('settings-deep-search-input');
    expect(deInput).toHaveFocus();
    fireEvent.change(deInput, { target: { value: 'Datenschutzerklärung' } });
    expect(await screen.findByTestId('settings-search-hit-about-legal')).toBeInTheDocument();
    unmount();

    // 2. Verify EVERY entry in SETTINGS_SEARCH_INDEX (excluding Electron-only desktop cards in JSDOM web mode) resolves to a real DOM element
    const desktopOnlyIds = new Set(['general-desktop', 'shortcuts-global']);
    const { container } = render(
      <I18nProvider lang="en" onChangeLanguage={vi.fn()}>
        <SettingsModal onClose={vi.fn()} initialTab="appearance" actions={createMockActions()} />
      </I18nProvider>,
    );

    for (const entry of SETTINGS_SEARCH_INDEX) {
      if (desktopOnlyIds.has(entry.settingId)) continue;
      await user.keyboard('{Control>}f{/Control}');
      const searchInput = screen.getByTestId('settings-deep-search-input');
      const labelText = String(EN_DICTIONARY[entry.labelKey]);
      fireEvent.change(searchInput, { target: { value: labelText } });
      const hit = screen.getByTestId(`settings-search-hit-${entry.id}`);
      await user.click(hit);
      await waitFor(() => {
        const targetEl = container.querySelector(`[data-setting-id="${entry.settingId}"]`);
        expect(
          targetEl,
          `Missing DOM target [data-setting-id="${entry.settingId}"]`,
        ).not.toBeNull();
      });
    }

    // Verify general-language search auto-expanded the collapsible language picker
    await user.keyboard('{Control>}f{/Control}');
    const searchInput = screen.getByTestId('settings-deep-search-input');
    fireEvent.change(searchInput, { target: { value: 'Application Language' } });
    await user.click(screen.getByTestId('settings-search-hit-general-language'));
    await waitFor(() => {
      expect(screen.getByRole('listbox')).toBeInTheDocument();
    });
  }, 15000);

  it('T-3.1: Accessibility tab renders Power Pilot card with zoom, font scale, 4 primary switches, and Colorblind toggle under Advanced', async () => {
    const user = userEvent.setup();
    const onChangeFontScale = vi.fn();
    const onToggleReadableSpacing = vi.fn();
    render(
      <I18nProvider lang="en" onChangeLanguage={vi.fn()}>
        <AccessibilitySettingsTab
          zoomPercent={100}
          fontScale="normal"
          highContrast={false}
          reducedMotion={false}
          readableSpacing={false}
          colorBlindShapes={false}
          strongFocusRing={false}
          onChangeZoomPercent={vi.fn()}
          onChangeFontScale={onChangeFontScale}
          onToggleHighContrast={vi.fn()}
          onToggleReducedMotion={vi.fn()}
          onToggleReadableSpacing={onToggleReadableSpacing}
          onToggleColorBlindShapes={vi.fn()}
          onToggleStrongFocusRing={vi.fn()}
          onResetAccessibility={vi.fn()}
        />
      </I18nProvider>,
    );

    expect(screen.queryByText(EN_DICTIONARY.settingsSubtitle)).not.toBeInTheDocument();
    expect(screen.getByText(EN_DICTIONARY.accessibilitySectionSubtitle)).toBeInTheDocument();
    expect(screen.getByTestId('a11y-font-scale-select')).toBeInTheDocument();
    expect(screen.getAllByRole('switch')).toHaveLength(4);

    await user.selectOptions(screen.getByTestId('a11y-font-scale-select'), 'large');
    expect(onChangeFontScale).toHaveBeenCalledWith('large');

    await user.click(screen.getByTestId('a11y-toggle-readable-spacing'));
    expect(onToggleReadableSpacing).toHaveBeenCalledWith(true);

    // Colorblind shapes sits behind Advanced toggle by default
    expect(screen.queryByTestId('a11y-toggle-colorblind-shapes')).not.toBeInTheDocument();
    await user.click(screen.getByTestId('a11y-advanced-toggle'));
    expect(screen.getByTestId('a11y-toggle-colorblind-shapes')).toBeInTheDocument();
    expect(screen.getAllByRole('switch')).toHaveLength(5);
  });

  it('T-4.1: General tab collapses 73 languages by default, closes on Escape without closing modal, removes trash purge, and keeps safety/drag lock in Advanced', async () => {
    const user = userEvent.setup();
    const onEscapeWindow = vi.fn();
    window.addEventListener('keydown', onEscapeWindow);

    try {
      render(
        <I18nProvider lang="en" onChangeLanguage={vi.fn()}>
          <GeneralSettingsTab
            closeBehavior="ask"
            launchAtStartup={false}
            launchMinimizedToTray={true}
            weekStartsOn="monday"
            timeFormat="24h"
            defaultStartupView="all"
            defaultLayoutMode="list"
            defaultPriority="normal"
            completedTaskBehavior="bottom"
            completionSound="pop"
            confirmBeforeDelete={false}
            dragLocked={false}
            onChangeCloseBehavior={vi.fn()}
            onToggleLaunchAtStartup={vi.fn()}
            onToggleLaunchMinimizedToTray={vi.fn()}
            onChangeWeekStartsOn={vi.fn()}
            onChangeTimeFormat={vi.fn()}
            onChangeDefaultStartupView={vi.fn()}
            onChangeDefaultLayoutMode={vi.fn()}
            onChangeDefaultPriority={vi.fn()}
            onChangeCompletedTaskBehavior={vi.fn()}
            onChangeCompletionSound={vi.fn()}
            onToggleConfirmBeforeDelete={vi.fn()}
            onToggleDragLock={vi.fn()}
            onResetGeneral={vi.fn()}
          />
        </I18nProvider>,
      );

      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      expect(screen.queryByTestId('general-trash-purge-select')).not.toBeInTheDocument();
      expect(screen.queryByTestId('general-drag-lock-toggle')).not.toBeInTheDocument();

      await user.click(screen.getByTestId('general-advanced-toggle'));
      expect(screen.getByTestId('general-drag-lock-toggle')).toHaveAttribute('role', 'switch');

      await user.click(screen.getByTestId('general-language-toggle-btn'));
      expect(screen.getByRole('listbox')).toBeInTheDocument();

      const langSearch = screen.getByTestId('general-language-search-input');
      await user.type(langSearch, 'deutsch');
      expect(screen.getByRole('option', { name: /Deutsch/i })).toBeInTheDocument();

      await user.keyboard('{Escape}');
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    } finally {
      window.removeEventListener('keydown', onEscapeWindow);
    }
  });

  it('T-4.2: Trash tab reveals retention & cleanup card inside Advanced even when Trash is empty, and avoids nested tablists', async () => {
    const user = userEvent.setup();
    const onChangePurge = vi.fn();
    const onClearCompleted = vi.fn().mockResolvedValue(undefined);

    render(
      <I18nProvider lang="en" onChangeLanguage={vi.fn()}>
        <TrashSettingsTab
          trashedCategories={[]}
          trashedTodos={[]}
          completedTodoCount={3}
          trashAutoPurgeDays={7}
          onChangeTrashAutoPurgeDays={onChangePurge}
          onClearAllCompleted={onClearCompleted}
          onRestoreTodo={vi.fn().mockResolvedValue(undefined)}
          onPermanentDeleteTodo={vi.fn().mockResolvedValue(undefined)}
          onRestoreCategory={vi.fn().mockResolvedValue(undefined)}
          onPermanentDeleteCategory={vi.fn().mockResolvedValue(undefined)}
          onEmptyTrash={vi.fn().mockResolvedValue(undefined)}
          formatTimestamp={() => 'Now'}
        />
      </I18nProvider>,
    );

    expect(screen.queryByTestId('trash-retention-card')).not.toBeInTheDocument();
    await user.click(screen.getByTestId('trash-advanced-toggle'));
    expect(screen.getByTestId('trash-retention-card')).toBeInTheDocument();
    await user.selectOptions(screen.getByTestId('general-trash-purge-select'), '30');
    expect(onChangePurge).toHaveBeenCalledWith(30);
    await user.click(screen.getByTestId('trash-move-completed-btn'));
    expect(onClearCompleted).toHaveBeenCalledTimes(1);
    expect(screen.queryAllByRole('tablist')).toHaveLength(0);
  });

  it('T-5.1 & T-5.2: Shortcuts uses System-Wide header and Notifications splits everyday controls from Advanced quiet hours/channels', async () => {
    const user = userEvent.setup();
    const prevBridge = window.agendameaWindow;
    window.agendameaWindow = {
      setGlobalQuickAddShortcut: vi.fn(),
    } as never;

    try {
      const { unmount } = render(
        <I18nProvider lang="en" onChangeLanguage={vi.fn()}>
          <ShortcutsSettingsTab
            globalQuickAddShortcut={true}
            globalQuickAddShortcutKey="Ctrl+Alt+N"
            quickAddRegistered={true}
            voiceShortcutEnabled={true}
            voiceShortcut="Ctrl+Alt+Space"
            voiceRegistered={true}
            customShortcuts={DEFAULT_CUSTOM_SHORTCUTS}
            onToggleGlobalQuickAddShortcut={vi.fn()}
            onChangeGlobalQuickAddShortcutKey={vi.fn()}
            onToggleVoiceShortcutEnabled={vi.fn()}
            onVoiceShortcutChange={vi.fn()}
            onChangeCustomShortcut={vi.fn()}
            onRefreshOsStatus={vi.fn().mockResolvedValue(undefined)}
            onResetAllShortcuts={vi.fn()}
          />
        </I18nProvider>,
      );

      expect(screen.getByText(EN_DICTIONARY.shortcutsGlobalSectionTitle)).toBeInTheDocument();
      expect(screen.getAllByRole('switch')).toHaveLength(2);
      unmount();

      const { container } = render(
        <I18nProvider lang="en" onChangeLanguage={vi.fn()}>
          <NotificationsSettingsTab
            profile="balanced"
            leadMinutes={15}
            channels={DEFAULT_CHANNELS}
            quietHoursEnabled={false}
            quietHoursStart="22:00"
            quietHoursEnd="07:00"
            notificationSoundEnabled={true}
            dailyDigestEnabled={false}
            dailyDigestTime="09:00"
            onApplyProfile={vi.fn()}
            onChangeChannel={vi.fn()}
            onChangeLeadMinutes={vi.fn()}
            onToggleQuietHours={vi.fn()}
            onChangeQuietHoursStart={vi.fn()}
            onChangeQuietHoursEnd={vi.fn()}
            onToggleNotificationSound={vi.fn()}
            onToggleDailyDigest={vi.fn()}
            onChangeDailyDigestTime={vi.fn()}
            onResetNotifications={vi.fn()}
            onSendTest={vi.fn()}
          />
        </I18nProvider>,
      );

      const balancedSvg = screen
        .getByTestId('notification-profile-balanced')
        .querySelector('svg')?.innerHTML;
      const silentSvg = screen
        .getByTestId('notification-profile-silent_inapp')
        .querySelector('svg')?.innerHTML;
      expect(balancedSvg).not.toEqual(silentSvg);
      expect(container.querySelector('[data-setting-id="notif-lead-time"]')).not.toBeNull();
      expect(screen.getAllByRole('switch')).toHaveLength(1);
      expect(container.querySelector('[data-setting-id="notif-channels"]')).toBeNull();

      await user.click(screen.getByTestId('notif-advanced-toggle'));
      expect(container.querySelector('[data-setting-id="notif-channels"]')).not.toBeNull();
      expect(screen.getAllByRole('switch')).toHaveLength(3);
    } finally {
      window.agendameaWindow = prevBridge;
    }
  });

  it('T-6.1a & T-6.1b: AI tab separates Voice vs Engine, shows Cold-Start banner when zero models installed, and switches on 1 click', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'getAiStatus').mockResolvedValue(createMockAiStatus(0));
    vi.spyOn(api, 'getPiperVoices').mockResolvedValue({
      voices: [
        {
          id: 'piper-en-amy',
          name: 'Amy',
          language: 'en-US',
          gender: 'female',
          license: 'MIT',
          expectedBytes: 60_000_000,
          installed: false,
          downloading: false,
        },
      ],
    } as never);

    render(
      <I18nProvider lang="en" onChangeLanguage={vi.fn()}>
        <AiVoiceSettingsTab />
      </I18nProvider>,
    );

    // Cold-start banner appears when zero models and zero external servers are ready
    const coldBanner = await screen.findByTestId('ai-cold-start-banner');
    expect(coldBanner).toBeInTheDocument();

    // Piper accordion is collapsed by default
    expect(screen.queryByTestId('piper-voice-row-piper-en-amy')).not.toBeInTheDocument();
    // Model catalog is hidden behind Engine view
    expect(screen.queryByTestId('ai-model-row-whisper-base')).not.toBeInTheDocument();

    // Clicking cold-start CTA switches directly to Engine & Models
    await user.click(screen.getByTestId('ai-cold-start-setup-btn'));
    expect(screen.getByTestId('ai-model-row-whisper-base')).toBeInTheDocument();
    expect(screen.queryAllByRole('tablist')).toHaveLength(0);
  });

  it('T-7.1: Data Backup tab renders primary backup/cloud cards and tucks Danger Zone & extra export formats under Advanced', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'getSystemInfo').mockResolvedValue({
      runtimePort: 38721,
      schemaVersion: 5,
      dbSizeBytes: 2048,
      modelsDiskBytes: 500_000_000,
      aiTier: 'tier-light',
      crashReportCount: 0,
      activeTodos: 2,
      completedTodos: 1,
      trashedTodos: 0,
      appVersion: '1.1.0',
    } as never);
    vi.spyOn(api, 'listCloudBackups').mockResolvedValue({ backups: [] } as never);

    const { container } = render(
      <I18nProvider lang="en" onChangeLanguage={vi.fn()}>
        <DataBackupSettingsTab
          totalTodoCount={3}
          oneDriveStatus={null}
          onOneDriveStatusChange={vi.fn()}
          isImporting={false}
          onImportingChange={vi.fn()}
          pendingImport={null}
          onPendingImportChange={vi.fn()}
          onImportBackup={vi.fn().mockResolvedValue(undefined)}
          onResetAllData={vi.fn().mockResolvedValue(undefined)}
          formatTimestamp={() => 'Now'}
        />
      </I18nProvider>,
    );

    expect(container.querySelector('section[data-setting-id="data-export-import"]')).not.toBeNull();
    expect(container.querySelector('section[data-setting-id="data-cloud"]')).not.toBeNull();
    expect(screen.queryByTestId('data-danger-zone-card')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('data-advanced-toggle'));
    expect(screen.getByTestId('data-danger-zone-card')).toBeInTheDocument();
    expect(screen.queryByText(EN_DICTIONARY.moveCompletedToTrashTitle)).not.toBeInTheDocument();
  });

  it('T-7.3: About tab uses Power Pilot layout, collapses System Health by default, keeps Data+Logs folders, opens single-card Legal doc with Back button', async () => {
    const user = userEvent.setup();
    const prevBridge = window.agendameaWindow;
    window.agendameaWindow = {
      getDiagnostics: vi.fn().mockResolvedValue({ distributionChannel: 'setup' }),
      openDataFolder: vi.fn(),
      openLogsFolder: vi.fn(),
    } as never;
    vi.spyOn(api, 'getSystemInfo').mockResolvedValue({
      runtimePort: 38721,
      schemaVersion: 5,
      dbSizeBytes: 2048,
      modelsDiskBytes: 0,
      aiTier: 'tier-light',
      crashReportCount: 0,
      activeTodos: 0,
      completedTodos: 0,
      trashedTodos: 0,
      categoriesCount: 2,
      appVersion: '1.1.0',
    } as never);
    vi.spyOn(api, 'getOneDriveStatus').mockResolvedValue(null as never);

    try {
      render(
        <I18nProvider lang="en" onChangeLanguage={vi.fn()}>
          <SettingsModal onClose={vi.fn()} initialTab="about" actions={createMockActions()} />
        </I18nProvider>,
      );

      // Power Pilot website CTA present
      expect(screen.getByTestId('about-website-link')).toBeInTheDocument();

      // System Health collapsed by default; expands on click
      expect(screen.queryByTestId('about-workspace-counters')).not.toBeInTheDocument();
      await user.click(screen.getByTestId('about-health-toggle'));
      expect(screen.getByTestId('about-workspace-counters')).toBeInTheDocument();

      // Both Data and Logs folder buttons preserved
      expect(screen.getByTestId('about-open-data-folder-btn')).toBeInTheDocument();
      expect(screen.getByTestId('about-open-logs-folder-btn')).toBeInTheDocument();

      // Dedicated User Guide tab works cleanly under System & About
      await user.click(screen.getByTestId('settings-tab-guide'));
      expect(screen.getByTestId('user-guide-search-input')).toBeInTheDocument();
      await user.click(screen.getByTestId('settings-tab-about'));

      // Legal document opens in single card with visible top Back button and returns directly to About tab
      await user.click(screen.getByTestId('legal-doc-row-privacy'));
      expect(screen.getByTestId('legal-document-card')).toBeInTheDocument();
      await user.click(screen.getByTestId('legal-doc-back-btn'));
      expect(screen.getByTestId('settings-tab-about')).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByTestId('about-legal-section')).toBeInTheDocument();
    } finally {
      window.agendameaWindow = prevBridge;
    }
  });
});
