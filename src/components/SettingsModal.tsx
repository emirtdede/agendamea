import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowDownToLine,
  Check,
  ChevronRight,
  Cloud,
  Contrast,
  Download,
  FileText,
  FolderOpen,
  Keyboard,
  Lock,
  Minus,
  Moon,
  Plus,
  Power,
  RefreshCw,
  RotateCcw,
  Scale,
  Shield,
  Sparkles,
  Sun,
  Trash2,
  Unlock,
  Upload,
  X,
  ZoomIn,
} from 'lucide-react';
import { api } from '../api/client';
import { useI18n } from '../i18n/I18nContext';
import { localizeErrorMessage, type LegalDocId } from '../i18n/translations';
import type {
  AppIconId,
  BootstrapPayload,
  Category,
  CloseBehavior,
  OneDriveStatus,
  ThemeId,
  ThemeMode,
  Todo,
  UpdateCheckResult,
} from '../types';
import {
  COLOR_THEMES,
  normalizeHexColor,
  resolveAppIconColors,
  ZOOM_PRESETS,
} from '../utils/themes';
import { BrandMark } from './BrandMark';
import { ColorDot } from './ColorDot';
import { LegalDocumentView } from './LegalDocumentView';
import { UpdateAndLanguageSection } from './UpdateSettingsSection';
import { VelliumLogo } from './VelliumLogo';

interface SettingsModalProps {
  onClose: () => void;
  themeMode: ThemeMode;
  themeId: ThemeId;
  customThemeColor: string;
  appIconId: AppIconId;
  customIconColor: string;
  zoomPercent: number;
  highContrast: boolean;
  reducedMotion: boolean;
  closeBehavior: CloseBehavior;
  dragLocked: boolean;
  onChangeMode: (mode: ThemeMode) => void;
  onChangeTheme: (id: ThemeId) => void;
  onChangeCustomThemeColor: (hex: string) => void;
  onChangeAppIcon: (id: AppIconId) => void;
  onChangeCustomIconColor: (hex: string) => void;
  onChangeZoomPercent: (zoom: number) => void;
  onToggleHighContrast: (enabled: boolean) => void;
  onToggleReducedMotion: (enabled: boolean) => void;
  onChangeCloseBehavior: (behavior: CloseBehavior) => void;
  onToggleDragLock: (locked: boolean) => void;
  autoUpdateCheck: boolean;
  onToggleAutoUpdateCheck: (enabled: boolean) => void;
  updateState: {
    status: 'idle' | 'checking' | 'up-to-date' | 'available' | 'downloading' | 'error';
    result: UpdateCheckResult | null;
    downloadPercent: number | null;
  };
  onCheckForUpdates: () => Promise<void>;
  onDownloadAndInstall: () => Promise<void>;
  totalTodoCount: number;
  completedTodoCount: number;
  onClearAllCompleted: () => Promise<void>;
  onImportBackup: (payload: unknown) => Promise<void>;
  onApplyRestoredBootstrap?: (restored: BootstrapPayload) => void;
  trashedCategories: Category[];
  trashedTodos: Todo[];
  onRestoreTodo: (id: string) => Promise<void>;
  onPermanentDeleteTodo: (id: string) => Promise<void>;
  onRestoreCategory: (id: string) => Promise<void>;
  onPermanentDeleteCategory: (id: string) => Promise<void>;
  onEmptyTrash: () => Promise<void>;
  onOpenWelcomeGuide?: () => void;
}

const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

function formatDeletedAt(iso: string | null, intlLocale: string): string {
  if (!iso) return '';
  try {
    const dt = new Date(iso);
    if (Number.isNaN(dt.getTime())) return '';
    return new Intl.DateTimeFormat(intlLocale, {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(dt);
  } catch {
    return '';
  }
}

export function SettingsModal({
  onClose,
  themeMode,
  themeId,
  customThemeColor,
  appIconId,
  customIconColor,
  zoomPercent,
  highContrast,
  reducedMotion,
  closeBehavior,
  dragLocked,
  onChangeMode,
  onChangeTheme,
  onChangeCustomThemeColor,
  onChangeAppIcon,
  onChangeCustomIconColor,
  onChangeZoomPercent,
  onToggleHighContrast,
  onToggleReducedMotion,
  onChangeCloseBehavior,
  onToggleDragLock,
  autoUpdateCheck,
  onToggleAutoUpdateCheck,
  updateState,
  onCheckForUpdates,
  onDownloadAndInstall,
  totalTodoCount,
  completedTodoCount,
  onClearAllCompleted,
  onImportBackup,
  onApplyRestoredBootstrap,
  trashedCategories,
  trashedTodos,
  onRestoreTodo,
  onPermanentDeleteTodo,
  onRestoreCategory,
  onPermanentDeleteCategory,
  onEmptyTrash,
  onOpenWelcomeGuide,
}: SettingsModalProps) {
  const { lang, t, meta, getThemeDisplayName, legalDocs } = useI18n();
  const [activeTab, setActiveTab] = useState<'general' | 'trash'>('general');
  const [activeLegalDoc, setActiveLegalDoc] = useState<LegalDocId | null>(null);
  const [confirmEmptyTrash, setConfirmEmptyTrash] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isClearingCompleted, setIsClearingCompleted] = useState(false);
  const [isEmptyingTrash, setIsEmptyingTrash] = useState(false);
  const [busyTrashIds, setBusyTrashIds] = useState<Set<string>>(() => new Set());
  const [importError, setImportError] = useState<string | null>(null);
  const [customThemeDraft, setCustomThemeDraft] = useState(customThemeColor);
  const [customIconDraft, setCustomIconDraft] = useState(customIconColor);

  useEffect(() => {
    setCustomThemeDraft(customThemeColor);
  }, [customThemeColor]);

  useEffect(() => {
    setCustomIconDraft(customIconColor);
  }, [customIconColor]);

  const [oneDriveStatus, setOneDriveStatus] = useState<OneDriveStatus | null>(null);
  const [isOneDriveBusy, setIsOneDriveBusy] = useState(false);
  const [isExportingBackup, setIsExportingBackup] = useState(false);
  const [backupDownloaded, setBackupDownloaded] = useState(false);
  const [pendingImport, setPendingImport] = useState<{
    fileName: string;
    payload: unknown;
    summary: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    void api
      .getOneDriveStatus()
      .then((st) => {
        if (isMountedRef.current) setOneDriveStatus(st);
      })
      .catch(() => {});
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const handleOneDriveConnectOrSync = async () => {
    if (isOneDriveBusy) return;
    setIsOneDriveBusy(true);
    setImportError(null);
    try {
      const next = oneDriveStatus?.connected
        ? await api.syncOneDrivePush()
        : await api.connectOneDrive({ autoSync: true });
      if (isMountedRef.current) setOneDriveStatus(next);
      if (next.restoredBootstrap) {
        if (onApplyRestoredBootstrap) {
          onApplyRestoredBootstrap(next.restoredBootstrap);
        } else {
          await onImportBackup(next.restoredBootstrap);
        }
      }
    } catch (err) {
      if (isMountedRef.current) {
        setImportError(
          localizeErrorMessage(err, t.operationFailedToast, lang, t),
        );
      }
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
      if (!res.ok) {
        throw new Error(t.operationFailedToast);
      }
      const blob = await res.blob();
      const disp = res.headers.get('content-disposition') ?? '';
      const match = /filename="([^"]+)"/i.exec(disp);
      const fileName = match?.[1] || `agendamea-backup-${new Date().toISOString().slice(0, 10)}.json`;
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

  const handleOneDriveOpenFolder = async () => {
    try {
      await api.openOneDriveFolder(oneDriveStatus?.folderPath);
    } catch {
      // Ignore folder open errors
    }
  };

  const handleOneDriveRestore = async () => {
    if (isOneDriveBusy) return;
    setIsOneDriveBusy(true);
    setImportError(null);
    try {
      const { status, bootstrap } = await api.syncOneDrivePull();
      if (isMountedRef.current) setOneDriveStatus(status);
      if (onApplyRestoredBootstrap) {
        onApplyRestoredBootstrap(bootstrap);
      } else {
        await onImportBackup(bootstrap);
      }
    } catch (err) {
      if (isMountedRef.current) {
        setImportError(
          localizeErrorMessage(err, t.importRestoreFailedError, lang, t),
        );
      }
    } finally {
      if (isMountedRef.current) setIsOneDriveBusy(false);
    }
  };

  const handleOneDriveToggleAutoSync = async () => {
    if (isOneDriveBusy || !oneDriveStatus) return;
    setIsOneDriveBusy(true);
    try {
      const nextAuto = !oneDriveStatus.autoSync;
      await api.updateSettings({ onedriveAutoSync: nextAuto });
      const refreshed = await api.getOneDriveStatus();
      if (isMountedRef.current) setOneDriveStatus(refreshed);
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
      if (isMountedRef.current) setOneDriveStatus(next);
    } catch {
      // Ignore disconnect error
    } finally {
      if (isMountedRef.current) setIsOneDriveBusy(false);
    }
  };

  useEffect(() => {
    if (activeLegalDoc && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  }, [activeLegalDoc]);

  const trashCount = trashedCategories.length + trashedTodos.length;

  const runTrashItemOp = useCallback(
    async (key: string, op: () => Promise<void>) => {
      setBusyTrashIds((prev) => {
        if (prev.has(key)) return prev;
        const next = new Set(prev);
        next.add(key);
        return next;
      });
      try {
        await op();
      } finally {
        if (isMountedRef.current) {
          setBusyTrashIds((prev) => {
            if (!prev.has(key)) return prev;
            const next = new Set(prev);
            next.delete(key);
            return next;
          });
        }
      }
    },
    [],
  );

  const safeClose = useCallback(() => {
    if (isImporting) return;
    onClose();
  }, [isImporting, onClose]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      if (isImporting) return;
      if (activeLegalDoc) {
        setActiveLegalDoc(null);
        return;
      }
      if (pendingImport) {
        setPendingImport(null);
        return;
      }
      onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isImporting, activeLegalDoc, pendingImport, onClose]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setImportError(null);
    setPendingImport(null);

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
      setPendingImport({
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
    setIsImporting(true);
    try {
      await onImportBackup(pendingImport.payload);
      setPendingImport(null);
    } catch (err) {
      setImportError(
        localizeErrorMessage(err, t.importRestoreFailedError, lang, t),
      );
    } finally {
      setIsImporting(false);
    }
  };

  const shortcuts = [
    { keys: 'N', label: t.shortcutNewTask },
    { keys: '/ · Ctrl+K', label: t.shortcutSearch },
    { keys: 'Alt + ↑ / ↓', label: t.shortcutReorder },
    { keys: 'Esc', label: t.shortcutEscape },
  ];

  const legalItems: Array<{ id: LegalDocId; title: string; Icon: typeof Shield }> = [
    { id: 'privacy', title: t.legalPrivacyTitle, Icon: Shield },
    { id: 'terms', title: t.legalTermsTitle, Icon: Scale },
    { id: 'gdpr', title: t.legalKvkkGdprTitle, Icon: FileText },
    { id: 'opensource', title: t.legalOpenSourceTitle, Icon: FileText },
    { id: 'accessibility', title: t.legalAccessibilityTitle, Icon: Shield },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-modal-title"
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-label={t.closeMenu}
        disabled={isImporting}
        onClick={safeClose}
        className="fixed inset-0 bg-black/45 backdrop-blur-[2px]"
      />

      {/* Dialog Surface */}
      <div className="relative z-10 flex max-h-[88vh] w-full max-w-[580px] flex-col overflow-hidden rounded-2xl border border-[var(--border-strong)] bg-[var(--surface)] shadow-2xl">
        {/* Header */}
        <div className="border-b border-[var(--border)] px-5 pt-4 pb-3 sm:px-6 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2
                id="settings-modal-title"
                className="font-display text-base font-bold tracking-tight text-[var(--text-primary)]"
              >
                {activeLegalDoc ? legalDocs[activeLegalDoc].title : t.settings}
              </h2>
              <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                {activeLegalDoc ? legalDocs[activeLegalDoc].subtitle : t.settingsSubtitle}
              </p>
            </div>
            <button
              type="button"
              disabled={isImporting}
              onClick={safeClose}
              aria-label={t.closeMenu}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] disabled:opacity-40 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Modal Navigation Tabs (hidden when reading a legal sub-page) */}
          {!activeLegalDoc && (
            <div
              role="tablist"
              aria-label={t.settings}
              className="grid grid-cols-2 gap-1 rounded-xl border border-[var(--border)] bg-[var(--surface-subtle)] p-1"
            >
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'general'}
                onClick={() => {
                  setActiveTab('general');
                  setConfirmEmptyTrash(false);
                }}
                className={`rounded-lg py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${activeTab === 'general'
                    ? 'bg-[var(--surface)] text-[var(--text-primary)] border border-[var(--border)] shadow-xs'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
              >
                {t.tabGeneral}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'trash'}
                onClick={() => setActiveTab('trash')}
                className={`flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${activeTab === 'trash'
                    ? 'bg-[var(--surface)] text-[var(--text-primary)] border border-[var(--border)] shadow-xs'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
              >
                <span>{t.tabTrash}</span>
                {trashCount > 0 && (
                  <span className="font-mono-tabular text-[11px] text-[var(--text-muted)]">
                    ({trashCount})
                  </span>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Scrollable Content */}
        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto px-5 py-5 sm:px-6 space-y-6"
        >
          {activeLegalDoc ? (
            <LegalDocumentView
              doc={legalDocs[activeLegalDoc]}
              backLabel={t.backToSettingsButton}
              onBack={() => setActiveLegalDoc(null)}
            />
          ) : activeTab === 'general' ? (
            <>
              {/* Appearance Mode */}
              <section aria-label={t.appearanceModeTitle} className="space-y-2.5">
                <h3 className="font-display text-xs font-semibold text-[var(--text-muted)]">
                  {t.appearanceModeTitle}
                </h3>
                <div className="grid grid-cols-2 gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface-subtle)] p-1">
                  <button
                    type="button"
                    onClick={() => onChangeMode('light')}
                    aria-pressed={themeMode === 'light'}
                    className={`flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition-colors whitespace-nowrap ${themeMode === 'light'
                        ? 'bg-[var(--surface)] text-[var(--text-primary)] border border-[var(--border)] shadow-xs'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                      }`}
                  >
                    <Sun className="h-4 w-4" />
                    <span>{t.lightMode}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onChangeMode('dark')}
                    aria-pressed={themeMode === 'dark'}
                    className={`flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition-colors whitespace-nowrap ${themeMode === 'dark'
                        ? 'bg-[var(--surface)] text-[var(--text-primary)] border border-[var(--border)] shadow-xs'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                      }`}
                  >
                    <Moon className="h-4 w-4" />
                    <span>{t.darkMode}</span>
                  </button>
                </div>
              </section>

              {/* 14 Color Themes */}
              <section aria-label={t.colorThemeTitle} className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-xs font-semibold text-[var(--text-muted)]">
                    {t.colorThemeTitle}
                  </h3>
                  <span className="font-mono-tabular text-xs text-[var(--text-muted)]">
                    {COLOR_THEMES.length + 1} {t.themesCountUnit}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {COLOR_THEMES.map((theme) => {
                    const isSelected = theme.id === themeId;
                    const swatch = themeMode === 'dark' ? theme.swatchDark : theme.swatch;
                    return (
                      <button
                        key={theme.id}
                        type="button"
                        onClick={() => onChangeTheme(theme.id)}
                        aria-pressed={isSelected}
                        className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-[13px] font-medium transition-colors ${isSelected
                            ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text-primary)]'
                            : 'border-[var(--border)] bg-[var(--canvas)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]'
                          }`}
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          <span
                            aria-hidden="true"
                            className="h-3.5 w-3.5 shrink-0 rounded-full border border-black/15"
                            style={{ backgroundColor: swatch }}
                          />
                          <span className="truncate whitespace-nowrap">
                            {getThemeDisplayName(theme.id, theme.name)}
                          </span>
                        </span>
                        {isSelected && (
                          <Check className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />
                        )}
                      </button>
                    );
                  })}

                  {/* Empty Custom HEX Color Theme Slot */}
                  <button
                    type="button"
                    data-testid="custom-theme-button"
                    onClick={() => onChangeTheme('custom')}
                    aria-pressed={themeId === 'custom'}
                    className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-[13px] font-medium transition-colors ${
                      themeId === 'custom'
                        ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text-primary)]'
                        : 'border-dashed border-[var(--border-strong)] bg-[var(--canvas)] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      {themeId === 'custom' ? (
                        <span
                          aria-hidden="true"
                          className="h-3.5 w-3.5 shrink-0 rounded-full border border-black/15"
                          style={{ backgroundColor: customThemeColor }}
                        />
                      ) : (
                        <span
                          aria-hidden="true"
                          className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border border-dashed border-[var(--text-muted)] text-[var(--text-muted)]"
                        >
                          <Plus className="h-2.5 w-2.5" />
                        </span>
                      )}
                      <span className="truncate whitespace-nowrap">
                        {themeId === 'custom' ? customThemeColor.toUpperCase() : t.customThemeButton}
                      </span>
                    </span>
                    {themeId === 'custom' && (
                      <Check className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />
                    )}
                  </button>
                </div>

                {/* Inline Custom HEX Theme Editor */}
                {themeId === 'custom' && (
                  <div
                    data-testid="custom-theme-editor"
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--canvas)] px-3.5 py-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-[var(--text-primary)]">
                        {t.customThemeHexTitle}
                      </p>
                      <p className="text-[11px] text-[var(--text-muted)]">
                        {t.customThemeHexHint}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <input
                        type="color"
                        aria-label={t.customThemeHexTitle}
                        value={customThemeColor}
                        onChange={(e) => {
                          setCustomThemeDraft(e.target.value);
                          onChangeCustomThemeColor(e.target.value);
                        }}
                        className="h-8 w-9 cursor-pointer rounded-md border border-[var(--border)] bg-[var(--surface)] p-0.5"
                      />
                      <input
                        type="text"
                        data-testid="custom-theme-hex-input"
                        aria-label={t.customColorHexLabel}
                        value={customThemeDraft}
                        maxLength={7}
                        placeholder="#2563eb"
                        onChange={(e) => {
                          const val = e.target.value;
                          setCustomThemeDraft(val);
                          const norm = normalizeHexColor(val);
                          if (norm) onChangeCustomThemeColor(norm);
                        }}
                        className="h-8 w-24 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 font-mono-tabular text-xs font-medium uppercase text-[var(--text-primary)] focus:border-[var(--accent)]"
                      />
                    </div>
                  </div>
                )}
              </section>

              <div className="h-px bg-[var(--border)]" />

              {/* Dynamic System-Wide App Icon Selector */}
              <section aria-label={t.appIconSectionTitle} className="space-y-3">
                <div>
                  <h3 className="font-display text-xs font-semibold text-[var(--text-muted)]">
                    {t.appIconSectionTitle}
                  </h3>
                  <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
                    {t.appIconSectionDesc}
                  </p>
                </div>

                {/* Primary Icon Modes */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {(
                    [
                      { id: 'match-theme' as AppIconId, label: t.appIconMatchTheme },
                      { id: 'obsidian' as AppIconId, label: t.appIconDarkMono },
                      { id: 'obsidian-light' as AppIconId, label: t.appIconLightMono },
                      { id: 'custom' as AppIconId, label: t.appIconCustom },
                    ] as const
                  ).map((opt) => {
                    const selected = appIconId === opt.id;
                    const previewColors = resolveAppIconColors(
                      opt.id,
                      themeId,
                      themeMode,
                      customThemeColor,
                      customIconColor,
                    );
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        data-testid={`app-icon-${opt.id}`}
                        aria-pressed={selected}
                        onClick={() => onChangeAppIcon(opt.id)}
                        className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border px-2.5 py-2.5 text-center transition-colors ${
                          selected
                            ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text-primary)]'
                            : opt.id === 'custom'
                              ? 'border-dashed border-[var(--border-strong)] bg-[var(--canvas)] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:bg-[var(--surface-hover)]'
                              : 'border-[var(--border)] bg-[var(--canvas)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]'
                        }`}
                      >
                        {opt.id === 'custom' && !selected ? (
                          <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-dashed border-[var(--border-strong)] text-[var(--text-muted)]">
                            <Plus className="h-3.5 w-3.5" />
                          </span>
                        ) : (
                          <BrandMark
                            className="h-7 w-7"
                            bgColor={previewColors.bg}
                            fgColor={previewColors.fg}
                            borderColor={previewColors.border}
                          />
                        )}
                        <span className="w-full truncate text-[11px] font-medium">
                          {opt.id === 'custom' && selected
                            ? customIconColor.toUpperCase()
                            : opt.label}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Theme-Matched Color Icon Swatches */}
                <div className="flex flex-wrap items-center gap-1.5">
                  {COLOR_THEMES.filter((item) => item.id !== 'obsidian').map((item) => {
                    const selected = appIconId === item.id;
                    const previewColors = resolveAppIconColors(
                      item.id,
                      themeId,
                      themeMode,
                      customThemeColor,
                      customIconColor,
                    );
                    const label = getThemeDisplayName(item.id, item.name);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        data-testid={`app-icon-${item.id}`}
                        title={label}
                        aria-label={label}
                        aria-pressed={selected}
                        onClick={() => onChangeAppIcon(item.id)}
                        className={`rounded-lg p-1 transition-all ${
                          selected
                            ? 'ring-2 ring-[var(--accent)] bg-[var(--accent-soft)]'
                            : 'hover:bg-[var(--surface-hover)]'
                        }`}
                      >
                        <BrandMark
                          className="h-6 w-6 rounded-md"
                          bgColor={previewColors.bg}
                          fgColor={previewColors.fg}
                          borderColor={previewColors.border}
                        />
                      </button>
                    );
                  })}
                </div>

                {/* Inline Custom Icon HEX Color Picker */}
                {appIconId === 'custom' && (
                  <div
                    data-testid="custom-icon-editor"
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--canvas)] px-3.5 py-2.5"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <BrandMark
                        className="h-7 w-7"
                        bgColor={
                          resolveAppIconColors(
                            'custom',
                            themeId,
                            themeMode,
                            customThemeColor,
                            customIconColor,
                          ).bg
                        }
                        fgColor={
                          resolveAppIconColors(
                            'custom',
                            themeId,
                            themeMode,
                            customThemeColor,
                            customIconColor,
                          ).fg
                        }
                        borderColor={
                          resolveAppIconColors(
                            'custom',
                            themeId,
                            themeMode,
                            customThemeColor,
                            customIconColor,
                          ).border
                        }
                      />
                      <span className="text-xs font-medium text-[var(--text-primary)] truncate">
                        {t.appIconCustom} (HEX)
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <input
                        type="color"
                        aria-label={t.appIconCustom}
                        value={customIconColor}
                        onChange={(e) => {
                          setCustomIconDraft(e.target.value);
                          onChangeCustomIconColor(e.target.value);
                        }}
                        className="h-8 w-9 cursor-pointer rounded-md border border-[var(--border)] bg-[var(--surface)] p-0.5"
                      />
                      <input
                        type="text"
                        data-testid="custom-icon-hex-input"
                        aria-label={t.customColorHexLabel}
                        value={customIconDraft}
                        maxLength={7}
                        placeholder="#2563eb"
                        onChange={(e) => {
                          const val = e.target.value;
                          setCustomIconDraft(val);
                          const norm = normalizeHexColor(val);
                          if (norm) onChangeCustomIconColor(norm);
                        }}
                        className="h-8 w-24 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 font-mono-tabular text-xs font-medium uppercase text-[var(--text-primary)] focus:border-[var(--accent)]"
                      />
                    </div>
                  </div>
                )}
              </section>

              <div className="h-px bg-[var(--border)]" />

              {/* Accessibility Section (Zoom %, High Contrast, Reduced Motion) */}
              <section aria-label={t.accessibilitySectionTitle} className="space-y-3">
                <div className="flex items-center gap-1.5">
                  <ZoomIn className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                  <h3 className="font-display text-xs font-semibold text-[var(--text-muted)]">
                    {t.accessibilitySectionTitle}
                  </h3>
                </div>

                <div className="divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--canvas)]">
                  {/* Zoom Percentage */}
                  <div className="space-y-2.5 px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-[var(--text-primary)]">
                          {t.zoomLevelTitle}
                        </p>
                        <p className="text-xs text-[var(--text-muted)]">{t.zoomLevelDesc}</p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          data-testid="zoom-decrease-btn"
                          disabled={zoomPercent <= ZOOM_PRESETS[0]}
                          aria-label="-"
                          onClick={() => {
                            const idx = ZOOM_PRESETS.indexOf(
                              zoomPercent as (typeof ZOOM_PRESETS)[number],
                            );
                            if (idx > 0) onChangeZoomPercent(ZOOM_PRESETS[idx - 1]);
                          }}
                          className="flex h-7 w-7 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--surface)] text-[var(--text-primary)] hover:bg-[var(--surface-hover)] disabled:opacity-40 transition-colors"
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <span
                          data-testid="zoom-percent-value"
                          className="min-w-[46px] text-center font-mono-tabular text-xs font-semibold text-[var(--text-primary)]"
                        >
                          {zoomPercent}%
                        </span>
                        <button
                          type="button"
                          data-testid="zoom-increase-btn"
                          disabled={zoomPercent >= ZOOM_PRESETS[ZOOM_PRESETS.length - 1]}
                          aria-label="+"
                          onClick={() => {
                            const idx = ZOOM_PRESETS.indexOf(
                              zoomPercent as (typeof ZOOM_PRESETS)[number],
                            );
                            if (idx >= 0 && idx < ZOOM_PRESETS.length - 1) {
                              onChangeZoomPercent(ZOOM_PRESETS[idx + 1]);
                            }
                          }}
                          className="flex h-7 w-7 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--surface)] text-[var(--text-primary)] hover:bg-[var(--surface-hover)] disabled:opacity-40 transition-colors"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      {ZOOM_PRESETS.map((preset) => {
                        const active = zoomPercent === preset;
                        return (
                          <button
                            key={preset}
                            type="button"
                            data-testid={`zoom-preset-${preset}`}
                            onClick={() => onChangeZoomPercent(preset)}
                            className={`rounded-md border px-2 py-1 font-mono-tabular text-[11px] font-medium transition-colors whitespace-nowrap ${
                              active
                                ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-fg)]'
                                : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]'
                            }`}
                          >
                            {preset}%
                          </button>
                        );
                      })}
                      {zoomPercent !== 100 && (
                        <button
                          type="button"
                          onClick={() => onChangeZoomPercent(100)}
                          className="ms-auto rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-[11px] font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors whitespace-nowrap"
                        >
                          {t.zoomResetButton}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* High Contrast */}
                  <div className="flex items-center justify-between gap-4 px-4 py-3">
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 text-sm font-medium text-[var(--text-primary)]">
                        <Contrast className="h-3.5 w-3.5 text-[var(--accent)] shrink-0" />
                        <span>{t.highContrastTitle}</span>
                      </p>
                      <p className="text-xs text-[var(--text-muted)]">{t.highContrastDesc}</p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      data-testid="toggle-high-contrast"
                      aria-checked={highContrast}
                      onClick={() => onToggleHighContrast(!highContrast)}
                      className={`inline-flex items-center rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                        highContrast
                          ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text-primary)]'
                          : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]'
                      }`}
                    >
                      {highContrast ? t.enabledBadge : t.disabledBadge}
                    </button>
                  </div>

                  {/* Reduced Motion */}
                  <div className="flex items-center justify-between gap-4 px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[var(--text-primary)]">
                        {t.reducedMotionTitle}
                      </p>
                      <p className="text-xs text-[var(--text-muted)]">{t.reducedMotionDesc}</p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      data-testid="toggle-reduced-motion"
                      aria-checked={reducedMotion}
                      onClick={() => onToggleReducedMotion(!reducedMotion)}
                      className={`inline-flex items-center rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                        reducedMotion
                          ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text-primary)]'
                          : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]'
                      }`}
                    >
                      {reducedMotion ? t.enabledBadge : t.disabledBadge}
                    </button>
                  </div>
                </div>
              </section>

              <div className="h-px bg-[var(--border)]" />

              {/* Close & System Tray Behavior */}
              <section aria-label={t.closeBehaviorSectionTitle} className="space-y-2.5">
                <div>
                  <h3 className="font-display text-xs font-semibold text-[var(--text-muted)]">
                    {t.closeBehaviorSectionTitle}
                  </h3>
                  <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
                    {t.closeBehaviorDesc}
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      { id: 'ask' as CloseBehavior, label: t.closeBehaviorAsk, Icon: Sparkles },
                      { id: 'tray' as CloseBehavior, label: t.closeBehaviorTray, Icon: ArrowDownToLine },
                      { id: 'quit' as CloseBehavior, label: t.closeBehaviorQuit, Icon: Power },
                    ] as const
                  ).map(({ id, label, Icon }) => {
                    const selected = closeBehavior === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        data-testid={`close-behavior-${id}`}
                        aria-pressed={selected}
                        onClick={() => onChangeCloseBehavior(id)}
                        className={`flex items-center justify-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs font-medium transition-colors whitespace-nowrap ${
                          selected
                            ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text-primary)]'
                            : 'border-[var(--border)] bg-[var(--canvas)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]'
                        }`}
                      >
                        <Icon className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{label}</span>
                      </button>
                    );
                  })}
                </div>
              </section>

              <div className="h-px bg-[var(--border)]" />

              {/* 73-Language Selector + Manual & Automatic Update System */}
              <UpdateAndLanguageSection
                autoUpdateCheck={autoUpdateCheck}
                onToggleAutoUpdateCheck={onToggleAutoUpdateCheck}
                updateState={updateState}
                onCheckForUpdates={onCheckForUpdates}
                onDownloadAndInstall={onDownloadAndInstall}
              />

              <div className="h-px bg-[var(--border)]" />

              {/* Data & Backup (User-friendly non-technical descriptions) */}
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
                    className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-400"
                  >
                    {importError}
                  </div>
                )}

                {pendingImport && (
                  <div
                    role="alertdialog"
                    aria-label={t.backupRestoreTitle}
                    className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3.5 py-3 space-y-2.5"
                  >
                    <p className="text-xs leading-relaxed text-[var(--text-primary)]">
                      <strong>{pendingImport.fileName}</strong> ({pendingImport.summary})
                    </p>
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        disabled={isImporting}
                        onClick={() => setPendingImport(null)}
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

                <div className="divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--canvas)]">
                  <div className="flex items-center justify-between gap-4 px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[var(--text-primary)]">
                        {t.dragReorderTitle}
                      </p>
                      <p className="text-xs text-[var(--text-muted)]">
                        {dragLocked ? t.dragLockedDesc : t.dragUnlockedDesc}
                      </p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={!dragLocked}
                      aria-label={t.dragReorderTitle}
                      onClick={() => onToggleDragLock(!dragLocked)}
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${dragLocked
                          ? 'border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]'
                          : 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text-primary)]'
                        }`}
                    >
                      {dragLocked ? (
                        <>
                          <Lock className="h-3.5 w-3.5" />
                          <span>{t.lockedBadge}</span>
                        </>
                      ) : (
                        <>
                          <Unlock className="h-3.5 w-3.5 text-[var(--accent)]" />
                          <span>{t.unlockedBadge}</span>
                        </>
                      )}
                    </button>
                  </div>

                  <div className="flex items-center justify-between gap-4 px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[var(--text-primary)]">
                        {t.backupRestoreTitle}
                      </p>
                      <p className="text-xs text-[var(--text-muted)]">
                        {t.backupRestoreDesc}
                      </p>
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
                        className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)] disabled:opacity-40 transition-colors whitespace-nowrap"
                      >
                        <Upload className="h-3.5 w-3.5" />
                        <span>{isImporting ? t.restoringButton : t.restoreButton}</span>
                      </button>
                      <button
                        type="button"
                        disabled={isExportingBackup}
                        data-testid="download-backup-link"
                        onClick={() => void handleDownloadBackup()}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)] disabled:opacity-40 transition-colors whitespace-nowrap"
                      >
                        {backupDownloaded ? (
                          <Check className="h-3.5 w-3.5 text-emerald-500" />
                        ) : (
                          <Download className="h-3.5 w-3.5" />
                        )}
                        <span>
                          {backupDownloaded ? t.autoSavedBadge : t.downloadBackupButton}
                        </span>
                      </button>
                    </div>
                  </div>

                  {/* Zero-Cost OneDrive Cloud Sync Card */}
                  <div
                    data-testid="onedrive-sync-card"
                    className="px-4 py-3.5 space-y-3"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <Cloud className="h-4 w-4 text-[var(--accent)] shrink-0" />
                          <p className="text-sm font-medium text-[var(--text-primary)] truncate">
                            {t.onedriveSectionTitle}
                          </p>
                        </div>
                        {oneDriveStatus?.connected && (
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="inline-flex items-center gap-1 rounded-md border border-[var(--accent)]/40 bg-[var(--accent-soft)] px-2 py-0.5 text-[11px] font-medium text-[var(--accent)] whitespace-nowrap">
                              <Check className="h-3 w-3 shrink-0" />
                              <span>{t.onedriveConnectedBadge}</span>
                            </span>
                            <button
                              type="button"
                              disabled={isOneDriveBusy}
                              onClick={() => void handleOneDriveDisconnect()}
                              className="inline-flex items-center rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-0.5 text-[11px] font-medium text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] disabled:opacity-40 transition-colors whitespace-nowrap"
                            >
                              {t.onedriveDisconnectButton}
                            </button>
                          </div>
                        )}
                      </div>
                      <p className="text-xs leading-relaxed text-[var(--text-muted)]">
                        {t.onedriveSectionDesc}
                      </p>
                      {oneDriveStatus?.lastSyncedAt && (
                        <p className="font-mono-tabular text-[11px] text-[var(--text-muted)]">
                          {t.onedriveLastSyncedPrefix}:{' '}
                          {formatDeletedAt(oneDriveStatus.lastSyncedAt, meta.intlLocale)}
                          {oneDriveStatus.hasRemoteBackup &&
                          typeof oneDriveStatus.remoteTodoCount === 'number'
                            ? ` · ${oneDriveStatus.remoteTodoCount} ${t.tasksTitle.toLowerCase()}`
                            : ''}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-nowrap items-center gap-1.5 pt-0.5 overflow-x-auto">
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
                          {oneDriveStatus?.connected
                            ? t.onedriveSyncNowButton
                            : t.onedriveConnectButton}
                        </span>
                      </button>

                      <button
                        type="button"
                        disabled={isOneDriveBusy || !oneDriveStatus?.hasRemoteBackup}
                        onClick={() => void handleOneDriveRestore()}
                        className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)] disabled:opacity-40 transition-colors whitespace-nowrap shrink-0"
                      >
                        <Upload className="h-3.5 w-3.5 shrink-0" />
                        <span>{t.onedriveRestoreButton}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => void handleOneDriveOpenFolder()}
                        className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors whitespace-nowrap shrink-0"
                      >
                        <FolderOpen className="h-3.5 w-3.5 shrink-0" />
                        <span>{t.onedriveOpenFolderButton}</span>
                      </button>
                    </div>

                    {oneDriveStatus?.connected && (
                      <div className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2">
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
                              : 'border-[var(--border)] bg-[var(--canvas)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                          }`}
                        >
                          {oneDriveStatus.autoSync ? t.enabledBadge : t.disabledBadge}
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-4 px-4 py-3">
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
                          setIsClearingCompleted(false);
                        }
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)] disabled:opacity-40 transition-colors whitespace-nowrap shrink-0"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>{isClearingCompleted ? t.movingButton : t.moveButton}</span>
                    </button>
                  </div>
                </div>
              </section>

              <div className="h-px bg-[var(--border)]" />

              {/* Keyboard Shortcuts */}
              <section aria-label={t.keyboardShortcutsTitle} className="space-y-2.5">
                <div className="flex items-center gap-1.5">
                  <Keyboard className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                  <h3 className="font-display text-xs font-semibold text-[var(--text-muted)]">
                    {t.keyboardShortcutsTitle}
                  </h3>
                </div>
                <div className="space-y-1.5">
                  {shortcuts.map((item) => (
                    <div
                      key={item.keys}
                      className="flex items-center justify-between gap-3 text-xs"
                    >
                      <span className="text-[var(--text-secondary)]">{item.label}</span>
                      <span className="font-mono-tabular text-[var(--text-muted)] whitespace-nowrap">
                        {item.keys}
                      </span>
                    </div>
                  ))}
                </div>
              </section>

              <div className="h-px bg-[var(--border)]" />

              {/* Legal Pages & Microsoft Store Compliance Section */}
              <section aria-label={t.legalSectionTitle} className="space-y-2.5">
                <div>
                  <h3 className="font-display text-xs font-semibold text-[var(--text-muted)]">
                    {t.legalSectionTitle}
                  </h3>
                  <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
                    {t.legalSectionSubtitle}
                  </p>
                </div>

                <div className="divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--canvas)]">
                  {legalItems.map(({ id, title, Icon }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setActiveLegalDoc(id)}
                      className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors"
                    >
                      <span className="flex items-center gap-2.5 min-w-0">
                        <Icon className="h-3.5 w-3.5 text-[var(--accent)] shrink-0" />
                        <span className="truncate">{title}</span>
                      </span>
                      <ChevronRight className="h-3.5 w-3.5 text-[var(--text-muted)] shrink-0" />
                    </button>
                  ))}
                </div>
              </section>

              <div className="h-px bg-[var(--border)]" />

              {/* About & Publisher */}
              <section
                aria-label="Agendamea"
                className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--text-muted)]"
              >
                <div className="flex items-center gap-2">
                  <VelliumLogo className="h-4 w-4 text-[var(--text-primary)] shrink-0" />
                  <span className="font-display font-semibold text-[var(--text-primary)]">
                    Agendamea
                  </span>
                  <span className="font-mono-tabular">v1.0.0</span>
                  <span>·</span>
                  <span>© 2026 Vellium</span>
                </div>
                <div className="flex items-center gap-3">
                  {onOpenWelcomeGuide && (
                    <button
                      type="button"
                      data-testid="settings-open-welcome-guide"
                      onClick={onOpenWelcomeGuide}
                      className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--canvas)] px-2 py-1 text-[11px] font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors whitespace-nowrap"
                    >
                      <Sparkles className="h-3 w-3 text-[var(--accent)] shrink-0" />
                      <span>{t.welcomeReplayButton}</span>
                    </button>
                  )}
                  <a
                    href="https://vellium.dev"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-[var(--text-primary)] underline-offset-2 hover:underline transition-colors"
                  >
                    vellium.dev
                  </a>
                  <a
                    href="mailto:support@vellium.dev"
                    className="hover:text-[var(--text-primary)] underline-offset-2 hover:underline transition-colors"
                  >
                    support@vellium.dev
                  </a>
                </div>
              </section>
            </>
          ) : (
            /* Trash Tab */
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-[var(--text-muted)]">{t.trashIntroDesc}</p>

                {trashCount > 0 &&
                  (confirmEmptyTrash ? (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        disabled={isEmptyingTrash}
                        onClick={() => setConfirmEmptyTrash(false)}
                        className="rounded-lg border border-[var(--border)] bg-[var(--canvas)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] disabled:opacity-40 whitespace-nowrap"
                      >
                        {t.cancelButton}
                      </button>
                      <button
                        type="button"
                        disabled={isEmptyingTrash}
                        onClick={async () => {
                          if (isEmptyingTrash) return;
                          setIsEmptyingTrash(true);
                          try {
                            await onEmptyTrash();
                            setConfirmEmptyTrash(false);
                          } finally {
                            setIsEmptyingTrash(false);
                          }
                        }}
                        className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-40 transition-colors whitespace-nowrap"
                      >
                        {isEmptyingTrash ? t.deletingButton : t.confirmDeleteAllPermanent}
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmEmptyTrash(true)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--canvas)] px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-500/10 transition-colors whitespace-nowrap shrink-0"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>{t.emptyTrashButton}</span>
                    </button>
                  ))}
              </div>

              {trashCount === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--canvas)] px-6 py-12 text-center">
                  <Trash2 className="mb-2.5 h-6 w-6 text-[var(--text-muted)]" />
                  <p className="font-display text-sm font-semibold text-[var(--text-primary)]">
                    {t.trashEmptyTitle}
                  </p>
                  <p className="mt-1 text-xs text-[var(--text-muted)]">{t.trashEmptyDesc}</p>
                </div>
              ) : (
                <>
                  {/* Trashed Categories */}
                  {trashedCategories.length > 0 && (
                    <section aria-label={t.categories} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <h3 className="font-display text-xs font-semibold text-[var(--text-muted)]">
                          {t.categories}
                        </h3>
                        <span className="font-mono-tabular text-xs text-[var(--text-muted)]">
                          {trashedCategories.length}
                        </span>
                      </div>
                      <div className="divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--canvas)]">
                        {trashedCategories.map((cat) => (
                          <div
                            key={cat.id}
                            className="flex items-center justify-between gap-3 px-3.5 py-2.5"
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 min-w-0">
                                <ColorDot color={cat.color} size="sm" />
                                <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                                  {cat.name}
                                </p>
                              </div>
                              <p className="mt-0.5 text-[11px] text-[var(--text-muted)] font-mono-tabular">
                                {t.deletedPrefix}: {formatDeletedAt(cat.deletedAt, meta.intlLocale)}
                              </p>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                disabled={isEmptyingTrash || busyTrashIds.has(`cat:${cat.id}`)}
                                onClick={() =>
                                  void runTrashItemOp(`cat:${cat.id}`, () =>
                                    onRestoreCategory(cat.id),
                                  )
                                }
                                aria-label={`${t.restoreItemButton}: ${cat.name}`}
                                className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)] disabled:opacity-40 transition-colors whitespace-nowrap"
                              >
                                <RotateCcw className="h-3 w-3" />
                                <span>{t.restoreItemButton}</span>
                              </button>
                              <button
                                type="button"
                                disabled={isEmptyingTrash || busyTrashIds.has(`cat:${cat.id}`)}
                                onClick={() =>
                                  void runTrashItemOp(`cat:${cat.id}`, () =>
                                    onPermanentDeleteCategory(cat.id),
                                  )
                                }
                                aria-label={`${t.permanentDeleteTitle}: ${cat.name}`}
                                className="flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-red-600 dark:text-red-400 hover:bg-red-500/10 disabled:opacity-40 transition-colors"
                                title={t.permanentDeleteTitle}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}

                  {/* Trashed Todos */}
                  {trashedTodos.length > 0 && (
                    <section aria-label={t.tasksTitle} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <h3 className="font-display text-xs font-semibold text-[var(--text-muted)]">
                          {t.tasksTitle}
                        </h3>
                        <span className="font-mono-tabular text-xs text-[var(--text-muted)]">
                          {trashedTodos.length}
                        </span>
                      </div>
                      <div className="divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--canvas)]">
                        {trashedTodos.map((todo) => (
                          <div
                            key={todo.id}
                            className="flex items-center justify-between gap-3 px-3.5 py-2.5"
                          >
                            <div className="min-w-0">
                              <p
                                className={`truncate text-sm font-medium ${todo.completed
                                    ? 'line-through text-[var(--text-muted)]'
                                    : 'text-[var(--text-primary)]'
                                  }`}
                              >
                                {todo.title}
                              </p>
                              <p className="mt-0.5 text-[11px] text-[var(--text-muted)] font-mono-tabular">
                                {t.deletedPrefix}:{' '}
                                {formatDeletedAt(todo.deletedAt, meta.intlLocale)}
                                {todo.subtasks.length > 0
                                  ? ` · ${todo.subtasks.length} ${t.subtaskCountUnit}`
                                  : ''}
                              </p>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                disabled={isEmptyingTrash || busyTrashIds.has(`todo:${todo.id}`)}
                                onClick={() =>
                                  void runTrashItemOp(`todo:${todo.id}`, () =>
                                    onRestoreTodo(todo.id),
                                  )
                                }
                                aria-label={`${t.restoreItemButton}: ${todo.title}`}
                                className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)] disabled:opacity-40 transition-colors whitespace-nowrap"
                              >
                                <RotateCcw className="h-3 w-3" />
                                <span>{t.restoreItemButton}</span>
                              </button>
                              <button
                                type="button"
                                disabled={isEmptyingTrash || busyTrashIds.has(`todo:${todo.id}`)}
                                onClick={() =>
                                  void runTrashItemOp(`todo:${todo.id}`, () =>
                                    onPermanentDeleteTodo(todo.id),
                                  )
                                }
                                aria-label={`${t.permanentDeleteTitle}: ${todo.title}`}
                                className="flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-red-600 dark:text-red-400 hover:bg-red-500/10 disabled:opacity-40 transition-colors"
                                title={t.permanentDeleteTitle}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default SettingsModal;
