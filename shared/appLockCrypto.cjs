'use strict';

/**
 * Cryptographic primitives for optional local App PIN / Password Lock.
 * - Uses Node.js built-in scrypt (N=16384, r=8, p=1, keylen=32) with 16-byte random salt.
 * - Uses crypto.timingSafeEqual for constant-time verification.
 * - Generates unambiguous 16-character one-time Recovery Codes (AGDM-XXXX-XXXX-XXXX).
 */

const crypto = require('node:crypto');

const VALID_LOCK_TYPES = new Set(['pin4', 'pin6', 'pin8', 'password']);
const VALID_AUTO_LOCK_MINUTES = new Set([0, 1, 5, 15, 30, 60]);

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 32;
const SCRYPT_MAXMEM = 64 * 1024 * 1024;

const RECOVERY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function isValidLockType(value) {
  return typeof value === 'string' && VALID_LOCK_TYPES.has(value);
}

function normalizeAutoLockMinutes(value) {
  const num = Number(value);
  if (Number.isFinite(num) && VALID_AUTO_LOCK_MINUTES.has(Math.trunc(num))) {
    return Math.trunc(num);
  }
  return 5;
}

/**
 * Validates a PIN or Password against the selected lock mode.
 * @param {string} lockType
 * @param {unknown} rawSecret
 * @returns {{ ok: boolean, code?: string }}
 */
function validateLockCredential(lockType, rawSecret) {
  if (!isValidLockType(lockType)) {
    return { ok: false, code: 'INVALID_LOCK_TYPE' };
  }
  if (typeof rawSecret !== 'string') {
    return { ok: false, code: 'INVALID_CREDENTIAL' };
  }
  if (rawSecret.includes('\0')) {
    return { ok: false, code: 'INVALID_CREDENTIAL' };
  }
  if (lockType === 'pin4') {
    return /^\d{4}$/.test(rawSecret) ? { ok: true } : { ok: false, code: 'INVALID_PIN_LENGTH' };
  }
  if (lockType === 'pin6') {
    return /^\d{6}$/.test(rawSecret) ? { ok: true } : { ok: false, code: 'INVALID_PIN_LENGTH' };
  }
  if (lockType === 'pin8') {
    return /^\d{8}$/.test(rawSecret) ? { ok: true } : { ok: false, code: 'INVALID_PIN_LENGTH' };
  }
  // password mode: 4..128 chars, cannot be whitespace-only
  if (rawSecret.length < 4 || rawSecret.length > 128 || rawSecret.trim().length === 0) {
    return { ok: false, code: 'INVALID_PASSWORD_LENGTH' };
  }
  return { ok: true };
}

/**
 * Hashes a secret using scrypt with a fresh 16-byte random salt (non-blocking async).
 * @param {string} secret
 * @returns {Promise<string>}
 */
function hashSecretAsync(secret) {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16);
    crypto.scrypt(
      secret,
      salt,
      SCRYPT_KEYLEN,
      { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, maxmem: SCRYPT_MAXMEM },
      (err, derived) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(
          `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString('hex')}$${derived.toString('hex')}`,
        );
      },
    );
  });
}

/**
 * Verifies a candidate secret against a stored scrypt hash using constant-time comparison.
 * @param {string} secret
 * @param {string} storedHash
 * @returns {Promise<boolean>}
 */
function verifySecretAsync(secret, storedHash) {
  return new Promise((resolve) => {
    if (typeof secret !== 'string' || typeof storedHash !== 'string') {
      resolve(false);
      return;
    }
    const parts = storedHash.split('$');
    if (parts.length !== 6 || parts[0] !== 'scrypt') {
      resolve(false);
      return;
    }
    const N = Number.parseInt(parts[1], 10);
    const r = Number.parseInt(parts[2], 10);
    const p = Number.parseInt(parts[3], 10);
    const saltHex = parts[4];
    const hashHex = parts[5];
    if (
      !Number.isFinite(N) ||
      !Number.isFinite(r) ||
      !Number.isFinite(p) ||
      N < 1024 ||
      N > 65536 ||
      r < 1 ||
      r > 32 ||
      p < 1 ||
      p > 8 ||
      !/^[0-9a-f]{32}$/i.test(saltHex) ||
      !/^[0-9a-f]{64}$/i.test(hashHex)
    ) {
      resolve(false);
      return;
    }
    const salt = Buffer.from(saltHex, 'hex');
    const expected = Buffer.from(hashHex, 'hex');
    crypto.scrypt(
      secret,
      salt,
      expected.length,
      { N, r, p, maxmem: SCRYPT_MAXMEM },
      (err, derived) => {
        if (err || derived.length !== expected.length) {
          resolve(false);
          return;
        }
        try {
          resolve(crypto.timingSafeEqual(derived, expected));
        } catch {
          resolve(false);
        }
      },
    );
  });
}

/**
 * Generates a high-entropy one-time recovery code formatted as AGDM-XXXX-XXXX-XXXX.
 * @returns {string}
 */
function generateRecoveryCode() {
  const bytes = crypto.randomBytes(12);
  let chars = '';
  for (let i = 0; i < 12; i += 1) {
    chars += RECOVERY_ALPHABET[bytes[i] % RECOVERY_ALPHABET.length];
  }
  return `AGDM-${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8, 12)}`;
}

/**
 * Normalizes user-entered recovery codes (case-insensitive, ignores hyphens/spaces).
 * @param {string} raw
 * @returns {string}
 */
function normalizeRecoveryCode(raw) {
  if (typeof raw !== 'string') return '';
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .trim();
}

/**
 * Returns cooldown duration in seconds based on consecutive failed attempts.
 * @param {number} failedAttempts
 * @returns {number}
 */
function computeRetryAfterSeconds(failedAttempts) {
  if (failedAttempts < 5) return 0;
  if (failedAttempts === 5) return 5;
  if (failedAttempts === 6) return 15;
  if (failedAttempts === 7) return 30;
  return 60;
}

module.exports = {
  VALID_LOCK_TYPES,
  VALID_AUTO_LOCK_MINUTES,
  isValidLockType,
  normalizeAutoLockMinutes,
  validateLockCredential,
  hashSecretAsync,
  verifySecretAsync,
  generateRecoveryCode,
  normalizeRecoveryCode,
  computeRetryAfterSeconds,
};
