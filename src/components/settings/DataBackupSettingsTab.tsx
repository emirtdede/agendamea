import {
  AlertTriangle,
  Check,
  Download,
  FolderOpen,
  HardDrive,
  History,
  Lock,
  RefreshCw,
  RotateCcw,
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
import { InfoTooltip } from '../InfoTooltip';
import { CloudSyncCard } from './data/CloudSyncCard';
import { ResetDataSection } from './data/ResetDataSection';
import { SettingsAdvancedSection } from './SettingsAdvancedSection';

const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

export interface PendingImportState {
  fileName: string;
  payload: unknown;
  summary: string;
}

export interface DataBackupSettingsTabProps {
  totalTodoCount: number;
  completedTodoCount?: number;
  oneDriveStatus: OneDriveStatus | null;
  onOneDriveStatusChange: (next: OneDriveStatus | null) => void;
  isImporting: boolean;
  onImportingChange: (busy: boolean) => void;
  pendingImport: PendingImportState | null;
  onPendingImportChange: (pending: PendingImportState | null) => void;
  onClearAllCompleted?: () => Promise<void>;
  onImportBackup: (payload: unknown) => Promise<void>;
  onApplyRestoredBootstrap?: (restored: BootstrapPayload) => void;
  onResetAllData?: (resetSettings: boolean) => Promise<void>;
  onNotifyCloudSync?: (payload: {
    title: string;
    body?: string;
    variant?: 'info' | 'error';
  }) => void;
  formatTimestamp: (iso: string | null) => string;
  revealSettingId?: string;
}

export const DataBackupSettingsTab = React.memo(function DataBackupSettingsTab({
  totalTodoCount,
  oneDriveStatus,
  onOneDriveStatusChange,
  isImporting,
  onImportingChange,
  pendingImport,
  onPendingImportChange,
  onImportBackup,
  onApplyRestoredBootstrap,
  onResetAllData,
  onNotifyCloudSync,
  formatTimestamp,
  revealSettingId,
}: DataBackupSettingsTabProps) {
  const { lang, meta, t } = useI18n();
  const [isOneDriveBusy, setIsOneDriveBusy] = useState(false);
  const [isExportingBackup, setIsExportingBackup] = useState(false);
  const [backupDownloaded, setBackupDownloaded] = useState(false);
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

  const forceAdvancedOpen =
    revealSettingId === 'data-danger-zone' || revealSettingId === 'data-reset';

  return (
    <section aria-label={t.dataAndBackupTitle} className="space-y-5 pb-4 animate-tab-enter">
      {/* Local Storage Footprint Strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)]/75 px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          <span className="inline-flex items-center gap-1.5 font-medium text-[var(--text-primary)]">
            <HardDrive className="h-3.5 w-3.5 text-[var(--text-muted)]" />
            <span>
              {totalTodoCount} {t.localRecordsBadge}
            </span>
          </span>
          {sysInfo && (
            <span className="font-mono-tabular text-[11px] text-[var(--text-muted)]">
              SQLite · {formatBytes(sysInfo.dbSizeBytes)}
            </span>
          )}
        </div>
        {hasDesktopBridge && (
          <button
            type="button"
            data-testid="data-open-folder-btn"
            onClick={() => void window.agendameaWindow?.openDataFolder?.()}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--text-secondary)] ag-hover-glow hover:text-[var(--text-primary)]"
          >
            <FolderOpen className="h-3.5 w-3.5 text-[var(--text-muted)]" />
            <span>{t.aboutOpenDataFolderButton}</span>
          </button>
        )}
      </div>

      {importError && (
        <div
          role="alert"
          data-testid="data-import-error-banner"
          className="sticky top-2 z-20 flex items-start justify-between gap-2.5 border-s-2 border-red-500/70 bg-[var(--canvas)]/95 ps-3 pe-2 py-2 text-xs font-medium text-red-600 dark:text-red-400 animate-fade-in"
        >
          <span className="min-w-0 flex-1 break-words leading-snug">{importError}</span>
          <button
            type="button"
            onClick={() => setImportError(null)}
            aria-label={t.closeMenu}
            className="shrink-0 p-0.5 text-red-600/80 ag-hover-danger-glow hover:text-red-600 dark:text-red-400/80 dark:hover:text-red-300 transition-colors"
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
          className="border-s-2 border-[var(--text-primary)] ps-4 py-2 space-y-2.5 animate-fade-in"
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
              className="min-w-[200px] flex-1 rounded-lg border border-[var(--border)] bg-transparent px-3 py-1.5 text-xs text-[var(--text-primary)] focus:border-[var(--text-secondary)]"
            />
            <button
              type="button"
              onClick={() => setPendingEncrypted(null)}
              className="px-2.5 py-1.5 text-xs font-medium text-[var(--text-secondary)] ag-hover-glow"
            >
              {t.cancelButton}
            </button>
            <button
              type="button"
              data-testid="data-decrypt-confirm-btn"
              onClick={() => void handleDecryptEncryptedImport()}
              className="rounded-lg px-3 py-1.5 text-xs font-semibold ag-hover-accent-glow"
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
          className="border-s-2 border-amber-500/70 ps-4 py-2 space-y-2.5 animate-fade-in"
        >
          <p className="text-xs leading-relaxed text-[var(--text-primary)] break-words">
            <strong className="break-all">{pendingImport.fileName}</strong> ({pendingImport.summary}
            )
          </p>
          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              disabled={isImporting}
              onClick={() => onPendingImportChange(null)}
              className="text-xs font-medium text-[var(--text-secondary)] ag-hover-glow disabled:opacity-40"
            >
              {t.cancelButton}
            </button>
            <button
              type="button"
              disabled={isImporting}
              onClick={() => void handleConfirmImport()}
              className="rounded-lg px-3 py-1.5 text-xs font-medium transition-opacity ag-hover-accent-glow disabled:opacity-40"
              style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-fg)' }}
            >
              {isImporting ? t.restoringButton : t.overwriteAndRestore}
            </button>
          </div>
        </div>
      )}

      {/* Card 1: Backup & Restore (Primary JSON Export + Universal Restore) */}
      <section
        aria-label={t.backupRestoreTitle}
        data-setting-id="data-export-import"
        className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/75 p-4 sm:p-5 space-y-4"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-1">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
              {t.backupRestoreTitle}
            </h3>
            <p className="text-xs leading-relaxed text-[var(--text-muted)]">
              {t.dataMultiFormatDesc}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
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
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-subtle)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] ag-hover-card-glow disabled:opacity-40 transition whitespace-nowrap"
            >
              <Upload className="h-3.5 w-3.5 text-[var(--text-muted)]" />
              <span>{isImporting ? t.restoringButton : t.restoreButton}</span>
            </button>
          </div>
        </div>

        {/* Primary Export Button */}
        <div className="flex flex-wrap items-center gap-3 pt-0.5">
          <button
            type="button"
            disabled={isExportingBackup}
            data-testid="download-backup-link"
            onClick={() => void handleDownloadExport('json')}
            className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold ag-hover-accent-glow disabled:opacity-40 transition"
            style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-fg)' }}
          >
            {backupDownloaded ? (
              <Check className="h-3.5 w-3.5" />
            ) : isExportingBackup ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            <span>{t.downloadBackupButton} (JSON)</span>
          </button>
        </div>
      </section>

      {/* Card 2: Multi-Cloud Sync & Snapshot History */}
      <section
        aria-label={t.cloudSyncSectionTitle}
        data-setting-id="data-cloud"
        className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/75 p-4 sm:p-5 space-y-5"
      >
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

        {/* Rolling Cloud / Local Backup Snapshot History */}
        {cloudSnapshots.length > 0 && (
          <div
            className="border-t border-[var(--border)]/70 pt-4 space-y-2.5"
            data-testid="data-snapshot-history"
          >
            <div className="flex items-center gap-2">
              <History className="h-3.5 w-3.5 text-[var(--text-muted)]" />
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                {t.dataSnapshotHistoryTitle} ({cloudSnapshots.length})
              </p>
            </div>
            <div className="max-h-48 divide-y divide-[var(--border)]/60 overflow-y-auto border-y border-[var(--border)]/70">
              {cloudSnapshots.map((snap) => (
                <div
                  key={snap.fileName}
                  className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-xs"
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
                    className="inline-flex items-center gap-1 text-xs font-medium text-[var(--text-secondary)] ag-hover-glow hover:text-[var(--text-primary)] disabled:opacity-40"
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
      </section>

      {/* Advanced Data Options: CSV/MD/ICS/AES-256 Encrypted Backup & Danger Zone */}
      <SettingsAdvancedSection
        forceOpen={forceAdvancedOpen}
        testId="data-advanced-section"
        toggleTestId="data-advanced-toggle"
      >
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/75 p-4 sm:p-5 space-y-3">
          <div className="flex items-center gap-1.5">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
              {t.dataExportMoreLabel}
            </h3>
            <InfoTooltip text={t.dataEncryptedTooltip} testId="data-encrypted-info" />
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              data-testid="export-csv-btn"
              disabled={isExportingBackup}
              onClick={() => void handleDownloadExport('csv')}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-subtle)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] ag-hover-card-glow"
            >
              <Download className="h-3.5 w-3.5 text-[var(--text-muted)]" />
              <span>CSV</span>
            </button>
            <button
              type="button"
              data-testid="export-md-btn"
              disabled={isExportingBackup}
              onClick={() => void handleDownloadExport('md')}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-subtle)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] ag-hover-card-glow"
            >
              <Download className="h-3.5 w-3.5 text-[var(--text-muted)]" />
              <span>Markdown</span>
            </button>
            <button
              type="button"
              data-testid="export-ics-btn"
              disabled={isExportingBackup}
              onClick={() => void handleDownloadExport('ics')}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-subtle)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] ag-hover-card-glow"
            >
              <Download className="h-3.5 w-3.5 text-[var(--text-muted)]" />
              <span>iCalendar (.ics)</span>
            </button>
            <button
              type="button"
              data-testid="export-encrypted-toggle-btn"
              onClick={() => setEncryptOpen((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-subtle)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] ag-hover-card-glow"
            >
              <Lock className="h-3.5 w-3.5 text-[var(--text-muted)]" />
              <span>{t.dataEncryptedBackupButton}</span>
            </button>
          </div>

          {encryptOpen && (
            <div className="animate-accordion flex flex-wrap items-center gap-2 border-t border-[var(--border)]/60 pt-3">
              <input
                type="password"
                data-testid="data-encrypt-passphrase-input"
                value={encryptPassphrase}
                onChange={(e) => setEncryptPassphrase(e.target.value)}
                placeholder={t.dataEncryptPassphrasePlaceholder}
                className="min-w-[200px] flex-1 rounded-lg border border-[var(--border)] bg-transparent px-3 py-1.5 text-xs text-[var(--text-primary)] focus:border-[var(--text-secondary)]"
              />
              <button
                type="button"
                data-testid="data-encrypt-download-btn"
                disabled={isExportingBackup}
                onClick={() => void handleDownloadEncryptedBackup()}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold ag-hover-accent-glow"
                style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-fg)' }}
              >
                <Lock className="h-3 w-3" />
                <span>{t.dataEncryptDownloadButton}</span>
              </button>
            </div>
          )}
        </div>

        {/* Section 3: Danger Zone Card */}
        {onResetAllData && (
          <section
            aria-label={t.dataDangerZoneTitle}
            data-setting-id="data-danger-zone"
            data-testid="data-danger-zone-card"
            className="rounded-xl border border-red-500/30 bg-[var(--surface)]/75 p-4 sm:p-5 space-y-3"
          >
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-3.5 w-3.5 text-red-600 dark:text-red-400 shrink-0" />
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-red-600 dark:text-red-400">
                {t.dataDangerZoneTitle}
              </h3>
            </div>
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
          </section>
        )}
      </SettingsAdvancedSection>
    </section>
  );
});
