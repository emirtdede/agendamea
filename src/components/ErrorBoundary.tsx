import { RotateCcw } from 'lucide-react';
import React from 'react';
import { I18nProvider, readInitialLanguage, useI18n } from '../i18n/I18nContext';
import { APP_VERSION } from '../utils/appVersion';
import { BrandMark } from './BrandMark';
import { WindowControls } from './WindowControls';

function ErrorBoundaryFallback({ onRecover }: { onRecover: () => void }) {
  const { t } = useI18n();
  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-[var(--canvas)] text-[var(--text-primary)] select-none">
      {/* Draggable Custom Titlebar with Native Window Controls */}
      <header className="flex h-11 shrink-0 items-center justify-between border-b border-[var(--border)] bg-[var(--surface)] px-4">
        <div className="app-drag-region flex flex-1 items-center gap-2.5 h-full">
          <BrandMark className="h-5 w-5 rounded-md" />
          <span className="font-display text-xs font-semibold tracking-tight text-[var(--text-primary)]">
            Agendamea
          </span>
          <span dir="ltr" className="font-mono-tabular text-[10px] text-[var(--text-muted)]">
            v{APP_VERSION}
          </span>
        </div>
        <div className="app-no-drag shrink-0">
          <WindowControls />
        </div>
      </header>

      {/* Centered Recovery Screen */}
      <main className="flex flex-1 items-center justify-center p-6">
        <div className="flex w-full max-w-[380px] flex-col items-center text-center space-y-4">
          <BrandMark className="h-14 w-14 rounded-2xl shadow-md" />
          <div className="space-y-1.5">
            <h1 className="font-display text-lg font-semibold tracking-tight text-[var(--text-primary)]">
              {t.loadFailedError}
            </h1>
            <p className="text-xs leading-relaxed text-[var(--text-muted)]">
              {t.welcomePrivacyLocalDesc}
            </p>
          </div>
          <div className="flex items-center gap-2.5 pt-1">
            <button
              type="button"
              onClick={onRecover}
              className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition-opacity hover:opacity-90"
              style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-fg)' }}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>{t.retry}</span>
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('Agendamea UI ErrorBoundary:', error, info.componentStack);
    try {
      const payload = JSON.stringify({
        source: 'renderer-error-boundary',
        name: error?.name || 'Error',
        message: error?.message || 'Unexpected UI error',
        stack: error?.stack || '',
        componentStack: info?.componentStack || '',
      });
      if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
        const blob = new Blob([payload], { type: 'application/json' });
        navigator.sendBeacon('/api/diagnostics/crash', blob);
      } else if (typeof fetch === 'function') {
        void fetch('/api/diagnostics/crash', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload,
        }).catch(() => {
          // Local crash persistence is best-effort only
        });
      }
    } catch {
      // Never throw inside error boundary reporting
    }
  }

  private handleRecover = () => {
    this.setState({ hasError: false });
    window.location.reload();
  };

  override render() {
    if (this.state.hasError) {
      const { code } = readInitialLanguage();

      return (
        <I18nProvider
          lang={code}
          onChangeLanguage={() => {
            /* noop */
          }}
        >
          <ErrorBoundaryFallback onRecover={this.handleRecover} />
        </I18nProvider>
      );
    }

    return this.props.children;
  }
}
