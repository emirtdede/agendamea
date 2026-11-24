import { api } from '../api/client';
import type {
  AppSettings,
  NotificationChannelMode,
  NotificationChannelsMap,
  NotificationEventType,
  NotificationProfileId,
} from '../types';
import {
  clampNotificationLeadMinutes,
  DEFAULT_DAILY_DIGEST_TIME,
  DEFAULT_NOTIFICATION_CHANNELS,
  DEFAULT_NOTIFICATION_LEAD_MINUTES,
  DEFAULT_QUIET_HOURS_END,
  DEFAULT_QUIET_HOURS_START,
  detectMatchingNotificationProfile,
  NOTIFICATION_PROFILE_PRESETS,
  sanitizeNotificationChannels,
  sanitizeTimeHHMM,
} from '../utils/notifications';
import {
  createSelectorStore,
  type EqualityFn,
  type SelectorStore,
  shallowEqual,
  useSelectorStore,
} from './createSelectorStore';
import { reportStoreError } from './storeErrorBus';

export interface NotificationStoreState {
  profile: NotificationProfileId;
  leadMinutes: number;
  channels: NotificationChannelsMap;
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
  notificationSoundEnabled: boolean;
  dailyDigestEnabled: boolean;
  dailyDigestTime: string;
}

export interface NotificationStore extends SelectorStore<NotificationStoreState> {
  hydrate: (settings: AppSettings) => void;
  applyProfile: (profile: Exclude<NotificationProfileId, 'custom'>) => void;
  updateChannel: (eventType: NotificationEventType, mode: NotificationChannelMode) => void;
  updateLeadMinutes: (minutes: number) => void;
  setQuietHoursEnabled: (enabled: boolean) => void;
  setQuietHoursStart: (time: string) => void;
  setQuietHoursEnd: (time: string) => void;
  setNotificationSoundEnabled: (enabled: boolean) => void;
  setDailyDigestEnabled: (enabled: boolean) => void;
  setDailyDigestTime: (time: string) => void;
  resetNotifications: () => void;
}

function requestBrowserNotificationPermissionIfNeeded(wantsDesktop: boolean): void {
  if (!wantsDesktop) return;
  if (typeof window !== 'undefined' && window.agendameaWindow?.showDesktopNotification) return;
  if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
    void Notification.requestPermission().catch(() => {
      /* ignore */
    });
  }
}

function getInitialNotificationState(): NotificationStoreState {
  return {
    profile: 'balanced',
    leadMinutes: DEFAULT_NOTIFICATION_LEAD_MINUTES,
    channels: { ...DEFAULT_NOTIFICATION_CHANNELS },
    quietHoursEnabled: false,
    quietHoursStart: DEFAULT_QUIET_HOURS_START,
    quietHoursEnd: DEFAULT_QUIET_HOURS_END,
    notificationSoundEnabled: true,
    dailyDigestEnabled: false,
    dailyDigestTime: DEFAULT_DAILY_DIGEST_TIME,
  };
}

export function createNotificationStore(
  persistSettings: (patch: Partial<AppSettings>) => Promise<AppSettings> = (patch) =>
    api.updateSettings(patch),
  onError: (err: unknown) => void = (err) => reportStoreError(err),
): NotificationStore {
  const base = createSelectorStore<NotificationStoreState>(getInitialNotificationState);

  const hydrate = (settings: AppSettings): void => {
    const prev = base.getState();
    const nextChannels = sanitizeNotificationChannels(settings.notificationChannels);
    const detected =
      settings.notificationProfile ?? detectMatchingNotificationProfile(nextChannels);
    const nextLead = clampNotificationLeadMinutes(settings.notificationLeadMinutes);
    base.patchState({
      profile: detected,
      leadMinutes: nextLead,
      channels: shallowEqual(prev.channels, nextChannels) ? prev.channels : nextChannels,
      quietHoursEnabled: Boolean(settings.quietHoursEnabled),
      quietHoursStart: sanitizeTimeHHMM(settings.quietHoursStart, DEFAULT_QUIET_HOURS_START),
      quietHoursEnd: sanitizeTimeHHMM(settings.quietHoursEnd, DEFAULT_QUIET_HOURS_END),
      notificationSoundEnabled: settings.notificationSoundEnabled !== false,
      dailyDigestEnabled: Boolean(settings.dailyDigestEnabled),
      dailyDigestTime: sanitizeTimeHHMM(settings.dailyDigestTime, DEFAULT_DAILY_DIGEST_TIME),
    });
  };

  const applyProfile = (profile: Exclude<NotificationProfileId, 'custom'>): void => {
    const preset: NotificationChannelsMap = { ...NOTIFICATION_PROFILE_PRESETS[profile] };
    const wantsDesktop = Object.values(preset).some((m) => m === 'both' || m === 'desktop');
    requestBrowserNotificationPermissionIfNeeded(wantsDesktop);
    base.patchState({
      profile,
      channels: preset,
    });
    void persistSettings({
      notificationProfile: profile,
      notificationChannels: preset,
    }).catch(onError);
  };

  const updateChannel = (eventType: NotificationEventType, mode: NotificationChannelMode): void => {
    requestBrowserNotificationPermissionIfNeeded(mode === 'both' || mode === 'desktop');
    const next: NotificationChannelsMap = { ...base.getState().channels, [eventType]: mode };
    const matched = detectMatchingNotificationProfile(next);
    base.patchState({
      profile: matched,
      channels: next,
    });
    void persistSettings({
      notificationProfile: matched,
      notificationChannels: next,
    }).catch(onError);
  };

  const updateLeadMinutes = (minutes: number): void => {
    const clamped = clampNotificationLeadMinutes(minutes);
    base.patchState({ leadMinutes: clamped });
    void persistSettings({ notificationLeadMinutes: clamped }).catch(onError);
  };

  const setQuietHoursEnabled = (enabled: boolean): void => {
    base.patchState({ quietHoursEnabled: enabled });
    void persistSettings({ quietHoursEnabled: enabled }).catch(onError);
  };

  const setQuietHoursStart = (time: string): void => {
    const clean = sanitizeTimeHHMM(time, DEFAULT_QUIET_HOURS_START);
    base.patchState({ quietHoursStart: clean });
    void persistSettings({ quietHoursStart: clean }).catch(onError);
  };

  const setQuietHoursEnd = (time: string): void => {
    const clean = sanitizeTimeHHMM(time, DEFAULT_QUIET_HOURS_END);
    base.patchState({ quietHoursEnd: clean });
    void persistSettings({ quietHoursEnd: clean }).catch(onError);
  };

  const setNotificationSoundEnabled = (enabled: boolean): void => {
    base.patchState({ notificationSoundEnabled: enabled });
    void persistSettings({ notificationSoundEnabled: enabled }).catch(onError);
  };

  const setDailyDigestEnabled = (enabled: boolean): void => {
    base.patchState({ dailyDigestEnabled: enabled });
    void persistSettings({ dailyDigestEnabled: enabled }).catch(onError);
  };

  const setDailyDigestTime = (time: string): void => {
    const clean = sanitizeTimeHHMM(time, DEFAULT_DAILY_DIGEST_TIME);
    base.patchState({ dailyDigestTime: clean });
    void persistSettings({ dailyDigestTime: clean }).catch(onError);
  };

  const resetNotifications = (): void => {
    const defaults = getInitialNotificationState();
    base.patchState(defaults);
    void persistSettings({
      notificationProfile: defaults.profile,
      notificationLeadMinutes: defaults.leadMinutes,
      notificationChannels: defaults.channels,
      quietHoursEnabled: defaults.quietHoursEnabled,
      quietHoursStart: defaults.quietHoursStart,
      quietHoursEnd: defaults.quietHoursEnd,
      notificationSoundEnabled: defaults.notificationSoundEnabled,
      dailyDigestEnabled: defaults.dailyDigestEnabled,
      dailyDigestTime: defaults.dailyDigestTime,
    }).catch(onError);
  };

  return {
    ...base,
    hydrate,
    applyProfile,
    updateChannel,
    updateLeadMinutes,
    setQuietHoursEnabled,
    setQuietHoursStart,
    setQuietHoursEnd,
    setNotificationSoundEnabled,
    setDailyDigestEnabled,
    setDailyDigestTime,
    resetNotifications,
  };
}

export const notificationStore = createNotificationStore();

export function useNotificationSelector<S>(
  selector: (state: NotificationStoreState) => S,
  isEqual: EqualityFn<S> = shallowEqual,
): S {
  return useSelectorStore(notificationStore, selector, isEqual);
}
