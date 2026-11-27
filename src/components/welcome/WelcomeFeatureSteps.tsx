import {
  Bell,
  Calendar,
  Check,
  ChevronRight,
  Clock,
  Cloud,
  Columns3,
  Cpu,
  Eye,
  Grid2x2,
  Hash,
  List,
  Lock,
  Mic,
  Moon,
  RotateCcw,
  Shield,
  ShieldCheck,
  Sparkles,
  Volume2,
  Webhook,
  WifiOff,
  Zap,
} from 'lucide-react';
import type React from 'react';
import { useI18n } from '../../i18n/I18nContext';
import type { SettingsTabId } from '../../types';
import { DEFAULT_CUSTOM_SHORTCUTS, formatShortcutDisplay } from '../../utils/shortcuts';
import { BrandMark } from '../BrandMark';

interface WelcomeFeatureStepsProps {
  step: number;
  activeIconColors: { bg: string; fg: string };
  customShortcuts: Partial<typeof DEFAULT_CUSTOM_SHORTCUTS>;
  voiceShortcut: string;
  onComplete: (openSettingsTarget?: boolean | SettingsTabId) => void;
}

interface WelcomeFeatureRow {
  Icon: React.ComponentType<{ className?: string }>;
  title: string;
  desc: string;
  action?: React.ReactNode;
}

function WelcomeRowList({ rows }: { rows: WelcomeFeatureRow[] }) {
  return (
    <div className="flex flex-1 flex-col justify-center divide-y divide-[var(--border)]">
      {rows.map(({ Icon, title, desc, action }) => (
        <div key={title} className="flex items-start gap-4 py-4 first:pt-1 last:pb-1">
          <span
            className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
            style={{ backgroundColor: 'var(--accent-soft)', color: 'var(--accent)' }}
          >
            <Icon className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-display text-sm font-semibold text-[var(--text-primary)]">{title}</p>
            <p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">{desc}</p>
          </div>
          {action}
        </div>
      ))}
    </div>
  );
}

export function WelcomeFeatureSteps({
  step,
  activeIconColors,
  customShortcuts,
  voiceShortcut,
  onComplete,
}: WelcomeFeatureStepsProps) {
  const { t, meta } = useI18n();

  const renderSettingsJump = (target: SettingsTabId, testId: string) => (
    <button
      type="button"
      data-testid={testId}
      onClick={() => onComplete(target)}
      className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--canvas)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] ag-hover-card-glow transition-colors whitespace-nowrap shrink-0 self-center"
    >
      <span>{t.settings}</span>
      <ChevronRight className="h-3.5 w-3.5 rtl:rotate-180 shrink-0" />
    </button>
  );

  if (step === 3) {
    return (
      <div className="flex flex-1 flex-col items-center justify-between py-2 text-center">
        <div className="flex flex-1 flex-col items-center justify-center space-y-3.5">
          <BrandMark
            className="h-[72px] w-[72px] rounded-2xl border border-[var(--border-strong)] shadow-md"
            bgColor={activeIconColors.bg}
            fgColor={activeIconColors.fg}
          />
          <div className="space-y-1">
            <p className="font-display text-lg font-semibold text-[var(--text-primary)]">
              Agendamea · {t.appTitleSuffix}
            </p>
            <p className="text-xs text-[var(--text-muted)]">{t.settingsSubtitle}</p>
          </div>
        </div>

        <div className="grid w-full grid-cols-3 gap-4 border-t border-[var(--border)] pt-5">
          {[
            { Icon: WifiOff, label: t.welcomeBenefitOffline },
            { Icon: Zap, label: t.welcomeBenefitInstant },
            { Icon: ShieldCheck, label: t.welcomeBenefitPrivate },
          ].map(({ Icon, label }) => (
            <div key={label} className="flex flex-col items-center gap-2 text-center">
              <span
                className="flex h-9 w-9 items-center justify-center rounded-xl"
                style={{ backgroundColor: 'var(--accent-soft)', color: 'var(--accent)' }}
              >
                <Icon className="h-4 w-4" />
              </span>
              <span className="text-xs font-medium leading-snug text-[var(--text-secondary)]">
                {label}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (step === 4) {
    return (
      <div className="grid flex-1 grid-cols-2 gap-4">
        {[
          { Icon: List, title: t.viewList, desc: t.welcomeCardListDesc },
          { Icon: Columns3, title: t.viewKanban, desc: t.welcomeCardKanbanDesc },
          { Icon: Calendar, title: t.viewCalendar, desc: t.welcomeCardCalendarDesc },
          { Icon: Grid2x2, title: t.viewMatrix, desc: t.welcomeCardMatrixDesc },
        ].map(({ Icon, title, desc }) => (
          <div
            key={title}
            className="flex flex-col justify-center gap-2.5 rounded-xl border border-[var(--border)] bg-[var(--canvas)] p-5"
          >
            <div className="flex items-center gap-2.5">
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                style={{ backgroundColor: 'var(--accent-soft)', color: 'var(--accent)' }}
              >
                <Icon className="h-4 w-4" />
              </span>
              <span className="font-display text-sm font-semibold text-[var(--text-primary)] truncate">
                {title}
              </span>
            </div>
            <p className="text-xs leading-relaxed text-[var(--text-muted)]">{desc}</p>
          </div>
        ))}
      </div>
    );
  }

  if (step === 5) {
    return (
      <div className="flex flex-1 flex-col justify-center gap-7">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--canvas)] p-5">
          <div className="flex items-start gap-3.5">
            <span
              className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
              style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-fg)' }}
            >
              <Check className="h-3 w-3" />
            </span>
            <div className="min-w-0 flex-1 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="font-display text-sm font-semibold text-[var(--text-primary)] truncate">
                  Agendamea · {t.today}
                </span>
                <span className="inline-flex items-center gap-1 font-mono-tabular text-xs font-medium text-[var(--accent)] shrink-0">
                  <Clock className="h-3.5 w-3.5" />
                  <span>14:30</span>
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-4 text-xs text-[var(--text-secondary)]">
                <span className="inline-flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                  <span>{t.today}</span>
                </span>
                <span className="inline-flex items-center gap-0.5 text-[var(--accent)]">
                  <Hash className="h-3.5 w-3.5" />
                  <span>{t.important.toLocaleLowerCase(meta.intlLocale)}</span>
                </span>
                <span className="inline-flex items-center gap-0.5 text-[var(--accent)]">
                  <Hash className="h-3.5 w-3.5" />
                  <span>{t.priorityHigh.toLocaleLowerCase(meta.intlLocale)}</span>
                </span>
                <span className="ms-auto font-mono-tabular text-xs text-[var(--text-muted)]">
                  2 / 3 {t.subtaskCountUnit}
                </span>
              </div>

              <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--surface-subtle)]">
                <div
                  className="h-full w-2/3 rounded-full"
                  style={{ backgroundColor: 'var(--accent)' }}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 border-t border-[var(--border)] pt-6">
          {[
            {
              keycap: formatShortcutDisplay(
                customShortcuts.newTask || DEFAULT_CUSTOM_SHORTCUTS.newTask,
              ),
              label: t.shortcutNewTask,
            },
            {
              keycap: formatShortcutDisplay(
                customShortcuts.search || DEFAULT_CUSTOM_SHORTCUTS.search,
              ),
              label: t.shortcutSearch,
            },
            {
              keycap: formatShortcutDisplay(voiceShortcut || 'CommandOrControl+Alt+D'),
              label: t.settingsTabAi,
            },
            {
              keycap: `${formatShortcutDisplay(customShortcuts.reorderUp || DEFAULT_CUSTOM_SHORTCUTS.reorderUp)} / ${formatShortcutDisplay(customShortcuts.reorderDown || DEFAULT_CUSTOM_SHORTCUTS.reorderDown)}`,
              label: t.shortcutReorder,
            },
          ].map((item) => (
            <div key={item.label} className="flex flex-col items-center gap-2 text-center">
              <kbd className="max-w-full truncate rounded-md bg-[var(--accent-soft)] px-2 py-1 font-mono-tabular text-[11px] font-semibold text-[var(--accent)]">
                {item.keycap}
              </kbd>
              <span className="line-clamp-2 text-[11px] leading-snug text-[var(--text-muted)]">
                {item.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (step === 6) {
    return (
      <WelcomeRowList
        rows={[
          {
            Icon: Bell,
            title: t.welcomeFocusRemindersTitle,
            desc: t.welcomeFocusRemindersDesc,
          },
          {
            Icon: Moon,
            title: t.welcomeFocusQuietTitle,
            desc: t.welcomeFocusQuietDesc,
            action: renderSettingsJump('notifications', 'welcome-open-notifications'),
          },
          {
            Icon: Eye,
            title: t.welcomeFocusComfortTitle,
            desc: t.welcomeFocusComfortDesc,
          },
        ]}
      />
    );
  }

  if (step === 7) {
    return (
      <WelcomeRowList
        rows={[
          {
            Icon: Mic,
            title: t.welcomeAiVoiceTitle,
            desc: t.welcomeAiVoiceDesc,
          },
          {
            Icon: Volume2,
            title: t.welcomeAiReadAloudTitle,
            desc: t.welcomeAiReadAloudDesc,
          },
          {
            Icon: Cpu,
            title: t.welcomeAiZeroDownloadTitle,
            desc: t.welcomeAiZeroDownloadDesc,
            action: renderSettingsJump('ai', 'welcome-open-ai'),
          },
        ]}
      />
    );
  }

  if (step === 8) {
    return (
      <WelcomeRowList
        rows={[
          {
            Icon: Sparkles,
            title: t.welcomePowerAssistantsTitle,
            desc: t.welcomePowerAssistantsDesc,
            action: renderSettingsJump('docs', 'welcome-open-automation'),
          },
          {
            Icon: Webhook,
            title: t.welcomePowerAutomationTitle,
            desc: t.welcomePowerAutomationDesc,
          },
          {
            Icon: Lock,
            title: t.welcomePowerExportTitle,
            desc: t.welcomePowerExportDesc,
          },
        ]}
      />
    );
  }

  if (step === 9) {
    return (
      <WelcomeRowList
        rows={[
          {
            Icon: Shield,
            title: t.welcomePrivacyLocalTitle,
            desc: t.welcomePrivacyLocalDesc,
          },
          {
            Icon: Cloud,
            title: t.welcomePrivacyCloudTitle,
            desc: t.welcomePrivacyCloudDesc,
            action: renderSettingsJump('data', 'welcome-open-settings'),
          },
          {
            Icon: RotateCcw,
            title: t.welcomePrivacyUndoTitle,
            desc: t.welcomePrivacyUndoDesc,
          },
        ]}
      />
    );
  }

  return null;
}
