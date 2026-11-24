import {
  Check,
  Download,
  FolderOpen,
  HardDrive,
  History,
  Lock,
  RefreshCw,
  RotateCcw,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../api/client';
import { useI18n } from '../../i18n/I18nContext';
import { localizeErrorMessage } from '../../i18n/translations';
import type {
  BootstrapPayload,
  CloudBackupFileEntry,
  DetectedCloudProvider,
  OneDriveStatus,
  SystemInfoPayload,
} from '../../types';
import {
  decryptBackupPayload,
  type EncryptedBackupEnvelope,
  encryptBackupPayload,
  isEncryptedBackupEnvelope,
  parseCsvToBackupPayload,
  parseIcsToBackupPayload,
} from '../../utils/exportFormats';
import { formatByteSize as formatBytes } from '../../utils/formatBytes';
import { CloudSyncCard } from './data/CloudSyncCard';
import { ResetDataSection } from './data/ResetDataSection';

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
  onResetAllData?: (resetSettings: boolean) => Promise<void>;
  onNotifyCloudSync?: (payload: {
    title: string;
    body?: string;
    variant?: 'info' | 'error';
  }) => void;
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
  onResetAllData,
  onNotifyCloudSync,
  formatTimestamp,
}: DataBackupSettingsTabProps) {
  const { lang, meta, t } = useI18n();
  const [isOneDriveBusy, setIsOneDriveBusy] = useState(false);
  const [isExportingBackup, setIsExportingBackup] = useState(false);
  const [backupDownloaded, setBackupDownloaded] = useState(false);
  const [isClearingCompleted, setIsClearingCompleted] = useState(false);
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);
  const [resetIncludeSettings, setResetIncludeSettings] = useState(false);
  const [isResettingData, setIsResettingData] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [sysInfo, setSysInfo] = useState<SystemInfoPayload | null>(null);
  const [cloudSnapshots, setCloudSnapshots] = useState<CloudBackupFileEntry[]>([]);
  const [restoringFileName, setRestoringFileName] = useState<string | null>(null);
  const [encryptOpen, setEncryptOpen] = useState(false);
  const [encryptPassphrase, setEncryptPassphrase] = useState('');
  const [pendingEncrypted, setPendingEncrypted] = useState<{
    fileName: string;
    envelope: EncryptedBackupEnvelope;
  } | null>(null);
  const [decryptPassphrase, setDecryptPassphrase] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const isMountedRef = useRef(true);
  const backupBadgeTimerRef = useRef<number | null>(null);
  const revokeUrlTimerRef = useRef<number | null>(null);
  const activeObjectUrlRef = useRef<string | null>(null);

  const hasDesktopBridge =
    typeof window !== 'undefined' && Boolean(window.agendameaWindow?.openDataFolder);

  const syncVersionKey = oneDriveStatus?.lastSyncedAt ?? '';

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (backupBadgeTimerRef.current !== null) {
        window.clearTimeout(backupBadgeTimerRef.current);
        backupBadgeTimerRef.current = null;
      }
      if (revokeUrlTimerRef.current !== null) {
        window.clearTimeout(revokeUrlTimerRef.current);
        revokeUrlTimerRef.current = null;
      }
      if (activeObjectUrlRef.current) {
        try {
          URL.revokeObjectURL(activeObjectUrlRef.current);
        } catch {
          // Ignore revoke error
        }
        activeObjectUrlRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    let active = true;
    const _marker = syncVersionKey;
    void _marker;
    void api
      .getSystemInfo()
      .then((info) => {
        if (active && isMountedRef.current) setSysInfo(info);
      })
      .catch(() => {
        /* ignore */
      });
    void api
      .listCloudBackups()
      .then((res) => {
        if (active && isMountedRef.current && Array.isArray(res?.backups)) {
          setCloudSnapshots(res.backups);
        }
      })
      .catch(() => {
        /* ignore */
      });
    return () => {
      active = false;
    };
  }, [syncVersionKey]);

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

  const triggerBlobDownload = (blob: Blob, fileName: string) => {
    if (revokeUrlTimerRef.current !== null) {
      window.clearTimeout(revokeUrlTimerRef.current);
      revokeUrlTimerRef.current = null;
    }
    if (activeObjectUrlRef.current) {
      try {
        URL.revokeObjectURL(activeObjectUrlRef.current);
      } catch {
        // Ignore revoke error
      }
      activeObjectUrlRef.current = null;
    }
    const objectUrl = URL.createObjectURL(blob);
    activeObjectUrlRef.current = objectUrl;
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    revokeUrlTimerRef.current = window.setTimeout(() => {
      revokeUrlTimerRef.current = null;
      if (activeObjectUrlRef.current === objectUrl) {
        activeObjectUrlRef.current = null;
      }
      URL.revokeObjectURL(objectUrl);
    }, 1000);
    if (isMountedRef.current) {
      if (backupBadgeTimerRef.current !== null) {
        window.clearTimeout(backupBadgeTimerRef.current);
      }
      setBackupDownloaded(true);
      backupBadgeTimerRef.current = window.setTimeout(() => {
        backupBadgeTimerRef.current = null;
        if (isMountedRef.current) setBackupDownloaded(false);
      }, 3000);
    }
  };

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
    if (!oneDriveStatus?.connected) {
      const firstDetected = cloudProviders.find((p) => p.detected);
      if (!firstDetected && window.agendameaWindow?.pickCloudSyncFolder) {
        await handleOneDrivePickFolder();
        return;
      }
    }
    setIsOneDriveBusy(true);
    setImportError(null);
    try {
      const next = oneDriveStatus?.connected
        ? await api.syncOneDrivePush()
        : await api.connectOneDrive({ autoSync: true });
      if (isMountedRef.current) onOneDriveStatusChange(next);
      await applyRestoredIfPresent(next.restoredBootstrap);
      onNotifyCloudSync?.({ title: t.onedriveSyncedToast });
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
      onNotifyCloudSync?.({ title: t.onedriveSyncedToast });
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
      onNotifyCloudSync?.({ title: t.onedriveSyncedToast });
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
      onNotifyCloudSync?.({ title: t.onedriveSyncedToast });
    } catch (err) {
      if (isMountedRef.current) {
        setImportError(localizeErrorMessage(err, t.importRestoreFailedError, lang, t));
      }
    } finally {
      if (isMountedRef.current) setIsOneDriveBusy(false);
    }
  };

  const handleRestoreSpecificSnapshot = async (fileName: string) => {
    if (restoringFileName) return;
    setRestoringFileName(fileName);
    setImportError(null);
    try {
      const { status, bootstrap } = await api.restoreCloudBackupFile(fileName);
      if (isMountedRef.current) onOneDriveStatusChange(status);
      await applyRestoredIfPresent(bootstrap);
      onNotifyCloudSync?.({ title: t.onedriveSyncedToast });
    } catch (err) {
      if (isMountedRef.current) {
        setImportError(localizeErrorMessage(err, t.importRestoreFailedError, lang, t));
      }
    } finally {
      if (isMountedRef.current) setRestoringFileName(null);
    }
  };

  const handleOneDriveToggleAutoSync = async () => {
    if (isOneDriveBusy || !oneDriveStatus) return;
    setIsOneDriveBusy(true);
    setImportError(null);
    try {
      await api.updateSettings({ onedriveAutoSync: !oneDriveStatus.autoSync });
      const refreshed = await api.getOneDriveStatus();
      if (isMountedRef.current) onOneDriveStatusChange(refreshed);
    } catch (err) {
      if (isMountedRef.current) {
        setImportError(localizeErrorMessage(err, t.operationFailedToast, lang, t));
      }
    } finally {
      if (isMountedRef.current) setIsOneDriveBusy(false);
    }
  };

  const handleOneDriveDisconnect = async () => {
    if (isOneDriveBusy) return;
    setIsOneDriveBusy(true);
    setImportError(null);
    try {
      const next = await api.disconnectOneDrive();
      if (isMountedRef.current) onOneDriveStatusChange(next);
    } catch (err) {
      if (isMountedRef.current) {
        setImportError(localizeErrorMessage(err, t.operationFailedToast, lang, t));
      }
    } finally {
      if (isMountedRef.current) setIsOneDriveBusy(false);
    }
  };

  const handleDownloadExport = async (format: 'json' | 'csv' | 'md' | 'ics') => {
    if (isExportingBackup) return;
    setIsExportingBackup(true);
    setImportError(null);
    try {
      const { blob, fileName } = await api.exportBackupBlob(format, lang);
      if (!isMountedRef.current) return;
      triggerBlobDownload(blob, fileName);
    } catch (err) {
      if (isMountedRef.current) {
        setImportError(localizeErrorMessage(err, t.operationFailedToast, lang, t));
      }
    } finally {
      if (isMountedRef.current) setIsExportingBackup(false);
    }
  };

  const handleDownloadEncryptedBackup = async () => {
    if (isExportingBackup) return;
    if (encryptPassphrase.length < 4) {
      setImportError(t.dataEncryptPassphraseShortError);
      return;
    }
    setIsExportingBackup(true);
    setImportError(null);
    try {
      const jsonText = await api.exportBackupText('json', lang);
      const parsed = JSON.parse(jsonText) as Record<string, unknown>;
      const envelope = await encryptBackupPayload(parsed, encryptPassphrase);
      const blob = new Blob([JSON.stringify(envelope, null, 2)], {
        type: 'application/json;charset=utf-8',
      });
      triggerBlobDownload(
        blob,
        `agendamea-encrypted-${new Date().toISOString().slice(0, 10)}.agenc`,
      );
      setEncryptPassphrase('');
      setEncryptOpen(false);
    } catch (err) {
      if (isMountedRef.current) {
        setImportError(localizeErrorMessage(err, t.operationFailedToast, lang, t));
      }
    } finally {
      if (isMountedRef.current) setIsExportingBackup(false);
    }
  };

  const prepareImportPreview = (fileName: string, record: Record<string, unknown>) => {
    const todoCount = Array.isArray(record.todos) ? record.todos.length : 0;
    const catCount = Array.isArray(record.categories) ? record.categories.length : 0;
    const trashCountInFile =
      (Array.isArray(record.trashedTodos) ? record.trashedTodos.length : 0) +
      (Array.isArray(record.trashedCategories) ? record.trashedCategories.length : 0);
    const summaryParts = [
      `${todoCount} ${t.tasksTitle.toLocaleLowerCase(meta.intlLocale)}`,
      `${catCount} ${t.categories.toLocaleLowerCase(meta.intlLocale)}`,
    ];
    if (trashCountInFile > 0) {
      summaryParts.push(`${trashCountInFile} ${t.tabTrash.toLocaleLowerCase(meta.intlLocale)}`);
    }
    onPendingImportChange({
      fileName,
      payload: record,
      summary: summaryParts.join(' · '),
    });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setImportError(null);
    setPendingEncrypted(null);
    onPendingImportChange(null);

    if (file.size > MAX_IMPORT_BYTES) {
      setImportError(t.importSizeExceededError);
      return;
    }

    try {
      const text = await file.text();
      const lowerName = file.name.toLowerCase();

      if (lowerName.endsWith('.csv')) {
        const csvPayload = parseCsvToBackupPayload(text);
        prepareImportPreview(file.name, csvPayload as Record<string, unknown>);
        return;
      }

      if (lowerName.endsWith('.ics') || text.includes('BEGIN:VCALENDAR')) {
        const icsPayload = parseIcsToBackupPayload(text);
        prepareImportPreview(file.name, icsPayload as Record<string, unknown>);
        return;
      }

      const parsed: unknown = JSON.parse(text);
      if (isEncryptedBackupEnvelope(parsed)) {
        setPendingEncrypted({ fileName: file.name, envelope: parsed });
        setDecryptPassphrase('');
        return;
      }
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        setImportError(t.importInvalidBackupError);
        return;
      }
      const record = parsed as Record<string, unknown>;
      const hasValidBackupKeys =
        Array.isArray(record.todos) ||
        Array.isArray(record.categories) ||
        Array.isArray(record.trashedTodos) ||
        Array.isArray(record.trashedCategories) ||
        (Boolean(record.settings) &&
          typeof record.settings === 'object' &&
          !Array.isArray(record.settings));
      if (!hasValidBackupKeys) {
        setImportError(t.importInvalidBackupError);
        return;
      }
      prepareImportPreview(file.name, record);
    } catch {
      setImportError(t.importInvalidBackupError);
    }
  };

  const handleDecryptEncryptedImport = async () => {
    if (!pendingEncrypted) return;
    setImportError(null);
    try {
      const decrypted = await decryptBackupPayload(pendingEncrypted.envelope, decryptPassphrase);
      prepareImportPreview(pendingEncrypted.fileName, decrypted);
      setPendingEncrypted(null);
      setDecryptPassphrase('');
    } catch {
      setImportError(t.dataDecryptFailedError);
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
    <section aria-label={t.dataAndBackupTitle} className="space-y-4">
      {/* Local Storage Footprint Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          <span className="inline-flex items-center gap-1.5 font-medium text-[var(--text-primary)]">
            <HardDrive className="h-3.5 w-3.5 text-[var(--accent)]" />
            <span>
              {totalTodoCount} {t.localRecordsBadge}
            </span>
          </span>
          {sysInfo && (
            <span className="font-mono-tabular text-[11px] text-[var(--text-muted)]">
              SQLite: {formatBytes(sysInfo.dbSizeBytes)} · AI:{' '}
              {formatBytes(sysInfo.modelsDiskBytes)}
            </span>
          )}
        </div>
        {hasDesktopBridge && (
          <button
            type="button"
            data-testid="data-open-folder-btn"
            onClick={() => void window.agendameaWindow?.openDataFolder?.()}
            className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--canvas)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)]"
          >
            <FolderOpen className="h-3 w-3 text-[var(--accent)]" />
            <span>{t.aboutOpenDataFolderButton}</span>
          </button>
        )}
      </div>

      {importError && (
        <div
          role="alert"
          data-testid="data-import-error-banner"
          className="sticky top-2 z-20 flex items-start justify-between gap-2.5 rounded-xl border border-red-500/40 bg-[var(--surface)] px-3.5 py-2.5 text-xs font-medium text-red-600 dark:text-red-400 shadow-md animate-fade-in"
        >
          <span className="min-w-0 flex-1 break-words leading-snug">{importError}</span>
          <button
            type="button"
            onClick={() => setImportError(null)}
            aria-label={t.closeMenu}
            className="shrink-0 rounded-md p-0.5 text-red-600/80 hover:bg-red-500/15 hover:text-red-600 dark:text-red-400/80 dark:hover:text-red-300 transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Encrypted Backup Passphrase Prompt */}
      {pendingEncrypted && (
        <div
          role="dialog"
          aria-label={t.dataEncryptedBackupTitle}
          className="rounded-xl border border-[var(--accent)]/40 bg-[var(--accent-soft)] p-4 space-y-2.5 animate-fade-in"
        >
          <p className="text-xs font-semibold text-[var(--text-primary)]">
            {t.dataDecryptPromptTitle}:{' '}
            <span className="font-mono-tabular">{pendingEncrypted.fileName}</span>
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="password"
              data-testid="data-decrypt-passphrase-input"
              value={decryptPassphrase}
              onChange={(e) => setDecryptPassphrase(e.target.value)}
              placeholder={t.dataEncryptPassphrasePlaceholder}
              className="min-w-[200px] flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs text-[var(--text-primary)] focus:border-[var(--accent)]"
            />
            <button
              type="button"
              onClick={() => setPendingEncrypted(null)}
              className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-secondary)]"
            >
              {t.cancelButton}
            </button>
            <button
              type="button"
              data-testid="data-decrypt-confirm-btn"
              onClick={() => void handleDecryptEncryptedImport()}
              className="rounded-lg px-3 py-1.5 text-xs font-semibold"
              style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-fg)' }}
            >
              {t.dataDecryptUnlockButton}
            </button>
          </div>
        </div>
      )}

      {pendingImport && (
        <div
          role="alertdialog"
          aria-label={t.backupRestoreTitle}
          className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3.5 space-y-2.5 animate-fade-in"
        >
          <p className="text-xs leading-relaxed text-[var(--text-primary)] break-words">
            <strong className="break-all">{pendingImport.fileName}</strong> ({pendingImport.summary}
            )
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
        {/* Multi-Format Export & Universal Import */}
        <div data-setting-id="data-export-import" className="px-4 py-4 space-y-3.5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-[var(--text-primary)]">
                {t.backupRestoreTitle}
              </p>
              <p className="mt-0.5 text-xs text-[var(--text-muted)]">{t.dataMultiFormatDesc}</p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json,.json,.agenc,.csv,.ics,text/csv,text/calendar"
                onChange={(e) => void handleFileChange(e)}
                aria-label={t.restoreButton}
                className="hidden"
              />
              <button
                type="button"
                data-testid="data-universal-import-btn"
                disabled={isImporting}
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--canvas)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)] disabled:opacity-40 transition-colors whitespace-nowrap"
              >
                <Upload className="h-3.5 w-3.5" />
                <span>{isImporting ? t.restoringButton : t.restoreButton}</span>
              </button>
            </div>
          </div>

          {/* Export Format Buttons */}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              disabled={isExportingBackup}
              data-testid="download-backup-link"
              onClick={() => void handleDownloadExport('json')}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--canvas)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)] disabled:opacity-40 transition-colors"
            >
              {backupDownloaded ? (
                <Check className="h-3.5 w-3.5 text-emerald-500" />
              ) : isExportingBackup ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin text-[var(--accent)]" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
              <span>{t.downloadBackupButton} (JSON)</span>
            </button>
            <button
              type="button"
              data-testid="export-csv-btn"
              disabled={isExportingBackup}
              onClick={() => void handleDownloadExport('csv')}
              className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--canvas)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
            >
              <Download className="h-3 w-3" />
              <span>CSV</span>
            </button>
            <button
              type="button"
              data-testid="export-md-btn"
              disabled={isExportingBackup}
              onClick={() => void handleDownloadExport('md')}
              className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--canvas)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
            >
              <Download className="h-3 w-3" />
              <span>Markdown</span>
            </button>
            <button
              type="button"
              data-testid="export-ics-btn"
              disabled={isExportingBackup}
              onClick={() => void handleDownloadExport('ics')}
              className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--canvas)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
            >
              <Download className="h-3 w-3" />
              <span>iCalendar (.ics)</span>
            </button>
            <button
              type="button"
              data-testid="export-encrypted-toggle-btn"
              onClick={() => setEncryptOpen((v) => !v)}
              className="inline-flex items-center gap-1 rounded-lg border border-[var(--accent)]/40 bg-[var(--accent-soft)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:opacity-90"
            >
              <Lock className="h-3 w-3 text-[var(--accent)]" />
              <span>{t.dataEncryptedBackupButton}</span>
            </button>
          </div>

          {encryptOpen && (
            <div className="animate-accordion flex flex-wrap items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--canvas)] p-3">
              <input
                type="password"
                data-testid="data-encrypt-passphrase-input"
                value={encryptPassphrase}
                onChange={(e) => setEncryptPassphrase(e.target.value)}
                placeholder={t.dataEncryptPassphrasePlaceholder}
                className="min-w-[200px] flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-xs text-[var(--text-primary)] focus:border-[var(--accent)]"
              />
              <button
                type="button"
                data-testid="data-encrypt-download-btn"
                disabled={isExportingBackup}
                onClick={() => void handleDownloadEncryptedBackup()}
                className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold"
                style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-fg)' }}
              >
                <Lock className="h-3 w-3" />
                <span>{t.dataEncryptDownloadButton}</span>
              </button>
            </div>
          )}
        </div>

        {/* Multi-Cloud Sync */}
        <div data-setting-id="data-cloud">
          <CloudSyncCard
            oneDriveStatus={oneDriveStatus}
            cloudProviders={cloudProviders}
            isOneDriveBusy={isOneDriveBusy}
            formatTimestamp={formatTimestamp}
            onConnectOrSync={() => void handleOneDriveConnectOrSync()}
            onRestore={() => void handleOneDriveRestore()}
            onPickFolder={() => void handleOneDrivePickFolder()}
            onOpenFolder={() => {
              setImportError(null);
              void api.openOneDriveFolder(oneDriveStatus?.folderPath).catch((err) => {
                const errMsg = localizeErrorMessage(err, t.operationFailedToast, lang, t);
                if (isMountedRef.current) {
                  setImportError(errMsg);
                }
                onNotifyCloudSync?.({
                  title: t.onedriveOpenFolderButton,
                  body: errMsg,
                  variant: 'error',
                });
              });
            }}
            onSelectProvider={(provider) => void handleSelectCloudProvider(provider)}
            onToggleAutoSync={() => void handleOneDriveToggleAutoSync()}
            onDisconnect={() => void handleOneDriveDisconnect()}
          />
        </div>

        {/* Rolling Cloud / Local Backup Snapshot History */}
        {cloudSnapshots.length > 0 && (
          <div className="px-4 py-3.5 space-y-2.5" data-testid="data-snapshot-history">
            <div className="flex items-center gap-2">
              <History className="h-4 w-4 text-[var(--accent)]" />
              <p className="text-xs font-semibold text-[var(--text-primary)]">
                {t.dataSnapshotHistoryTitle} ({cloudSnapshots.length})
              </p>
            </div>
            <div className="max-h-48 divide-y divide-[var(--border)] overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--canvas)]">
              {cloudSnapshots.map((snap) => (
                <div
                  key={snap.fileName}
                  className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs"
                >
                  <div className="min-w-0">
                    <p className="font-mono-tabular font-medium text-[var(--text-primary)] truncate">
                      {snap.fileName}
                    </p>
                    <p className="font-mono-tabular text-[10.5px] text-[var(--text-muted)]">
                      {formatTimestamp(snap.mtimeIso)} · {snap.todoCount} {t.tasksTitle} ·{' '}
                      {formatBytes(snap.sizeBytes)}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={restoringFileName !== null}
                    onClick={() => void handleRestoreSpecificSnapshot(snap.fileName)}
                    className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)] disabled:opacity-40"
                  >
                    <RotateCcw className="h-3 w-3" />
                    <span>
                      {restoringFileName === snap.fileName
                        ? t.restoringButton
                        : t.restoreItemButton}
                    </span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

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

        {/* Clean Start / Reset All Data */}
        {onResetAllData && (
          <div data-setting-id="data-reset">
            <ResetDataSection
              confirmResetOpen={confirmResetOpen}
              resetIncludeSettings={resetIncludeSettings}
              isResettingData={isResettingData}
              isImporting={isImporting}
              onOpenConfirm={() => setConfirmResetOpen(true)}
              onCancelConfirm={() => {
                setConfirmResetOpen(false);
                setResetIncludeSettings(false);
              }}
              onToggleIncludeSettings={setResetIncludeSettings}
              onConfirmReset={() => {
                void (async () => {
                  if (isResettingData) return;
                  setIsResettingData(true);
                  setImportError(null);
                  try {
                    await onResetAllData(resetIncludeSettings);
                    if (isMountedRef.current) {
                      setConfirmResetOpen(false);
                      setResetIncludeSettings(false);
                      const refreshed = await api.getOneDriveStatus().catch(() => null);
                      if (isMountedRef.current && refreshed) {
                        onOneDriveStatusChange(refreshed);
                      }
                    }
                  } catch (err) {
                    if (isMountedRef.current) {
                      setImportError(localizeErrorMessage(err, t.operationFailedToast, lang, t));
                    }
                  } finally {
                    if (isMountedRef.current) setIsResettingData(false);
                  }
                })();
              }}
            />
          </div>
        )}
      </div>
    </section>
  );
});
