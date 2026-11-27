import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LanguageRestartModal } from '../../src/components/LanguageRestartModal';
import { GeneralSettingsTab } from '../../src/components/settings/GeneralSettingsTab';
import { I18nProvider, readInitialLanguage } from '../../src/i18n/I18nContext';
import type { LanguageCode } from '../../src/i18n/languages';
import { EN_DICTIONARY, TR_DICTIONARY } from '../../src/i18n/translations';
import { createPreferencesStore } from '../../src/store/preferencesStore';
import type { AppSettings } from '../../src/types';

function LanguageChangeHarness({
  initialLang = 'tr',
  onRelaunch,
  onPersist,
}: {
  initialLang?: LanguageCode;
  onRelaunch: () => Promise<void>;
  onPersist: (patch: Partial<AppSettings>) => Promise<AppSettings>;
}) {
  const [activeLang] = useState<LanguageCode>(initialLang);
  const [pendingLang, setPendingLang] = useState<LanguageCode | null>(null);
  const [targetLang, setTargetLang] = useState<LanguageCode | null>(null);
  const [store] = useState(() => createPreferencesStore(onPersist, vi.fn()));

  return (
    <I18nProvider
      lang={activeLang}
      pendingLanguage={pendingLang}
      onChangeLanguage={(next) => {
        if (next !== activeLang) setTargetLang(next);
      }}
      onRestartApp={onRelaunch}
    >
      <GeneralSettingsTab
        closeBehavior="ask"
        launchAtStartup={false}
        launchMinimizedToTray={false}
        weekStartsOn="monday"
        timeFormat="24h"
        defaultStartupView="all"
        defaultLayoutMode="list"
        defaultPriority="normal"
        completedTaskBehavior="bottom"
        completionSound="none"
        confirmBeforeDelete={false}
        dragLocked={false}
        onChangeCloseBehavior={vi.fn()}
        onToggleLaunchAtStartup={vi.fn()}
        onToggleLaunchMinimizedToTray={vi.fn()}
        onChangeWeekStartsOn={vi.fn()}
        onChangeTimeFormat={vi.fn()}
        onChangeDefaultStartupView={vi.fn()}
        onChangeDefaultLayoutMode={vi.fn()}
        onChangeDefaultPriority={vi.fn()}
        onChangeCompletedTaskBehavior={vi.fn()}
        onChangeCompletionSound={vi.fn()}
        onToggleConfirmBeforeDelete={vi.fn()}
        onToggleDragLock={vi.fn()}
        onResetGeneral={vi.fn()}
      />
      {targetLang && (
        <LanguageRestartModal
          targetLanguage={targetLang}
          onRestartNow={async () => {
            const chosen = targetLang;
            await store.saveLanguageForNextLaunch(chosen);
            setPendingLang(chosen);
            setTargetLang(null);
            await onRelaunch();
          }}
          onLater={async () => {
            const chosen = targetLang;
            setTargetLang(null);
            await store.saveLanguageForNextLaunch(chosen);
            setPendingLang(chosen);
          }}
          onCancel={() => setTargetLang(null)}
        />
      )}
    </I18nProvider>
  );
}

describe('Single-Locale Startup & Language Restart Flow', () => {
  afterEach(() => {
    delete window.__AGENDAMEA_INITIAL_LANG__;
    localStorage.clear();
  });

  it('readInitialLanguage prioritizes server-injected Setup/DB locale over localStorage', () => {
    localStorage.setItem('agendamea-language', 'fr');
    window.__AGENDAMEA_INITIAL_LANG__ = 'de';

    const resolved = readInitialLanguage();
    expect(resolved.code).toBe('de');
    expect(resolved.fromServerBoot).toBe(true);
  });

  it('opens LanguageRestartModal without hot-swapping active language, persists and triggers relaunch on Restart Now', async () => {
    const relaunch = vi.fn().mockResolvedValue(undefined);
    const persist = vi.fn(
      async (patch: Partial<AppSettings>) =>
        ({
          themeMode: 'dark',
          themeId: 'obsidian',
          dragLocked: false,
          sidebarCollapsed: false,
          language: patch.language ?? 'tr',
        }) as AppSettings,
    );

    render(<LanguageChangeHarness initialLang="tr" onRelaunch={relaunch} onPersist={persist} />);

    // Open language picker and pick English
    fireEvent.click(screen.getByTestId('general-language-toggle-btn'));
    fireEvent.click(screen.getByRole('option', { name: /English/i }));

    // Restart popup appears; active UI stays in Turkish (never hot-swaps!)
    const modal = screen.getByTestId('language-restart-modal');
    expect(modal).toBeInTheDocument();
    expect(screen.getByText(TR_DICTIONARY.langRestartModalTitle)).toBeInTheDocument();
    expect(screen.getByTestId('lang-restart-target-name')).toHaveTextContent('English');
    expect(screen.queryByText(EN_DICTIONARY.langRestartModalTitle)).not.toBeInTheDocument();
    expect(persist).not.toHaveBeenCalled();

    // Confirm Restart Now -> persists language then triggers relaunch
    fireEvent.click(screen.getByTestId('lang-restart-now-btn'));
    await waitFor(() => {
      expect(persist).toHaveBeenCalledWith({ language: 'en' });
      expect(relaunch).toHaveBeenCalledTimes(1);
    });
    expect(localStorage.getItem('agendamea-language')).toBe('en');
  });

  it('saves pending language for next launch without restarting when Later is clicked, and supports Cancel', async () => {
    const relaunch = vi.fn().mockResolvedValue(undefined);
    const persist = vi.fn(
      async (patch: Partial<AppSettings>) =>
        ({
          themeMode: 'dark',
          themeId: 'obsidian',
          dragLocked: false,
          sidebarCollapsed: false,
          language: patch.language ?? 'tr',
        }) as AppSettings,
    );

    render(<LanguageChangeHarness initialLang="tr" onRelaunch={relaunch} onPersist={persist} />);

    // Pick Deutsch then Cancel -> nothing persisted
    fireEvent.click(screen.getByTestId('general-language-toggle-btn'));
    fireEvent.click(screen.getByRole('option', { name: /Deutsch/i }));
    expect(screen.getByTestId('language-restart-modal')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('lang-restart-cancel-btn'));
    expect(screen.queryByTestId('language-restart-modal')).not.toBeInTheDocument();
    expect(persist).not.toHaveBeenCalled();

    // Pick Deutsch then Later -> persisted for next launch, active UI stays Turkish, pending banner shown
    fireEvent.click(screen.getByTestId('general-language-toggle-btn'));
    fireEvent.click(screen.getByRole('option', { name: /Deutsch/i }));
    fireEvent.click(screen.getByTestId('lang-restart-later-btn'));

    await waitFor(() => {
      expect(persist).toHaveBeenCalledWith({ language: 'de' });
      expect(screen.getByTestId('general-language-pending-banner')).toBeInTheDocument();
    });
    expect(relaunch).not.toHaveBeenCalled();
    expect(screen.getByTestId('general-active-language-pill')).toHaveTextContent('Türkçe');
    expect(localStorage.getItem('agendamea-language')).toBe('de');

    // Clicking Restart Now inside pending banner triggers relaunch
    fireEvent.click(screen.getByTestId('general-language-restart-now-btn'));
    await waitFor(() => {
      expect(relaunch).toHaveBeenCalledTimes(1);
    });
  });
});
