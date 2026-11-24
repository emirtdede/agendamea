import React from 'react';
import type { LegalDocId } from '../../i18n/translations';
import { notificationStore, useNotificationSelector } from '../../store/notificationStore';
import { preferencesStore, usePreferencesSelector } from '../../store/preferencesStore';
import { shortcutStore, useShortcutSelector } from '../../store/shortcutStore';
import { useWebhookSelector, webhookStore } from '../../store/webhookStore';
import { useWorkspaceSnapshotSelector } from '../../store/workspaceSnapshotStore';
import type { BootstrapPayload, OneDriveStatus, SettingsTabId } from '../../types';
import { DocsSettingsSection, type DocsSubTabId } from '../DocsSettingsSection';
import { AboutLegalSettingsTab, type AboutSubTabId } from './AboutLegalSettingsTab';
import { AccessibilitySettingsTab } from './AccessibilitySettingsTab';
import { type AiSubTabId, AiVoiceSettingsTab } from './AiVoiceSettingsTab';
import { AppearanceSettingsTab } from './AppearanceSettingsTab';
import { DataBackupSettingsTab, type PendingImportState } from './DataBackupSettingsTab';
import { GeneralSettingsTab } from './GeneralSettingsTab';
import { LegalSettingsTab } from './LegalSettingsTab';
import { NotificationsSettingsTab } from './NotificationsSettingsTab';
import { ShortcutsSettingsTab } from './ShortcutsSettingsTab';
import { TrashSettingsTab } from './TrashSettingsTab';
import { WebhooksSettingsTab } from './WebhooksSettingsTab';

export interface SettingsNavigationSignal {
  subTab?: string;
  expandSectionId?: string;
  seq: number;
}

export interface SettingsRuntimeActions {
  onToggleDragLock: (locked: boolean) => void;
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

const ConnectedAppearanceTab = React.memo(function ConnectedAppearanceTab() {
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

const ConnectedAccessibilityTab = React.memo(function ConnectedAccessibilityTab() {
  const slice = usePreferencesSelector((s) => ({
    zoomPercent: s.zoomPercent,
    highContrast: s.highContrast,
    reducedMotion: s.reducedMotion,
    colorBlindShapes: s.colorBlindShapes,
    strongFocusRing: s.strongFocusRing,
  }));
  return (
    <AccessibilitySettingsTab
      {...slice}
      onChangeZoomPercent={preferencesStore.setZoomPercent}
      onToggleHighContrast={preferencesStore.setHighContrast}
      onToggleReducedMotion={preferencesStore.setReducedMotion}
      onToggleColorBlindShapes={preferencesStore.setColorBlindShapes}
      onToggleStrongFocusRing={preferencesStore.setStrongFocusRing}
      onResetAccessibility={preferencesStore.resetAccessibility}
    />
  );
});

const ConnectedGeneralTab = React.memo(function ConnectedGeneralTab({
  onToggleDragLock,
  expandLanguageSeq,
}: {
  onToggleDragLock: (locked: boolean) => void;
  expandLanguageSeq?: number;
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
    />
  );
});

const ConnectedShortcutsTab = React.memo(function ConnectedShortcutsTab() {
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
}: {
  onSendTest: () => void;
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
  actions,
}: {
  oneDriveStatus: OneDriveStatus | null;
  onOneDriveStatusChange: (status: OneDriveStatus | null) => void;
  isImporting: boolean;
  onImportingChange: (importing: boolean) => void;
  pendingImport: PendingImportState | null;
  onPendingImportChange: (pending: PendingImportState | null) => void;
  formatTimestamp: (iso: string | null) => string;
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
    />
  );
});

const ConnectedTrashTab = React.memo(function ConnectedTrashTab({
  formatTimestamp,
  actions,
}: {
  formatTimestamp: (iso: string | null) => string;
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
  actions,
}: SettingsTabOutletProps) {
  switch (activeTab) {
    case 'appearance':
      return <ConnectedAppearanceTab />;
    case 'accessibility':
      return <ConnectedAccessibilityTab />;
    case 'general':
      return (
        <ConnectedGeneralTab
          onToggleDragLock={actions.onToggleDragLock}
          expandLanguageSeq={
            navSignal?.expandSectionId === 'general-language' ? navSignal.seq : undefined
          }
        />
      );
    case 'shortcuts':
      return <ConnectedShortcutsTab />;
    case 'notifications':
      return <ConnectedNotificationsTab onSendTest={actions.onSendTestNotification} />;
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
          actions={actions}
        />
      );
    case 'trash':
      return <ConnectedTrashTab formatTimestamp={formatTimestamp} actions={actions} />;
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
});
