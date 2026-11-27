import { registerSW } from 'virtual:pwa-register';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { api } from './api/client.ts';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { readInitialLanguage } from './i18n/I18nContext.tsx';
import { loadLocaleBundle } from './i18n/localeLoader.ts';
import './fonts.css';
import './index.css';

const isDesktopShell = typeof window !== 'undefined' && Boolean(window.agendameaWindow);

if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  if (!isDesktopShell) {
    registerSW({ immediate: true });
  } else {
    // Ensure no stale Service Worker caches old chunk hashes on localhost desktop ports
    void navigator.serviceWorker
      .getRegistrations()
      .then((registrations) => {
        for (const reg of registrations) {
          void reg.unregister();
        }
      })
      .catch(() => {
        // Ignore service worker unregistration errors
      });
  }
}

async function bootstrapApp() {
  // Start /api/bootstrap in parallel with active locale chunk loading to eliminate startup waterfall
  api.prefetchBootstrap();
  const initialLang = readInitialLanguage().code;
  await loadLocaleBundle(initialLang);

  const rootEl = document.getElementById('root');
  if (rootEl) {
    createRoot(rootEl).render(
      <ErrorBoundary>
        <App />
      </ErrorBoundary>,
    );
  }
}

void bootstrapApp();
