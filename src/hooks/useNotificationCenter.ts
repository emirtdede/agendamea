import { useCallback, useEffect, useRef } from 'react';
import type { UiDictionary } from '../i18n/translations';
import { notificationStore } from '../store/notificationStore';
import type { AppSettings, NotificationEventType, Todo } from '../types';
import {
  evaluateTaskReminders,
  isWithinQuietHours,
  shouldDeliverNotification,
} from '../utils/notifications';
import { isTodoScheduledForToday } from '../utils/todoLogic';

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

/**
 * Store-backed notification runtime.
 * Keeps ZERO React state inside App.tsx so changing notification profiles,
 * channels, or lead times triggers 0 App.tsx re-renders.
 */
export function useNotificationCenter({
  todos,
  tRef,
  showInfoToast,
  onFocusTodo,
}: {
  todos: Todo[];
  tRef: React.MutableRefObject<UiDictionary>;
  showInfoToast: (message: string, variant?: 'info' | 'error') => void;
  onFocusTodo?: (todoId: string) => void;
}) {
  const todosRef = useRef(todos);
  todosRef.current = todos;
  const onFocusTodoRef = useRef(onFocusTodo);
  onFocusTodoRef.current = onFocusTodo;
  const sentKeysRef = useRef<Set<string>>(loadPersistedSentReminderKeys());

  const hydrateNotificationSettings = useCallback((settings: AppSettings) => {
    notificationStore.hydrate(settings);
  }, []);

  const dispatchNotification = useCallback(
    (eventType: NotificationEventType, payload: NotificationDispatchPayload) => {
      const notifState = notificationStore.getState();
      const delivery = shouldDeliverNotification(notifState.channels, eventType);
      const quietNow = isWithinQuietHours(
        new Date(),
        notifState.quietHoursEnabled,
        notifState.quietHoursStart,
        notifState.quietHoursEnd,
      );
      if (delivery.inApp) {
        const message = payload.body ? `${payload.title}: ${payload.body}` : payload.title;
        showInfoToast(message, payload.variant ?? 'info');
      }
      if (delivery.desktop && !quietNow) {
        if (window.agendameaWindow?.showDesktopNotification) {
          void window.agendameaWindow
            .showDesktopNotification({
              title: payload.title,
              body: payload.body || '',
              todoId: payload.todoId,
              silent: !notifState.notificationSoundEnabled,
            })
            .catch(() => {
              /* ignore */
            });
        } else if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          try {
            const browserNotif = new Notification(payload.title, {
              body: payload.body || '',
              silent: !notifState.notificationSoundEnabled,
            });
            browserNotif.onclick = () => {
              try {
                window.focus();
              } catch {
                // Ignore browser focus errors
              }
              if (payload.todoId) {
                onFocusTodoRef.current?.(payload.todoId);
              }
              browserNotif.close();
            };
          } catch {
            // Ignore browser Notification errors
          }
        }
      }
    },
    [showInfoToast],
  );

  const sendTestNotification = useCallback(() => {
    const dict = tRef.current;
    const channels = notificationStore.getState().channels;
    const anyDesktop = Object.values(channels).some((m) => m === 'both' || m === 'desktop');
    const anyInApp = Object.values(channels).some((m) => m === 'both' || m === 'inApp');
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
          .catch(() => {
            /* ignore */
          });
      } else if (typeof Notification !== 'undefined') {
        const openBrowserTestNotif = () => {
          try {
            const browserNotif = new Notification(dict.notificationsTestTitle, {
              body: dict.notificationsTestBody,
            });
            browserNotif.onclick = () => {
              try {
                window.focus();
              } catch {
                // Ignore
              }
              browserNotif.close();
            };
          } catch {
            // Ignore
          }
        };
        if (Notification.permission === 'granted') {
          openBrowserTestNotif();
        } else if (Notification.permission === 'default') {
          void Notification.requestPermission().then((perm) => {
            if (perm === 'granted') {
              openBrowserTestNotif();
            } else if (!sendInApp) {
              showInfoToast(
                `${dict.notificationsTestTitle}: ${dict.notificationsTestBody}`,
                'info',
              );
            }
          });
        } else if (!sendInApp) {
          showInfoToast(`${dict.notificationsTestTitle}: ${dict.notificationsTestBody}`, 'info');
        }
      } else if (!sendInApp) {
        showInfoToast(`${dict.notificationsTestTitle}: ${dict.notificationsTestBody}`, 'info');
      }
    }
  }, [showInfoToast, tRef]);

  // Background due/upcoming task reminder ticker (checks every 20s)
  useEffect(() => {
    const checkReminders = () => {
      const now = new Date();
      const notifState = notificationStore.getState();
      const leadMinutes = notifState.leadMinutes;
      const hits = evaluateTaskReminders(todosRef.current, now, leadMinutes);
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
        const body = hit.todo.dueTime ? `${hit.todo.title} (${hit.todo.dueTime})` : hit.todo.title;
        dispatchNotification(hit.kind === 'upcoming' ? 'taskUpcoming' : 'taskDue', {
          title,
          body,
          todoId: hit.todo.id,
        });
      }

      // Daily Digest check (fires once per day at configured HH:mm)
      if (notifState.dailyDigestEnabled) {
        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, '0');
        const d = String(now.getDate()).padStart(2, '0');
        const todayStr = `${y}-${m}-${d}`;
        const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        const digestKey = `digest:${todayStr}:${notifState.dailyDigestTime}`;
        if (hhmm >= notifState.dailyDigestTime && !sentKeysRef.current.has(digestKey)) {
          sentKeysRef.current.add(digestKey);
          addedAny = true;
          const active = todosRef.current.filter((item) => !item.completed && !item.deletedAt);
          const todayCount = active.filter((item) =>
            isTodoScheduledForToday(item, todayStr),
          ).length;
          const overdueCount = active.filter(
            (item) => item.dueDate && item.dueDate < todayStr,
          ).length;
          if (todayCount > 0 || overdueCount > 0) {
            dispatchNotification('taskUpcoming', {
              title: dict.notifDailyDigestLabel,
              body: `${dict.today}: ${todayCount} · ${dict.overdueSuffix}: ${overdueCount}`,
            });
          }
        }
      }

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

  const clearPersistedSentReminders = useCallback(() => {
    sentKeysRef.current.clear();
    try {
      localStorage.removeItem(SENT_REMINDERS_STORAGE_KEY);
    } catch {
      // Ignore storage errors
    }
  }, []);

  return {
    hydrateNotificationSettings,
    dispatchNotification,
    sendTestNotification,
    clearPersistedSentReminders,
  };
}
