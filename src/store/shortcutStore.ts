import { api } from '../api/client';
import type { AppSettings } from '../types';
import {
  type CustomShortcutsMap,
  DEFAULT_CUSTOM_SHORTCUTS,
  type ShortcutActionId,
  sanitizeCustomShortcuts,
} from '../utils/shortcuts';
import {
  createSelectorStore,
  type EqualityFn,
  type SelectorStore,
  shallowEqual,
  useSelectorStore,
} from './createSelectorStore';
import { reportStoreError } from './storeErrorBus';

export const DEFAULT_GLOBAL_QUICK_ADD_KEY = 'CommandOrControl+Alt+N';
export const DEFAULT_VOICE_SHORTCUT_KEY = 'CommandOrControl+Alt+D';

export interface ShortcutStoreState {
  globalQuickAddShortcut: boolean;
  globalQuickAddShortcutKey: string;
  quickAddRegistered: boolean;
  voiceShortcutEnabled: boolean;
  voiceShortcut: string;
  voiceRegistered: boolean;
  customShortcuts: CustomShortcutsMap;
}

export interface ShortcutStore extends SelectorStore<ShortcutStoreState> {
  hydrate: (
    settings: AppSettings,
    options?: { fallbackDefaults?: boolean; syncElectron?: boolean },
  ) => void;
  setGlobalQuickAddEnabled: (enabled: boolean) => void;
  setGlobalQuickAddKey: (nextKey: string) => void;
  setVoiceShortcutEnabled: (enabled: boolean) => void;
  setVoiceShortcut: (nextKey: string) => void;
  setCustomShortcut: (action: ShortcutActionId, nextShortcut: string) => void;
  refreshOsStatus: () => Promise<void>;
  autoResolveOsConflicts: () => Promise<void>;
  resetAll: () => void;
}

function getInitialShortcutState(): ShortcutStoreState {
  return {
    globalQuickAddShortcut: true,
    globalQuickAddShortcutKey: DEFAULT_GLOBAL_QUICK_ADD_KEY,
    quickAddRegistered: true,
    voiceShortcutEnabled: true,
    voiceShortcut: DEFAULT_VOICE_SHORTCUT_KEY,
    voiceRegistered: true,
    customShortcuts: { ...DEFAULT_CUSTOM_SHORTCUTS },
  };
}

export function createShortcutStore(
  persistSettings: (patch: Partial<AppSettings>) => Promise<AppSettings> = (patch) =>
    api.updateSettings(patch),
  onError: (err: unknown) => void = (err) => reportStoreError(err),
): ShortcutStore {
  const base = createSelectorStore<ShortcutStoreState>(getInitialShortcutState);

  const getBridge = () => (typeof window !== 'undefined' ? window.agendameaWindow : undefined);

  const hydrate = (
    settings: AppSettings,
    options?: { fallbackDefaults?: boolean; syncElectron?: boolean },
  ): void => {
    const prev = base.getState();
    const nextEnabled =
      typeof settings.globalQuickAddShortcut === 'boolean'
        ? settings.globalQuickAddShortcut
        : options?.fallbackDefaults
          ? true
          : prev.globalQuickAddShortcut;
    const nextVoiceEnabled =
      typeof settings.voiceShortcutEnabled === 'boolean'
        ? settings.voiceShortcutEnabled
        : options?.fallbackDefaults
          ? true
          : prev.voiceShortcutEnabled;
    const nextVoice =
      typeof settings.voiceShortcut === 'string' && settings.voiceShortcut.trim()
        ? settings.voiceShortcut.trim()
        : options?.fallbackDefaults
          ? DEFAULT_VOICE_SHORTCUT_KEY
          : prev.voiceShortcut;
    const nextQuickAddKey =
      typeof settings.globalQuickAddShortcutKey === 'string' &&
      settings.globalQuickAddShortcutKey.trim()
        ? settings.globalQuickAddShortcutKey.trim()
        : options?.fallbackDefaults
          ? DEFAULT_GLOBAL_QUICK_ADD_KEY
          : prev.globalQuickAddShortcutKey;
    const nextCustom = sanitizeCustomShortcuts(settings.customShortcuts);
    const customChanged = !shallowEqual(prev.customShortcuts, nextCustom);

    base.patchState({
      globalQuickAddShortcut: nextEnabled,
      globalQuickAddShortcutKey: nextQuickAddKey,
      voiceShortcutEnabled: nextVoiceEnabled,
      voiceShortcut: nextVoice,
      customShortcuts: customChanged ? nextCustom : prev.customShortcuts,
    });

    if (options?.syncElectron) {
      const bridge = getBridge();
      if (typeof settings.globalQuickAddShortcut === 'boolean' || options.fallbackDefaults) {
        void bridge
          ?.setGlobalQuickAddShortcut?.(nextEnabled)
          ?.then((res) => {
            if (res && typeof res.registered === 'boolean') {
              base.patchState({ quickAddRegistered: res.registered });
            }
          })
          ?.catch(() => {
            /* ignore */
          });
      }
      if (typeof settings.voiceShortcutEnabled === 'boolean' || options.fallbackDefaults) {
        void bridge
          ?.setVoiceShortcutEnabled?.(nextVoiceEnabled)
          ?.then((res) => {
            if (res && typeof res.registered === 'boolean') {
              base.patchState({ voiceRegistered: res.registered });
            }
          })
          ?.catch(() => {
            /* ignore */
          });
      }
      if (
        (typeof settings.voiceShortcut === 'string' && settings.voiceShortcut.trim()) ||
        options.fallbackDefaults
      ) {
        void bridge
          ?.setVoiceShortcut?.(nextVoice)
          ?.then((res) => {
            if (res && typeof res.registered === 'boolean') {
              base.patchState({ voiceRegistered: res.registered });
            }
          })
          ?.catch(() => {
            /* ignore */
          });
      }
      if (
        (typeof settings.globalQuickAddShortcutKey === 'string' &&
          settings.globalQuickAddShortcutKey.trim()) ||
        options.fallbackDefaults
      ) {
        void bridge
          ?.setGlobalQuickAddShortcutKey?.(nextQuickAddKey)
          ?.then((res) => {
            if (res && typeof res.registered === 'boolean') {
              base.patchState({ quickAddRegistered: res.registered });
            }
          })
          ?.catch(() => {
            /* ignore */
          });
      }
    }
  };

  const refreshOsStatus = async (): Promise<void> => {
    try {
      const st = await getBridge()?.getShortcutStatus?.();
      if (st) {
        const prev = base.getState();
        const patch: Partial<ShortcutStoreState> = {
          quickAddRegistered: Boolean(st.quickAddRegistered),
          voiceRegistered: Boolean(st.voiceRegistered),
        };
        const persistPatch: Partial<AppSettings> = {};
        if (st.quickAddKey && st.quickAddKey !== prev.globalQuickAddShortcutKey) {
          patch.globalQuickAddShortcutKey = st.quickAddKey;
          persistPatch.globalQuickAddShortcutKey = st.quickAddKey;
        }
        if (st.voiceShortcut && st.voiceShortcut !== prev.voiceShortcut) {
          patch.voiceShortcut = st.voiceShortcut;
          persistPatch.voiceShortcut = st.voiceShortcut;
        }
        base.patchState(patch);
        if (Object.keys(persistPatch).length > 0) {
          void persistSettings(persistPatch).catch(onError);
        }
      }
    } catch {
      // Ignore in web mode
    }
  };

  const autoResolveOsConflicts = async (): Promise<void> => {
    try {
      const res = await getBridge()?.autoResolveShortcuts?.();
      if (!res) {
        await refreshOsStatus();
        return;
      }
      const prev = base.getState();
      const patch: Partial<ShortcutStoreState> = {
        quickAddRegistered:
          typeof res.quickAddRegistered === 'boolean'
            ? res.quickAddRegistered
            : prev.quickAddRegistered,
        voiceRegistered:
          typeof res.voiceRegistered === 'boolean' ? res.voiceRegistered : prev.voiceRegistered,
      };
      const persistPatch: Partial<AppSettings> = {};
      if (res.quickAddKey && res.quickAddKey !== prev.globalQuickAddShortcutKey) {
        patch.globalQuickAddShortcutKey = res.quickAddKey;
        persistPatch.globalQuickAddShortcutKey = res.quickAddKey;
      }
      if (res.voiceShortcut && res.voiceShortcut !== prev.voiceShortcut) {
        patch.voiceShortcut = res.voiceShortcut;
        persistPatch.voiceShortcut = res.voiceShortcut;
      }
      base.patchState(patch);
      if (Object.keys(persistPatch).length > 0) {
        void persistSettings(persistPatch).catch(onError);
      }
    } catch {
      // Ignore in web mode
    }
  };

  const setGlobalQuickAddEnabled = (enabled: boolean): void => {
    base.patchState({ globalQuickAddShortcut: enabled });
    void getBridge()
      ?.setGlobalQuickAddShortcut?.(enabled)
      ?.then((res) => {
        if (res && typeof res.registered === 'boolean') {
          base.patchState({ quickAddRegistered: res.registered });
        }
      })
      ?.catch(() => {
        /* ignore */
      });
    void persistSettings({ globalQuickAddShortcut: enabled }).catch(onError);
  };

  const setGlobalQuickAddKey = (nextKey: string): void => {
    base.patchState({ globalQuickAddShortcutKey: nextKey });
    void getBridge()
      ?.setGlobalQuickAddShortcutKey?.(nextKey)
      ?.then((res) => {
        if (res && typeof res.registered === 'boolean') {
          base.patchState({ quickAddRegistered: res.registered });
        }
      })
      ?.catch(() => {
        /* ignore */
      });
    void persistSettings({ globalQuickAddShortcutKey: nextKey }).catch(onError);
  };

  const setVoiceShortcutEnabled = (enabled: boolean): void => {
    base.patchState({ voiceShortcutEnabled: enabled });
    void getBridge()
      ?.setVoiceShortcutEnabled?.(enabled)
      ?.then((res) => {
        if (res && typeof res.registered === 'boolean') {
          base.patchState({ voiceRegistered: res.registered });
        }
      })
      ?.catch(() => {
        /* ignore */
      });
    void persistSettings({ voiceShortcutEnabled: enabled }).catch(onError);
  };

  const setVoiceShortcut = (nextKey: string): void => {
    base.patchState({ voiceShortcut: nextKey });
    void getBridge()
      ?.setVoiceShortcut?.(nextKey)
      ?.then((res) => {
        if (res && typeof res.registered === 'boolean') {
          base.patchState({ voiceRegistered: res.registered });
        }
      })
      ?.catch(() => {
        /* ignore */
      });
    void persistSettings({ voiceShortcut: nextKey }).catch(onError);
  };

  const setCustomShortcut = (action: ShortcutActionId, nextShortcut: string): void => {
    const next: CustomShortcutsMap = {
      ...base.getState().customShortcuts,
      [action]: nextShortcut,
    };
    base.patchState({ customShortcuts: next });
    void persistSettings({ customShortcuts: next }).catch(onError);
  };

  const resetAll = (): void => {
    const defaults: CustomShortcutsMap = { ...DEFAULT_CUSTOM_SHORTCUTS };
    base.patchState({
      globalQuickAddShortcut: true,
      globalQuickAddShortcutKey: DEFAULT_GLOBAL_QUICK_ADD_KEY,
      voiceShortcutEnabled: true,
      voiceShortcut: DEFAULT_VOICE_SHORTCUT_KEY,
      customShortcuts: defaults,
    });
    const bridge = getBridge();
    void Promise.allSettled([
      bridge?.setGlobalQuickAddShortcut?.(true),
      bridge?.setGlobalQuickAddShortcutKey?.(DEFAULT_GLOBAL_QUICK_ADD_KEY),
      bridge?.setVoiceShortcutEnabled?.(true),
      bridge?.setVoiceShortcut?.(DEFAULT_VOICE_SHORTCUT_KEY),
    ]).finally(() => {
      void refreshOsStatus();
    });
    void persistSettings({
      globalQuickAddShortcut: true,
      customShortcuts: defaults,
      globalQuickAddShortcutKey: DEFAULT_GLOBAL_QUICK_ADD_KEY,
      voiceShortcutEnabled: true,
      voiceShortcut: DEFAULT_VOICE_SHORTCUT_KEY,
    }).catch(onError);
  };

  return {
    ...base,
    hydrate,
    setGlobalQuickAddEnabled,
    setGlobalQuickAddKey,
    setVoiceShortcutEnabled,
    setVoiceShortcut,
    setCustomShortcut,
    refreshOsStatus,
    autoResolveOsConflicts,
    resetAll,
  };
}

export const shortcutStore = createShortcutStore();

export function useShortcutSelector<S>(
  selector: (state: ShortcutStoreState) => S,
  isEqual: EqualityFn<S> = shallowEqual,
): S {
  return useSelectorStore(shortcutStore, selector, isEqual);
}
