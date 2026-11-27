import {
  AlertCircle,
  Check,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  ShieldCheck,
  X,
} from 'lucide-react';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../../api/client';
import { useI18n } from '../../i18n/I18nContext';
import { appLockStore } from '../../store/appLockStore';
import type { AppLockType } from '../../types';

export type AppLockModalMode = 'setup' | 'change' | 'disable';

interface AppLockModalProps {
  mode: AppLockModalMode;
  currentType: AppLockType;
  onClose: () => void;
  onSuccessToast?: (message: string) => void;
}

function getExpectedPinLen(type: AppLockType): number {
  if (type === 'pin4') return 4;
  if (type === 'pin6') return 6;
  if (type === 'pin8') return 8;
  return 0;
}

export function AppLockModal({ mode, currentType, onClose, onSuccessToast }: AppLockModalProps) {
  const { t } = useI18n();
  const [selectedType, setSelectedType] = useState<AppLockType>(
    mode === 'setup' ? 'pin4' : currentType,
  );
  const [currentSecret, setCurrentSecret] = useState('');
  const [newSecret, setNewSecret] = useState('');
  const [confirmSecret, setConfirmSecret] = useState('');
  const [showSecrets, setShowSecrets] = useState(false);
  const [useRecoveryToDisable, setUseRecoveryToDisable] = useState(false);
  const [recoveryInput, setRecoveryInput] = useState('');
  const [generatedRecovery, setGeneratedRecovery] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const currentInputRef = useRef<HTMLInputElement>(null);
  const newInputRef = useRef<HTMLInputElement>(null);
  const recoveryInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (generatedRecovery) return;
    if (mode === 'setup') {
      newInputRef.current?.focus();
    } else if (mode === 'disable' && useRecoveryToDisable) {
      recoveryInputRef.current?.focus();
    } else {
      currentInputRef.current?.focus();
    }
  }, [generatedRecovery, mode, useRecoveryToDisable]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !generatedRecovery) {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [generatedRecovery, onClose]);

  const pinLen = getExpectedPinLen(selectedType);
  const isNewPin = pinLen > 0;
  const currentPinLen = getExpectedPinLen(currentType);

  const validateNewCredential = (): string | null => {
    if (isNewPin) {
      if (!new RegExp(`^\\d{${pinLen}}$`).test(newSecret)) {
        return t.appLockInvalidPinError.replace('{digits}', String(pinLen));
      }
    } else if (newSecret.length < 4 || newSecret.length > 128 || newSecret.trim().length === 0) {
      return t.appLockInvalidPasswordError;
    }
    if (newSecret !== confirmSecret) {
      return t.appLockMismatchError;
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setErrorMsg(null);

    if (mode === 'setup') {
      const err = validateNewCredential();
      if (err) {
        setErrorMsg(err);
        return;
      }
      setSubmitting(true);
      try {
        const res = await api.setupAppLock({ type: selectedType, secret: newSecret });
        if (res.status) appLockStore.applyStatus(res.status);
        if (!res.ok) {
          setErrorMsg(t.appLockWrongCredential);
          return;
        }
        setGeneratedRecovery(res.recoveryCode ?? null);
        onSuccessToast?.(t.appLockEnabledToast);
      } catch {
        setErrorMsg(t.operationFailedToast);
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (mode === 'change') {
      if (!currentSecret) {
        setErrorMsg(t.appLockWrongCredential);
        return;
      }
      const err = validateNewCredential();
      if (err) {
        setErrorMsg(err);
        return;
      }
      setSubmitting(true);
      try {
        const res = await api.changeAppLock({
          currentSecret,
          type: selectedType,
          newSecret,
        });
        if (res.status) appLockStore.applyStatus(res.status);
        if (!res.ok) {
          if (res.code === 'LOCK_COOLDOWN' && res.retryAfterSeconds) {
            setErrorMsg(t.appLockCooldownError.replace('{seconds}', String(res.retryAfterSeconds)));
          } else {
            setErrorMsg(t.appLockWrongCredential);
          }
          return;
        }
        setGeneratedRecovery(res.recoveryCode ?? null);
        onSuccessToast?.(t.appLockChangedToast);
      } catch {
        setErrorMsg(t.operationFailedToast);
      } finally {
        setSubmitting(false);
      }
      return;
    }

    // disable mode
    if (useRecoveryToDisable) {
      if (!recoveryInput.trim()) {
        setErrorMsg(t.appLockRecoveryInvalid);
        return;
      }
    } else if (!currentSecret) {
      setErrorMsg(t.appLockWrongCredential);
      return;
    }
    setSubmitting(true);
    try {
      const res = useRecoveryToDisable
        ? await api.recoverAppLock(recoveryInput.trim())
        : await api.disableAppLock(currentSecret);
      if (res.status) appLockStore.applyStatus(res.status);
      if (!res.ok) {
        if (res.code === 'LOCK_COOLDOWN' && res.retryAfterSeconds) {
          setErrorMsg(t.appLockCooldownError.replace('{seconds}', String(res.retryAfterSeconds)));
        } else {
          setErrorMsg(useRecoveryToDisable ? t.appLockRecoveryInvalid : t.appLockWrongCredential);
        }
        return;
      }
      onSuccessToast?.(t.appLockDisabledToast);
      onClose();
    } catch {
      setErrorMsg(t.operationFailedToast);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopyRecovery = async () => {
    if (!generatedRecovery) return;
    try {
      await navigator.clipboard.writeText(generatedRecovery);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = generatedRecovery;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  const lockTypes: ReadonlyArray<{ id: AppLockType; label: string }> = [
    { id: 'pin4', label: t.appLockTypePin4 },
    { id: 'pin6', label: t.appLockTypePin6 },
    { id: 'pin8', label: t.appLockTypePin8 },
    { id: 'password', label: t.appLockTypePassword },
  ];

  const modalTitle = generatedRecovery
    ? t.appLockRecoverySavedTitle
    : mode === 'setup'
      ? t.appLockEnableButton
      : mode === 'change'
        ? t.appLockChangeButton
        : t.appLockDisableButton;

  const modalContent = (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <button
        type="button"
        tabIndex={-1}
        aria-label={t.closeMenu}
        onClick={() => {
          if (!generatedRecovery) onClose();
        }}
        className="fixed inset-0 border-0 bg-black/55 backdrop-blur-[2px]"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="app-lock-modal-title"
        data-testid="app-lock-modal"
        className="relative z-10 w-full max-w-[440px] rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-3.5">
          <div className="flex items-center gap-2 min-w-0">
            {generatedRecovery ? (
              <ShieldCheck className="h-4 w-4 text-emerald-500 shrink-0" />
            ) : (
              <Lock className="h-4 w-4 text-[var(--text-muted)] shrink-0" />
            )}
            <h3
              id="app-lock-modal-title"
              className="font-display text-sm font-semibold text-[var(--text-primary)] truncate"
            >
              {modalTitle}
            </h3>
          </div>
          {!generatedRecovery && (
            <button
              type="button"
              aria-label={t.closeMenu}
              onClick={onClose}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] ag-hover-glow"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {generatedRecovery ? (
          <div className="p-5 space-y-4">
            <p className="text-xs leading-relaxed text-[var(--text-muted)]">
              {t.appLockRecoverySavedWarning}
            </p>
            <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border-strong)] bg-[var(--canvas)] px-4 py-3">
              <code
                data-testid="app-lock-generated-recovery"
                className="font-mono-tabular text-sm font-semibold tracking-wider text-[var(--text-primary)] select-all"
              >
                {generatedRecovery}
              </code>
              <button
                type="button"
                data-testid="app-lock-copy-recovery-btn"
                onClick={() => void handleCopyRecovery()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-primary)] ag-hover-card-glow shrink-0"
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5 text-emerald-500" />
                ) : (
                  <Copy className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                )}
                <span>{copied ? t.appLockRecoveryCopiedToast : t.appLockRecoveryCopyButton}</span>
              </button>
            </div>
            <div className="flex justify-end pt-1">
              <button
                type="button"
                data-testid="app-lock-recovery-done-btn"
                onClick={onClose}
                className="rounded-xl px-4 py-2 text-xs font-semibold transition-opacity hover:opacity-90"
                style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-fg)' }}
              >
                {t.appLockRecoveryDoneButton}
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={(e) => void handleSubmit(e)} className="p-5 space-y-4">
            {(mode === 'change' || (mode === 'disable' && !useRecoveryToDisable)) && (
              <div className="space-y-1.5">
                <label
                  htmlFor="app-lock-current-input"
                  className="block text-xs font-medium text-[var(--text-secondary)]"
                >
                  {t.appLockCurrentLabel}
                </label>
                <div className="relative">
                  <input
                    ref={currentInputRef}
                    id="app-lock-current-input"
                    data-testid="app-lock-current-input"
                    type={showSecrets ? 'text' : 'password'}
                    inputMode={currentPinLen > 0 ? 'numeric' : 'text'}
                    autoComplete="current-password"
                    value={currentSecret}
                    onChange={(e) => {
                      const val =
                        currentPinLen > 0
                          ? e.target.value.replace(/\D/g, '').slice(0, currentPinLen)
                          : e.target.value;
                      setCurrentSecret(val);
                      if (errorMsg) setErrorMsg(null);
                    }}
                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--canvas)] py-2 ps-3 pe-9 text-sm text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none"
                  />
                  <button
                    type="button"
                    aria-label={showSecrets ? t.appLockHideSecret : t.appLockShowSecret}
                    onClick={() => setShowSecrets((prev) => !prev)}
                    className="absolute end-2 top-1/2 -translate-y-1/2 p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                  >
                    {showSecrets ? (
                      <EyeOff className="h-3.5 w-3.5" />
                    ) : (
                      <Eye className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
              </div>
            )}

            {mode === 'disable' && useRecoveryToDisable && (
              <div className="space-y-1.5">
                <label
                  htmlFor="app-lock-disable-recovery"
                  className="block text-xs font-medium text-[var(--text-secondary)]"
                >
                  {t.appLockRecoveryTitle}
                </label>
                <input
                  ref={recoveryInputRef}
                  id="app-lock-disable-recovery"
                  data-testid="app-lock-disable-recovery-input"
                  type="text"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={t.appLockRecoveryPlaceholder}
                  value={recoveryInput}
                  onChange={(e) => {
                    setRecoveryInput(e.target.value.toUpperCase());
                    if (errorMsg) setErrorMsg(null);
                  }}
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--canvas)] px-3 py-2 font-mono-tabular text-sm tracking-wider text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none"
                />
              </div>
            )}

            {mode === 'disable' && (
              <button
                type="button"
                onClick={() => {
                  setUseRecoveryToDisable((prev) => !prev);
                  setErrorMsg(null);
                }}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
              >
                <KeyRound className="h-3.5 w-3.5" />
                <span>{useRecoveryToDisable ? t.appLockBackToUnlock : t.appLockForgotLink}</span>
              </button>
            )}

            {(mode === 'setup' || mode === 'change') && (
              <>
                <div className="space-y-1.5">
                  <span className="block text-xs font-medium text-[var(--text-secondary)]">
                    {t.appLockTypeLabel}
                  </span>
                  <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                    {lockTypes.map((item) => {
                      const active = selectedType === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          data-testid={`app-lock-type-${item.id}`}
                          aria-pressed={active}
                          onClick={() => {
                            setSelectedType(item.id);
                            setNewSecret('');
                            setConfirmSecret('');
                            setErrorMsg(null);
                          }}
                          className={`rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors ${
                            active
                              ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text-primary)] font-semibold'
                              : 'border-[var(--border)] bg-[var(--canvas)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                          }`}
                        >
                          {item.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="app-lock-new-input"
                    className="block text-xs font-medium text-[var(--text-secondary)]"
                  >
                    {t.appLockNewLabel}
                  </label>
                  <div className="relative">
                    <input
                      ref={newInputRef}
                      id="app-lock-new-input"
                      data-testid="app-lock-new-input"
                      type={showSecrets ? 'text' : 'password'}
                      inputMode={isNewPin ? 'numeric' : 'text'}
                      autoComplete="new-password"
                      maxLength={isNewPin ? pinLen : 128}
                      value={newSecret}
                      onChange={(e) => {
                        const val = isNewPin
                          ? e.target.value.replace(/\D/g, '').slice(0, pinLen)
                          : e.target.value;
                        setNewSecret(val);
                        if (errorMsg) setErrorMsg(null);
                      }}
                      className="w-full rounded-xl border border-[var(--border)] bg-[var(--canvas)] py-2 ps-3 pe-9 text-sm text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none"
                    />
                    <button
                      type="button"
                      aria-label={showSecrets ? t.appLockHideSecret : t.appLockShowSecret}
                      onClick={() => setShowSecrets((prev) => !prev)}
                      className="absolute end-2 top-1/2 -translate-y-1/2 p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                    >
                      {showSecrets ? (
                        <EyeOff className="h-3.5 w-3.5" />
                      ) : (
                        <Eye className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="app-lock-confirm-input"
                    className="block text-xs font-medium text-[var(--text-secondary)]"
                  >
                    {t.appLockConfirmLabel}
                  </label>
                  <input
                    id="app-lock-confirm-input"
                    data-testid="app-lock-confirm-input"
                    type={showSecrets ? 'text' : 'password'}
                    inputMode={isNewPin ? 'numeric' : 'text'}
                    autoComplete="new-password"
                    maxLength={isNewPin ? pinLen : 128}
                    value={confirmSecret}
                    onChange={(e) => {
                      const val = isNewPin
                        ? e.target.value.replace(/\D/g, '').slice(0, pinLen)
                        : e.target.value;
                      setConfirmSecret(val);
                      if (errorMsg) setErrorMsg(null);
                    }}
                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--canvas)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none"
                  />
                </div>
              </>
            )}

            {errorMsg && (
              <div
                role="alert"
                data-testid="app-lock-modal-error"
                className="flex items-center gap-2 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-500 dark:text-red-400"
              >
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-[var(--border)] bg-[var(--canvas)] px-3.5 py-2 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                {t.cancelButton}
              </button>
              <button
                type="submit"
                data-testid="app-lock-modal-submit-btn"
                disabled={submitting}
                className="rounded-xl px-4 py-2 text-xs font-semibold transition-opacity hover:opacity-90 disabled:opacity-45"
                style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-fg)' }}
              >
                {t.applyButton}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );

  if (typeof document !== 'undefined' && document.body) {
    return createPortal(modalContent, document.body);
  }
  return modalContent;
}
