import schemas from '../../shared/schemas/index.cjs';
import { isLoopbackAddress, sendRouteError } from '../middleware/security.ts';
import { validateBody } from '../middleware/validate.ts';
import type { ServerContext } from '../types.ts';

/**
 * Registers server-side App PIN / Password Lock API routes and enforces an HTTP 423 Locked
 * data-access barrier across all protected /api/* routes while the app is locked.
 */
export function registerSecurityRoutes(ctx: ServerContext): void {
  const { app, appLock } = ctx;

  // Enforce true backend lock gate BEFORE data routes register.
  // When appLock is disabled (default), isAppLocked() is a single boolean check (~0 overhead).
  app.use('/api', (req, res, next) => {
    if (!appLock.isAppLocked()) {
      next();
      return;
    }
    const p = req.path;
    if (
      p === '/health' ||
      p.startsWith('/security/lock') ||
      p === '/diagnostics/crash' ||
      p === '/server/shutdown'
    ) {
      next();
      return;
    }
    res.status(423).json({
      error: 'Uygulama kilitli.',
      code: 'APP_LOCKED',
      lock: appLock.getStatus(),
    });
  });

  app.get('/api/security/lock/status', (_req, res) => {
    res.json(appLock.getStatus());
  });

  app.post('/api/security/lock/lock', (req, res) => {
    if (!isLoopbackAddress(req.socket.remoteAddress)) {
      res.status(403).json({ error: 'Yalnızca yerel erişime izin verilir.' });
      return;
    }
    const status = appLock.lockNow();
    if (status.locked && ctx.sseClients) {
      for (const client of ctx.sseClients) {
        try {
          client.end();
        } catch {
          // Ignore already closed SSE stream
        }
      }
      ctx.sseClients.clear();
    }
    res.json(status);
  });

  app.post(
    '/api/security/lock/verify',
    validateBody(schemas.AppLockVerifyBodySchema, 'Geçersiz kilit doğrulama isteği.'),
    async (req, res) => {
      if (!isLoopbackAddress(req.socket.remoteAddress)) {
        res.status(403).json({ error: 'Yalnızca yerel erişime izin verilir.' });
        return;
      }
      try {
        const result = await appLock.verifyAndUnlock(String(req.body.secret ?? ''));
        if (!result.ok) {
          const statusCode = result.code === 'LOCK_COOLDOWN' ? 429 : 401;
          res.status(statusCode).json(result);
          return;
        }
        res.json(result);
      } catch (err) {
        sendRouteError(res, 'POST /api/security/lock/verify', err, 'Kilit doğrulanamadı.');
      }
    },
  );

  app.post(
    '/api/security/lock/recover',
    validateBody(schemas.AppLockRecoverBodySchema, 'Geçersiz kurtarma kodu.'),
    async (req, res) => {
      if (!isLoopbackAddress(req.socket.remoteAddress)) {
        res.status(403).json({ error: 'Yalnızca yerel erişime izin verilir.' });
        return;
      }
      try {
        const result = await appLock.recoverAndDisable(String(req.body.recoveryCode ?? ''));
        if (!result.ok) {
          const statusCode = result.code === 'LOCK_COOLDOWN' ? 429 : 401;
          res.status(statusCode).json(result);
          return;
        }
        res.json(result);
      } catch (err) {
        sendRouteError(res, 'POST /api/security/lock/recover', err, 'Kurtarma kodu doğrulanamadı.');
      }
    },
  );

  app.post(
    '/api/security/lock/setup',
    validateBody(schemas.AppLockSetupBodySchema, 'Geçersiz kilit kurulum isteği.'),
    async (req, res) => {
      if (!isLoopbackAddress(req.socket.remoteAddress)) {
        res.status(403).json({ error: 'Yalnızca yerel erişime izin verilir.' });
        return;
      }
      try {
        const result = await appLock.setupLock({
          type: req.body.type,
          secret: req.body.secret,
          autoLockMinutes: req.body.autoLockMinutes,
          lockOnMinimize: req.body.lockOnMinimize,
        });
        if (!result.ok) {
          const statusCode = result.code === 'LOCK_ALREADY_ENABLED' ? 409 : 400;
          res.status(statusCode).json(result);
          return;
        }
        res.status(201).json(result);
      } catch (err) {
        sendRouteError(
          res,
          'POST /api/security/lock/setup',
          err,
          'Uygulama kilidi etkinleştirilemedi.',
        );
      }
    },
  );

  app.post(
    '/api/security/lock/change',
    validateBody(schemas.AppLockChangeBodySchema, 'Geçersiz kilit değiştirme isteği.'),
    async (req, res) => {
      if (!isLoopbackAddress(req.socket.remoteAddress)) {
        res.status(403).json({ error: 'Yalnızca yerel erişime izin verilir.' });
        return;
      }
      if (appLock.isAppLocked()) {
        res
          .status(423)
          .json({ error: 'Uygulama kilitli.', code: 'APP_LOCKED', lock: appLock.getStatus() });
        return;
      }
      try {
        const result = await appLock.changeLock({
          currentSecret: req.body.currentSecret,
          type: req.body.type,
          newSecret: req.body.newSecret,
        });
        if (!result.ok) {
          const statusCode =
            result.code === 'LOCK_COOLDOWN'
              ? 429
              : result.code === 'INVALID_CREDENTIAL'
                ? 401
                : 400;
          res.status(statusCode).json(result);
          return;
        }
        res.json(result);
      } catch (err) {
        sendRouteError(res, 'POST /api/security/lock/change', err, 'Kilit değiştirilemedi.');
      }
    },
  );

  app.post(
    '/api/security/lock/disable',
    validateBody(schemas.AppLockDisableBodySchema, 'Geçersiz kilit kaldırma isteği.'),
    async (req, res) => {
      if (!isLoopbackAddress(req.socket.remoteAddress)) {
        res.status(403).json({ error: 'Yalnızca yerel erişime izin verilir.' });
        return;
      }
      if (appLock.isAppLocked()) {
        res
          .status(423)
          .json({ error: 'Uygulama kilitli.', code: 'APP_LOCKED', lock: appLock.getStatus() });
        return;
      }
      try {
        const result = await appLock.disableLock(String(req.body.currentSecret ?? ''));
        if (!result.ok) {
          const statusCode = result.code === 'LOCK_COOLDOWN' ? 429 : 401;
          res.status(statusCode).json(result);
          return;
        }
        res.json(result);
      } catch (err) {
        sendRouteError(
          res,
          'POST /api/security/lock/disable',
          err,
          'Uygulama kilidi kaldırılamadı.',
        );
      }
    },
  );

  app.patch(
    '/api/security/lock/config',
    validateBody(schemas.AppLockConfigBodySchema, 'Geçersiz kilit yapılandırması.'),
    (req, res) => {
      if (!isLoopbackAddress(req.socket.remoteAddress)) {
        res.status(403).json({ error: 'Yalnızca yerel erişime izin verilir.' });
        return;
      }
      if (appLock.isAppLocked()) {
        res
          .status(423)
          .json({ error: 'Uygulama kilitli.', code: 'APP_LOCKED', lock: appLock.getStatus() });
        return;
      }
      res.json(
        appLock.updateConfig({
          autoLockMinutes: req.body.autoLockMinutes,
          lockOnMinimize: req.body.lockOnMinimize,
        }),
      );
    },
  );
}
