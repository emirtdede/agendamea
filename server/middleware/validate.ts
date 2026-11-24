import type express from 'express';

export interface SafeParseSchema<T = unknown> {
  safeParse: (
    input: unknown,
  ) =>
    | { success: true; data: T }
    | { success: false; error: { issues?: Array<{ message?: string; path?: PropertyKey[] }> } };
}

/**
 * Validates `req.body` against a shared Zod v4 schema (`shared/schemas/index.cjs`).
 * Preserves existing localized error strings when fallbackError is supplied.
 */
export function validateBody<T>(
  schema: SafeParseSchema<T>,
  fallbackError: string,
): express.RequestHandler {
  return (req, res, next) => {
    const parsed = schema.safeParse(req.body ?? {});
    if (!parsed.success) {
      const firstIssue = parsed.error.issues?.[0];
      const msg =
        firstIssue?.message &&
        !firstIssue.message.startsWith('Invalid input') &&
        !firstIssue.message.startsWith('Too small')
          ? firstIssue.message
          : fallbackError;
      res.status(400).json({ error: msg });
      return;
    }
    req.body = parsed.data;
    next();
  };
}
