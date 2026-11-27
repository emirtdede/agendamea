import React, { lazy, Suspense } from 'react';
import type { LegalDocId } from '../../i18n/translations';
import { notificationStore, useNotificationSelector } from '../../store/notificationStore';
import { preferencesStore, usePreferencesSelector } from '../../store/preferencesStore';
import { shortcutStore, useShortcutSelector } from '../../store/shortcutStore';
import { useWebhookSelector, webhookStore } from '../../store/webhookStore';
import { useWorkspaceSnapshotSelector } from '../../store/workspaceSnapshotStore';
import type { BootstrapPayload, OneDriveStatus, SettingsTabId } from '../../types';
import type { DocsSubTabId } from '../DocsSettingsSection';
import type { AboutSubTabId } from './AboutLegalSettingsTab';
import type { AiSubTabId } from './AiVoiceSettingsTab';
import { AppearanceSettingsTab } from './AppearanceSettingsTab';
import type { PendingImportState } from './DataBackupSettingsTab';

// Code-split all non-default settings tabs so opening Settings loads only the active tab (~65-70% smaller initial chunk)
const AccessibilitySettingsTab = lazy(() =>
  import('./AccessibilitySettingsTab').then((m) => ({ default: m.AccessibilitySettingsTab })),
);
const GeneralSettingsTab = lazy(() =>
  import('./GeneralSettingsTab').then((m) => ({ default: m.GeneralSettingsTab })),
);
const ShortcutsSettingsTab = lazy(() =>
  import('./ShortcutsSettingsTab').then((m) => ({ default: m.ShortcutsSettingsTab })),
);
const NotificationsSettingsTab = lazy(() =>
  import('./NotificationsSettingsTab').then((m) => ({ default: m.NotificationsSettingsTab })),
);
const AiVoiceSettingsTab = lazy(() =>
  import('./AiVoiceSettingsTab').then((m) => ({ default: m.AiVoiceSettingsTab })),
);
const DataBackupSettingsTab = lazy(() =>
  import('./DataBackupSettingsTab').then((m) => ({ default: m.DataBackupSettingsTab })),
);
const TrashSettingsTab = lazy(() =>
  import('./TrashSettingsTab').then((m) => ({ default: m.TrashSettingsTab })),
);
const UserGuideSettingsTab = lazy(() =>
  import('./UserGuideSettingsTab').then((m) => ({ default: m.UserGuideSettingsTab })),
);
const DocsSettingsSection = lazy(() =>
  import('../DocsSettingsSection').then((m) => ({ default: m.DocsSettingsSection })),
);
const WebhooksSettingsTab = lazy(() =>
  import('./WebhooksSettingsTab').then((m) => ({ default: m.WebhooksSettingsTab })),
);
const LegalSettingsTab = lazy(() =>
  import('./LegalSettingsTab').then((m) => ({ default: m.LegalSettingsTab })),
);
const AboutLegalSettingsTab = lazy(() =>
  import('./AboutLegalSettingsTab').then((m) => ({ default: m.AboutLegalSettingsTab })),
);

export interface SettingsNavigationSignal {
  subTab?: string;
  expandSectionId?: string;
  revealSettingId?: string;
  seq: number;
}

export interface SettingsRuntimeActions {
  onToggleDragLock: (locked: boolean) => void;
  onLockAppNow?: () => void;
  onNotifyInfo?: (message: string) => void;
  onSendTestNotification: () => void;
  onNotifyVoice?: (payload: { title: string; body?: string; variant?: 'info' | 'error' }) => void;
  onNotifyCloudSync?: (payload: {
    title: string;
    body?: string;
    variant?: 'info' | 'error';
  }) => void;
  onCheckForUpdates: () => Promise<void>;
  onDownloadAndInstall: () => Promise<void>;
  onCancelUpdateDownload?: () => Promise<void>;
  onQuitAndInstallUpdate?: () => Promise<void>;
  onClearAllCompleted: () => Promise<void>;
  onImportBackup: (payload: unknown) => Promise<void>;
  onApplyRestoredBootstrap?: (restored: BootstrapPayload) => void;
  onResetAllData?: (resetSettings: boolean) => Promise<void>;
  onRestoreTodo: (id: string) => Promise<void>;
  onPermanentDeleteTodo: (id: string) => Promise<void>;
  onRestoreCategory: (id: string) => Promise<void>;
  onPermanentDeleteCategory: (id: string) => Promise<void>;
  onEmptyTrash: () => Promise<void>;
  onRestoreAllTrash?: () => Promise<void>;
}

const ConnectedAppearanceTab = React.memo(function ConnectedAppearanceTab({
  revealSettingId,
}: {
  revealSettingId?: string;
}) {
  const slice = usePreferencesSelector((s) => ({
    themeMode: s.themeMode,
    themeId: s.themeId,
    customThemeColor: s.customThemeColor,
    recentCustomColors: s.recentCustomColors,
    appIconId: s.appIconId,
    customIconColor: s.customIconColor,
    listDensity: s.listDensity,
    fontFamily: s.fontFamily,
  }));
  return (
    <AppearanceSettingsTab
      {...slice}
      revealSettingId={revealSettingId}
      onChangeMode={preferencesStore.setThemeMode}
      onChangeTheme={preferencesStore.setThemeId}
      onChangeCustomThemeColor={preferencesStore.setCustomThemeColor}
      onChangeAppIcon={preferencesStore.setAppIconId}
      onChangeCustomIconColor={preferencesStore.setCustomIconColor}
      onChangeListDensity={preferencesStore.setListDensity}
      onChangeFontFamily={preferencesStore.setFontFamily}
      onResetAppearance={preferencesStore.resetAppearance}
    />
  );
});

const ConnectedAccessibilityTab = React.memo(function ConnectedAccessibilityTab({
  revealSettingId,
}: {
  revealSettingId?: string;
}) {
  const slice = usePreferencesSelector((s) => ({
    zoomPercent: s.zoomPercent,
    fontScale: s.fontScale,
    highContrast: s.highContrast,
    reducedMotion: s.reducedMotion,
    readableSpacing: s.readableSpacing,
    colorBlindShapes: s.colorBlindShapes,
    strongFocusRing: s.strongFocusRing,
  }));
  return (
    <AccessibilitySettingsTab
      {...slice}
      revealSettingId={revealSettingId}
      onChangeZoomPercent={preferencesStore.setZoomPercent}
      onChangeFontScale={preferencesStore.setFontScale}
      onToggleHighContrast={preferencesStore.setHighContrast}
      onToggleReducedMotion={preferencesStore.setReducedMotion}
      onToggleReadableSpacing={preferencesStore.setReadableSpacing}
      onToggleColorBlindShapes={preferencesStore.setColorBlindShapes}
      onToggleStrongFocusRing={preferencesStore.setStrongFocusRing}
      onResetAccessibility={preferencesStore.resetAccessibility}
    />
  );
});

const ConnectedGeneralTab = React.memo(function ConnectedGeneralTab({
  onToggleDragLock,
  onLockAppNow,
  onNotifyInfo,
  expandLanguageSeq,
  revealSettingId,
}: {
  onToggleDragLock: (locked: boolean) => void;
  onLockAppNow?: () => void;
  onNotifyInfo?: (message: string) => void;
  expandLanguageSeq?: number;
  revealSettingId?: string;
}) {
  const slice = usePreferencesSelector((s) => ({
    closeBehavior: s.closeBehavior,
    launchAtStartup: s.launchAtStartup,
    launchMinimizedToTray: s.launchMinimizedToTray,
    weekStartsOn: s.weekStartsOn,
    timeFormat: s.timeFormat,
    defaultStartupView: s.defaultStartupView,
    defaultLayoutMode: s.defaultLayoutMode,
    defaultPriority: s.defaultPriority,
    completedTaskBehavior: s.completedTaskBehavior,
    completionSound: s.completionSound,
    confirmBeforeDelete: s.confirmBeforeDelete,
    dragLocked: s.dragLocked,
  }));
  return (
    <GeneralSettingsTab
      {...slice}
      expandLanguageSeq={expandLanguageSeq}
      revealSettingId={revealSettingId}
      onChangeCloseBehavior={preferencesStore.setCloseBehavior}
      onToggleLaunchAtStartup={preferencesStore.setLaunchAtStartup}
      onToggleLaunchMinimizedToTray={preferencesStore.setLaunchMinimizedToTray}
      onChangeWeekStartsOn={preferencesStore.setWeekStartsOn}
      onChangeTimeFormat={preferencesStore.setTimeFormat}
      onChangeDefaultStartupView={preferencesStore.setDefaultStartupView}
      onChangeDefaultLayoutMode={preferencesStore.setDefaultLayoutMode}
      onChangeDefaultPriority={preferencesStore.setDefaultPriority}
      onChangeCompletedTaskBehavior={preferencesStore.setCompletedTaskBehavior}
      onChangeCompletionSound={preferencesStore.setCompletionSound}
      onToggleConfirmBeforeDelete={preferencesStore.setConfirmBeforeDelete}
      onToggleDragLock={onToggleDragLock}
      onResetGeneral={preferencesStore.resetGeneral}
      onLockAppNow={onLockAppNow}
      onNotifyInfo={onNotifyInfo}
    />
  );
});

const ConnectedShortcutsTab = React.memo(function ConnectedShortcutsTab({
  revealSettingId,
}: {
  revealSettingId?: string;
}) {
  const slice = useShortcutSelector((s) => ({
    globalQuickAddShortcut: s.globalQuickAddShortcut,
    globalQuickAddShortcutKey: s.globalQuickAddShortcutKey,
    quickAddRegistered: s.quickAddRegistered,
    voiceShortcutEnabled: s.voiceShortcutEnabled,
    voiceShortcut: s.voiceShortcut,
    voiceRegistered: s.voiceRegistered,
    customShortcuts: s.customShortcuts,
  }));
  return (
    <ShortcutsSettingsTab
      {...slice}
      revealSettingId={revealSettingId}
      onToggleGlobalQuickAddShortcut={shortcutStore.setGlobalQuickAddEnabled}
      onChangeGlobalQuickAddShortcutKey={shortcutStore.setGlobalQuickAddKey}
      onToggleVoiceShortcutEnabled={shortcutStore.setVoiceShortcutEnabled}
      onVoiceShortcutChange={shortcutStore.setVoiceShortcut}
      onChangeCustomShortcut={shortcutStore.setCustomShortcut}
      onRefreshOsStatus={shortcutStore.refreshOsStatus}
      onAutoResolveOsShortcuts={shortcutStore.autoResolveOsConflicts}
      onResetAllShortcuts={shortcutStore.resetAll}
    />
  );
});

const ConnectedNotificationsTab = React.memo(function ConnectedNotificationsTab({
  onSendTest,
  revealSettingId,
}: {
  onSendTest: () => void;
  revealSettingId?: string;
}) {
  const slice = useNotificationSelector((s) => ({
    profile: s.profile,
    leadMinutes: s.leadMinutes,
    channels: s.channels,
    quietHoursEnabled: s.quietHoursEnabled,
    quietHoursStart: s.quietHoursStart,
    quietHoursEnd: s.quietHoursEnd,
    notificationSoundEnabled: s.notificationSoundEnabled,
    dailyDigestEnabled: s.dailyDigestEnabled,
    dailyDigestTime: s.dailyDigestTime,
  }));
  return (
    <NotificationsSettingsTab
      {...slice}
      revealSettingId={revealSettingId}
      onApplyProfile={notificationStore.applyProfile}
      onChangeChannel={notificationStore.updateChannel}
      onChangeLeadMinutes={notificationStore.updateLeadMinutes}
      onToggleQuietHours={notificationStore.setQuietHoursEnabled}
      onChangeQuietHoursStart={notificationStore.setQuietHoursStart}
      onChangeQuietHoursEnd={notificationStore.setQuietHoursEnd}
      onToggleNotificationSound={notificationStore.setNotificationSoundEnabled}
      onToggleDailyDigest={notificationStore.setDailyDigestEnabled}
      onChangeDailyDigestTime={notificationStore.setDailyDigestTime}
      onResetNotifications={notificationStore.resetNotifications}
      onSendTest={onSendTest}
    />
  );
});

const ConnectedWebhooksTab = React.memo(function ConnectedWebhooksTab() {
  const slice = useWebhookSelector((s) => ({
    webhookEnabled: s.webhookEnabled,
    webhookUrl: s.webhookUrl,
    webhookSecret: s.webhookSecret,
    webhookEvents: s.webhookEvents,
    webhookFormat: s.webhookFormat,
    webhookIncomingEnabled: s.webhookIncomingEnabled,
    webhookIncomingSecret: s.webhookIncomingSecret,
    webhookAllowLocalNetwork: s.webhookAllowLocalNetwork,
    webhookEndpointOverrides: s.webhookEndpointOverrides,
  }));
  return <WebhooksSettingsTab {...slice} onSaveWebhook={webhookStore.save} />;
});

const ConnectedDataTab = React.memo(function ConnectedDataTab({
  oneDriveStatus,
  onOneDriveStatusChange,
  isImporting,
  onImportingChange,
  pendingImport,
  onPendingImportChange,
  formatTimestamp,
  revealSettingId,
  actions,
}: {
  oneDriveStatus: OneDriveStatus | null;
  onOneDriveStatusChange: (status: OneDriveStatus | null) => void;
  isImporting: boolean;
  onImportingChange: (importing: boolean) => void;
  pendingImport: PendingImportState | null;
  onPendingImportChange: (pending: PendingImportState | null) => void;
  formatTimestamp: (iso: string | null) => string;
  revealSettingId?: string;
  actions: SettingsRuntimeActions;
}) {
  const totalTodoCount = useWorkspaceSnapshotSelector((s) => s.totalTodoCount, Object.is);
  return (
    <DataBackupSettingsTab
      totalTodoCount={totalTodoCount}
      oneDriveStatus={oneDriveStatus}
      onOneDriveStatusChange={onOneDriveStatusChange}
      isImporting={isImporting}
      onImportingChange={onImportingChange}
      pendingImport={pendingImport}
      onPendingImportChange={onPendingImportChange}
      onImportBackup={actions.onImportBackup}
      onApplyRestoredBootstrap={actions.onApplyRestoredBootstrap}
      onResetAllData={actions.onResetAllData}
      onNotifyCloudSync={actions.onNotifyCloudSync}
      formatTimestamp={formatTimestamp}
      revealSettingId={revealSettingId}
    />
  );
});

const ConnectedTrashTab = React.memo(function ConnectedTrashTab({
  formatTimestamp,
  revealSettingId,
  actions,
}: {
  formatTimestamp: (iso: string | null) => string;
  revealSettingId?: string;
  actions: SettingsRuntimeActions;
}) {
  const trash = useWorkspaceSnapshotSelector((s) => ({
    trashedCategories: s.trashedCategories,
    trashedTodos: s.trashedTodos,
    completedTodoCount: s.completedTodoCount,
  }));
  const trashAutoPurgeDays = usePreferencesSelector((s) => s.trashAutoPurgeDays, Object.is);
  return (
    <TrashSettingsTab
      trashedCategories={trash.trashedCategories}
      trashedTodos={trash.trashedTodos}
      completedTodoCount={trash.completedTodoCount}
      trashAutoPurgeDays={trashAutoPurgeDays}
      onChangeTrashAutoPurgeDays={preferencesStore.setTrashAutoPurgeDays}
      onClearAllCompleted={actions.onClearAllCompleted}
      onRestoreTodo={actions.onRestoreTodo}
      onPermanentDeleteTodo={actions.onPermanentDeleteTodo}
      onRestoreCategory={actions.onRestoreCategory}
      onPermanentDeleteCategory={actions.onPermanentDeleteCategory}
      onEmptyTrash={actions.onEmptyTrash}
      onRestoreAllTrash={actions.onRestoreAllTrash}
      formatTimestamp={formatTimestamp}
      revealSettingId={revealSettingId}
    />
  );
});

interface SettingsTabOutletProps {
  activeTab: SettingsTabId;
  navSignal?: SettingsNavigationSignal | null;
  oneDriveStatus: OneDriveStatus | null;
  onOneDriveStatusChange: (status: OneDriveStatus | null) => void;
  isImporting: boolean;
  onImportingChange: (importing: boolean) => void;
  pendingImport: PendingImportState | null;
  onPendingImportChange: (pending: PendingImportState | null) => void;
  formatTimestamp: (iso: string | null) => string;
  onOpenLegalDoc: (doc: LegalDocId) => void;
  onSelectTab?: (tab: SettingsTabId) => void;
  onOpenWelcomeGuide?: () => void;
  actions: SettingsRuntimeActions;
}

export const SettingsTabOutlet = React.memo(function SettingsTabOutlet({
  activeTab,
  navSignal,
  oneDriveStatus,
  onOneDriveStatusChange,
  isImporting,
  onImportingChange,
  pendingImport,
  onPendingImportChange,
  formatTimestamp,
  onOpenLegalDoc,
  onSelectTab,
  onOpenWelcomeGuide,
  actions,
}: SettingsTabOutletProps) {
  const revealSettingId = navSignal?.revealSettingId;

  const renderActiveTab = () => {
    switch (activeTab) {
      case 'appearance':
        return <ConnectedAppearanceTab revealSettingId={revealSettingId} />;
      case 'accessibility':
        return <ConnectedAccessibilityTab revealSettingId={revealSettingId} />;
      case 'general':
        return (
          <ConnectedGeneralTab
            onToggleDragLock={actions.onToggleDragLock}
            onLockAppNow={actions.onLockAppNow}
            onNotifyInfo={actions.onNotifyInfo}
            expandLanguageSeq={
              navSignal?.expandSectionId === 'general-language' ? navSignal.seq : undefined
            }
            revealSettingId={revealSettingId}
          />
        );
      case 'shortcuts':
        return <ConnectedShortcutsTab revealSettingId={revealSettingId} />;
      case 'notifications':
        return (
          <ConnectedNotificationsTab
            onSendTest={actions.onSendTestNotification}
            revealSettingId={revealSettingId}
          />
        );
      case 'ai':
        return (
          <AiVoiceSettingsTab
            onNotifyVoice={actions.onNotifyVoice}
            requestedSubTab={
              navSignal?.subTab === 'voice' || navSignal?.subTab === 'engine'
                ? (navSignal.subTab as AiSubTabId)
                : undefined
            }
            subTabSeq={navSignal?.seq}
            revealSettingId={revealSettingId}
          />
        );
      case 'data':
        return (
          <ConnectedDataTab
            oneDriveStatus={oneDriveStatus}
            onOneDriveStatusChange={onOneDriveStatusChange}
            isImporting={isImporting}
            onImportingChange={onImportingChange}
            pendingImport={pendingImport}
            onPendingImportChange={onPendingImportChange}
            formatTimestamp={formatTimestamp}
            revealSettingId={revealSettingId}
            actions={actions}
          />
        );
      case 'trash':
        return (
          <ConnectedTrashTab
            formatTimestamp={formatTimestamp}
            revealSettingId={revealSettingId}
            actions={actions}
          />
        );
      case 'guide':
        return (
          <UserGuideSettingsTab
            onOpenSettingsTab={onSelectTab}
            onOpenWelcomeWizard={onOpenWelcomeGuide}
          />
        );
      case 'docs':
        return (
          <DocsSettingsSection
            webhookNode={<ConnectedWebhooksTab />}
            requestedSubTab={
              navSignal?.subTab === 'cli' ||
              navSignal?.subTab === 'mcp' ||
              navSignal?.subTab === 'api' ||
              navSignal?.subTab === 'webhooks'
                ? (navSignal.subTab as DocsSubTabId)
                : undefined
            }
            subTabSeq={navSignal?.seq}
          />
        );
      case 'webhooks':
        return <ConnectedWebhooksTab />;
      case 'legal':
        return <LegalSettingsTab onOpenLegalDoc={onOpenLegalDoc} />;
      default:
        return (
          <AboutLegalSettingsTab
            oneDriveStatus={oneDriveStatus}
            onCheckForUpdates={actions.onCheckForUpdates}
            onDownloadAndInstall={actions.onDownloadAndInstall}
            onCancelUpdateDownload={actions.onCancelUpdateDownload}
            onQuitAndInstallUpdate={actions.onQuitAndInstallUpdate}
            onOpenLegalDoc={onOpenLegalDoc}
            onOpenWelcomeGuide={onOpenWelcomeGuide}
            requestedSubTab={
              navSignal?.subTab === 'about' || navSignal?.subTab === 'guide'
                ? (navSignal.subTab as AboutSubTabId)
                : undefined
            }
            expandSectionId={navSignal?.expandSectionId}
            subTabSeq={navSignal?.seq}
          />
        );
    }
  };

  return <Suspense fallback={null}>{renderActiveTab()}</Suspense>;
});
