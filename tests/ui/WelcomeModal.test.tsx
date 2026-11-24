import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WelcomeModal } from '../../src/components/WelcomeModal';
import { I18nProvider } from '../../src/i18n/I18nContext';
import type { LanguageCode } from '../../src/i18n/languages';
import { EN_DICTIONARY, TR_DICTIONARY } from '../../src/i18n/translations';
import type { SettingsTabId } from '../../src/types';

function renderWelcomeModal(
  onComplete: (openSettingsTarget?: boolean | SettingsTabId) => void = vi.fn(),
  language: LanguageCode = 'en',
) {
  return render(
    <I18nProvider lang={language} onChangeLanguage={vi.fn()}>
      <WelcomeModal onComplete={onComplete} />
    </I18nProvider>,
  );
}

function jumpToStep(stepNumber: number) {
  const tab = screen.getByRole('tab', { name: `${stepNumber} / 10` });
  fireEvent.click(tab);
}

describe('WelcomeModal 10-step onboarding guide', () => {
  it('renders 10 steps and preserves the untouched first 3 setup steps', () => {
    renderWelcomeModal();

    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(10);
    expect(screen.getByText('1 / 10')).toBeInTheDocument();

    // Step 1: Language step intact
    expect(screen.getByTestId('welcome-selected-language')).toBeInTheDocument();
    expect(screen.queryByTestId('welcome-optional-badge')).not.toBeInTheDocument();

    // Step 2: Color Theme & Mode step intact
    fireEvent.click(screen.getByTestId('welcome-step-next'));
    expect(screen.getByText('2 / 10')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: EN_DICTIONARY.colorThemeTitle }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('welcome-optional-badge')).not.toBeInTheDocument();

    // Step 3: App Icon step intact
    fireEvent.click(screen.getByTestId('welcome-step-next'));
    expect(screen.getByText('3 / 10')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: EN_DICTIONARY.appIconSectionTitle }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('welcome-optional-badge')).not.toBeInTheDocument();
  });

  it('presents new features and marks optional steps with clear badges and deep settings links', () => {
    const onComplete = vi.fn();
    renderWelcomeModal(onComplete, 'en');

    // Step 7 (index 6): Focus Mode & Smart Reminders (core feature, not optional)
    jumpToStep(7);
    expect(screen.getByText('7 / 10')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: EN_DICTIONARY.welcomeFocusTitle }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('welcome-optional-badge')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('welcome-open-notifications'));
    expect(onComplete).toHaveBeenLastCalledWith('notifications');

    // Step 8 (index 7): Voice Dictation & On-Device AI (optional)
    jumpToStep(8);
    expect(screen.getByText('8 / 10')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: EN_DICTIONARY.welcomeAiTitle })).toBeInTheDocument();
    expect(screen.getByTestId('welcome-optional-badge')).toHaveTextContent(
      EN_DICTIONARY.welcomeOptionalBadge,
    );
    fireEvent.click(screen.getByTestId('welcome-open-ai'));
    expect(onComplete).toHaveBeenLastCalledWith('ai');

    // Step 9 (index 8): Optional Automation & Power Tools (optional)
    jumpToStep(9);
    expect(screen.getByText('9 / 10')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: EN_DICTIONARY.welcomePowerTitle }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('welcome-optional-badge')).toHaveTextContent(
      EN_DICTIONARY.welcomeOptionalBadge,
    );
    fireEvent.click(screen.getByTestId('welcome-open-automation'));
    expect(onComplete).toHaveBeenLastCalledWith('docs');

    // Step 10 (index 9): Privacy & Protection + Start CTA
    jumpToStep(10);
    expect(screen.getByText('10 / 10')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: EN_DICTIONARY.welcomeStep4Title }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('welcome-optional-badge')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('welcome-open-settings'));
    expect(onComplete).toHaveBeenLastCalledWith('data');

    fireEvent.click(screen.getByTestId('welcome-step-start'));
    expect(onComplete).toHaveBeenLastCalledWith(false);
  });

  it('supports keyboard navigation, Skip button, and Escape dismissal', () => {
    const onComplete = vi.fn();
    renderWelcomeModal(onComplete, 'en');

    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(screen.getByText('2 / 10')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(screen.getByText('1 / 10')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('welcome-step-skip'));
    expect(onComplete).toHaveBeenLastCalledWith(false);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onComplete).toHaveBeenCalledTimes(2);
  });

  it('renders warm end-user copy without developer acronyms on new Turkish steps', () => {
    renderWelcomeModal(vi.fn(), 'tr');

    for (const stepNum of [7, 8, 9, 10]) {
      jumpToStep(stepNum);
      const modalText = screen.getByTestId('welcome-modal').textContent ?? '';
      expect(modalText).not.toMatch(/SQLite|WASM|ONNX|FTS5|HMAC-SHA256|JSON-RPC/i);
    }

    jumpToStep(8);
    expect(screen.getByTestId('welcome-optional-badge')).toHaveTextContent(
      TR_DICTIONARY.welcomeOptionalBadge,
    );
    expect(screen.getByRole('heading', { name: TR_DICTIONARY.welcomeAiTitle })).toBeInTheDocument();
  });
});
