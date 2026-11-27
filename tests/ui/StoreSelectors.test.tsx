import { act, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  createSelectorStore,
  type SelectorStore,
  shallowEqual,
  useSelectorStore,
} from '../../src/store/createSelectorStore';
import { createNotificationStore } from '../../src/store/notificationStore';
import { createPreferencesStore } from '../../src/store/preferencesStore';
import { createShortcutStore } from '../../src/store/shortcutStore';
import { reportStoreError, setStoreErrorReporter } from '../../src/store/storeErrorBus';
import { createUpdaterStore } from '../../src/store/updaterStore';
import { createWebhookStore } from '../../src/store/webhookStore';
import { createWorkspaceSnapshotStore } from '../../src/store/workspaceSnapshotStore';
import { createWorkspaceUiStore } from '../../src/store/workspaceUiStore';
import type { AppSettings } from '../../src/types';
import { DEFAULT_NOTIFICATION_CHANNELS } from '../../src/utils/notifications';

const BASE_SETTINGS: AppSettings = {
  themeMode: 'dark',
  themeId: 'obsidian',
  themeCustomized: true,
  customThemeColor: '#2563eb',
  appIconId: 'match-theme',
  customIconColor: '#2563eb',
  language: 'en',
  sidebarCollapsed: false,
  dragLocked: false,
  onedriveAutoSync: false,
  onedriveCustomPath: '',
  webhookEnabled: false,
  webhookUrl: '',
  webhookSecret: '',
  webhookFormat: 'auto',
  webhookEvents: '',
  webhookAllowLocalNetwork: true,
  webhookEndpointOverrides: {},
  webhookIncomingEnabled: false,
  webhookIncomingSecret: '',
  onboardingCompleted: true,
  closeBehavior: 'ask',
  launchAtStartup: false,
  globalQuickAddShortcut: true,
  globalQuickAddShortcutKey: 'CommandOrControl+Alt+N',
  autoUpdateCheck: true,
  zoomPercent: 100,
  highContrast: false,
  reducedMotion: false,
  customShortcuts: {},
  notificationProfile: 'balanced',
  notificationLeadMinutes: 15,
  notificationChannels: { ...DEFAULT_NOTIFICATION_CHANNELS },
};

interface DemoState {
  alpha: number;
  beta: string;
}

function AlphaReader({
  store,
  renderCount,
}: {
  store: SelectorStore<DemoState>;
  renderCount: { alpha: number; beta: number };
}) {
  renderCount.alpha += 1;
  const alpha = useSelectorStore(store, (s) => s.alpha);
  return <span data-testid="alpha">{alpha}</span>;
}

function BetaReader({
  store,
  renderCount,
}: {
  store: SelectorStore<DemoState>;
  renderCount: { alpha: number; beta: number };
}) {
  renderCount.beta += 1;
  const view = useSelectorStore(store, (s) => ({ beta: s.beta }), shallowEqual);
  const seenRef = useRef(0);
  seenRef.current += 1;
  return <span data-testid="beta">{view.beta}</span>;
}

describe('Selector Store Isolation (React 19 useSyncExternalStore)', () => {
  it('prevents re-renders when unrelated store keys change', () => {
    const store = createSelectorStore<DemoState>({ alpha: 1, beta: 'initial' });
    const renderCount = { alpha: 0, beta: 0 };

    render(
      <>
        <AlphaReader store={store} renderCount={renderCount} />
        <BetaReader store={store} renderCount={renderCount} />
      </>,
    );

    expect(renderCount.alpha).toBe(1);
    expect(renderCount.beta).toBe(1);

    act(() => {
      store.patchState({ alpha: 2 });
    });

    expect(screen.getByTestId('alpha')).toHaveTextContent('2');
    expect(renderCount.alpha).toBe(2);
    expect(renderCount.beta).toBe(1);
  });

  it('persists webhook patches with monotonic last-write-wins sequence protection', async () => {
    let resolveFirst!: (val: Record<string, unknown>) => void;
    const persist = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((r) => {
            resolveFirst = r;
          }),
      )
      .mockResolvedValueOnce({
        webhookEnabled: true,
        webhookUrl: 'https://second.example.com/hook',
        webhookSecret: 'sec2',
      });

    const wStore = createWebhookStore(persist as never, vi.fn());
    const p1 = wStore.save({
      webhookEnabled: true,
      webhookUrl: 'https://first.example.com/hook',
      webhookSecret: 'sec1',
    });
    const p2 = wStore.save({
      webhookEnabled: true,
      webhookUrl: 'https://second.example.com/hook',
      webhookSecret: 'sec2',
    });

    await p2;
    resolveFirst({
      webhookEnabled: true,
      webhookUrl: 'https://first.example.com/hook',
      webhookSecret: 'sec1',
    });
    await p1;

    expect(wStore.getState().webhookUrl).toBe('https://second.example.com/hook');
  });

  it('manages workspace UI, snapshot, error bus, notification, updater, shortcut, and preferences stores', async () => {
    // 1. storeErrorBus
    const reported: unknown[] = [];
    setStoreErrorReporter((err) => reported.push(err));
    reportStoreError(new Error('disk full'), 'fallback');
    expect(reported).toHaveLength(1);
    setStoreErrorReporter(null);

    // 2. workspaceUiStore
    const ui = createWorkspaceUiStore();
    ui.setActiveView({ type: 'smart', id: 'today' });
    ui.setActiveView((prev) => prev);
    ui.setLayoutMode('kanban');
    ui.setStatusFilter('active');
    ui.setTagFilter('urgent');
    ui.setTagFilter((prev) => prev);
    ui.setSortBy('priority');
    ui.setSortBy((prev) => prev);
    ui.setSearchQuery('deploy');
    ui.setSearchDateFrom('2026-11-01');
    ui.setSearchDateTo('2026-11-30');
    ui.setIsDateFilterOpen(true);
    ui.setIsDateFilterOpen((prev) => !prev);
    ui.setSelectedTodoId('todo-1');
    ui.setSelectedTodoId((prev) => prev);
    ui.openSettings('webhooks');
    expect(ui.getState().isSettingsOpen).toBe(true);
    expect(ui.getState().selectedTodoId).toBeNull();
    ui.closeSettings();
    expect(ui.getState().isSettingsOpen).toBe(false);
    ui.setIsSettingsOpen(true);
    ui.setSettingsInitialTab('ai');
    ui.setIsWelcomeOpen(true);
    ui.setIsCloseModalOpen(true);
    ui.setIsMobileSidebarOpen(true);
    ui.setTodoContextMenu(null);
    ui.setDayContextMenu({ x: 10, y: 20, dateStr: '2026-11-23' });
    ui.dismissModals();
    expect(ui.getState().isWelcomeOpen).toBe(false);
    expect(ui.getState().isCloseModalOpen).toBe(false);
    ui.selectView({ type: 'smart', id: 'important' });
    ui.clearSearchAndFilters();
    ui.resetNavigationForRestore();
    expect(ui.getState().activeView).toEqual({ type: 'smart', id: 'all' });

    // 3. workspaceSnapshotStore
    const snap = createWorkspaceSnapshotStore();
    snap.syncCounts(12, 4);
    snap.syncTrash([], []);
    expect(snap.getState().totalTodoCount).toBe(12);
    expect(snap.getState().completedTodoCount).toBe(4);

    // 4. notificationStore
    const persist = vi.fn().mockResolvedValue(BASE_SETTINGS);
    const notif = createNotificationStore(persist);
    notif.hydrate(BASE_SETTINGS);
    notif.applyProfile('silent_inapp');
    expect(notif.getState().profile).toBe('silent_inapp');
    notif.updateChannel('taskUpcoming', 'inApp');
    notif.updateLeadMinutes(30);
    expect(notif.getState().leadMinutes).toBe(30);
    expect(persist).toHaveBeenCalled();

    // 5. updaterStore
    const onErr = vi.fn();
    const updater = createUpdaterStore(persist, onErr);
    updater.hydrateAutoUpdateCheck(false);
    expect(updater.getState().autoUpdateCheck).toBe(false);
    updater.toggleAutoUpdateCheck(true);
    updater.setUpdateState({
      status: 'checking',
      result: null,
      downloadPercent: null,
      errorMessage: null,
    });
    updater.setUpdateState((prev) => prev);
    expect(updater.getState().updateState.status).toBe('checking');

    // 6. shortcutStore
    const shortcuts = createShortcutStore(persist, onErr);
    shortcuts.hydrate(BASE_SETTINGS, { fallbackDefaults: true, syncElectron: true });
    shortcuts.setGlobalQuickAddEnabled(false);
    shortcuts.setGlobalQuickAddKey('CommandOrControl+Shift+A');
    shortcuts.setVoiceShortcut('CommandOrControl+Shift+V');
    shortcuts.setCustomShortcut('newTask', 'Ctrl+K');
    expect(shortcuts.getState().voiceShortcut).toBe('CommandOrControl+Shift+V');
    shortcuts.resetAll();
    expect(shortcuts.getState().voiceShortcut).toBe('CommandOrControl+Alt+D');

    // 7. preferencesStore
    const prefs = createPreferencesStore(persist, onErr);
    prefs.setThemeMode('dark');
    prefs.setThemeId('emerald');
    prefs.setCustomThemeColor('#ff5500');
    prefs.setAppIconId('custom');
    prefs.setCustomIconColor('#00aa88');
    expect(prefs.consumeIconDirty()).toBe(true);
    expect(prefs.consumeIconDirty()).toBe(false);
    prefs.setZoomPercent(110);
    prefs.setFontScale('large');
    prefs.setReadableSpacing(true);
    prefs.setHighContrast(true);
    prefs.setReducedMotion(true);
    expect(prefs.getState().fontScale).toBe('large');
    expect(prefs.getState().readableSpacing).toBe(true);
    await prefs.setCloseBehavior('tray');
    await prefs.setCloseBehavior('quit', { persist: false });
    prefs.setLaunchAtStartup(true);
    prefs.setDragLocked(true);
    prefs.setLanguage('tr');
    prefs.toggleSidebarCollapsed();
    expect(prefs.getState().sidebarCollapsed).toBe(true);
    expect(prefs.expandSidebarIfCollapsed()).toBe(true);
    expect(prefs.expandSidebarIfCollapsed()).toBe(false);
    await prefs.syncFromBootstrap(BASE_SETTINGS, { fromExternalSse: true });
    await prefs.syncFromBootstrap(BASE_SETTINGS, { fromExternalSse: false });
    prefs.applyRestored(BASE_SETTINGS);
    expect(prefs.getState().themeMode).toBe('dark');
    prefs.disposeTimers();
    prefs.reset();
  });
});
