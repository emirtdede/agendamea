import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import type { UiDictionary } from '../i18n/translations';
import type {
  AppSettings,
  NotificationChannelMode,
  NotificationChannelsMap,
  NotificationEventType,
  NotificationProfileId,
  Todo,
} from '../types';
import {
  clampNotificationLeadMinutes,
  DEFAULT_NOTIFICATION_CHANNELS,
  DEFAULT_NOTIFICATION_LEAD_MINUTES,
  detectMatchingNotificationProfile,
  evaluateTaskReminders,
  NOTIFICATION_PROFILE_PRESETS,
  sanitizeNotificationChannels,
  shouldDeliverNotification,
} from '../utils/notifications';

const SENT_REMINDERS_STORAGE_KEY = 'agendamea-sent-reminders-v1';
const MAX_PERSISTED_REMINDER_KEYS = 300;

function loadPersistedSentReminderKeys(): Set<string> {
  try {
    const raw = localStorage.getItem(SENT_REMINDERS_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return new Set(
        parsed
          .filter((item): item is string => typeof item === 'string' && item.length > 0)
          .slice(-MAX_PERSISTED_REMINDER_KEYS),
      );
    }
  } catch {
    // Ignore storage read failures
  }
  return new Set();
}

function persistSentReminderKeys(keys: Set<string>): void {
  try {
    const trimmed = Array.from(keys).slice(-MAX_PERSISTED_REMINDER_KEYS);
    localStorage.setItem(SENT_REMINDERS_STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // Ignore storage write failures
  }
}

export interface NotificationDispatchPayload {
  title: string;
  body?: string;
  todoId?: string;
  variant?: 'info' | 'error';
}

export function useNotificationCenter({
  todos,
  tRef,
  showInfoToast,
}: {
  todos: Todo[];
  tRef: React.MutableRefObject<UiDictionary>;
  showInfoToast: (message: string, variant?: 'info' | 'error') => void;
}) {
  const [notificationProfile, setNotificationProfile] =
    useState<NotificationProfileId>('balanced');
  const [notificationLeadMinutes, setNotificationLeadMinutesState] = useState<number>(
    DEFAULT_NOTIFICATION_LEAD_MINUTES,
  );
  const [notificationChannels, setNotificationChannels] = useState<NotificationChannelsMap>({
    ...DEFAULT_NOTIFICATION_CHANNELS,
  });

  const channelsRef = useRef(notificationChannels);
  channelsRef.current = notificationChannels;
  const leadMinutesRef = useRef(notificationLeadMinutes);
  leadMinutesRef.current = notificationLeadMinutes;
  const todosRef = useRef(todos);
  todosRef.current = todos;
  const sentKeysRef = useRef<Set<string>>(loadPersistedSentReminderKeys());

  const hydrateNotificationSettings = useCallback((settings: AppSettings) => {
    const channels = sanitizeNotificationChannels(settings.notificationChannels);
    setNotificationChannels(channels);
    const detected =
      settings.notificationProfile ?? detectMatchingNotificationProfile(channels);
    setNotificationProfile(detected);
    setNotificationLeadMinutesState(
      clampNotificationLeadMinutes(settings.notificationLeadMinutes),
    );
  }, []);

  const dispatchNotification = useCallback(
    (eventType: NotificationEventType, payload: NotificationDispatchPayload) => {
      const delivery = shouldDeliverNotification(channelsRef.current, eventType);
      if (delivery.inApp) {
        const message = payload.body ? `${payload.title}: ${payload.body}` : payload.title;
        showInfoToast(message, payload.variant ?? 'info');
      }
      if (delivery.desktop) {
        if (window.agendameaWindow?.showDesktopNotification) {
          void window.agendameaWindow
            .showDesktopNotification({
              title: payload.title,
              body: payload.body || '',
              todoId: payload.todoId,
            })
            .catch(() => {});
        } else if (
          typeof Notification !== 'undefined' &&
          Notification.permission === 'granted'
        ) {
          try {
            new Notification(payload.title, { body: payload.body || '' });
          } catch {
            // Ignore browser Notification errors
          }
        }
      }
    },
    [showInfoToast],
  );

  const requestBrowserNotificationPermissionIfNeeded = useCallback((wantsDesktop: boolean) => {
    if (!wantsDesktop) return;
    if (window.agendameaWindow?.showDesktopNotification) return;
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      void Notification.requestPermission().catch(() => {});
    }
  }, []);

  const applyNotificationProfile = useCallback(
    (profile: Exclude<NotificationProfileId, 'custom'>) => {
      const preset = { ...NOTIFICATION_PROFILE_PRESETS[profile] };
      const wantsDesktop = Object.values(preset).some((m) => m === 'both' || m === 'desktop');
      requestBrowserNotificationPermissionIfNeeded(wantsDesktop);
      setNotificationProfile(profile);
      setNotificationChannels(preset);
      void api
        .updateSettings({
          notificationProfile: profile,
          notificationChannels: preset,
        })
        .catch(() => {});
    },
    [requestBrowserNotificationPermissionIfNeeded],
  );

  const updateNotificationChannel = useCallback(
    (eventType: NotificationEventType, mode: NotificationChannelMode) => {
      requestBrowserNotificationPermissionIfNeeded(mode === 'both' || mode === 'desktop');
      const next: NotificationChannelsMap = { ...channelsRef.current, [eventType]: mode };
      const matched = detectMatchingNotificationProfile(next);
      channelsRef.current = next;
      setNotificationChannels(next);
      setNotificationProfile(matched);
      void api
        .updateSettings({
          notificationProfile: matched,
          notificationChannels: next,
        })
        .catch(() => {});
    },
    [requestBrowserNotificationPermissionIfNeeded],
  );

  const updateNotificationLeadMinutes = useCallback((minutes: number) => {
    const clamped = clampNotificationLeadMinutes(minutes);
    setNotificationLeadMinutesState(clamped);
    void api.updateSettings({ notificationLeadMinutes: clamped }).catch(() => {});
  }, []);

  const sendTestNotification = useCallback(() => {
    const dict = tRef.current;
    // Honor active channel selection; if all channels are silenced (Focus Mode), preview both so user can verify delivery
    const anyDesktop = Object.values(channelsRef.current).some(
      (m) => m === 'both' || m === 'desktop',
    );
    const anyInApp = Object.values(channelsRef.current).some(
      (m) => m === 'both' || m === 'inApp',
    );
    const allSilenced = !anyDesktop && !anyInApp;
    const sendInApp = anyInApp || allSilenced;
    const sendDesktop = anyDesktop || allSilenced;

    if (sendInApp) {
      showInfoToast(`${dict.notificationsTestTitle}: ${dict.notificationsTestBody}`, 'info');
    }
    if (sendDesktop) {
      if (window.agendameaWindow?.showDesktopNotification) {
        void window.agendameaWindow
          .showDesktopNotification({
            title: dict.notificationsTestTitle,
            body: dict.notificationsTestBody,
          })
          .catch(() => {});
      } else if (typeof Notification !== 'undefined') {
        if (Notification.permission === 'granted') {
          try {
            new Notification(dict.notificationsTestTitle, { body: dict.notificationsTestBody });
          } catch {
            // Ignore
          }
        } else if (Notification.permission === 'default') {
          void Notification.requestPermission().then((perm) => {
            if (perm === 'granted') {
              try {
                new Notification(dict.notificationsTestTitle, {
                  body: dict.notificationsTestBody,
                });
              } catch {
                // Ignore
              }
            }
          });
        }
      }
    }
  }, [showInfoToast, tRef]);

  // Background due/upcoming task reminder ticker (checks every 20s)
  useEffect(() => {
    const checkReminders = () => {
      const now = new Date();
      const hits = evaluateTaskReminders(todosRef.current, now, leadMinutesRef.current);
      if (hits.length === 0) return;
      const dict = tRef.current;
      let addedAny = false;
      for (const hit of hits) {
        if (sentKeysRef.current.has(hit.reminderKey)) continue;
        sentKeysRef.current.add(hit.reminderKey);
        addedAny = true;
        const title =
          hit.kind === 'upcoming'
            ? dict.notificationTaskUpcomingTitle
            : dict.notificationTaskDueTitle;
        const body = hit.todo.dueTime
          ? `${hit.todo.title} (${hit.todo.dueTime})`
          : hit.todo.title;
        dispatchNotification(hit.kind === 'upcoming' ? 'taskUpcoming' : 'taskDue', {
          title,
          body,
          todoId: hit.todo.id,
        });
      }
      // Keep dedup set bounded and persisted across restarts
      if (sentKeysRef.current.size > MAX_PERSISTED_REMINDER_KEYS) {
        const entries = Array.from(sentKeysRef.current).slice(-200);
        sentKeysRef.current = new Set(entries);
      }
      if (addedAny) {
        persistSentReminderKeys(sentKeysRef.current);
      }
    };

    const initialTimer = window.setTimeout(checkReminders, 4000);
    const intervalId = window.setInterval(checkReminders, 20000);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(intervalId);
    };
  }, [dispatchNotification, tRef]);

  return {
    notificationProfile,
    notificationLeadMinutes,
    notificationChannels,
    hydrateNotificationSettings,
    applyNotificationProfile,
    updateNotificationChannel,
    updateNotificationLeadMinutes,
    dispatchNotification,
    sendTestNotification,
  };
}
