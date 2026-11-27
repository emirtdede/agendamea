import { api } from '../api/client';
import type { AppLockAutoLockMinutes, AppLockStatus, AppLockType, AppSettings } from '../types';
import {
  createSelectorStore,
  type EqualityFn,
  type SelectorStore,
  shallowEqual,
  useSelectorStore,
} from './createSelectorStore';

export interface AppLockStoreState {
  enabled: boolean;
  locked: boolean;
  type: AppLockType;
  autoLockMinutes: AppLockAutoLockMinutes;
  lockOnMinimize: boolean;
  hasRecoveryCode: boolean;
  failedAttempts: number;
  retryAfterSeconds: number;
}

const DEFAULT_LOCK_STATE: AppLockStoreState = {
  enabled: false,
  locked: false,
  type: 'pin4',
  autoLockMinutes: 5,
  lockOnMinimize: false,
  hasRecoveryCode: false,
  failedAttempts: 0,
  retryAfterSeconds: 0,
};

export interface AppLockStore extends SelectorStore<AppLockStoreState> {
  hydrateFromSettings: (settings: AppSettings) => void;
  applyStatus: (status: AppLockStatus) => void;
  setLockedLocal: (locked: boolean) => void;
  resetToDisabled: () => void;
  updateConfig: (patch: {
    autoLockMinutes?: AppLockAutoLockMinutes;
    lockOnMinimize?: boolean;
  }) => Promise<AppLockStatus | null>;
}

function readInitialLockState(): AppLockStoreState {
  if (typeof window === 'undefined') {
    return { ...DEFAULT_LOCK_STATE };
  }
  const injected = (window as unknown as { __AGENDAMEA_INITIAL_LOCK__?: Partial<AppLockStatus> })
    .__AGENDAMEA_INITIAL_LOCK__;
  if (!injected || typeof injected !== 'object') {
    return { ...DEFAULT_LOCK_STATE };
  }
  const enabled = Boolean(injected.enabled);
  const type: AppLockType =
    injected.type === 'pin4' ||
    injected.type === 'pin6' ||
    injected.type === 'pin8' ||
    injected.type === 'password'
      ? injected.type
      : 'pin4';
  const rawMins = injected.autoLockMinutes;
  const autoLockMinutes: AppLockAutoLockMinutes =
    rawMins === 0 ||
    rawMins === 1 ||
    rawMins === 5 ||
    rawMins === 15 ||
    rawMins === 30 ||
    rawMins === 60
      ? rawMins
      : 5;
  return {
    enabled,
    locked: Boolean(enabled && injected.locked),
    type,
    autoLockMinutes,
    lockOnMinimize: Boolean(injected.lockOnMinimize),
    hasRecoveryCode: Boolean(injected.hasRecoveryCode),
    failedAttempts: Number(injected.failedAttempts) || 0,
    retryAfterSeconds: Math.max(0, Number(injected.retryAfterSeconds) || 0),
  };
}

export function createAppLockStore(): AppLockStore {
  const base = createSelectorStore<AppLockStoreState>(readInitialLockState());

  const hydrateFromSettings = (settings: AppSettings) => {
    const enabled = Boolean(settings.appLockEnabled);
    const type: AppLockType =
      settings.appLockType === 'pin4' ||
      settings.appLockType === 'pin6' ||
      settings.appLockType === 'pin8' ||
      settings.appLockType === 'password'
        ? settings.appLockType
        : 'pin4';
    const rawMins = settings.appLockAutoLockMinutes;
    const autoLockMinutes: AppLockAutoLockMinutes =
      rawMins === 0 ||
      rawMins === 1 ||
      rawMins === 5 ||
      rawMins === 15 ||
      rawMins === 30 ||
      rawMins === 60
        ? rawMins
        : 5;
    const lockOnMinimize = Boolean(settings.appLockOnMinimize);
    base.setState((prev) => ({
      ...prev,
      enabled,
      locked: enabled ? prev.locked : false,
      type,
      autoLockMinutes,
      lockOnMinimize,
    }));
  };

  const applyStatus = (status: AppLockStatus) => {
    base.setState({
      enabled: Boolean(status.enabled),
      locked: Boolean(status.enabled && status.locked),
      type: status.type,
      autoLockMinutes: status.autoLockMinutes,
      lockOnMinimize: Boolean(status.lockOnMinimize),
      hasRecoveryCode: Boolean(status.hasRecoveryCode),
      failedAttempts: Number(status.failedAttempts) || 0,
      retryAfterSeconds: Math.max(0, Number(status.retryAfterSeconds) || 0),
    });
  };

  const updateConfig = async (patch: {
    autoLockMinutes?: AppLockAutoLockMinutes;
    lockOnMinimize?: boolean;
  }): Promise<AppLockStatus | null> => {
    base.setState((prev) => ({
      ...prev,
      ...(patch.autoLockMinutes !== undefined ? { autoLockMinutes: patch.autoLockMinutes } : {}),
      ...(patch.lockOnMinimize !== undefined ? { lockOnMinimize: patch.lockOnMinimize } : {}),
    }));
    try {
      const next = await api.updateAppLockConfig(patch);
      applyStatus(next);
      return next;
    } catch {
      return null;
    }
  };

  const setLockedLocal = (locked: boolean) => {
    base.setState((prev) => ({
      ...prev,
      locked: prev.enabled && locked,
    }));
  };

  const resetToDisabled = () => {
    base.setState({ ...DEFAULT_LOCK_STATE });
  };

  return {
    ...base,
    hydrateFromSettings,
    applyStatus,
    setLockedLocal,
    resetToDisabled,
    updateConfig,
  };
}

export const appLockStore = createAppLockStore();

export function useAppLockSelector<TSelected>(
  selector: (state: AppLockStoreState) => TSelected,
  equalityFn: EqualityFn<TSelected> = shallowEqual,
): TSelected {
  return useSelectorStore(appLockStore, selector, equalityFn);
}
