import { api } from '../api/client';
import type { AppUpdateState } from '../components/UpdateSettingsSection';
import type { AppSettings } from '../types';
import {
  createSelectorStore,
  type EqualityFn,
  type SelectorStore,
  shallowEqual,
  useSelectorStore,
} from './createSelectorStore';
import { reportStoreError } from './storeErrorBus';

export interface UpdaterStoreState {
  autoUpdateCheck: boolean;
  updateState: AppUpdateState;
}

export interface UpdaterStore extends SelectorStore<UpdaterStoreState> {
  hydrateAutoUpdateCheck: (enabled: boolean) => void;
  toggleAutoUpdateCheck: (enabled: boolean) => void;
  setUpdateState: (updater: AppUpdateState | ((prev: AppUpdateState) => AppUpdateState)) => void;
}

function getInitialUpdaterState(): UpdaterStoreState {
  return {
    autoUpdateCheck: true,
    updateState: {
      status: 'idle',
      result: null,
      downloadPercent: null,
      errorMessage: null,
    },
  };
}

export function createUpdaterStore(
  persistSettings: (patch: Partial<AppSettings>) => Promise<AppSettings> = (patch) =>
    api.updateSettings(patch),
  onError: (err: unknown) => void = (err) => reportStoreError(err),
): UpdaterStore {
  const base = createSelectorStore<UpdaterStoreState>(getInitialUpdaterState);

  const hydrateAutoUpdateCheck = (enabled: boolean): void => {
    base.patchState({ autoUpdateCheck: Boolean(enabled) });
  };

  const toggleAutoUpdateCheck = (enabled: boolean): void => {
    base.patchState({ autoUpdateCheck: enabled });
    void persistSettings({ autoUpdateCheck: enabled }).catch(onError);
  };

  const setUpdateState = (
    updater: AppUpdateState | ((prev: AppUpdateState) => AppUpdateState),
  ): void => {
    const prev = base.getState().updateState;
    const next = typeof updater === 'function' ? updater(prev) : updater;
    if (shallowEqual(prev, next)) return;
    base.patchState({ updateState: next });
  };

  return {
    ...base,
    hydrateAutoUpdateCheck,
    toggleAutoUpdateCheck,
    setUpdateState,
  };
}

export const updaterStore = createUpdaterStore();

export function useUpdaterSelector<S>(
  selector: (state: UpdaterStoreState) => S,
  isEqual: EqualityFn<S> = shallowEqual,
): S {
  return useSelectorStore(updaterStore, selector, isEqual);
}
