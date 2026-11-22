import { useCallback, useEffect, useState, type MutableRefObject } from 'react';
import { api } from '../api/client';
import type { AppUpdateState } from '../components/UpdateSettingsSection';
import type { UiDictionary } from '../i18n/translations';

interface UseAppUpdaterOptions {
  tRef: MutableRefObject<UiDictionary>;
  showInfoToast: (message: string, tone?: 'info' | 'error') => void;
  formatUiError: (err: unknown, fallback?: string) => string;
}

export function useAppUpdater({ tRef, showInfoToast, formatUiError }: UseAppUpdaterOptions) {
  const [autoUpdateCheck, setAutoUpdateCheck] = useState<boolean>(true);
  const [updateState, setUpdateState] = useState<AppUpdateState>({
    status: 'idle',
    result: null,
    downloadPercent: null,
  });

  // Listen to Electron native update progress, downloaded & error events
  useEffect(() => {
    const unsubProgress = window.agendameaWindow?.onUpdateProgress?.((pct) => {
      setUpdateState((prev) =>
        prev.status === 'downloading' ? { ...prev, downloadPercent: pct } : prev,
      );
    });
    const unsubDownloaded = window.agendameaWindow?.onUpdateDownloaded?.((info) => {
      setUpdateState((prev) => ({
        status: 'downloaded',
        result: prev.result
          ? {
              ...prev.result,
              latestVersion: info.version || prev.result.latestVersion,
              downloaded: true,
            }
          : prev.result,
        downloadPercent: 100,
      }));
      showInfoToast(tRef.current.updateReadyToInstallLabel, 'info');
    });
    const unsubError = window.agendameaWindow?.onUpdateError?.(() => {
      setUpdateState((prev) =>
        prev.status === 'downloading'
          ? {
              ...prev,
              status: prev.result?.updateAvailable ? 'available' : 'error',
              downloadPercent: null,
            }
          : prev,
      );
    });
    return () => {
      if (typeof unsubProgress === 'function') unsubProgress();
      if (typeof unsubDownloaded === 'function') unsubDownloaded();
      if (typeof unsubError === 'function') unsubError();
    };
  }, [showInfoToast, tRef]);

  const runUpdateCheck = useCallback(
    async (isManual: boolean) => {
      setUpdateState((prev) => ({ ...prev, status: 'checking' }));
      try {
        const res = await api.checkForUpdates();
        if (!res.ok) {
          setUpdateState({
            status: isManual ? 'error' : 'idle',
            result: res,
            downloadPercent: null,
          });
          return;
        }
        if (res.downloaded) {
          setUpdateState({
            status: 'downloaded',
            result: res,
            downloadPercent: 100,
          });
        } else if (res.updateAvailable) {
          setUpdateState({
            status: 'available',
            result: res,
            downloadPercent: null,
          });
          if (!isManual) {
            showInfoToast(`${tRef.current.updateAvailableLabel}: v${res.latestVersion}`, 'info');
          }
        } else {
          setUpdateState({
            status: 'up-to-date',
            result: res,
            downloadPercent: null,
          });
        }
      } catch {
        setUpdateState((prev) => ({
          status: isManual ? 'error' : 'idle',
          result: prev.result,
          downloadPercent: null,
        }));
      }
    },
    [showInfoToast, tRef],
  );

  // Automatic background update check on startup & every 6 hours (skipped inside Microsoft Store MSIX)
  useEffect(() => {
    if (!autoUpdateCheck || window.agendameaWindow?.isWindowsStore) return;
    const startupTimer = window.setTimeout(() => {
      void runUpdateCheck(false);
    }, 3000);
    const periodicTimer = window.setInterval(
      () => {
        void runUpdateCheck(false);
      },
      6 * 60 * 60 * 1000,
    );
    return () => {
      window.clearTimeout(startupTimer);
      window.clearInterval(periodicTimer);
    };
  }, [autoUpdateCheck, runUpdateCheck]);

  const handleManualCheckForUpdates = useCallback(async () => {
    await runUpdateCheck(true);
  }, [runUpdateCheck]);

  const handleDownloadAndInstallUpdate = useCallback(async () => {
    const res = updateState.result;
    if (!res) return;
    const installerUrl = res.setupUrl || res.msixUrl || null;
    const downloadUrl = installerUrl || res.portableUrl || res.releaseUrl;
    if (
      window.agendameaWindow?.downloadAndInstallUpdate &&
      (res.nativeAutoUpdateReady || installerUrl)
    ) {
      setUpdateState((prev) => ({
        ...prev,
        status: 'downloading',
        downloadPercent: 5,
      }));
      const outcome = await window.agendameaWindow.downloadAndInstallUpdate(installerUrl || '');
      if (outcome?.downloaded) {
        setUpdateState((prev) => ({
          ...prev,
          status: 'downloaded',
          downloadPercent: 100,
        }));
      } else {
        setUpdateState((prev) =>
          prev.status === 'downloaded'
            ? prev
            : {
                ...prev,
                status: 'available',
                downloadPercent: null,
              },
        );
      }
      return;
    }
    window.open(downloadUrl, '_blank', 'noopener,noreferrer');
  }, [updateState.result]);

  const handleQuitAndInstallUpdate = useCallback(async () => {
    await window.agendameaWindow?.quitAndInstallUpdate?.();
  }, []);

  const handleToggleAutoUpdateCheck = useCallback(
    (enabled: boolean) => {
      setAutoUpdateCheck(enabled);
      void api.updateSettings({ autoUpdateCheck: enabled }).catch((err) => {
        showInfoToast(formatUiError(err), 'error');
      });
    },
    [showInfoToast, formatUiError],
  );

  return {
    autoUpdateCheck,
    setAutoUpdateCheck,
    updateState,
    handleManualCheckForUpdates,
    handleDownloadAndInstallUpdate,
    handleQuitAndInstallUpdate,
    handleToggleAutoUpdateCheck,
  };
}
