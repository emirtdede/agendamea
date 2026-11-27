import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../src/api/client';
import { AppLockScreen } from '../../src/components/AppLockScreen';
import { AppLockSettingsCard } from '../../src/components/settings/AppLockSettingsCard';
import { I18nProvider } from '../../src/i18n/I18nContext';
import { appLockStore } from '../../src/store/appLockStore';

function renderWithI18n(ui: React.ReactElement) {
  return render(
    <I18nProvider lang="en" onChangeLanguage={vi.fn()}>
      {ui}
    </I18nProvider>,
  );
}

describe('App Lock UI (PIN 4/6/8 & Password)', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    appLockStore.resetToDisabled();
  });

  it('enables 6-digit PIN from General Settings card, validates mismatch, and displays one-time Recovery Code', async () => {
    const setupSpy = vi.spyOn(api, 'setupAppLock').mockResolvedValue({
      ok: true,
      recoveryCode: 'AGDM-ABCD-EFGH-2345',
      status: {
        enabled: true,
        locked: false,
        type: 'pin6',
        autoLockMinutes: 5,
        lockOnMinimize: false,
        hasRecoveryCode: true,
        failedAttempts: 0,
        retryAfterSeconds: 0,
      },
    });
    const notifySpy = vi.fn();

    renderWithI18n(<AppLockSettingsCard onLockNow={vi.fn()} onNotifyInfo={notifySpy} />);

    // Initially off: Enable button visible, active controls hidden
    expect(screen.getByTestId('app-lock-enable-btn')).toBeInTheDocument();
    expect(screen.queryByTestId('app-lock-timeout-select')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('app-lock-enable-btn'));
    const modal = await screen.findByTestId('app-lock-modal');
    expect(modal).toBeInTheDocument();

    // Switch to 6-digit PIN
    fireEvent.click(screen.getByTestId('app-lock-type-pin6'));
    fireEvent.change(screen.getByTestId('app-lock-new-input'), { target: { value: '123456' } });
    fireEvent.change(screen.getByTestId('app-lock-confirm-input'), { target: { value: '654321' } });
    fireEvent.click(screen.getByTestId('app-lock-modal-submit-btn'));

    expect(screen.getByTestId('app-lock-modal-error')).toBeInTheDocument();
    expect(setupSpy).not.toHaveBeenCalled();

    // Enter matching confirmation and submit
    fireEvent.change(screen.getByTestId('app-lock-confirm-input'), { target: { value: '123456' } });
    fireEvent.click(screen.getByTestId('app-lock-modal-submit-btn'));

    await waitFor(() => {
      expect(setupSpy).toHaveBeenCalledWith({ type: 'pin6', secret: '123456' });
    });

    // Recovery code shown once
    expect(await screen.findByTestId('app-lock-generated-recovery')).toHaveTextContent(
      'AGDM-ABCD-EFGH-2345',
    );
    expect(notifySpy).toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('app-lock-recovery-done-btn'));

    // Card now shows active controls (auto-lock timeout, minimize toggle, lock now, change, disable)
    expect(screen.getByTestId('app-lock-timeout-select')).toBeInTheDocument();
    expect(screen.getByTestId('app-lock-minimize-toggle')).toBeInTheDocument();
    expect(screen.getByTestId('app-lock-now-btn')).toBeInTheDocument();
    expect(screen.getByTestId('app-lock-change-btn')).toBeInTheDocument();
    expect(screen.getByTestId('app-lock-disable-btn')).toBeInTheDocument();
  });

  it('auto-submits 4-digit PIN on AppLockScreen, shows error on wrong PIN, and supports recovery unlock', async () => {
    const verifySpy = vi
      .spyOn(api, 'verifyAppLock')
      .mockResolvedValueOnce({
        ok: false,
        code: 'INVALID_CREDENTIAL',
        retryAfterSeconds: 0,
        status: {
          enabled: true,
          locked: true,
          type: 'pin4',
          autoLockMinutes: 5,
          lockOnMinimize: false,
          hasRecoveryCode: true,
          failedAttempts: 1,
          retryAfterSeconds: 0,
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        status: {
          enabled: true,
          locked: false,
          type: 'pin4',
          autoLockMinutes: 5,
          lockOnMinimize: false,
          hasRecoveryCode: true,
          failedAttempts: 0,
          retryAfterSeconds: 0,
        },
      });
    const onUnlocked = vi.fn();

    renderWithI18n(<AppLockScreen lockType="pin4" onUnlocked={onUnlocked} />);

    const pinInput = screen.getByTestId('app-lock-pin-input');
    // Entering 4th digit triggers auto-submit
    fireEvent.change(pinInput, { target: { value: '0000' } });

    await waitFor(() => {
      expect(verifySpy).toHaveBeenCalledWith('0000');
    });
    expect(await screen.findByTestId('app-lock-error')).toBeInTheDocument();
    expect(onUnlocked).not.toHaveBeenCalled();

    // Correct PIN unlocks immediately
    fireEvent.change(pinInput, { target: { value: '2468' } });
    await waitFor(() => {
      expect(onUnlocked).toHaveBeenCalledTimes(1);
    });
  });

  it('unlocks via Recovery Code flow when user clicks Forgot PIN', async () => {
    const recoverSpy = vi.spyOn(api, 'recoverAppLock').mockResolvedValue({
      ok: true,
      status: {
        enabled: false,
        locked: false,
        type: 'password',
        autoLockMinutes: 5,
        lockOnMinimize: false,
        hasRecoveryCode: false,
        failedAttempts: 0,
        retryAfterSeconds: 0,
      },
    });
    const onUnlocked = vi.fn();

    renderWithI18n(<AppLockScreen lockType="password" onUnlocked={onUnlocked} />);
    expect(screen.getByTestId('app-lock-password-input')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('app-lock-forgot-btn'));
    const recoveryInput = screen.getByTestId('app-lock-recovery-input');
    fireEvent.change(recoveryInput, { target: { value: 'agdm-1234-5678-9abc' } });
    fireEvent.click(screen.getByTestId('app-lock-recover-submit-btn'));

    await waitFor(() => {
      expect(recoverSpy).toHaveBeenCalledWith('AGDM-1234-5678-9ABC');
      expect(onUnlocked).toHaveBeenCalledTimes(1);
    });
  });
});
