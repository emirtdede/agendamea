import { type MutableRefObject, useCallback, useEffect, useRef } from 'react';
import { api } from '../api/client';
import type { UiDictionary } from '../i18n/translations';
import { updaterStore } from '../store/updaterStore';

interface UseAppUpdaterOptions {
  tRef: MutableRefObject<UiDictionary>;
  showInfoToast: (message: string, tone?: 'info' | 'error') => void;
  formatUiError: (err: unknown, fallback?: string) => string;
  dispatchUpdateNotification?: (payload: { title: string; body?: string }) => void;
}

/**
 * Store-backed app updater lifecycle hook.
 * Keeps ZERO React state inside App.tsx so update checks, download percentage ticks,
 * and toggle switches cause 0 App.tsx re-renders.
 */
export function useAppUpdater({
  tRef,
  showInfoToast,
  formatUiError,
  dispatchUpdateNotification,
}: UseAppUpdaterOptions) {
  const isCheckingRef = useRef(false);

  // Listen to Electron native update progress, downloaded & error events
  useEffect(() => {
    const unsubProgress = window.agendameaWindow?.onUpdateProgress?.((pct) => {
      updaterStore.setUpdateState((prev) =>
        prev.status === 'downloading'
          ? { ...prev, downloadPercent: pct, errorMessage: null }
          : prev,
      );
    });
    const unsubDownloaded = window.agendameaWindow?.onUpdateDownloaded?.((info) => {
      updaterStore.setUpdateState((prev) => ({
        status: 'downloaded',
        result: prev.result
          ? {
              ...prev.result,
              latestVersion: info.version || prev.result.latestVersion,
              downloaded: true,
            }
          : prev.result,
        downloadPercent: 100,
        errorMessage: null,
      }));
      if (dispatchUpdateNotification) {
        dispatchUpdateNotification({ title: tRef.current.updateReadyToInstallLabel });
      } else {
        showInfoToast(tRef.current.updateReadyToInstallLabel, 'info');
      }
    });
    const unsubError = window.agendameaWindow?.onUpdateError?.(() => {
      if (updaterStore.getState().updateState.status !== 'downloading') return;
      const errText = tRef.current.updateErrorOfflineLabel;
      showInfoToast(errText, 'error');
      updaterStore.setUpdateState((prev) => {
        if (prev.status !== 'downloading') return prev;
        return {
          ...prev,
          status: prev.result?.updateAvailable ? 'available' : 'error',
          downloadPercent: null,
          errorMessage: errText,
        };
      });
    });
    return () => {
      if (typeof unsubProgress === 'function') unsubProgress();
      if (typeof unsubDownloaded === 'function') unsubDownloaded();
      if (typeof unsubError === 'function') unsubError();
    };
  }, [dispatchUpdateNotification, showInfoToast, tRef]);

  const runUpdateCheck = useCallback(
    async (isManual: boolean) => {
      if (isCheckingRef.current) return;
      isCheckingRef.current = true;
      updaterStore.setUpdateState((prev) => ({
        ...prev,
        status: 'checking',
        errorMessage: null,
      }));
      try {
        const res = await api.checkForUpdates();
        if (!res.ok) {
          updaterStore.setUpdateState({
            status: isManual ? 'error' : 'idle',
            result: res,
            downloadPercent: null,
            errorMessage: isManual ? tRef.current.updateErrorOfflineLabel : null,
          });
          return;
        }
        if (res.downloaded) {
          updaterStore.setUpdateState({
            status: 'downloaded',
            result: res,
            downloadPercent: 100,
            errorMessage: null,
          });
        } else if (res.updateAvailable) {
          updaterStore.setUpdateState({
            status: 'available',
            result: res,
            downloadPercent: null,
            errorMessage: null,
          });
          if (!isManual) {
            if (dispatchUpdateNotification) {
              dispatchUpdateNotification({
                title: tRef.current.updateAvailableLabel,
                body: `v${res.latestVersion}`,
              });
            } else {
              showInfoToast(`${tRef.current.updateAvailableLabel}: v${res.latestVersion}`, 'info');
            }
          }
        } else {
          updaterStore.setUpdateState({
            status: 'up-to-date',
            result: res,
            downloadPercent: null,
            errorMessage: null,
          });
        }
      } catch {
        updaterStore.setUpdateState((prev) => ({
          status: isManual ? 'error' : 'idle',
          result: prev.result,
          downloadPercent: null,
          errorMessage: isManual ? tRef.current.updateErrorOfflineLabel : null,
        }));
      } finally {
        isCheckingRef.current = false;
      }
    },
    [dispatchUpdateNotification, showInfoToast, tRef],
  );

  // Automatic background update check synced imperatively with updaterStore.autoUpdateCheck
  useEffect(() => {
    let startupTimer: number | null = null;
    let periodicTimer: number | null = null;
    let activeEnabled: boolean | null = null;

    const clearTimers = () => {
      if (startupTimer !== null) {
        window.clearTimeout(startupTimer);
        startupTimer = null;
      }
      if (periodicTimer !== null) {
        window.clearInterval(periodicTimer);
        periodicTimer = null;
      }
    };

    const syncScheduler = () => {
      const wantsAuto =
        updaterStore.getState().autoUpdateCheck && !window.agendameaWindow?.isWindowsStore;
      if (wantsAuto === activeEnabled) return;
      activeEnabled = wantsAuto;
      clearTimers();
      if (!wantsAuto) return;
      startupTimer = window.setTimeout(() => {
        void runUpdateCheck(false);
      }, 3000);
      periodicTimer = window.setInterval(
        () => {
          void runUpdateCheck(false);
        },
        6 * 60 * 60 * 1000,
      );
    };

    syncScheduler();
    const unsubscribe = updaterStore.subscribe(syncScheduler);
    return () => {
      unsubscribe();
      clearTimers();
    };
  }, [runUpdateCheck]);

  const handleManualCheckForUpdates = useCallback(async () => {
    await runUpdateCheck(true);
  }, [runUpdateCheck]);

  const handleDownloadAndInstallUpdate = useCallback(async () => {
    const current = updaterStore.getState().updateState;
    const res = current.result;
    if (!res) return;
    const installerUrl = res.setupUrl || res.msixUrl || null;
    const downloadUrl = installerUrl || res.portableUrl || res.releaseUrl;
    if (
      window.agendameaWindow?.downloadAndInstallUpdate &&
      (res.nativeAutoUpdateReady || installerUrl)
    ) {
      updaterStore.setUpdateState((prev) => ({
        ...prev,
        status: 'downloading',
        downloadPercent: 5,
        errorMessage: null,
      }));
      try {
        const outcome = await window.agendameaWindow.downloadAndInstallUpdate(installerUrl || '');
        if (outcome?.cancelled) {
          updaterStore.setUpdateState((prev) => ({
            ...prev,
            status: prev.result?.updateAvailable ? 'available' : 'idle',
            downloadPercent: null,
            errorMessage: null,
          }));
        } else if (outcome?.downloaded) {
          updaterStore.setUpdateState((prev) => ({
            ...prev,
            status: 'downloaded',
            downloadPercent: 100,
            errorMessage: null,
          }));
        } else if (outcome?.ok && (outcome.launchedInstaller || outcome.launchedExternal)) {
          updaterStore.setUpdateState((prev) => ({
            ...prev,
            status: 'available',
            downloadPercent: null,
            errorMessage: null,
          }));
        } else if (updaterStore.getState().updateState.status !== 'downloaded') {
          const errText = tRef.current.updateErrorOfflineLabel;
          if (!updaterStore.getState().updateState.errorMessage) {
            showInfoToast(errText, 'error');
          }
          updaterStore.setUpdateState((prev) => {
            if (prev.status === 'downloaded') return prev;
            return {
              ...prev,
              status: 'available',
              downloadPercent: null,
              errorMessage: prev.errorMessage ?? errText,
            };
          });
        }
      } catch (err) {
        const errText = formatUiError(err, tRef.current.updateErrorOfflineLabel);
        showInfoToast(errText, 'error');
        updaterStore.setUpdateState((prev) => ({
          ...prev,
          status: prev.result?.updateAvailable ? 'available' : 'error',
          downloadPercent: null,
          errorMessage: errText,
        }));
      }
      return;
    }
    if (/^https?:\/\//i.test(downloadUrl)) {
      window.open(downloadUrl, '_blank', 'noopener,noreferrer');
    }
  }, [formatUiError, showInfoToast, tRef]);

  const handleCancelUpdateDownload = useCallback(async () => {
    try {
      await window.agendameaWindow?.cancelUpdateDownload?.();
    } catch {
      // Ignore cancel IPC failure
    }
    updaterStore.setUpdateState((prev) => ({
      ...prev,
      status: prev.result?.updateAvailable ? 'available' : 'idle',
      downloadPercent: null,
      errorMessage: null,
    }));
  }, []);

  const handleQuitAndInstallUpdate = useCallback(async () => {
    await window.agendameaWindow?.quitAndInstallUpdate?.();
  }, []);

  return {
    handleManualCheckForUpdates,
    handleDownloadAndInstallUpdate,
    handleCancelUpdateDownload,
    handleQuitAndInstallUpdate,
  };
}
