import { registerSW } from 'virtual:pwa-register';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
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

const rootEl = document.getElementById('root');
if (rootEl) {
  createRoot(rootEl).render(
    <ErrorBoundary>
      <App />
    </ErrorBoundary>,
  );
}
