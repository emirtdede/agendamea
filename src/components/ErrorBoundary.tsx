import React from 'react';
import { RotateCcw } from 'lucide-react';
import { readInitialLanguage } from '../i18n/I18nContext';
import { getDictionary } from '../i18n/localesWorld';
import { APP_VERSION } from '../utils/appVersion';
import { BrandMark } from './BrandMark';
import { WindowControls } from './WindowControls';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('Agendamea UI ErrorBoundary:', error, info.componentStack);
  }

  private handleRecover = () => {
    this.setState({ hasError: false });
    window.location.reload();
  };

  override render() {
    if (this.state.hasError) {
      const { code } = readInitialLanguage();
      const t = getDictionary(code);

      return (
        <div className="relative flex h-full w-full flex-col overflow-hidden bg-[var(--canvas)] text-[var(--text-primary)] select-none">
          {/* Draggable Custom Titlebar with Native Window Controls */}
          <header className="flex h-11 shrink-0 items-center justify-between border-b border-[var(--border)] bg-[var(--surface)] px-4">
            <div className="app-drag-region flex flex-1 items-center gap-2.5 h-full">
              <BrandMark className="h-5 w-5 rounded-md" />
              <span className="font-display text-xs font-semibold tracking-tight text-[var(--text-primary)]">
                Agendamea
              </span>
              <span className="font-mono-tabular text-[10px] text-[var(--text-muted)]">
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
                  onClick={this.handleRecover}
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

    return this.props.children;
  }
}
