import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { useI18n } from '../i18n/I18nContext';

export function OfflineIndicator() {
  const { t } = useI18n();
  const isOnline = useOnlineStatus();
  const isDesktopShell = typeof window !== 'undefined' && Boolean(window.agendameaWindow);

  // Desktop Electron shell always persists directly to local storage; internet is never required
  if (isOnline || isDesktopShell) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="offline-indicator"
      className="flex min-h-[44px] w-full shrink-0 items-center gap-2 border-b border-amber-500/30 bg-amber-500/10 ps-4 pe-32 py-2.5 text-xs font-medium text-[var(--text-primary)] animate-fade-in"
    >
      <WifiOff className="h-3.5 w-3.5 text-amber-500 shrink-0" />
      <span className="min-w-0 break-words leading-snug">{t.offlineBannerText}</span>
    </div>
  );
}
