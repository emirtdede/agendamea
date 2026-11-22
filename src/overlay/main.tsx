import React from 'react';
import { createRoot } from 'react-dom/client';
import '../index.css';
import { VoiceOverlayApp } from './VoiceOverlayApp';

const rootEl = document.getElementById('overlay-root');
if (rootEl) {
  createRoot(rootEl).render(
    <React.StrictMode>
      <VoiceOverlayApp />
    </React.StrictMode>,
  );
}
