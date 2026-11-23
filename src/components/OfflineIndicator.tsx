import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { useI18n } from '../i18n/I18nContext';

export function OfflineIndicator() {
  const { t } = useI18n();
  const isOnline = useOnlineStatus();
  const isDesktopShell =
    typeof window !== 'undefined' && Boolean(window.agendameaWindow);

  // Desktop Electron shell always persists directly to local storage; internet is never required
  if (isOnline || isDesktopShell) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 end-4 z-50 flex items-center gap-2 rounded-lg border border-amber-500/30 bg-[var(--surface)] px-3 py-2 text-xs font-medium text-[var(--text-primary)] shadow-lg"
    >
      <WifiOff className="h-3.5 w-3.5 text-amber-500 shrink-0" />
      <span>{t.offlineBannerText}</span>
    </div>
  );
}
