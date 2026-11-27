import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import { useI18n } from '../i18n/I18nContext';

interface NativeWindowBridge {
  isWindowsStore?: boolean;
  minimize?: () => Promise<void> | undefined;
  toggleMaximize?: () => Promise<boolean | undefined> | undefined;
  close?: () => Promise<void> | undefined;
  isMaximized?: () => Promise<boolean> | boolean;
  onMaximizedChange?: (cb: (isMaximized: boolean) => void) => (() => void) | undefined;
  onCloseRequested?: (cb: () => void) => (() => void) | undefined;
  onWindowMinimizedOrHidden?: (cb: () => void) => (() => void) | undefined;
  onVoiceActivity?: (cb: () => void) => (() => void) | undefined;
  onFocusQuickAdd?: (cb: () => void) => (() => void) | undefined;
  onNavigateSmartView?: (
    cb: (viewId: import('../types').SmartView) => void,
  ) => (() => void) | undefined;
  setCloseBehavior?: (
    behavior: import('../types').CloseBehavior,
  ) => Promise<{ ok: boolean; closeBehavior?: import('../types').CloseBehavior }>;
  performCloseAction?: (
    action: 'tray' | 'quit',
  ) => Promise<{ ok: boolean; action?: 'tray' | 'quit' }>;
  setLaunchAtStartup?: (
    enabled: boolean,
    minimizedToTray?: boolean,
  ) => Promise<{ ok: boolean; launchAtStartup?: boolean }>;
  setGlobalQuickAddShortcut?: (
    enabled: boolean,
  ) => Promise<{ ok: boolean; registered?: boolean; globalQuickAddShortcut?: boolean }>;
  setGlobalQuickAddShortcutKey?: (
    shortcut: string,
  ) => Promise<{ ok: boolean; registered?: boolean; globalQuickAddShortcutKey?: string }>;
  getShortcutStatus?: () => Promise<{
    quickAddEnabled: boolean;
    quickAddKey?: string;
    quickAddRegistered: boolean;
    voiceEnabled: boolean;
    voiceShortcut?: string;
    voiceRegistered: boolean;
  }>;
  autoResolveShortcuts?: () => Promise<{
    ok: boolean;
    resolvedAny?: boolean;
    quickAddKey?: string;
    quickAddRegistered?: boolean;
    voiceShortcut?: string;
    voiceRegistered?: boolean;
  }>;
  showDesktopNotification?: (payload: {
    title: string;
    body: string;
    todoId?: string;
    silent?: boolean;
  }) => Promise<{ ok: boolean; supported?: boolean }>;
  onFocusTodo?: (cb: (todoId: string) => void) => (() => void) | undefined;
  getDiagnostics?: () => Promise<{
    appVersion: string;
    electronVersion: string;
    chromeVersion: string;
    nodeVersion: string;
    platform: string;
    arch: string;
    osRelease: string;
    isWindowsStore: boolean;
    distributionChannel?: 'store' | 'portable' | 'setup' | 'dev';
    locale: string;
    execPath?: string;
    cliPath?: string;
    mcpPath?: string;
    cliBinDir?: string;
    cliExePath?: string;
    cliInstalled?: boolean;
    runtimePort?: number | null;
    userDataDir?: string;
    logsDir?: string;
    modelsDir?: string;
    quickAddRegistered?: boolean;
    voiceRegistered?: boolean;
  }>;
  openDataFolder?: () => Promise<{ ok: boolean; path?: string }>;
  openLogsFolder?: () => Promise<{ ok: boolean; path?: string }>;
  openModelsFolder?: () => Promise<{ ok: boolean; path?: string }>;
  openFileLocation?: (targetPath: string) => Promise<{ ok: boolean; path?: string }>;
  openWindowsNotificationSettings?: () => Promise<{ ok: boolean }>;
  openMicrosoftStorePage?: () => Promise<{ ok: boolean }>;
  runCliDry?: (
    commandName: 'stat' | 'doctor',
  ) => Promise<{ ok: boolean; stdout: string; stderr: string }>;
  installCliShims?: () => Promise<{
    ok: boolean;
    binDir?: string;
    installed?: boolean;
    nativeShim?: boolean;
    executablePath?: string;
    error?: string;
  }>;
  openCliTerminal?: () => Promise<{ ok: boolean; error?: string }>;
  listMcpClients?: () => Promise<{
    ok: boolean;
    clients: import('../types').McpClientStatus[];
    error?: string;
  }>;
  installMcpClient?: (clientId: string) => Promise<{
    ok: boolean;
    clientId?: string;
    name?: string;
    configPath?: string;
    requiresRestart?: boolean;
    error?: string;
  }>;
  installCustomMcpFile?: () => Promise<{
    ok: boolean;
    canceled?: boolean;
    name?: string;
    configPath?: string;
    format?: string;
    rootKey?: string;
    error?: string;
  }>;
  uninstallMcpClient?: (clientId: string) => Promise<{
    ok: boolean;
    clientId?: string;
    removed?: boolean;
    error?: string;
  }>;
  testMcpServer?: () => Promise<import('../types').McpProbeResult>;
  updateTrayLabels?: (labels: {
    openLabel: string;
    newTaskLabel: string;
    dictateLabel?: string;
    todayLabel?: string;
    importantLabel?: string;
    quitLabel: string;
  }) => Promise<{ ok: boolean }>;
  applyAppIcon?: (payload: {
    bg: string;
    fg: string;
    updateShortcuts?: boolean;
  }) => Promise<{ ok: boolean; icoPath?: string; updatedShortcuts?: number }>;
  setZoomFactor?: (factor: number) => Promise<{ ok: boolean; factor?: number }>;
  setWindowThemeMode?: (mode: import('../types').ThemeMode) => Promise<{ ok: boolean }>;
  getInitialLocale?: () => Promise<{
    installerLocale: string | null;
    osLocale: string;
    preferred: string;
  }>;
  relaunch?: () => Promise<{ ok: boolean }>;
  checkForUpdates?: () => Promise<import('../types').UpdateCheckResult>;
  downloadAndInstallUpdate?: (url?: string) => Promise<{
    ok: boolean;
    downloaded?: boolean;
    cancelled?: boolean;
    nativeAutoUpdater?: boolean;
    launchedInstaller?: boolean;
    launchedExternal?: boolean;
    storeManaged?: boolean;
  }>;
  cancelUpdateDownload?: () => Promise<{ ok: boolean; cancelled?: boolean }>;
  quitAndInstallUpdate?: () => Promise<{ ok: boolean; storeManaged?: boolean }>;
  pickCloudSyncFolder?: () => Promise<{
    ok: boolean;
    canceled?: boolean;
    folderPath?: string;
  }>;
  openOneDriveFolder?: (folderPath?: string | null) => Promise<{ ok: boolean; path?: string }>;
  onUpdateProgress?: (cb: (percent: number) => void) => (() => void) | undefined;
  onUpdateDownloaded?: (cb: (info: { version: string }) => void) => (() => void) | undefined;
  onUpdateError?: (cb: (message: string) => void) => (() => void) | undefined;
  setVoiceShortcut?: (
    shortcut: string,
  ) => Promise<{ ok: boolean; registered?: boolean; voiceShortcut?: string }>;
  setVoiceShortcutEnabled?: (enabled: boolean) => Promise<{
    ok: boolean;
    registered?: boolean;
    voiceShortcut?: string;
    voiceShortcutEnabled?: boolean;
  }>;
  toggleVoiceOverlay?: () => Promise<{ ok: boolean; visible?: boolean; listening?: boolean }>;
  hideVoiceOverlay?: () => Promise<{ ok: boolean }>;
  setOverlayFocusable?: (focusable: boolean) => Promise<{ ok: boolean }>;
  notifyOverlayListening?: (listening: boolean) => Promise<{ ok: boolean; listening?: boolean }>;
  notifyOverlayReady?: () => void;
  getOverlayBounds?: () => Promise<{ x: number; y: number; width: number; height: number } | null>;
  openWindowsSpeechSettings?: () => Promise<{ ok: boolean }>;
  onOverlayCommand?: (cb: (payload: { action?: string }) => void) => (() => void) | undefined;
}

declare global {
  interface Window {
    agendameaWindow?: NativeWindowBridge;
  }
}

interface WindowControlsProps {
  onNotify?: (message: string) => void;
}

function getNativeBridge(): NativeWindowBridge | null {
  if (typeof window === 'undefined') return null;
  return window.agendameaWindow ?? null;
}

export function WindowControls({ onNotify }: WindowControlsProps) {
  const { t } = useI18n();
  const [isFullscreenOrMaximized, setIsFullscreenOrMaximized] = useState(false);
  const closeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    let active = true;
    const bridge = getNativeBridge();

    let unsubNative: (() => void) | undefined;
    if (bridge?.isMaximized) {
      Promise.resolve(bridge.isMaximized())
        .then((val) => {
          if (active) setIsFullscreenOrMaximized(Boolean(val));
        })
        .catch(() => {
          // Ignore maximize query errors
        });
    }
    if (bridge?.onMaximizedChange) {
      unsubNative = bridge.onMaximizedChange((val) => {
        if (active) setIsFullscreenOrMaximized(Boolean(val));
      });
    }

    const syncFullscreen = () => {
      if (!bridge?.toggleMaximize) {
        setIsFullscreenOrMaximized(Boolean(document.fullscreenElement));
      }
    };

    document.addEventListener('fullscreenchange', syncFullscreen);
    syncFullscreen();

    return () => {
      active = false;
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
      document.removeEventListener('fullscreenchange', syncFullscreen);
      if (typeof unsubNative === 'function') unsubNative();
    };
  }, []);

  const handleMinimize = useCallback(async () => {
    const bridge = getNativeBridge();
    if (bridge?.minimize) {
      await bridge.minimize();
      return;
    }

    if (document.fullscreenElement && document.exitFullscreen) {
      await document.exitFullscreen().catch(() => {
        // Ignore fullscreen exit errors
      });
    }

    try {
      const res = await api.minimizeWindow();
      window.blur();
      if (!res.supported) {
        onNotify?.(t.windowMinimizedToast);
      }
    } catch {
      window.blur();
    }
  }, [onNotify, t.windowMinimizedToast]);

  const handleToggleFullscreen = useCallback(async () => {
    const bridge = getNativeBridge();
    if (bridge?.toggleMaximize) {
      const result = await bridge.toggleMaximize();
      if (typeof result === 'boolean') {
        setIsFullscreenOrMaximized(result);
      } else {
        setIsFullscreenOrMaximized((prev) => !prev);
      }
      return;
    }

    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        setIsFullscreenOrMaximized(false);
      } else if (document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
        setIsFullscreenOrMaximized(true);
      }
    } catch {
      onNotify?.(t.windowFullscreenBlockedToast);
    }
  }, [onNotify, t.windowFullscreenBlockedToast]);

  const handleClose = useCallback(async () => {
    const bridge = getNativeBridge();
    if (bridge?.close) {
      await bridge.close();
      return;
    }

    window.close();

    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
    }
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null;
      if (!window.closed) {
        onNotify?.(t.windowCloseTabToast);
      }
    }, 180);
  }, [onNotify, t.windowCloseTabToast]);

  const maximizeTitle = isFullscreenOrMaximized ? t.windowRestore : t.windowMaximize;

  return (
    <fieldset
      aria-label={t.windowControlsLabel}
      className="app-no-drag flex items-center gap-0.5 rounded-lg border-0 bg-[var(--canvas)]/92 p-0.5"
    >
      {/* Minimize */}
      <button
        type="button"
        onClick={() => void handleMinimize()}
        aria-label={t.windowMinimize}
        title={t.windowMinimize}
        className="app-no-drag flex h-7 w-8 cursor-pointer items-center justify-center rounded-md text-[var(--text-muted)] transition-colors ag-hover-glow hover:text-[var(--text-primary)] active:bg-[var(--border)]"
      >
        <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <path d="M2 6.5H10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      </button>

      {/* Maximize / Restore */}
      <button
        type="button"
        onClick={() => void handleToggleFullscreen()}
        aria-label={maximizeTitle}
        title={maximizeTitle}
        aria-pressed={isFullscreenOrMaximized}
        className="app-no-drag flex h-7 w-8 cursor-pointer items-center justify-center rounded-md text-[var(--text-muted)] transition-colors ag-hover-glow hover:text-[var(--text-primary)] active:bg-[var(--border)]"
      >
        {isFullscreenOrMaximized ? (
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path
              d="M3.75 3.75V2.5C3.75 2.08579 4.08579 1.75 4.5 1.75H9.5C9.91421 1.75 10.25 2.08579 10.25 2.5V7.5C10.25 7.91421 9.91421 8.25 9.5 8.25H8.25"
              stroke="currentColor"
              strokeWidth="1.15"
              strokeLinecap="round"
            />
            <rect
              x="1.75"
              y="3.75"
              width="6.5"
              height="6.5"
              rx="1"
              stroke="currentColor"
              strokeWidth="1.15"
            />
          </svg>
        ) : (
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <rect
              x="2"
              y="2"
              width="8"
              height="8"
              rx="1"
              stroke="currentColor"
              strokeWidth="1.15"
            />
          </svg>
        )}
      </button>

      {/* Close */}
      <button
        type="button"
        onClick={() => void handleClose()}
        aria-label={t.windowClose}
        title={t.windowClose}
        className="app-no-drag flex h-7 w-8 cursor-pointer items-center justify-center rounded-md text-[var(--text-muted)] transition-colors ag-hover-danger-glow"
      >
        <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <path
            d="M2.5 2.5L9.5 9.5M9.5 2.5L2.5 9.5"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </fieldset>
  );
}
