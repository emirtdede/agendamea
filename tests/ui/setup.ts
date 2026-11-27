import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
import { seedLoadedLocaleBundle } from '../../src/i18n/localeLoader';
import {
  EN_DICTIONARY,
  EN_LEGAL_DOCUMENTS,
  TR_DICTIONARY,
  TR_LEGAL_DOCUMENTS,
} from '../../src/i18n/translations';

seedLoadedLocaleBundle('en', { dict: EN_DICTIONARY, legal: EN_LEGAL_DOCUMENTS });
seedLoadedLocaleBundle('tr', { dict: TR_DICTIONARY, legal: TR_LEGAL_DOCUMENTS });

afterEach(() => {
  cleanup();
});

if (typeof window !== 'undefined') {
  if (!window.matchMedia) {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query.includes('1024px'),
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  }

  if (typeof globalThis.ResizeObserver === 'undefined') {
    class MockResizeObserver {
      observe() {
        // mock
      }
      unobserve() {
        // mock
      }
      disconnect() {
        // mock
      }
    }
    globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;
  }

  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = vi.fn();
  }
}
