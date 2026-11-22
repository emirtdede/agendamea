import React from 'react';
import {
  Bell,
  BellOff,
  BellRing,
  CheckCircle2,
  Clock,
  Cloud,
  Download,
  Mic,
  Monitor,
  Send,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react';
import { useI18n } from '../../i18n/I18nContext';
import type {
  NotificationChannelMode,
  NotificationChannelsMap,
  NotificationEventType,
  NotificationProfileId,
} from '../../types';
import { SelectField } from '../SelectField';

export interface NotificationsSettingsTabProps {
  profile: NotificationProfileId;
  leadMinutes: number;
  channels: NotificationChannelsMap;
  onApplyProfile: (profile: Exclude<NotificationProfileId, 'custom'>) => void;
  onChangeChannel: (eventType: NotificationEventType, mode: NotificationChannelMode) => void;
  onChangeLeadMinutes: (minutes: number) => void;
  onSendTest: () => void;
}

const LEAD_MINUTE_OPTIONS = [5, 10, 15, 30, 60] as const;

export const NotificationsSettingsTab = React.memo(function NotificationsSettingsTab({
  profile,
  leadMinutes,
  channels,
  onApplyProfile,
  onChangeChannel,
  onChangeLeadMinutes,
  onSendTest,
}: NotificationsSettingsTabProps) {
  const { t, lang } = useI18n();

  const profiles = [
    {
      id: 'balanced' as const,
      title: t.notificationsProfileBalanced,
      desc: t.notificationsProfileBalancedDesc,
      Icon: Bell,
    },
    {
      id: 'all' as const,
      title: t.notificationsProfileAll,
      desc: t.notificationsProfileAllDesc,
      Icon: BellRing,
    },
    {
      id: 'focus' as const,
      title: t.notificationsProfileFocus,
      desc: t.notificationsProfileFocusDesc,
      Icon: BellOff,
    },
    {
      id: 'silent_inapp' as const,
      title: t.notificationsProfileSilent,
      desc: t.notificationsProfileSilentDesc,
      Icon: Monitor,
    },
  ];

  const eventRows: Array<{
    id: NotificationEventType;
    title: string;
    desc: string;
    Icon: React.ComponentType<{ className?: string }>;
  }> = [
    {
      id: 'taskUpcoming',
      title: t.notificationsEventUpcoming,
      desc: t.notificationsEventUpcomingDesc,
      Icon: Clock,
    },
    {
      id: 'taskDue',
      title: t.notificationsEventDue,
      desc: t.notificationsEventDueDesc,
      Icon: BellRing,
    },
    {
      id: 'taskCompleted',
      title: t.notificationsEventCompleted,
      desc: t.notificationsEventCompletedDesc,
      Icon: CheckCircle2,
    },
    {
      id: 'voiceAssistant',
      title: t.notificationsEventVoice,
      desc: t.notificationsEventVoiceDesc,
      Icon: Mic,
    },
    {
      id: 'cloudSync',
      title: t.notificationsEventCloud,
      desc: t.notificationsEventCloudDesc,
      Icon: Cloud,
    },
    {
      id: 'appUpdates',
      title: t.notificationsEventUpdates,
      desc: t.notificationsEventUpdatesDesc,
      Icon: Download,
    },
  ];

  const modeOptions: Array<{ id: NotificationChannelMode; label: string }> = [
    { id: 'both', label: t.notificationsChannelBoth },
    { id: 'inApp', label: t.notificationsChannelInApp },
    { id: 'desktop', label: t.notificationsChannelDesktop },
    { id: 'off', label: t.notificationsChannelOff },
  ];

  return (
    <div className="space-y-6" data-testid="settings-notifications-section">
      {/* Header Action Row: Active Profile Badge + Send Test */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
            style={{ backgroundColor: 'var(--accent-soft)', color: 'var(--accent)' }}
          >
            {profile === 'focus' ? <BellOff className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-xs font-semibold text-[var(--text-primary)]">
                {t.notificationsProfilesTitle}
              </p>
              {profile === 'custom' && (
                <span
                  data-testid="notification-profile-custom-badge"
                  className="inline-flex items-center gap-1 rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--accent)]"
                >
                  <SlidersHorizontal className="h-2.5 w-2.5" />
                  <span>{t.notificationsProfileCustom}</span>
                </span>
              )}
            </div>
            <p className="text-[11px] text-[var(--text-muted)]">{t.notificationsSubtitle}</p>
          </div>
        </div>

        <button
          type="button"
          data-testid="notifications-test-btn"
          onClick={onSendTest}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--accent)] bg-[var(--accent-soft)] px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)] transition-opacity hover:opacity-90 whitespace-nowrap"
        >
          <Send className="h-3.5 w-3.5 text-[var(--accent)]" />
          <span>{t.notificationsTestButton}</span>
        </button>
      </div>

      {/* Preset Profiles Grid */}
      <section aria-label={t.notificationsProfilesTitle} className="space-y-2.5">
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {profiles.map(({ id, title, desc, Icon }) => {
            const active = profile === id;
            return (
              <button
                key={id}
                type="button"
                data-testid={`notification-profile-${id}`}
                aria-pressed={active}
                onClick={() => onApplyProfile(id)}
                className={`flex items-start gap-3 rounded-xl border p-3.5 text-left transition-all ${
                  active
                    ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                    : 'border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-hover)]'
                }`}
              >
                <div
                  className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${
                    active
                      ? 'border-[var(--accent)]/40 bg-[var(--surface)] text-[var(--accent)]'
                      : 'border-[var(--border)] bg-[var(--canvas)] text-[var(--text-muted)]'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-[var(--text-primary)]">{title}</span>
                    {active && <Sparkles className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />}
                  </div>
                  <p className="text-[11px] leading-snug text-[var(--text-muted)]">{desc}</p>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Upcoming Reminder Lead Time */}
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3.5">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-[var(--text-primary)]">
            {t.notificationsLeadTimeTitle}
          </p>
          <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
            {t.notificationsLeadTimeDesc}
          </p>
        </div>
        <SelectField
          data-testid="notifications-lead-select"
          value={leadMinutes}
          onChange={(e) => onChangeLeadMinutes(Number(e.target.value))}
          wrapperClassName="w-[120px] shrink-0"
        >
          {LEAD_MINUTE_OPTIONS.map((mins) => (
            <option key={mins} value={mins}>
              {lang === 'tr' ? `${mins} dk` : `${mins} min`}
            </option>
          ))}
        </SelectField>
      </section>

      {/* Per-Event 4-Way Channel Matrix */}
      <section aria-label={t.notificationsChannelsTitle} className="space-y-2.5">
        <h3 className="font-display text-xs font-semibold text-[var(--text-muted)]">
          {t.notificationsChannelsTitle}
        </h3>
        <div className="divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
          {eventRows.map(({ id, title, desc, Icon }) => {
            const currentMode = channels[id] ?? 'both';
            return (
              <div
                key={id}
                data-testid={`notification-row-${id}`}
                className="flex flex-col gap-2.5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-start gap-2.5 min-w-0">
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]" />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-[var(--text-primary)]">{title}</p>
                    <p className="text-[11px] text-[var(--text-muted)]">{desc}</p>
                  </div>
                </div>

                <div
                  role="radiogroup"
                  aria-label={title}
                  className="inline-flex shrink-0 items-center gap-0.5 rounded-lg border border-[var(--border)] bg-[var(--canvas)] p-0.5 self-start sm:self-center"
                >
                  {modeOptions.map((opt) => {
                    const selected = currentMode === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        data-testid={`notification-channel-${id}-${opt.id}`}
                        onClick={() => onChangeChannel(id, opt.id)}
                        className={`rounded-md px-2 py-1 text-[11px] font-medium transition-all whitespace-nowrap ${
                          selected
                            ? 'bg-[var(--accent)] text-[var(--accent-fg)] shadow-xs'
                            : 'text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]'
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
});
