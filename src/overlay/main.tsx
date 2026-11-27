import React from 'react';
import { createRoot } from 'react-dom/client';
import '../index.css';
import { readInitialLanguage } from '../i18n/I18nContext';
import { loadLocaleBundle } from '../i18n/localeLoader';
import { VoiceOverlayApp } from './VoiceOverlayApp';

async function bootstrapOverlay() {
  const initialLang = readInitialLanguage().code;
  await loadLocaleBundle(initialLang);

  const rootEl = document.getElementById('overlay-root');
  if (rootEl) {
    createRoot(rootEl).render(
      <React.StrictMode>
        <VoiceOverlayApp />
      </React.StrictMode>,
    );
  }
}

void bootstrapOverlay();
