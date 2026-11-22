import type { Todo } from '../types';

export type NotificationProfileId =
  | 'balanced'
  | 'all'
  | 'focus'
  | 'silent_inapp'
  | 'custom';

export type NotificationChannelMode = 'both' | 'inApp' | 'desktop' | 'off';

export type NotificationEventType =
  | 'taskUpcoming'
  | 'taskDue'
  | 'taskCompleted'
  | 'voiceAssistant'
  | 'cloudSync'
  | 'appUpdates';

export type NotificationChannelsMap = Record<NotificationEventType, NotificationChannelMode>;

export const NOTIFICATION_EVENT_KEYS: readonly NotificationEventType[] = [
  'taskUpcoming',
  'taskDue',
  'taskCompleted',
  'voiceAssistant',
  'cloudSync',
  'appUpdates',
] as const;

export const NOTIFICATION_LEAD_OPTIONS = [5, 15, 30, 60] as const;

export const NOTIFICATION_PROFILE_PRESETS: Record<
  Exclude<NotificationProfileId, 'custom'>,
  NotificationChannelsMap
> = {
  balanced: {
    taskUpcoming: 'both',
    taskDue: 'both',
    taskCompleted: 'inApp',
    voiceAssistant: 'inApp',
    cloudSync: 'inApp',
    appUpdates: 'both',
  },
  all: {
    taskUpcoming: 'both',
    taskDue: 'both',
    taskCompleted: 'both',
    voiceAssistant: 'both',
    cloudSync: 'both',
    appUpdates: 'both',
  },
  focus: {
    taskUpcoming: 'off',
    taskDue: 'off',
    taskCompleted: 'off',
    voiceAssistant: 'off',
    cloudSync: 'off',
    appUpdates: 'off',
  },
  silent_inapp: {
    taskUpcoming: 'inApp',
    taskDue: 'inApp',
    taskCompleted: 'inApp',
    voiceAssistant: 'inApp',
    cloudSync: 'inApp',
    appUpdates: 'inApp',
  },
};

export const DEFAULT_NOTIFICATION_PROFILE: NotificationProfileId = 'balanced';
export const DEFAULT_NOTIFICATION_LEAD_MINUTES = 15;
export const DEFAULT_NOTIFICATION_CHANNELS: NotificationChannelsMap = {
  ...NOTIFICATION_PROFILE_PRESETS.balanced,
};

export function isValidNotificationChannelMode(val: unknown): val is NotificationChannelMode {
  return val === 'both' || val === 'inApp' || val === 'desktop' || val === 'off';
}

export function isValidNotificationProfileId(val: unknown): val is NotificationProfileId {
  return (
    val === 'balanced' ||
    val === 'all' ||
    val === 'focus' ||
    val === 'silent_inapp' ||
    val === 'custom'
  );
}

export function sanitizeNotificationChannels(raw: unknown): NotificationChannelsMap {
  const result: NotificationChannelsMap = { ...DEFAULT_NOTIFICATION_CHANNELS };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return result;
  }
  const obj = raw as Record<string, unknown>;
  for (const key of NOTIFICATION_EVENT_KEYS) {
    if (isValidNotificationChannelMode(obj[key])) {
      result[key] = obj[key] as NotificationChannelMode;
    }
  }
  return result;
}

export function detectMatchingNotificationProfile(
  channels: NotificationChannelsMap,
): NotificationProfileId {
  for (const profileId of ['balanced', 'all', 'focus', 'silent_inapp'] as const) {
    const preset = NOTIFICATION_PROFILE_PRESETS[profileId];
    if (NOTIFICATION_EVENT_KEYS.every((k) => channels[k] === preset[k])) {
      return profileId;
    }
  }
  return 'custom';
}

export function clampNotificationLeadMinutes(val: unknown): number {
  const num = Number(val);
  if (!Number.isFinite(num)) return DEFAULT_NOTIFICATION_LEAD_MINUTES;
  const rounded = Math.round(num);
  return Math.max(1, Math.min(180, rounded));
}

export function shouldDeliverNotification(
  channels: NotificationChannelsMap,
  event: NotificationEventType,
): { inApp: boolean; desktop: boolean } {
  const mode = channels[event] ?? 'inApp';
  return {
    inApp: mode === 'both' || mode === 'inApp',
    desktop: mode === 'both' || mode === 'desktop',
  };
}

export interface EvaluatedTaskReminder {
  todo: Todo;
  kind: 'upcoming' | 'due';
  reminderKey: string;
  minutesRemaining: number;
}

/**
 * Evaluates active (incomplete) tasks against the current local clock to find tasks
 * whose scheduled due date/time is approaching within `leadMinutes` or has just arrived/become overdue.
 */
export function evaluateTaskReminders(
  todos: readonly Todo[],
  now: Date,
  leadMinutes: number,
): EvaluatedTaskReminder[] {
  const lead = clampNotificationLeadMinutes(leadMinutes);
  const nowMs = now.getTime();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const todayStr = `${y}-${m}-${d}`;
  const results: EvaluatedTaskReminder[] = [];

  for (const todo of todos) {
    if (todo.completed || todo.deletedAt) continue;
    const targetDate = todo.dueDate || todo.startDate;
    if (!targetDate) continue;

    if (todo.dueTime && /^([01]\d|2[0-3]):[0-5]\d$/.test(todo.dueTime)) {
      const [yy, mm, dd] = targetDate.split('-').map(Number);
      const [hh, min] = todo.dueTime.split(':').map(Number);
      const dueDt = new Date(yy, mm - 1, dd, hh, min, 0, 0);
      if (Number.isNaN(dueDt.getTime())) continue;

      const diffMin = (dueDt.getTime() - nowMs) / 60_000;
      // Approaching window: 0 < diffMin <= leadMinutes
      if (diffMin > 0 && diffMin <= lead) {
        results.push({
          todo,
          kind: 'upcoming',
          reminderKey: `upcoming:${todo.id}:${targetDate}:${todo.dueTime}:${lead}`,
          minutesRemaining: Math.max(1, Math.ceil(diffMin)),
        });
      } else if (diffMin <= 0 && diffMin >= -1440) {
        // Due now or overdue within the last 24h
        results.push({
          todo,
          kind: 'due',
          reminderKey: `due:${todo.id}:${targetDate}:${todo.dueTime}`,
          minutesRemaining: Math.floor(diffMin),
        });
      }
    } else if (targetDate < todayStr) {
      // Untimed task whose dueDate is strictly before today -> overdue once per day
      results.push({
        todo,
        kind: 'due',
        reminderKey: `overdue:${todo.id}:${todayStr}`,
        minutesRemaining: -1440,
      });
    }
  }

  return results;
}
