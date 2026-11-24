import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SettingsModal } from '../../src/components/SettingsModal';
import type { SettingsRuntimeActions } from '../../src/components/settings/SettingsTabOutlet';
import { I18nProvider } from '../../src/i18n/I18nContext';

function createMockActions(): SettingsRuntimeActions {
  return {
    onSendTestNotification: vi.fn(),
    onNotifyVoice: vi.fn(),
    onNotifyCloudSync: vi.fn(),
    onCheckForUpdates: vi.fn().mockResolvedValue(undefined),
    onDownloadAndInstall: vi.fn().mockResolvedValue(undefined),
    onQuitAndInstallUpdate: vi.fn().mockResolvedValue(undefined),
    onClearAllCompleted: vi.fn().mockResolvedValue(undefined),
    onImportBackup: vi.fn().mockResolvedValue(undefined),
    onApplyRestoredBootstrap: vi.fn(),
    onResetAllData: vi.fn().mockResolvedValue(undefined),
    onRestoreTodo: vi.fn().mockResolvedValue(undefined),
    onPermanentDeleteTodo: vi.fn().mockResolvedValue(undefined),
    onRestoreCategory: vi.fn().mockResolvedValue(undefined),
    onPermanentDeleteCategory: vi.fn().mockResolvedValue(undefined),
    onEmptyTrash: vi.fn().mockResolvedValue(undefined),
    onToggleDragLock: vi.fn(),
  };
}

describe('SettingsModal (Viewport Isolation & Tab Navigation)', () => {
  it('mounts strictly one tablist on desktop viewport and closes on Escape', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(
      <I18nProvider lang="en" onChangeLanguage={vi.fn()}>
        <SettingsModal onClose={onClose} initialTab="appearance" actions={createMockActions()} />
      </I18nProvider>,
    );

    expect(screen.getAllByRole('tablist')).toHaveLength(1);
    await user.click(screen.getByTestId('settings-tab-general'));
    expect(screen.getByTestId('settings-tab-general')).toHaveAttribute('aria-selected', 'true');

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('mounts compact tablist only when matchMedia reports < 1024px', () => {
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    try {
      render(
        <I18nProvider lang="en" onChangeLanguage={vi.fn()}>
          <SettingsModal onClose={vi.fn()} initialTab="appearance" actions={createMockActions()} />
        </I18nProvider>,
      );

      expect(screen.getAllByRole('tablist')).toHaveLength(1);
      expect(screen.getByTestId('settings-compact-tab-appearance')).toBeInTheDocument();
      expect(screen.queryByTestId('settings-tab-appearance')).not.toBeInTheDocument();
    } finally {
      window.matchMedia = originalMatchMedia;
    }
  });

  it('supports deep settings search jumping directly to a matching tab via Ctrl+F', async () => {
    const user = userEvent.setup();
    render(
      <I18nProvider lang="en" onChangeLanguage={vi.fn()}>
        <SettingsModal onClose={vi.fn()} initialTab="appearance" actions={createMockActions()} />
      </I18nProvider>,
    );

    await user.keyboard('{Control>}f{/Control}');
    const searchInput = screen.getByTestId('settings-deep-search-input');
    await user.type(searchInput, 'quiet');
    const hit = screen.getByTestId('settings-search-hit-notif-quiet-digest');
    await user.click(hit);

    expect(screen.getByTestId('settings-tab-notifications')).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });
});
