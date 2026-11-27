import { AlertCircle, ArrowLeft, Eye, EyeOff, KeyRound, Lock } from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import { useI18n } from '../i18n/I18nContext';
import { appLockStore } from '../store/appLockStore';
import type { AppLockStatus, AppLockType } from '../types';
import { BrandMark } from './BrandMark';
import { WindowControls } from './WindowControls';

interface AppLockScreenProps {
  lockType: AppLockType;
  initialRetryAfterSeconds?: number;
  onUnlocked: (status: AppLockStatus) => void;
}

function getPinLength(type: AppLockType): number {
  if (type === 'pin4') return 4;
  if (type === 'pin6') return 6;
  if (type === 'pin8') return 8;
  return 0;
}

export function AppLockScreen({
  lockType,
  initialRetryAfterSeconds = 0,
  onUnlocked,
}: AppLockScreenProps) {
  const { t } = useI18n();
  const pinLen = getPinLength(lockType);
  const isPin = pinLen > 0;

  const [mode, setMode] = useState<'unlock' | 'recover'>('unlock');
  const [secret, setSecret] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [cooldownSec, setCooldownSec] = useState(Math.max(0, initialRetryAfterSeconds));

  const inputRef = useRef<HTMLInputElement>(null);
  const recoveryRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setCooldownSec((prev) => Math.max(prev, initialRetryAfterSeconds));
  }, [initialRetryAfterSeconds]);

  useEffect(() => {
    if (cooldownSec <= 0) return;
    const id = window.setInterval(() => {
      setCooldownSec((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [cooldownSec]);

  useEffect(() => {
    const target = mode === 'unlock' ? inputRef.current : recoveryRef.current;
    if (target) {
      target.focus();
    }
  }, [mode]);

  const submitCredential = useCallback(
    async (candidate: string) => {
      if (submitting || cooldownSec > 0) return;
      if (isPin && candidate.length !== pinLen) return;
      if (!isPin && candidate.trim().length === 0) return;

      setSubmitting(true);
      setErrorMsg(null);
      try {
        const res = await api.verifyAppLock(candidate);
        if (res.status) {
          appLockStore.applyStatus(res.status);
        }
        if (res.ok) {
          setSecret('');
          onUnlocked(res.status);
          return;
        }
        const retry = Math.max(
          0,
          Number(res.retryAfterSeconds ?? res.status?.retryAfterSeconds) || 0,
        );
        if (retry > 0) {
          setCooldownSec(retry);
          setErrorMsg(t.appLockCooldownError.replace('{seconds}', String(retry)));
        } else {
          setErrorMsg(t.appLockWrongCredential);
        }
        setSecret('');
        window.requestAnimationFrame(() => inputRef.current?.focus());
      } catch {
        setErrorMsg(t.appLockWrongCredential);
        setSecret('');
      } finally {
        setSubmitting(false);
      }
    },
    [
      cooldownSec,
      isPin,
      onUnlocked,
      pinLen,
      submitting,
      t.appLockCooldownError,
      t.appLockWrongCredential,
    ],
  );

  const handlePinChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (cooldownSec > 0 || submitting) return;
    const digitsOnly = e.target.value.replace(/\D/g, '').slice(0, pinLen);
    setSecret(digitsOnly);
    if (errorMsg) setErrorMsg(null);
    if (digitsOnly.length === pinLen) {
      void submitCredential(digitsOnly);
    }
  };

  const handleUnlockFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void submitCredential(secret);
  };

  const handleRecoverSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting || cooldownSec > 0 || !recoveryCode.trim()) return;
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const res = await api.recoverAppLock(recoveryCode.trim());
      if (res.status) {
        appLockStore.applyStatus(res.status);
      }
      if (res.ok) {
        setRecoveryCode('');
        onUnlocked(res.status);
        return;
      }
      const retry = Math.max(
        0,
        Number(res.retryAfterSeconds ?? res.status?.retryAfterSeconds) || 0,
      );
      if (retry > 0) {
        setCooldownSec(retry);
        setErrorMsg(t.appLockCooldownError.replace('{seconds}', String(retry)));
      } else {
        setErrorMsg(t.appLockRecoveryInvalid);
      }
    } catch {
      setErrorMsg(t.appLockRecoveryInvalid);
    } finally {
      setSubmitting(false);
    }
  };

  const pinSlots = isPin ? Array.from({ length: pinLen }, (_, idx) => idx) : [];
  const activeError =
    cooldownSec > 0 ? t.appLockCooldownError.replace('{seconds}', String(cooldownSec)) : errorMsg;

  return (
    <div
      data-testid="app-lock-screen"
      role="dialog"
      aria-modal="true"
      aria-labelledby="app-lock-screen-title"
      className="fixed inset-0 z-[60] flex flex-col bg-[var(--canvas)] text-[var(--text-primary)] select-none"
    >
      {/* Keep frameless desktop window bar draggable and controllable while locked */}
      <div className="app-drag-region flex h-10 shrink-0 items-center justify-end px-2">
        <WindowControls />
      </div>

      <div className="flex flex-1 items-center justify-center p-4">
        <div className="w-full max-w-[400px] rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-7 shadow-xl space-y-6">
          <div className="flex flex-col items-center text-center space-y-3">
            <div className="relative">
              <BrandMark className="h-12 w-12 rounded-xl border border-[var(--border-strong)]" />
              <span className="absolute -bottom-1.5 -end-1.5 flex h-6 w-6 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--text-primary)] shadow-sm">
                {mode === 'unlock' ? (
                  <Lock className="h-3 w-3" />
                ) : (
                  <KeyRound className="h-3 w-3" />
                )}
              </span>
            </div>
            <div className="space-y-1">
              <h1
                id="app-lock-screen-title"
                className="font-display text-lg font-bold tracking-tight text-[var(--text-primary)]"
              >
                {mode === 'unlock' ? t.appLockScreenTitle : t.appLockRecoveryTitle}
              </h1>
              <p className="text-xs leading-relaxed text-[var(--text-muted)]">
                {mode === 'unlock' ? t.appLockScreenSubtitle : t.appLockRecoveryDesc}
              </p>
            </div>
          </div>

          {mode === 'unlock' ? (
            <form onSubmit={handleUnlockFormSubmit} className="space-y-4">
              {isPin ? (
                <div className="space-y-2.5">
                  <label
                    htmlFor="app-lock-pin-input"
                    className="relative flex items-center justify-center gap-2 cursor-text"
                  >
                    <input
                      id="app-lock-pin-input"
                      ref={inputRef}
                      type="password"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      autoComplete="off"
                      data-testid="app-lock-pin-input"
                      aria-label={t.appLockEnterPinPlaceholder}
                      value={secret}
                      onChange={handlePinChange}
                      disabled={submitting || cooldownSec > 0}
                      maxLength={pinLen}
                      className="sr-only"
                    />
                    {pinSlots.map((idx) => {
                      const filled = idx < secret.length;
                      const active = idx === secret.length && cooldownSec === 0;
                      return (
                        <div
                          key={idx}
                          aria-hidden="true"
                          className={`flex items-center justify-center rounded-lg border transition-colors ${
                            pinLen === 8 ? 'h-10 w-8' : pinLen === 6 ? 'h-11 w-10' : 'h-12 w-12'
                          } ${
                            active
                              ? 'border-[var(--accent)] bg-[var(--canvas)] ring-2 ring-[var(--accent-ring)]'
                              : filled
                                ? 'border-[var(--border-strong)] bg-[var(--surface-subtle)]'
                                : 'border-[var(--border)] bg-[var(--canvas)]'
                          }`}
                        >
                          <span
                            className={`rounded-full transition-transform ${
                              filled
                                ? 'h-2.5 w-2.5 scale-100 bg-[var(--text-primary)]'
                                : 'h-1.5 w-1.5 scale-0 bg-transparent'
                            }`}
                          />
                        </div>
                      );
                    })}
                  </label>
                  <p className="text-center text-[11px] text-[var(--text-muted)]">
                    {t.appLockEnterPinPlaceholder}
                  </p>
                </div>
              ) : (
                <div className="relative">
                  <input
                    ref={inputRef}
                    type={showSecret ? 'text' : 'password'}
                    autoComplete="current-password"
                    data-testid="app-lock-password-input"
                    aria-label={t.appLockEnterPasswordPlaceholder}
                    placeholder={t.appLockEnterPasswordPlaceholder}
                    value={secret}
                    onChange={(e) => {
                      setSecret(e.target.value);
                      if (errorMsg) setErrorMsg(null);
                    }}
                    disabled={submitting || cooldownSec > 0}
                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--canvas)] py-2.5 ps-3.5 pe-10 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none disabled:opacity-50"
                  />
                  <button
                    type="button"
                    aria-label={showSecret ? t.appLockHideSecret : t.appLockShowSecret}
                    onClick={() => setShowSecret((prev) => !prev)}
                    className="absolute end-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                  >
                    {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              )}

              {activeError && (
                <div
                  role="alert"
                  data-testid="app-lock-error"
                  className="flex items-center gap-2 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-500 dark:text-red-400"
                >
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  <span>{activeError}</span>
                </div>
              )}

              <button
                type="submit"
                data-testid="app-lock-unlock-btn"
                disabled={
                  submitting ||
                  cooldownSec > 0 ||
                  (isPin ? secret.length !== pinLen : secret.trim().length === 0)
                }
                className="w-full rounded-xl py-2.5 text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-45"
                style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-fg)' }}
              >
                {submitting ? t.appLockUnlockingButton : t.appLockUnlockButton}
              </button>

              <div className="text-center pt-1">
                <button
                  type="button"
                  data-testid="app-lock-forgot-btn"
                  onClick={() => {
                    setMode('recover');
                    setErrorMsg(null);
                    setSecret('');
                  }}
                  className="text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                >
                  {t.appLockForgotLink}
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={(e) => void handleRecoverSubmit(e)} className="space-y-4">
              <input
                ref={recoveryRef}
                type="text"
                autoComplete="off"
                spellCheck={false}
                data-testid="app-lock-recovery-input"
                aria-label={t.appLockRecoveryPlaceholder}
                placeholder={t.appLockRecoveryPlaceholder}
                value={recoveryCode}
                onChange={(e) => {
                  setRecoveryCode(e.target.value.toUpperCase());
                  if (errorMsg) setErrorMsg(null);
                }}
                disabled={submitting || cooldownSec > 0}
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--canvas)] px-3.5 py-2.5 font-mono-tabular text-sm tracking-wider text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none disabled:opacity-50"
              />

              {activeError && (
                <div
                  role="alert"
                  data-testid="app-lock-error"
                  className="flex items-center gap-2 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-500 dark:text-red-400"
                >
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  <span>{activeError}</span>
                </div>
              )}

              <button
                type="submit"
                data-testid="app-lock-recover-submit-btn"
                disabled={submitting || cooldownSec > 0 || recoveryCode.trim().length < 4}
                className="w-full rounded-xl py-2.5 text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-45"
                style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-fg)' }}
              >
                {submitting ? t.appLockUnlockingButton : t.appLockUnlockButton}
              </button>

              <div className="text-center pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setMode('unlock');
                    setErrorMsg(null);
                    setRecoveryCode('');
                  }}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                >
                  <ArrowLeft className="h-3.5 w-3.5 rtl:rotate-180" />
                  <span>{t.appLockBackToUnlock}</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
