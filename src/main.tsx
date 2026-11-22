import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import './index.css';

const isDesktopShell =
  typeof window !== 'undefined' && Boolean(window.agendameaWindow);

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
      .catch(() => {});
  }
}

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
