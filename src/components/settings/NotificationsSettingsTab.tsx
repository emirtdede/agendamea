import {
  Bell,
  BellOff,
  Clock,
  ExternalLink,
  Moon,
  RotateCcw,
  Send,
  ShieldCheck,
  Sparkles,
  Sun,
  Volume2,
} from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import { useI18n } from '../../i18n/I18nContext';
import type {
  NotificationChannelMode,
  NotificationChannelsMap,
  NotificationEventType,
  NotificationProfileId,
} from '../../types';
import { NOTIFICATION_EVENT_KEYS, NOTIFICATION_LEAD_OPTIONS } from '../../utils/notifications';
import { SelectField } from '../SelectField';

function readBrowserPermission(
  isElectronDesktop: boolean,
): 'desktop' | 'unsupported' | NotificationPermission {
  if (isElectronDesktop) return 'desktop';
  if (typeof Notification === 'undefined') return 'unsupported';
  return Notification.permission;
}

interface NotificationsSettingsTabProps {
  profile: NotificationProfileId;
  leadMinutes: number;
  channels: NotificationChannelsMap;
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
  notificationSoundEnabled: boolean;
  dailyDigestEnabled: boolean;
  dailyDigestTime: string;
  onApplyProfile: (profile: Exclude<NotificationProfileId, 'custom'>) => void;
  onChangeChannel: (eventType: NotificationEventType, mode: NotificationChannelMode) => void;
  onChangeLeadMinutes: (minutes: number) => void;
  onToggleQuietHours: (enabled: boolean) => void;
  onChangeQuietHoursStart: (time: string) => void;
  onChangeQuietHoursEnd: (time: string) => void;
  onToggleNotificationSound: (enabled: boolean) => void;
  onToggleDailyDigest: (enabled: boolean) => void;
  onChangeDailyDigestTime: (time: string) => void;
  onResetNotifications: () => void;
  onSendTest: () => void;
}

export const NotificationsSettingsTab = React.memo(function NotificationsSettingsTab({
  profile,
  leadMinutes,
  channels,
  quietHoursEnabled,
  quietHoursStart,
  quietHoursEnd,
  notificationSoundEnabled,
  dailyDigestEnabled,
  dailyDigestTime,
  onApplyProfile,
  onChangeChannel,
  onChangeLeadMinutes,
  onToggleQuietHours,
  onChangeQuietHoursStart,
  onChangeQuietHoursEnd,
  onToggleNotificationSound,
  onToggleDailyDigest,
  onChangeDailyDigestTime,
  onResetNotifications,
  onSendTest,
}: NotificationsSettingsTabProps) {
  const { t, meta } = useI18n();
  const minuteFormatter = useMemo(() => {
    try {
      return new Intl.NumberFormat(meta.intlLocale, {
        style: 'unit',
        unit: 'minute',
        unitDisplay: 'short',
      });
    } catch {
      return null;
    }
  }, [meta.intlLocale]);

  const formatLeadOption = (min: number): string =>
    minuteFormatter ? minuteFormatter.format(min) : `${min} ${t.notificationsMinutesUnit}`;
  const isElectronDesktop =
    typeof window !== 'undefined' && Boolean(window.agendameaWindow?.showDesktopNotification);

  const [browserPermission, setBrowserPermission] = useState<
    'desktop' | 'unsupported' | NotificationPermission
  >(() => readBrowserPermission(isElectronDesktop));

  useEffect(() => {
    setBrowserPermission(readBrowserPermission(isElectronDesktop));
    if (isElectronDesktop || typeof Notification === 'undefined') return;
    let permStatus: PermissionStatus | null = null;
    let active = true;
    const syncPermission = () => {
      if (active) setBrowserPermission(Notification.permission);
    };
    window.addEventListener('focus', syncPermission);
    document.addEventListener('visibilitychange', syncPermission);
    if (typeof navigator !== 'undefined' && navigator.permissions?.query) {
      void navigator.permissions
        .query({ name: 'notifications' })
        .then((status) => {
          if (!active) return;
          permStatus = status;
          syncPermission();
          status.onchange = syncPermission;
        })
        .catch(() => {
          /* Permissions API unavailable in this environment */
        });
    }
    return () => {
      active = false;
      window.removeEventListener('focus', syncPermission);
      document.removeEventListener('visibilitychange', syncPermission);
      if (permStatus) permStatus.onchange = null;
    };
  }, [isElectronDesktop]);

  const profileCards: Array<{
    id: Exclude<NotificationProfileId, 'custom'>;
    title: string;
    desc: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    {
      id: 'balanced',
      title: t.notificationsProfileBalanced,
      desc: t.notificationsProfileBalancedDesc,
      icon: Bell,
    },
    {
      id: 'all',
      title: t.notificationsProfileAll,
      desc: t.notificationsProfileAllDesc,
      icon: Sparkles,
    },
    {
      id: 'focus',
      title: t.notificationsProfileFocus,
      desc: t.notificationsProfileFocusDesc,
      icon: BellOff,
    },
    {
      id: 'silent_inapp',
      title: t.notificationsProfileSilent,
      desc: t.notificationsProfileSilentDesc,
      icon: Bell,
    },
  ];

  const eventMeta: Record<NotificationEventType, { title: string; desc: string }> = {
    taskUpcoming: {
      title: t.notificationsEventUpcoming,
      desc: t.notificationsEventUpcomingDesc,
    },
    taskDue: {
      title: t.notificationsEventDue,
      desc: t.notificationsEventDueDesc,
    },
    taskCompleted: {
      title: t.notificationsEventCompleted,
      desc: t.notificationsEventCompletedDesc,
    },
    voiceAssistant: {
      title: t.notificationsEventVoice,
      desc: t.notificationsEventVoiceDesc,
    },
    cloudSync: {
      title: t.notificationsEventCloud,
      desc: t.notificationsEventCloudDesc,
    },
    appUpdates: {
      title: t.notificationsEventUpdates,
      desc: t.notificationsEventUpdatesDesc,
    },
  };

  return (
    <div className="space-y-6" data-testid="settings-notifications-section">
      {/* Header + Test + Reset */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs leading-relaxed text-[var(--text-muted)]">
          {t.notificationsSubtitle}
        </p>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            data-testid="notifications-test-btn"
            onClick={onSendTest}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-hover)]"
          >
            <Send className="h-3.5 w-3.5 text-[var(--accent)]" />
            <span>{t.notificationsTestButton}</span>
          </button>
          <button
            type="button"
            data-testid="notifications-reset-btn"
            onClick={onResetNotifications}
            className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>{t.resetTabDefaultsButton}</span>
          </button>
        </div>
      </div>

      {/* OS / Browser Notification Permission Banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
        <div className="flex items-center gap-2 min-w-0">
          <ShieldCheck className="h-4 w-4 text-emerald-500 shrink-0" />
          <span className="text-xs font-medium text-[var(--text-primary)]">
            {t.notifPermissionLabel}:
          </span>
          <span className="rounded-full bg-[var(--surface-subtle)] px-2 py-0.5 text-[11px] font-medium text-[var(--text-secondary)]">
            {browserPermission === 'desktop'
              ? t.notifPermissionDesktopNative
              : browserPermission === 'granted'
                ? t.enabledBadge
                : browserPermission === 'denied'
                  ? t.disabledBadge
                  : t.notifPermissionPrompt}
          </span>
        </div>
        {isElectronDesktop && (
          <button
            type="button"
            data-testid="notif-open-windows-settings-btn"
            onClick={() => void window.agendameaWindow?.openWindowsNotificationSettings?.()}
            className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--canvas)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors"
          >
            <ExternalLink className="h-3 w-3 text-[var(--accent)]" />
            <span>{t.notifOpenWindowsSettingsButton}</span>
          </button>
        )}
      </div>

      {/* Preset Profiles */}
      <section
        aria-label={t.notificationsProfilesTitle}
        data-setting-id="notif-profiles"
        className="space-y-3"
      >
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-display text-xs font-semibold text-[var(--text-muted)]">
            {t.notificationsProfilesTitle}
          </h3>
          {profile === 'custom' && (
            <span className="rounded-full border border-[var(--accent)]/40 bg-[var(--accent-soft)] px-2 py-0.5 text-[10.5px] font-semibold text-[var(--text-primary)]">
              {t.notificationsProfileCustom}
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {profileCards.map((card) => {
            const Icon = card.icon;
            const active = profile === card.id;
            return (
              <button
                key={card.id}
                type="button"
                data-testid={`notification-profile-${card.id}`}
                aria-pressed={active}
                onClick={() => onApplyProfile(card.id)}
                className={`flex items-start gap-2.5 rounded-xl border p-3.5 text-start transition-colors ${
                  active
                    ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                    : 'border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-hover)]'
                }`}
              >
                <Icon
                  className={`h-4 w-4 mt-0.5 shrink-0 ${
                    active ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'
                  }`}
                />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-[var(--text-primary)]">{card.title}</p>
                  <p className="mt-0.5 text-[11px] leading-snug text-[var(--text-muted)]">
                    {card.desc}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Quiet Hours, Notification Sound & Daily Digest */}
      <section
        aria-label={t.notifQuietHoursTitle}
        data-setting-id="notif-quiet-digest"
        className="divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]"
      >
        {/* Quiet Hours */}
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-start gap-2.5 min-w-0">
              <Moon className="h-4 w-4 text-[var(--accent)] mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-[var(--text-primary)]">
                  {t.notifQuietHoursTitle}
                </p>
                <p className="mt-0.5 text-xs text-[var(--text-muted)]">{t.notifQuietHoursDesc}</p>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              data-testid="notif-quiet-hours-toggle"
              aria-checked={quietHoursEnabled}
              aria-label={t.notifQuietHoursTitle}
              onClick={() => onToggleQuietHours(!quietHoursEnabled)}
              className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                quietHoursEnabled ? 'bg-[var(--accent)]' : 'bg-[var(--border-strong)]'
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-[var(--surface)] shadow-sm transition-transform ${
                  quietHoursEnabled
                    ? 'translate-x-4.5 rtl:-translate-x-4.5'
                    : 'translate-x-0.5 rtl:-translate-x-0.5'
                }`}
              />
            </button>
          </div>

          {quietHoursEnabled && (
            <div className="flex flex-wrap items-center gap-3 ps-6 pt-1">
              <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                <span>{t.notifQuietFromLabel}</span>
                <input
                  type="time"
                  data-testid="notif-quiet-start"
                  value={quietHoursStart}
                  onChange={(e) => onChangeQuietHoursStart(e.target.value)}
                  className="font-mono-tabular rounded-lg border border-[var(--border)] bg-[var(--canvas)] px-2.5 py-1 text-xs text-[var(--text-primary)] focus:border-[var(--accent)]"
                />
              </label>
              <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                <span>{t.notifQuietToLabel}</span>
                <input
                  type="time"
                  data-testid="notif-quiet-end"
                  value={quietHoursEnd}
                  onChange={(e) => onChangeQuietHoursEnd(e.target.value)}
                  className="font-mono-tabular rounded-lg border border-[var(--border)] bg-[var(--canvas)] px-2.5 py-1 text-xs text-[var(--text-primary)] focus:border-[var(--accent)]"
                />
              </label>
            </div>
          )}
        </div>

        {/* Notification Sound */}
        <div className="flex items-center justify-between gap-3 px-4 py-3.5">
          <div className="flex items-start gap-2.5 min-w-0">
            <Volume2 className="h-4 w-4 text-[var(--text-muted)] mt-0.5 shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-[var(--text-primary)]">{t.notifSoundTitle}</p>
              <p className="mt-0.5 text-xs text-[var(--text-muted)]">{t.notifSoundDesc}</p>
            </div>
          </div>
          <button
            type="button"
            role="switch"
            data-testid="notif-sound-toggle"
            aria-checked={notificationSoundEnabled}
            aria-label={t.notifSoundTitle}
            onClick={() => onToggleNotificationSound(!notificationSoundEnabled)}
            className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
              notificationSoundEnabled ? 'bg-[var(--accent)]' : 'bg-[var(--border-strong)]'
            }`}
          >
            <span
              className={`inline-block h-3.5 w-3.5 transform rounded-full bg-[var(--surface)] shadow-sm transition-transform ${
                notificationSoundEnabled
                  ? 'translate-x-4.5 rtl:-translate-x-4.5'
                  : 'translate-x-0.5 rtl:-translate-x-0.5'
              }`}
            />
          </button>
        </div>

        {/* Daily Digest */}
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-start gap-2.5 min-w-0">
              <Sun className="h-4 w-4 text-[var(--accent)] mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-[var(--text-primary)]">
                  {t.notifDailyDigestLabel}
                </p>
                <p className="mt-0.5 text-xs text-[var(--text-muted)]">{t.notifDailyDigestDesc}</p>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              data-testid="notif-daily-digest-toggle"
              aria-checked={dailyDigestEnabled}
              aria-label={t.notifDailyDigestLabel}
              onClick={() => onToggleDailyDigest(!dailyDigestEnabled)}
              className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                dailyDigestEnabled ? 'bg-[var(--accent)]' : 'bg-[var(--border-strong)]'
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-[var(--surface)] shadow-sm transition-transform ${
                  dailyDigestEnabled
                    ? 'translate-x-4.5 rtl:-translate-x-4.5'
                    : 'translate-x-0.5 rtl:-translate-x-0.5'
                }`}
              />
            </button>
          </div>
          {dailyDigestEnabled && (
            <div className="flex items-center gap-2 ps-6">
              <span className="text-xs text-[var(--text-secondary)]">
                {t.notifDigestTimeLabel}:
              </span>
              <input
                type="time"
                data-testid="notif-daily-digest-time"
                value={dailyDigestTime}
                onChange={(e) => onChangeDailyDigestTime(e.target.value)}
                className="font-mono-tabular rounded-lg border border-[var(--border)] bg-[var(--canvas)] px-2.5 py-1 text-xs text-[var(--text-primary)] focus:border-[var(--accent)]"
              />
            </div>
          )}
        </div>
      </section>

      {/* Upcoming Reminder Lead Time */}
      <section
        aria-label={t.notificationsLeadTimeTitle}
        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3.5"
      >
        <div className="flex items-start gap-2.5 min-w-0">
          <Clock className="h-4 w-4 text-[var(--accent)] mt-0.5 shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-[var(--text-primary)]">
              {t.notificationsLeadTimeTitle}
            </p>
            <p className="mt-0.5 text-xs text-[var(--text-muted)]">{t.notificationsLeadTimeDesc}</p>
          </div>
        </div>
        <SelectField
          data-testid="notification-lead-select"
          value={leadMinutes}
          onChange={(e) => onChangeLeadMinutes(Number(e.target.value))}
          wrapperClassName="w-36 shrink-0"
        >
          {NOTIFICATION_LEAD_OPTIONS.map((min) => (
            <option key={min} value={min}>
              {formatLeadOption(min)}
            </option>
          ))}
        </SelectField>
      </section>

      {/* Per-Event Channel Controls */}
      <section
        aria-label={t.notificationsChannelsTitle}
        className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]"
      >
        <div className="border-b border-[var(--border)] bg-[var(--canvas)]/60 px-4 py-3">
          <h3 className="font-display text-xs font-semibold text-[var(--text-primary)]">
            {t.notificationsChannelsTitle}
          </h3>
        </div>
        <div className="divide-y divide-[var(--border)]">
          {NOTIFICATION_EVENT_KEYS.map((eventKey) => (
            <div
              key={eventKey}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-[var(--text-primary)]">
                  {eventMeta[eventKey].title}
                </p>
                <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
                  {eventMeta[eventKey].desc}
                </p>
              </div>
              <SelectField
                data-testid={`notification-channel-${eventKey}`}
                value={channels[eventKey]}
                onChange={(e) =>
                  onChangeChannel(eventKey, e.target.value as NotificationChannelMode)
                }
                wrapperClassName="w-40 shrink-0"
              >
                <option value="both">{t.notificationsChannelBoth}</option>
                <option value="inApp">{t.notificationsChannelInApp}</option>
                <option value="desktop">{t.notificationsChannelDesktop}</option>
                <option value="off">{t.notificationsChannelOff}</option>
              </SelectField>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
});
