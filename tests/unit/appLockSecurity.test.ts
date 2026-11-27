import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import express from 'express';
import { registerSecurityRoutes } from '../../server/routes/security.ts';
import { createAppLockService } from '../../server/services/appLock.ts';
import type { ServerContext } from '../../server/types.ts';
import { TodoDatabase } from '../../src/db/database.ts';

const require = createRequire(import.meta.url);
const appLockCrypto = require('../../shared/appLockCrypto.cjs');

async function startTestLockServer(db: TodoDatabase) {
  const app = express();
  app.use(express.json());
  const appLock = createAppLockService(db);
  const ctx = { app, db, appLock } as unknown as ServerContext;
  registerSecurityRoutes(ctx);

  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
  app.get('/api/bootstrap', (_req, res) => res.json(db.getBootstrap()));
  app.get('/api/todos', (_req, res) => res.json(db.getTodos()));
  app.patch('/api/settings', (req, res) => res.json(db.updateSettings(req.body ?? {})));

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    appLock,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

test('APPLOCK-1: scrypt hashing, random salt, constant-time verify, and 4/6/8-digit + password validation', async () => {
  assert.equal(appLockCrypto.validateLockCredential('pin4', '1234').ok, true);
  assert.equal(appLockCrypto.validateLockCredential('pin4', '123').ok, false);
  assert.equal(appLockCrypto.validateLockCredential('pin4', '12ab').ok, false);
  assert.equal(appLockCrypto.validateLockCredential('pin6', '123456').ok, true);
  assert.equal(appLockCrypto.validateLockCredential('pin6', '12345').ok, false);
  assert.equal(appLockCrypto.validateLockCredential('pin8', '12345678').ok, true);
  assert.equal(appLockCrypto.validateLockCredential('pin8', '1234567').ok, false);
  assert.equal(appLockCrypto.validateLockCredential('password', 'abcd').ok, true);
  assert.equal(appLockCrypto.validateLockCredential('password', 'abc').ok, false);
  assert.equal(appLockCrypto.validateLockCredential('password', '    ').ok, false);

  const hashA = await appLockCrypto.hashSecretAsync('2468');
  const hashB = await appLockCrypto.hashSecretAsync('2468');
  assert.ok(hashA.startsWith('scrypt$'));
  assert.notEqual(hashA, hashB, 'Each hash must use a fresh random salt');
  assert.equal(await appLockCrypto.verifySecretAsync('2468', hashA), true);
  assert.equal(await appLockCrypto.verifySecretAsync('2469', hashA), false);
  assert.equal(await appLockCrypto.verifySecretAsync('2468', 'corrupted-hash'), false);

  const recovery = appLockCrypto.generateRecoveryCode();
  assert.match(recovery, /^AGDM-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  assert.equal(
    appLockCrypto.normalizeRecoveryCode(recovery.toLowerCase().replace(/-/g, ' ')),
    appLockCrypto.normalizeRecoveryCode(recovery),
  );
});

test('APPLOCK-2: Secret hashes never leak via getSettings/bootstrap and PATCH /api/settings cannot bypass lock', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agendamea-applock-'));
  const db = new TodoDatabase(path.join(tmpDir, 'test.db'));
  const srv = await startTestLockServer(db);
  try {
    // Default disabled state
    const initial = await fetch(`${srv.baseUrl}/api/security/lock/status`).then((r) => r.json());
    assert.equal(initial.enabled, false);
    assert.equal(initial.locked, false);

    // Setup 6-digit PIN
    const setupRes = await fetch(`${srv.baseUrl}/api/security/lock/setup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'pin6',
        secret: '654321',
        autoLockMinutes: 15,
        lockOnMinimize: true,
      }),
    });
    assert.equal(setupRes.status, 201);
    const setupBody = await setupRes.json();
    assert.equal(setupBody.ok, true);
    assert.match(setupBody.recoveryCode, /^AGDM-/);
    assert.equal(setupBody.status.enabled, true);
    assert.equal(setupBody.status.locked, false);
    assert.equal(setupBody.status.type, 'pin6');
    assert.equal(setupBody.status.autoLockMinutes, 15);
    assert.equal(setupBody.status.lockOnMinimize, true);

    // Verify zero hash exposure in settings or bootstrap JSON
    const settingsDump = JSON.stringify(db.getSettings());
    const bootstrapDump = JSON.stringify(db.getBootstrap());
    assert.ok(!settingsDump.includes('scrypt$'), 'Secret hash must never appear in getSettings');
    assert.ok(!settingsDump.includes('appLockSecretHash'));
    assert.ok(!settingsDump.includes('appLockRecoveryHash'));
    assert.ok(!bootstrapDump.includes('scrypt$'), 'Secret hash must never appear in bootstrap');

    // Attempt privilege bypass via generic PATCH /api/settings
    await fetch(`${srv.baseUrl}/api/settings`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appLockEnabled: false, appLockType: 'pin4' }),
    });
    const afterTamper = db.getSettings();
    assert.equal(afterTamper.appLockEnabled, true, 'PATCH /api/settings must not disable lock');
    assert.equal(afterTamper.appLockType, 'pin6', 'PATCH /api/settings must not alter lock type');
  } finally {
    await srv.close();
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 4, retryDelay: 50 });
  }
});

test('APPLOCK-3: Boot starts locked, HTTP 423 blocks /api/* data, brute-force cooldown triggers, and recovery code unlocks + disables', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agendamea-applock-gate-'));
  const dbPath = path.join(tmpDir, 'test.db');
  const db1 = new TodoDatabase(dbPath);
  db1.createTodo({ title: 'Top secret task' });

  const service1 = createAppLockService(db1);
  const setup = await service1.setupLock({ type: 'pin4', secret: '1984' });
  assert.equal(setup.ok, true);
  const recoveryCode = setup.recoveryCode ?? '';
  db1.close();

  // Simulate fresh server restart: must start locked automatically!
  const db2 = new TodoDatabase(dbPath);
  const srv = await startTestLockServer(db2);
  try {
    const healthRes = await fetch(`${srv.baseUrl}/api/health`);
    assert.equal(healthRes.status, 200, '/api/health must stay reachable while locked');

    const bootstrapRes = await fetch(`${srv.baseUrl}/api/bootstrap`);
    assert.equal(bootstrapRes.status, 423, '/api/bootstrap must return 423 Locked');
    const lockedPayload = await bootstrapRes.json();
    assert.equal(lockedPayload.code, 'APP_LOCKED');
    assert.ok(!JSON.stringify(lockedPayload).includes('Top secret task'));

    const todosRes = await fetch(`${srv.baseUrl}/api/todos`);
    assert.equal(todosRes.status, 423, '/api/todos must return 423 Locked');

    // Protected lock management endpoints must also reject while locked (423)
    const lockedChange = await fetch(`${srv.baseUrl}/api/security/lock/change`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentSecret: '1984', type: 'pin4', newSecret: '4321' }),
    });
    assert.equal(lockedChange.status, 423, '/change must return 423 while locked');

    const lockedDisable = await fetch(`${srv.baseUrl}/api/security/lock/disable`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentSecret: '1984' }),
    });
    assert.equal(lockedDisable.status, 423, '/disable must return 423 while locked');

    // 5 consecutive wrong PIN attempts trigger progressive cooldown (429)
    for (let i = 1; i <= 4; i += 1) {
      const bad = await fetch(`${srv.baseUrl}/api/security/lock/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret: '0000' }),
      });
      assert.equal(bad.status, 401);
    }
    const fifth = await fetch(`${srv.baseUrl}/api/security/lock/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: '0000' }),
    });
    assert.equal(fifth.status, 429, '5th failed attempt must enforce cooldown');
    const fifthBody = await fifth.json();
    assert.equal(fifthBody.code, 'LOCK_COOLDOWN');
    assert.ok(fifthBody.retryAfterSeconds >= 5);

    // Simulate clean boot instance (no active cooldown) to verify unlock + change + lockNow + recovery
    const db3 = new TodoDatabase(dbPath);
    const srv3 = await startTestLockServer(db3);
    try {
      const unlockRes = await fetch(`${srv3.baseUrl}/api/security/lock/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret: '1984' }),
      });
      assert.equal(unlockRes.status, 200);

      const allowedBootstrap = await fetch(`${srv3.baseUrl}/api/bootstrap`);
      assert.equal(allowedBootstrap.status, 200);
      const data = await allowedBootstrap.json();
      assert.equal(data.todos.length, 1);
      assert.equal(data.todos[0].title, 'Top secret task');

      // Change from 4-digit PIN to Password (rotates recovery code)
      const changeRes = await fetch(`${srv3.baseUrl}/api/security/lock/change`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentSecret: '1984',
          type: 'password',
          newSecret: 'MyStrongPass!2026',
        }),
      });
      assert.equal(changeRes.status, 200);
      const changeBody = await changeRes.json();
      assert.equal(changeBody.status.type, 'password');
      assert.notEqual(changeBody.recoveryCode, recoveryCode);
      const rotatedRecovery = changeBody.recoveryCode as string;

      // Manual lock -> old PIN rejected, new password accepted
      await fetch(`${srv3.baseUrl}/api/security/lock/lock`, { method: 'POST' });
      assert.equal((await fetch(`${srv3.baseUrl}/api/todos`)).status, 423);

      const oldPinAttempt = await fetch(`${srv3.baseUrl}/api/security/lock/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret: '1984' }),
      });
      assert.equal(oldPinAttempt.status, 401);

      // Recover with new recovery code (case & hyphen insensitive) unlocks and disables lock
      const recoverRes = await fetch(`${srv3.baseUrl}/api/security/lock/recover`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recoveryCode: rotatedRecovery.toLowerCase() }),
      });
      assert.equal(recoverRes.status, 200);
      const recoverBody = await recoverRes.json();
      assert.equal(recoverBody.ok, true);
      assert.equal(recoverBody.status.enabled, false);
      assert.equal(recoverBody.status.locked, false);
      assert.equal((await fetch(`${srv3.baseUrl}/api/todos`)).status, 200);
    } finally {
      await srv3.close();
      db3.close();
    }
  } finally {
    await srv.close();
    db2.close();
    fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 4, retryDelay: 50 });
  }
});
