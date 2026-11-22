import React, { useMemo, useRef, useState } from 'react';
import { Check, Cloud, Download, FolderOpen, RefreshCw, Trash2, Upload } from 'lucide-react';
import { api } from '../../api/client';
import { useI18n } from '../../i18n/I18nContext';
import { localizeErrorMessage } from '../../i18n/translations';
import type { BootstrapPayload, DetectedCloudProvider, OneDriveStatus } from '../../types';

const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

export interface PendingImportState {
  fileName: string;
  payload: unknown;
  summary: string;
}

export interface DataBackupSettingsTabProps {
  totalTodoCount: number;
  completedTodoCount: number;
  oneDriveStatus: OneDriveStatus | null;
  onOneDriveStatusChange: (next: OneDriveStatus | null) => void;
  isImporting: boolean;
  onImportingChange: (busy: boolean) => void;
  pendingImport: PendingImportState | null;
  onPendingImportChange: (pending: PendingImportState | null) => void;
  onClearAllCompleted: () => Promise<void>;
  onImportBackup: (payload: unknown) => Promise<void>;
  onApplyRestoredBootstrap?: (restored: BootstrapPayload) => void;
  formatTimestamp: (iso: string | null) => string;
}

export const DataBackupSettingsTab = React.memo(function DataBackupSettingsTab({
  totalTodoCount,
  completedTodoCount,
  oneDriveStatus,
  onOneDriveStatusChange,
  isImporting,
  onImportingChange,
  pendingImport,
  onPendingImportChange,
  onClearAllCompleted,
  onImportBackup,
  onApplyRestoredBootstrap,
  formatTimestamp,
}: DataBackupSettingsTabProps) {
  const { lang, t } = useI18n();
  const [isOneDriveBusy, setIsOneDriveBusy] = useState(false);
  const [isExportingBackup, setIsExportingBackup] = useState(false);
  const [backupDownloaded, setBackupDownloaded] = useState(false);
  const [isClearingCompleted, setIsClearingCompleted] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isMountedRef = useRef(true);

  React.useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const cloudProviders = useMemo<DetectedCloudProvider[]>(
    () =>
      oneDriveStatus?.detectedProviders && oneDriveStatus.detectedProviders.length > 0
        ? oneDriveStatus.detectedProviders
        : [
            { id: 'onedrive', label: 'OneDrive', folderPath: '', detected: false },
            { id: 'googledrive', label: 'Google Drive', folderPath: '', detected: false },
            { id: 'icloud', label: 'iCloud Drive', folderPath: '', detected: false },
            { id: 'dropbox', label: 'Dropbox', folderPath: '', detected: false },
          ],
    [oneDriveStatus?.detectedProviders],
  );

  const applyRestoredIfPresent = async (restored?: BootstrapPayload) => {
    if (!restored) return;
    if (onApplyRestoredBootstrap) {
      onApplyRestoredBootstrap(restored);
    } else {
      await onImportBackup(restored);
    }
  };

  const handleOneDriveConnectOrSync = async () => {
    if (isOneDriveBusy) return;
    setIsOneDriveBusy(true);
    setImportError(null);
    try {
      const next = oneDriveStatus?.connected
        ? await api.syncOneDrivePush()
        : await api.connectOneDrive({ autoSync: true });
      if (isMountedRef.current) onOneDriveStatusChange(next);
      await applyRestoredIfPresent(next.restoredBootstrap);
    } catch (err) {
      if (isMountedRef.current) {
        setImportError(localizeErrorMessage(err, t.operationFailedToast, lang, t));
      }
    } finally {
      if (isMountedRef.current) setIsOneDriveBusy(false);
    }
  };

  const handleOneDrivePickFolder = async () => {
    if (isOneDriveBusy) return;
    setImportError(null);
    try {
      const picked = await window.agendameaWindow?.pickCloudSyncFolder?.();
      if (!picked || picked.canceled || !picked.folderPath) return;
      setIsOneDriveBusy(true);
      const next = await api.connectOneDrive({
        folderPath: picked.folderPath,
        autoSync: true,
      });
      if (isMountedRef.current) onOneDriveStatusChange(next);
      await applyRestoredIfPresent(next.restoredBootstrap);
    } catch (err) {
      if (isMountedRef.current) {
        setImportError(localizeErrorMessage(err, t.operationFailedToast, lang, t));
      }
    } finally {
      if (isMountedRef.current) setIsOneDriveBusy(false);
    }
  };

  const handleSelectCloudProvider = async (provider: DetectedCloudProvider) => {
    if (isOneDriveBusy) return;
    if (!provider.detected) {
      await handleOneDrivePickFolder();
      return;
    }
    setIsOneDriveBusy(true);
    setImportError(null);
    try {
      const next = await api.connectOneDrive({
        folderPath: provider.folderPath,
        autoSync: true,
      });
      if (isMountedRef.current) onOneDriveStatusChange(next);
      await applyRestoredIfPresent(next.restoredBootstrap);
    } catch (err) {
      if (isMountedRef.current) {
        setImportError(localizeErrorMessage(err, t.operationFailedToast, lang, t));
      }
    } finally {
      if (isMountedRef.current) setIsOneDriveBusy(false);
    }
  };

  const handleOneDriveRestore = async () => {
    if (isOneDriveBusy) return;
    setIsOneDriveBusy(true);
    setImportError(null);
    try {
      const { status, bootstrap } = await api.syncOneDrivePull();
      if (isMountedRef.current) onOneDriveStatusChange(status);
      await applyRestoredIfPresent(bootstrap);
    } catch (err) {
      if (isMountedRef.current) {
        setImportError(localizeErrorMessage(err, t.importRestoreFailedError, lang, t));
      }
    } finally {
      if (isMountedRef.current) setIsOneDriveBusy(false);
    }
  };

  const handleOneDriveToggleAutoSync = async () => {
    if (isOneDriveBusy || !oneDriveStatus) return;
    setIsOneDriveBusy(true);
    try {
      await api.updateSettings({ onedriveAutoSync: !oneDriveStatus.autoSync });
      const refreshed = await api.getOneDriveStatus();
      if (isMountedRef.current) onOneDriveStatusChange(refreshed);
    } catch {
      // Ignore toggle error
    } finally {
      if (isMountedRef.current) setIsOneDriveBusy(false);
    }
  };

  const handleOneDriveDisconnect = async () => {
    if (isOneDriveBusy) return;
    setIsOneDriveBusy(true);
    try {
      const next = await api.disconnectOneDrive();
      if (isMountedRef.current) onOneDriveStatusChange(next);
    } catch {
      // Ignore disconnect error
    } finally {
      if (isMountedRef.current) setIsOneDriveBusy(false);
    }
  };

  const handleDownloadBackup = async () => {
    if (isExportingBackup) return;
    setIsExportingBackup(true);
    setImportError(null);
    try {
      const res = await fetch(`/api/export?lang=${encodeURIComponent(lang)}`);
      if (!res.ok) throw new Error(t.operationFailedToast);
      const blob = await res.blob();
      const disp = res.headers.get('content-disposition') ?? '';
      const match = /filename="([^"]+)"/i.exec(disp);
      const fileName =
        match?.[1] || `agendamea-backup-${new Date().toISOString().slice(0, 10)}.json`;
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      if (isMountedRef.current) {
        setBackupDownloaded(true);
        window.setTimeout(() => {
          if (isMountedRef.current) setBackupDownloaded(false);
        }, 4000);
      }
    } catch (err) {
      if (isMountedRef.current) {
        setImportError(localizeErrorMessage(err, t.operationFailedToast, lang, t));
      }
    } finally {
      if (isMountedRef.current) setIsExportingBackup(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setImportError(null);
    onPendingImportChange(null);

    if (file.size > MAX_IMPORT_BYTES) {
      setImportError(t.importSizeExceededError);
      return;
    }

    try {
      const text = await file.text();
      const parsed: unknown = JSON.parse(text);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        setImportError(t.importInvalidBackupError);
        return;
      }
      const record = parsed as Record<string, unknown>;
      const todoCount = Array.isArray(record.todos) ? record.todos.length : 0;
      const catCount = Array.isArray(record.categories) ? record.categories.length : 0;
      const trashCountInFile =
        (Array.isArray(record.trashedTodos) ? record.trashedTodos.length : 0) +
        (Array.isArray(record.trashedCategories) ? record.trashedCategories.length : 0);
      const summaryParts = [
        `${todoCount} ${t.tasksTitle.toLowerCase()}`,
        `${catCount} ${t.categories.toLowerCase()}`,
      ];
      if (trashCountInFile > 0) {
        summaryParts.push(`${trashCountInFile} ${t.tabTrash.toLowerCase()}`);
      }
      onPendingImportChange({
        fileName: file.name,
        payload: parsed,
        summary: summaryParts.join(' · '),
      });
    } catch {
      setImportError(t.importInvalidBackupError);
    }
  };

  const handleConfirmImport = async () => {
    if (!pendingImport || isImporting) return;
    setImportError(null);
    onImportingChange(true);
    try {
      await onImportBackup(pendingImport.payload);
      onPendingImportChange(null);
    } catch (err) {
      if (isMountedRef.current) {
        setImportError(localizeErrorMessage(err, t.importRestoreFailedError, lang, t));
      }
    } finally {
      onImportingChange(false);
    }
  };

  return (
    <section aria-label={t.dataAndBackupTitle} className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-xs font-semibold text-[var(--text-muted)]">
          {t.dataAndBackupTitle}
        </h3>
        <span className="font-mono-tabular text-xs text-[var(--text-muted)]">
          {totalTodoCount} {t.localRecordsBadge}
        </span>
      </div>

      {importError && (
        <div
          role="alert"
          className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-600 dark:text-red-400"
        >
          {importError}
        </div>
      )}

      {pendingImport && (
        <div
          role="alertdialog"
          aria-label={t.backupRestoreTitle}
          className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3.5 space-y-2.5"
        >
          <p className="text-xs leading-relaxed text-[var(--text-primary)]">
            <strong>{pendingImport.fileName}</strong> ({pendingImport.summary})
          </p>
          <div className="flex items-center justify-end gap-1.5">
            <button
              type="button"
              disabled={isImporting}
              onClick={() => onPendingImportChange(null)}
              className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] disabled:opacity-40"
            >
              {t.cancelButton}
            </button>
            <button
              type="button"
              disabled={isImporting}
              onClick={() => void handleConfirmImport()}
              className="rounded-lg px-3 py-1 text-xs font-medium transition-opacity disabled:opacity-40"
              style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-fg)' }}
            >
              {isImporting ? t.restoringButton : t.overwriteAndRestore}
            </button>
          </div>
        </div>
      )}

      <div className="divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
        {/* JSON Backup & Restore */}
        <div className="flex flex-wrap items-center justify-between gap-4 px-4 py-3.5">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-[var(--text-primary)]">{t.backupRestoreTitle}</p>
            <p className="text-xs text-[var(--text-muted)]">{t.backupRestoreDesc}</p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              onChange={(e) => void handleFileChange(e)}
              aria-label={t.restoreButton}
              className="hidden"
            />
            <button
              type="button"
              disabled={isImporting}
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--canvas)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)] disabled:opacity-40 transition-colors whitespace-nowrap"
            >
              <Upload className="h-3.5 w-3.5" />
              <span>{isImporting ? t.restoringButton : t.restoreButton}</span>
            </button>
            <button
              type="button"
              disabled={isExportingBackup}
              data-testid="download-backup-link"
              onClick={() => void handleDownloadBackup()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--canvas)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)] disabled:opacity-40 transition-colors whitespace-nowrap"
            >
              {backupDownloaded ? (
                <Check className="h-3.5 w-3.5 text-emerald-500" />
              ) : isExportingBackup ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin text-[var(--accent)]" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
              <span>{t.downloadBackupButton}</span>
            </button>
          </div>
        </div>

        {/* Zero-Cost Multi-Cloud Folder Sync (OneDrive, Google Drive, iCloud Drive, Dropbox, Custom) */}
        <div data-testid="onedrive-sync-card" className="px-4 py-4 space-y-3.5">
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Cloud className="h-4 w-4 text-[var(--accent)] shrink-0" />
                <p className="text-sm font-medium text-[var(--text-primary)] truncate">
                  {t.cloudSyncSectionTitle}
                </p>
              </div>
              {oneDriveStatus?.connected && (
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="inline-flex items-center gap-1 rounded-md border border-[var(--accent)]/40 bg-[var(--accent-soft)] px-2 py-0.5 text-[11px] font-medium text-[var(--accent)] whitespace-nowrap">
                    <Check className="h-3 w-3 shrink-0" />
                    <span>{t.enabledBadge}</span>
                  </span>
                  <button
                    type="button"
                    disabled={isOneDriveBusy}
                    onClick={() => void handleOneDriveDisconnect()}
                    className="inline-flex items-center rounded-md border border-[var(--border)] bg-[var(--canvas)] px-2 py-0.5 text-[11px] font-medium text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] disabled:opacity-40 transition-colors whitespace-nowrap"
                  >
                    {t.onedriveDisconnectButton}
                  </button>
                </div>
              )}
            </div>
            <p className="text-xs leading-relaxed text-[var(--text-muted)]">
              {t.cloudSyncSectionDesc}
            </p>
          </div>

          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--text-muted)]">
              {t.cloudSyncProvidersTitle}
            </p>
            <div className="grid grid-cols-2 gap-2" data-testid="cloud-providers-grid">
              {cloudProviders.map((provider) => {
                const isActive =
                  Boolean(oneDriveStatus?.connected) &&
                  oneDriveStatus?.activeProvider === provider.id;
                return (
                  <button
                    key={provider.id}
                    type="button"
                    data-testid={`cloud-provider-${provider.id}`}
                    disabled={isOneDriveBusy}
                    onClick={() => void handleSelectCloudProvider(provider)}
                    className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left transition-colors disabled:opacity-45 ${
                      isActive
                        ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text-primary)]'
                        : 'border-[var(--border)] bg-[var(--canvas)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]'
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
                      <Check className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />
                    ) : provider.detected ? (
                      <span
                        aria-hidden="true"
                        className="h-2 w-2 shrink-0 rounded-full bg-emerald-500"
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
            <div className="space-y-0.5 rounded-lg border border-[var(--border)] bg-[var(--canvas)] px-3 py-2">
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
                  {oneDriveStatus.hasRemoteBackup &&
                  typeof oneDriveStatus.remoteTodoCount === 'number'
                    ? ` · ${oneDriveStatus.remoteTodoCount} ${t.tasksTitle.toLowerCase()}`
                    : ''}
                </p>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
            <button
              type="button"
              disabled={isOneDriveBusy}
              onClick={() => void handleOneDriveConnectOrSync()}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-opacity disabled:opacity-40 whitespace-nowrap shrink-0"
              style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-fg)' }}
            >
              <RefreshCw
                className={`h-3.5 w-3.5 shrink-0 ${isOneDriveBusy ? 'animate-spin' : ''}`}
              />
              <span>
                {oneDriveStatus?.connected ? t.onedriveSyncNowButton : t.onedriveConnectButton}
              </span>
            </button>

            <button
              type="button"
              disabled={isOneDriveBusy || !oneDriveStatus?.hasRemoteBackup}
              onClick={() => void handleOneDriveRestore()}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--canvas)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)] disabled:opacity-40 transition-colors whitespace-nowrap shrink-0"
            >
              <Upload className="h-3.5 w-3.5 shrink-0" />
              <span>{t.onedriveRestoreButton}</span>
            </button>

            <button
              type="button"
              data-testid="onedrive-pick-folder-btn"
              disabled={isOneDriveBusy}
              onClick={() => void handleOneDrivePickFolder()}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--canvas)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)] disabled:opacity-40 transition-colors whitespace-nowrap shrink-0"
            >
              <FolderOpen className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />
              <span>{t.cloudPickFolderButton}</span>
            </button>

            <button
              type="button"
              onClick={() => void api.openOneDriveFolder(oneDriveStatus?.folderPath).catch(() => {})}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--canvas)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors whitespace-nowrap shrink-0"
            >
              <FolderOpen className="h-3.5 w-3.5 shrink-0" />
              <span>{t.onedriveOpenFolderButton}</span>
            </button>
          </div>

          {oneDriveStatus?.connected && (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--canvas)] px-3 py-2">
              <span className="text-xs font-medium text-[var(--text-secondary)]">
                {t.onedriveAutoSyncTitle}
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={oneDriveStatus.autoSync}
                disabled={isOneDriveBusy}
                onClick={() => void handleOneDriveToggleAutoSync()}
                className={`inline-flex items-center rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors shrink-0 ${
                  oneDriveStatus.autoSync
                    ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text-primary)]'
                    : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              >
                {oneDriveStatus.autoSync ? t.enabledBadge : t.disabledBadge}
              </button>
            </div>
          )}
        </div>

        {/* Move Completed to Trash */}
        <div className="flex items-center justify-between gap-4 px-4 py-3.5">
          <div className="min-w-0">
            <p className="text-sm font-medium text-[var(--text-primary)]">
              {t.moveCompletedToTrashTitle}
            </p>
            <p className="text-xs text-[var(--text-muted)]">
              {completedTodoCount > 0
                ? `${completedTodoCount} ${t.completedCountLabel}`
                : t.moveCompletedToTrashEmptyDesc}
            </p>
          </div>
          <button
            type="button"
            disabled={completedTodoCount === 0 || isClearingCompleted}
            onClick={async () => {
              if (isClearingCompleted) return;
              setIsClearingCompleted(true);
              try {
                await onClearAllCompleted();
              } finally {
                if (isMountedRef.current) setIsClearingCompleted(false);
              }
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--canvas)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)] disabled:opacity-40 transition-colors whitespace-nowrap shrink-0"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>{isClearingCompleted ? t.movingButton : t.moveButton}</span>
          </button>
        </div>
      </div>
    </section>
  );
});
