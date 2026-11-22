import React, { useMemo, useState } from 'react';
import {
  Check,
  CheckCircle2,
  Download,
  ExternalLink,
  Globe,
  RefreshCw,
  RotateCw,
  Search,
} from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';
import type { LanguageCode } from '../i18n/languages';
import type { UpdateCheckResult } from '../types';
import { APP_VERSION } from '../utils/appVersion';

export interface AppUpdateState {
  status:
    | 'idle'
    | 'checking'
    | 'up-to-date'
    | 'available'
    | 'downloading'
    | 'downloaded'
    | 'error';
  result: UpdateCheckResult | null;
  downloadPercent: number | null;
}

export const LanguageSelectorSection = React.memo(function LanguageSelectorSection() {
  const { lang, meta, t, languages, onChangeLanguage } = useI18n();
  const [langQuery, setLangQuery] = useState('');
  const [isLangListOpen, setIsLangListOpen] = useState(false);

  const filteredLanguages = useMemo(() => {
    const q = langQuery.trim().toLowerCase();
    if (!q) return languages;
    return languages.filter(
      (l) =>
        l.nativeName.toLowerCase().includes(q) ||
        l.englishName.toLowerCase().includes(q) ||
        l.code.toLowerCase().includes(q),
    );
  }, [languages, langQuery]);

  return (
    <section aria-label={t.languageSectionTitle} className="space-y-2.5">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-xs font-semibold text-[var(--text-muted)]">
          {t.languageSectionTitle}
        </h3>
        <span className="font-mono-tabular text-xs text-[var(--text-muted)]">
          {meta.nativeName} ({meta.code})
        </span>
      </div>

      <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
        <button
          type="button"
          data-testid="settings-language-toggle-btn"
          onClick={() => setIsLangListOpen((prev) => !prev)}
          aria-expanded={isLangListOpen}
          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-[var(--surface-hover)]/60 transition-colors"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <Globe className="h-4 w-4 text-[var(--accent)] shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-[var(--text-primary)] truncate">
                {meta.nativeName}
              </p>
              <p className="text-xs text-[var(--text-muted)] truncate">
                {meta.englishName} · 73
              </p>
            </div>
          </div>
          <span className="rounded-lg border border-[var(--border)] bg-[var(--canvas)] px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)]">
            {meta.code.toUpperCase()}
          </span>
        </button>

        {isLangListOpen && (
          <div className="animate-tab-enter border-t border-[var(--border)] p-3.5 space-y-2.5 bg-[var(--surface-subtle)]/50">
            <div className="relative flex items-center">
              <Search className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-[var(--text-muted)]" />
              <input
                type="text"
                value={langQuery}
                onChange={(e) => setLangQuery(e.target.value)}
                placeholder={t.languageSearchPlaceholder}
                aria-label={t.languageSearchPlaceholder}
                className="h-8 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] pl-8 pr-3 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--border-strong)] focus:outline-none"
              />
            </div>

            <div
              role="listbox"
              aria-label={t.languageSectionTitle}
              className="grid max-h-56 grid-cols-1 sm:grid-cols-2 gap-1.5 overflow-y-auto pr-1"
            >
              {filteredLanguages.map((item) => {
                const selected = item.code === lang;
                return (
                  <button
                    key={item.code}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => {
                      onChangeLanguage(item.code as LanguageCode);
                      setIsLangListOpen(false);
                      setLangQuery('');
                    }}
                    className={`flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-left text-xs transition-colors ${
                      selected
                        ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text-primary)] font-semibold'
                        : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    <span className="min-w-0 truncate">
                      <span className="text-[var(--text-primary)]">{item.nativeName}</span>{' '}
                      <span className="text-[11px] text-[var(--text-muted)]">
                        ({item.englishName})
                      </span>
                    </span>
                    {selected && (
                      <Check className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </section>
  );
});

interface UpdatesSectionProps {
  autoUpdateCheck: boolean;
  onToggleAutoUpdateCheck: (enabled: boolean) => void;
  updateState: AppUpdateState;
  onCheckForUpdates: () => Promise<void>;
  onDownloadAndInstall: () => Promise<void>;
  onQuitAndInstall?: () => Promise<void>;
}

const CHECKED_AT_FORMATTER_CACHE = new Map<string, Intl.DateTimeFormat>();

function getCheckedAtFormatter(intlLocale: string): Intl.DateTimeFormat {
  let fmt = CHECKED_AT_FORMATTER_CACHE.get(intlLocale);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat(intlLocale, {
      hour: '2-digit',
      minute: '2-digit',
    });
    CHECKED_AT_FORMATTER_CACHE.set(intlLocale, fmt);
  }
  return fmt;
}

export const UpdatesSection = React.memo(function UpdatesSection({
  autoUpdateCheck,
  onToggleAutoUpdateCheck,
  updateState,
  onCheckForUpdates,
  onDownloadAndInstall,
  onQuitAndInstall,
}: UpdatesSectionProps) {
  const { meta, t } = useI18n();

  const formattedCheckedAt = useMemo(() => {
    const iso = updateState.result?.checkedAt;
    if (!iso) return null;
    try {
      const dt = new Date(iso);
      if (Number.isNaN(dt.getTime())) return null;
      return getCheckedAtFormatter(meta.intlLocale).format(dt);
    } catch {
      return null;
    }
  }, [updateState.result?.checkedAt, meta.intlLocale]);

  if (window.agendameaWindow?.isWindowsStore) {
    return null;
  }

  const currentVersion = updateState.result?.currentVersion ?? APP_VERSION;

  return (
    <section aria-label={t.updatesSectionTitle} className="space-y-2.5">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-xs font-semibold text-[var(--text-muted)]">
          {t.updatesSectionTitle}
        </h3>
        <span className="font-mono-tabular text-xs text-[var(--text-muted)]">
          v{currentVersion}
        </span>
      </div>

      <div className="divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
        {/* Manual Version Query & Silent Delta Update Row */}
        <div className="p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0 space-y-0.5">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-[var(--text-primary)]">
                  {t.currentVersionLabel}:{' '}
                  <span className="font-mono-tabular">v{currentVersion}</span>
                </p>
                {(updateState.status === 'up-to-date' || updateState.status === 'downloaded') && (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                )}
              </div>
              <p className="text-xs text-[var(--text-muted)]">
                {updateState.status === 'checking'
                  ? t.checkingUpdatesLabel
                  : updateState.status === 'up-to-date'
                    ? t.upToDateLabel
                    : updateState.status === 'downloaded'
                      ? t.updateReadyToInstallLabel
                      : updateState.status === 'available' && updateState.result
                        ? `${t.updateAvailableLabel}: v${updateState.result.latestVersion}`
                        : updateState.status === 'downloading'
                          ? `${t.downloadingUpdateLabel} ${
                              updateState.downloadPercent !== null
                                ? `(${updateState.downloadPercent}%)`
                                : ''
                            }`
                          : updateState.status === 'error'
                            ? t.updateErrorOfflineLabel
                            : formattedCheckedAt
                              ? `${t.lastCheckedPrefix}: ${formattedCheckedAt}`
                              : t.upToDateLabel}
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {updateState.status === 'downloaded' && onQuitAndInstall && (
                <button
                  type="button"
                  data-testid="restart-and-update-btn"
                  onClick={() => void onQuitAndInstall()}
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-opacity whitespace-nowrap"
                  style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-fg)' }}
                >
                  <RotateCw className="h-3.5 w-3.5" />
                  <span>{t.restartAndUpdateButton}</span>
                </button>
              )}

              {updateState.status === 'available' && updateState.result && (
                <button
                  type="button"
                  data-testid="download-update-btn"
                  onClick={() => void onDownloadAndInstall()}
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-opacity whitespace-nowrap"
                  style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-fg)' }}
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>{t.downloadAndInstallButton}</span>
                </button>
              )}

              <button
                type="button"
                data-testid="check-updates-btn"
                disabled={
                  updateState.status === 'checking' || updateState.status === 'downloading'
                }
                onClick={() => void onCheckForUpdates()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--canvas)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)] disabled:opacity-45 transition-colors whitespace-nowrap"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${
                    updateState.status === 'checking' ? 'animate-spin text-[var(--accent)]' : ''
                  }`}
                />
                <span>{t.checkForUpdatesButton}</span>
              </button>
            </div>
          </div>

          {updateState.status === 'downloading' && (
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-subtle)]">
              {updateState.downloadPercent !== null ? (
                <div
                  className="h-full rounded-full transition-all duration-150"
                  style={{
                    width: `${Math.min(100, Math.max(5, updateState.downloadPercent))}%`,
                    backgroundColor: 'var(--accent)',
                  }}
                />
              ) : (
                <div
                  className="h-full w-2/5 rounded-full animate-indeterminate"
                  style={{ backgroundColor: 'var(--accent)' }}
                />
              )}
            </div>
          )}

          {(updateState.status === 'available' || updateState.status === 'downloaded') &&
            updateState.result?.releaseUrl && (
              <div className="flex items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--surface-subtle)] px-3 py-2 text-xs">
                <span className="font-medium text-[var(--text-primary)] truncate">
                  {updateState.result.releaseName ||
                    `Agendamea v${updateState.result.latestVersion}`}
                </span>
                <a
                  href={updateState.result.releaseUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-medium text-[var(--accent)] hover:underline shrink-0"
                >
                  <span>{t.viewReleaseNotes}</span>
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            )}
        </div>

        {/* Automatic Background Update Check Toggle */}
        <div className="flex items-center justify-between gap-4 px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-[var(--text-primary)]">
              {t.autoUpdateToggleTitle}
            </p>
            <p className="text-xs text-[var(--text-muted)]">{t.autoUpdateToggleDesc}</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={autoUpdateCheck}
            aria-label={t.autoUpdateToggleTitle}
            onClick={() => onToggleAutoUpdateCheck(!autoUpdateCheck)}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              autoUpdateCheck
                ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text-primary)]'
                : 'border-[var(--border)] bg-[var(--canvas)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]'
            }`}
          >
            <span>{autoUpdateCheck ? t.enabledBadge : t.disabledBadge}</span>
          </button>
        </div>
      </div>
    </section>
  );
});
