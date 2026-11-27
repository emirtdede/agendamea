import appLockCrypto from '../../shared/appLockCrypto.cjs';
import type { TodoDatabase } from '../../src/db/database.ts';
import type { AppLockAutoLockMinutes, AppLockStatus, AppLockType } from '../../src/types.ts';

const SECRET_HASH_KEY = 'appLockSecretHash';
const RECOVERY_HASH_KEY = 'appLockRecoveryHash';

export interface AppLockService {
  getStatus: () => AppLockStatus;
  isAppLocked: () => boolean;
  lockNow: () => AppLockStatus;
  verifyAndUnlock: (credential: string) => Promise<{
    ok: boolean;
    status: AppLockStatus;
    code?: string;
    retryAfterSeconds?: number;
  }>;
  recoverAndDisable: (recoveryCode: string) => Promise<{
    ok: boolean;
    status: AppLockStatus;
    code?: string;
    retryAfterSeconds?: number;
  }>;
  setupLock: (input: {
    type: AppLockType;
    secret: string;
    autoLockMinutes?: AppLockAutoLockMinutes;
    lockOnMinimize?: boolean;
  }) => Promise<{
    ok: boolean;
    recoveryCode?: string;
    status: AppLockStatus;
    code?: string;
  }>;
  changeLock: (input: { currentSecret: string; type: AppLockType; newSecret: string }) => Promise<{
    ok: boolean;
    recoveryCode?: string;
    status: AppLockStatus;
    code?: string;
    retryAfterSeconds?: number;
  }>;
  disableLock: (currentSecret: string) => Promise<{
    ok: boolean;
    status: AppLockStatus;
    code?: string;
    retryAfterSeconds?: number;
  }>;
  updateConfig: (input: {
    autoLockMinutes?: AppLockAutoLockMinutes;
    lockOnMinimize?: boolean;
  }) => AppLockStatus;
  resetLockState: () => void;
}

export function createAppLockService(db: TodoDatabase): AppLockService {
  const readRawSetting = (key: string): string | null => {
    const row = db.getRawDb().prepare('SELECT value FROM settings WHERE key = ?').get(key) as
      | { value?: string }
      | undefined;
    return typeof row?.value === 'string' && row.value.length > 0 ? row.value : null;
  };

  const hasValidHash = (): boolean => {
    const hash = readRawSetting(SECRET_HASH_KEY);
    return Boolean(hash?.startsWith('scrypt$'));
  };

  const hasRecoveryHash = (): boolean => {
    const hash = readRawSetting(RECOVERY_HASH_KEY);
    return Boolean(hash?.startsWith('scrypt$'));
  };

  const readEnabledAndMeta = (): {
    enabled: boolean;
    type: AppLockType;
    autoLockMinutes: AppLockAutoLockMinutes;
    lockOnMinimize: boolean;
  } => {
    const s = db.getSettings();
    const enabled = Boolean(s.appLockEnabled) && hasValidHash();
    const type: AppLockType = appLockCrypto.isValidLockType(s.appLockType)
      ? (s.appLockType as AppLockType)
      : 'pin4';
    const autoLockMinutes = appLockCrypto.normalizeAutoLockMinutes(
      s.appLockAutoLockMinutes ?? 5,
    ) as AppLockAutoLockMinutes;
    const lockOnMinimize = Boolean(s.appLockOnMinimize);
    return { enabled, type, autoLockMinutes, lockOnMinimize };
  };

  // Start locked on server boot whenever optional App Lock is enabled in SQLite
  let isLocked = readEnabledAndMeta().enabled;
  let failedAttempts = 0;
  let lockedUntilMs = 0;

  const getRemainingCooldownSeconds = (): number => {
    if (lockedUntilMs <= 0) return 0;
    const diff = lockedUntilMs - Date.now();
    if (diff <= 0) {
      lockedUntilMs = 0;
      return 0;
    }
    return Math.ceil(diff / 1000);
  };

  const getStatus = (): AppLockStatus => {
    const meta = readEnabledAndMeta();
    if (!meta.enabled) {
      isLocked = false;
    }
    return {
      enabled: meta.enabled,
      locked: meta.enabled && isLocked,
      type: meta.type,
      autoLockMinutes: meta.autoLockMinutes,
      lockOnMinimize: meta.lockOnMinimize,
      hasRecoveryCode: meta.enabled && hasRecoveryHash(),
      failedAttempts,
      retryAfterSeconds: getRemainingCooldownSeconds(),
    };
  };

  const isAppLocked = (): boolean => {
    if (!isLocked) return false;
    const meta = readEnabledAndMeta();
    if (!meta.enabled) {
      isLocked = false;
      return false;
    }
    return true;
  };

  const recordFailedAttempt = (): number => {
    failedAttempts += 1;
    const cooldown = appLockCrypto.computeRetryAfterSeconds(failedAttempts);
    if (cooldown > 0) {
      lockedUntilMs = Date.now() + cooldown * 1000;
    }
    return cooldown;
  };

  const clearFailedAttempts = (): void => {
    failedAttempts = 0;
    lockedUntilMs = 0;
  };

  const writeLockRowsInTx = (entries: Array<[string, string | null]>): void => {
    const rawDb = db.getRawDb();
    const upsert = rawDb.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
    const del = rawDb.prepare('DELETE FROM settings WHERE key = ?');
    rawDb.transaction(() => {
      for (const [k, v] of entries) {
        if (v === null) {
          del.run(k);
        } else {
          upsert.run(k, v);
        }
      }
    })();
    // Invalidate TodoDatabase's in-memory settings cache via no-op patch
    db.updateSettings({});
  };

  const lockNow = (): AppLockStatus => {
    const meta = readEnabledAndMeta();
    if (meta.enabled) {
      isLocked = true;
    }
    return getStatus();
  };

  const verifyAndUnlock = async (credential: string) => {
    const meta = readEnabledAndMeta();
    if (!meta.enabled) {
      isLocked = false;
      clearFailedAttempts();
      return { ok: true, status: getStatus() };
    }
    const retryAfter = getRemainingCooldownSeconds();
    if (retryAfter > 0) {
      return {
        ok: false,
        code: 'LOCK_COOLDOWN',
        retryAfterSeconds: retryAfter,
        status: getStatus(),
      };
    }
    const storedHash = readRawSetting(SECRET_HASH_KEY);
    if (!storedHash) {
      isLocked = false;
      clearFailedAttempts();
      return { ok: true, status: getStatus() };
    }
    const matched = await appLockCrypto.verifySecretAsync(credential, storedHash);
    if (!matched) {
      const nextCooldown = recordFailedAttempt();
      return {
        ok: false,
        code: nextCooldown > 0 ? 'LOCK_COOLDOWN' : 'INVALID_CREDENTIAL',
        retryAfterSeconds: nextCooldown,
        status: getStatus(),
      };
    }
    isLocked = false;
    clearFailedAttempts();
    return { ok: true, status: getStatus() };
  };

  const recoverAndDisable = async (recoveryCode: string) => {
    const meta = readEnabledAndMeta();
    if (!meta.enabled) {
      isLocked = false;
      clearFailedAttempts();
      return { ok: true, status: getStatus() };
    }
    const retryAfter = getRemainingCooldownSeconds();
    if (retryAfter > 0) {
      return {
        ok: false,
        code: 'LOCK_COOLDOWN',
        retryAfterSeconds: retryAfter,
        status: getStatus(),
      };
    }
    const storedRecovery = readRawSetting(RECOVERY_HASH_KEY);
    const normalized = appLockCrypto.normalizeRecoveryCode(recoveryCode);
    if (!storedRecovery || !normalized) {
      const nextCooldown = recordFailedAttempt();
      return {
        ok: false,
        code: nextCooldown > 0 ? 'LOCK_COOLDOWN' : 'INVALID_RECOVERY_CODE',
        retryAfterSeconds: nextCooldown,
        status: getStatus(),
      };
    }
    const matched = await appLockCrypto.verifySecretAsync(normalized, storedRecovery);
    if (!matched) {
      const nextCooldown = recordFailedAttempt();
      return {
        ok: false,
        code: nextCooldown > 0 ? 'LOCK_COOLDOWN' : 'INVALID_RECOVERY_CODE',
        retryAfterSeconds: nextCooldown,
        status: getStatus(),
      };
    }
    writeLockRowsInTx([
      ['appLockEnabled', '0'],
      [SECRET_HASH_KEY, null],
      [RECOVERY_HASH_KEY, null],
    ]);
    isLocked = false;
    clearFailedAttempts();
    return { ok: true, status: getStatus() };
  };

  const setupLock = async (input: {
    type: AppLockType;
    secret: string;
    autoLockMinutes?: AppLockAutoLockMinutes;
    lockOnMinimize?: boolean;
  }) => {
    const meta = readEnabledAndMeta();
    if (meta.enabled) {
      return { ok: false, code: 'LOCK_ALREADY_ENABLED', status: getStatus() };
    }
    const check = appLockCrypto.validateLockCredential(input.type, input.secret);
    if (!check.ok) {
      return { ok: false, code: check.code || 'INVALID_CREDENTIAL', status: getStatus() };
    }
    const recoveryCode = appLockCrypto.generateRecoveryCode();
    const [secretHash, recoveryHash] = await Promise.all([
      appLockCrypto.hashSecretAsync(input.secret),
      appLockCrypto.hashSecretAsync(appLockCrypto.normalizeRecoveryCode(recoveryCode)),
    ]);
    const autoLockMinutes = appLockCrypto.normalizeAutoLockMinutes(
      input.autoLockMinutes ?? meta.autoLockMinutes,
    );
    const lockOnMinimize =
      typeof input.lockOnMinimize === 'boolean' ? input.lockOnMinimize : meta.lockOnMinimize;

    writeLockRowsInTx([
      ['appLockEnabled', '1'],
      ['appLockType', input.type],
      ['appLockAutoLockMinutes', String(autoLockMinutes)],
      ['appLockOnMinimize', lockOnMinimize ? '1' : '0'],
      [SECRET_HASH_KEY, secretHash],
      [RECOVERY_HASH_KEY, recoveryHash],
    ]);
    isLocked = false;
    clearFailedAttempts();
    return { ok: true, recoveryCode, status: getStatus() };
  };

  const changeLock = async (input: {
    currentSecret: string;
    type: AppLockType;
    newSecret: string;
  }) => {
    const meta = readEnabledAndMeta();
    if (!meta.enabled) {
      return { ok: false, code: 'LOCK_NOT_ENABLED', status: getStatus() };
    }
    const retryAfter = getRemainingCooldownSeconds();
    if (retryAfter > 0) {
      return {
        ok: false,
        code: 'LOCK_COOLDOWN',
        retryAfterSeconds: retryAfter,
        status: getStatus(),
      };
    }
    const storedHash = readRawSetting(SECRET_HASH_KEY);
    if (!storedHash || !(await appLockCrypto.verifySecretAsync(input.currentSecret, storedHash))) {
      const nextCooldown = recordFailedAttempt();
      return {
        ok: false,
        code: nextCooldown > 0 ? 'LOCK_COOLDOWN' : 'INVALID_CREDENTIAL',
        retryAfterSeconds: nextCooldown,
        status: getStatus(),
      };
    }
    const check = appLockCrypto.validateLockCredential(input.type, input.newSecret);
    if (!check.ok) {
      return { ok: false, code: check.code || 'INVALID_CREDENTIAL', status: getStatus() };
    }
    const recoveryCode = appLockCrypto.generateRecoveryCode();
    const [secretHash, recoveryHash] = await Promise.all([
      appLockCrypto.hashSecretAsync(input.newSecret),
      appLockCrypto.hashSecretAsync(appLockCrypto.normalizeRecoveryCode(recoveryCode)),
    ]);
    writeLockRowsInTx([
      ['appLockEnabled', '1'],
      ['appLockType', input.type],
      [SECRET_HASH_KEY, secretHash],
      [RECOVERY_HASH_KEY, recoveryHash],
    ]);
    isLocked = false;
    clearFailedAttempts();
    return { ok: true, recoveryCode, status: getStatus() };
  };

  const disableLock = async (currentSecret: string) => {
    const meta = readEnabledAndMeta();
    if (!meta.enabled) {
      isLocked = false;
      clearFailedAttempts();
      return { ok: true, status: getStatus() };
    }
    const retryAfter = getRemainingCooldownSeconds();
    if (retryAfter > 0) {
      return {
        ok: false,
        code: 'LOCK_COOLDOWN',
        retryAfterSeconds: retryAfter,
        status: getStatus(),
      };
    }
    const storedHash = readRawSetting(SECRET_HASH_KEY);
    if (storedHash) {
      const matched = await appLockCrypto.verifySecretAsync(currentSecret, storedHash);
      if (!matched) {
        const nextCooldown = recordFailedAttempt();
        return {
          ok: false,
          code: nextCooldown > 0 ? 'LOCK_COOLDOWN' : 'INVALID_CREDENTIAL',
          retryAfterSeconds: nextCooldown,
          status: getStatus(),
        };
      }
    }
    writeLockRowsInTx([
      ['appLockEnabled', '0'],
      [SECRET_HASH_KEY, null],
      [RECOVERY_HASH_KEY, null],
    ]);
    isLocked = false;
    clearFailedAttempts();
    return { ok: true, status: getStatus() };
  };

  const updateConfig = (input: {
    autoLockMinutes?: AppLockAutoLockMinutes;
    lockOnMinimize?: boolean;
  }): AppLockStatus => {
    const entries: Array<[string, string]> = [];
    if (input.autoLockMinutes !== undefined) {
      entries.push([
        'appLockAutoLockMinutes',
        String(appLockCrypto.normalizeAutoLockMinutes(input.autoLockMinutes)),
      ]);
    }
    if (typeof input.lockOnMinimize === 'boolean') {
      entries.push(['appLockOnMinimize', input.lockOnMinimize ? '1' : '0']);
    }
    if (entries.length > 0) {
      writeLockRowsInTx(entries);
    }
    return getStatus();
  };

  const resetLockState = (): void => {
    writeLockRowsInTx([
      ['appLockEnabled', '0'],
      [SECRET_HASH_KEY, null],
      [RECOVERY_HASH_KEY, null],
    ]);
    isLocked = false;
    clearFailedAttempts();
  };

  return {
    getStatus,
    isAppLocked,
    lockNow,
    verifyAndUnlock,
    recoverAndDisable,
    setupLock,
    changeLock,
    disableLock,
    updateConfig,
    resetLockState,
  };
}
