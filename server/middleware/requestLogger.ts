import crypto from 'node:crypto';
import type express from 'express';
import { createComponentLogger } from '../services/logger.ts';

const httpLog = createComponentLogger('http');

export function registerRequestLogger(app: express.Express): void {
  app.use((req, res, next) => {
    const incomingId =
      typeof req.headers['x-request-id'] === 'string' ? req.headers['x-request-id'].trim() : '';
    const reqId =
      incomingId && /^[a-zA-Z0-9._-]{1,64}$/.test(incomingId)
        ? incomingId
        : crypto.randomUUID().slice(0, 12);

    (req as express.Request & { requestId?: string }).requestId = reqId;
    res.setHeader('X-Request-Id', reqId);

    if (!req.path.startsWith('/api/') || req.path === '/api/events') {
      next();
      return;
    }

    const startedAt = Date.now();
    res.on('finish', () => {
      const durationMs = Date.now() - startedAt;
      const meta = {
        reqId,
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        durationMs,
      };
      if (res.statusCode >= 500) {
        httpLog.error(meta, 'API request failed');
      } else if (res.statusCode >= 400) {
        httpLog.warn(meta, 'API request rejected');
      } else {
        httpLog.info(meta, 'API request completed');
      }
    });

    next();
  });
}
