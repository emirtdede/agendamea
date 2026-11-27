import { Check, Cloud, FolderOpen, RefreshCw, Upload } from 'lucide-react';
import React from 'react';
import { useI18n } from '../../../i18n/I18nContext';
import type { DetectedCloudProvider, OneDriveStatus } from '../../../types';
import { ToggleSwitch } from '../../ToggleSwitch';

interface CloudSyncCardProps {
  oneDriveStatus: OneDriveStatus | null;
  cloudProviders: DetectedCloudProvider[];
  isOneDriveBusy: boolean;
  formatTimestamp: (iso: string | null) => string;
  onConnectOrSync: () => void;
  onRestore: () => void;
  onPickFolder: () => void;
  onOpenFolder: () => void;
  onSelectProvider: (provider: DetectedCloudProvider) => void;
  onToggleAutoSync: () => void;
  onDisconnect: () => void;
}

export const CloudSyncCard = React.memo(function CloudSyncCard({
  oneDriveStatus,
  cloudProviders,
  isOneDriveBusy,
  formatTimestamp,
  onConnectOrSync,
  onRestore,
  onPickFolder,
  onOpenFolder,
  onSelectProvider,
  onToggleAutoSync,
  onDisconnect,
}: CloudSyncCardProps) {
  const { meta, t } = useI18n();

  return (
    <div data-testid="onedrive-sync-card" className="space-y-4">
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Cloud className="h-3.5 w-3.5 text-[var(--text-muted)] shrink-0" />
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)] truncate">
              {t.cloudSyncSectionTitle}
            </h3>
          </div>
          {oneDriveStatus?.connected && (
            <div className="flex items-center gap-3 shrink-0">
              <span className="inline-flex items-center gap-1 text-xs font-medium text-[var(--text-primary)] whitespace-nowrap">
                <Check className="h-3.5 w-3.5 shrink-0" />
                <span>{t.enabledBadge}</span>
              </span>
              <button
                type="button"
                disabled={isOneDriveBusy}
                onClick={onDisconnect}
                className="text-xs font-medium text-[var(--text-muted)] ag-hover-glow hover:text-[var(--text-primary)] disabled:opacity-40 transition-colors whitespace-nowrap"
              >
                {t.onedriveDisconnectButton}
              </button>
            </div>
          )}
        </div>
        <p className="text-xs leading-relaxed text-[var(--text-muted)]">{t.cloudSyncSectionDesc}</p>
      </div>

      <div className="space-y-2">
        <p className="text-[11px] font-medium text-[var(--text-muted)]">
          {t.cloudSyncProvidersTitle}
        </p>
        <div
          className="grid grid-cols-2 gap-1.5 border-y border-[var(--border)]/75 py-2"
          data-testid="cloud-providers-grid"
        >
          {oneDriveStatus === null
            ? [0, 1, 2, 3].map((idx) => (
                <div
                  key={idx}
                  data-testid="cloud-provider-skeleton"
                  className="flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 animate-pulse"
                >
                  <div className="space-y-1.5 flex-1">
                    <div className="h-3 w-20 rounded bg-[var(--surface-subtle)]" />
                    <div className="h-2.5 w-28 rounded bg-[var(--surface-subtle)]" />
                  </div>
                  <div className="h-3 w-3 rounded-full bg-[var(--surface-subtle)]" />
                </div>
              ))
            : cloudProviders.map((provider) => {
                const isActive =
                  Boolean(oneDriveStatus?.connected) &&
                  oneDriveStatus?.activeProvider === provider.id;
                return (
                  <button
                    key={provider.id}
                    type="button"
                    data-testid={`cloud-provider-${provider.id}`}
                    disabled={isOneDriveBusy}
                    onClick={() => onSelectProvider(provider)}
                    className={`flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-start transition-colors disabled:opacity-45 ${
                      isActive
                        ? 'bg-[var(--surface-subtle)] text-[var(--text-primary)]'
                        : 'bg-transparent text-[var(--text-secondary)] ag-hover-glow hover:text-[var(--text-primary)]'
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-[var(--text-primary)]">
                        {provider.label}
                      </p>
                      <p className="truncate text-[10.5px] text-[var(--text-muted)]">
                        {provider.detected ? t.cloudDetectedBadge : t.cloudNotInstalledHint}
                      </p>
                    </div>
                    {isActive ? (
                      <Check className="h-3.5 w-3.5 shrink-0 text-[var(--text-primary)]" />
                    ) : provider.detected ? (
                      <span
                        aria-hidden="true"
                        className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--text-secondary)]"
                      />
                    ) : (
                      <FolderOpen className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
                    )}
                  </button>
                );
              })}
        </div>
      </div>

      {oneDriveStatus?.folderPath && (
        <div className="space-y-0.5 border-s-2 border-[var(--border-strong)] ps-3 py-0.5">
          <p
            data-testid="onedrive-folder-path"
            className="truncate font-mono-tabular text-[11px] text-[var(--text-secondary)]"
            title={oneDriveStatus.folderPath}
          >
            {oneDriveStatus.folderPath}
          </p>
          {oneDriveStatus.lastSyncedAt && (
            <p className="font-mono-tabular text-[11px] text-[var(--text-muted)]">
              {t.onedriveLastSyncedPrefix}: {formatTimestamp(oneDriveStatus.lastSyncedAt)}
              {oneDriveStatus.hasRemoteBackup && typeof oneDriveStatus.remoteTodoCount === 'number'
                ? ` · ${oneDriveStatus.remoteTodoCount} ${t.tasksTitle.toLocaleLowerCase(meta.intlLocale)}`
                : ''}
            </p>
          )}
        </div>
      )}

      <div
        data-testid="cloud-sync-actions-grid"
        className="flex flex-wrap items-center gap-x-5 gap-y-2.5 pt-0.5"
      >
        <button
          type="button"
          disabled={isOneDriveBusy}
          title={oneDriveStatus?.connected ? t.onedriveSyncNowButton : t.onedriveConnectButton}
          onClick={onConnectOrSync}
          className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-medium transition-opacity ag-hover-accent-glow disabled:opacity-40 whitespace-nowrap"
          style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-fg)' }}
        >
          <RefreshCw className={`h-3.5 w-3.5 shrink-0 ${isOneDriveBusy ? 'animate-spin' : ''}`} />
          <span>
            {oneDriveStatus?.connected ? t.onedriveSyncNowButton : t.onedriveConnectButton}
          </span>
        </button>

        <button
          type="button"
          disabled={isOneDriveBusy || !oneDriveStatus?.hasRemoteBackup}
          title={t.onedriveRestoreButton}
          onClick={onRestore}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--text-secondary)] ag-hover-glow hover:text-[var(--text-primary)] disabled:opacity-40 transition-colors whitespace-nowrap"
        >
          <Upload className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
          <span>{t.onedriveRestoreButton}</span>
        </button>

        <button
          type="button"
          data-testid="onedrive-pick-folder-btn"
          disabled={isOneDriveBusy}
          title={t.cloudPickFolderButton}
          onClick={onPickFolder}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--text-secondary)] ag-hover-glow hover:text-[var(--text-primary)] disabled:opacity-40 transition-colors whitespace-nowrap"
        >
          <FolderOpen className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
          <span>{t.cloudPickFolderButton}</span>
        </button>

        <button
          type="button"
          title={t.onedriveOpenFolderButton}
          onClick={onOpenFolder}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--text-secondary)] ag-hover-glow hover:text-[var(--text-primary)] transition-colors whitespace-nowrap"
        >
          <FolderOpen className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
          <span>{t.onedriveOpenFolderButton}</span>
        </button>
      </div>

      {oneDriveStatus?.connected && (
        <div className="flex items-center justify-between gap-3 border-t border-[var(--border)]/60 pt-3">
          <span className="text-xs font-medium text-[var(--text-secondary)]">
            {t.onedriveAutoSyncTitle}
          </span>
          <ToggleSwitch
            checked={oneDriveStatus.autoSync}
            onChange={() => onToggleAutoSync()}
            disabled={isOneDriveBusy}
            label={t.onedriveAutoSyncTitle}
            testId="cloud-auto-sync-toggle"
          />
        </div>
      )}
    </div>
  );
});
