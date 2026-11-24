import loggerMod from '../../shared/logger.cjs';

export interface StructuredLogger {
  info: (objOrMsg: unknown, msg?: string) => void;
  warn: (objOrMsg: unknown, msg?: string) => void;
  error: (objOrMsg: unknown, msg?: string) => void;
  debug: (objOrMsg: unknown, msg?: string) => void;
  child: (bindings: Record<string, unknown>) => StructuredLogger;
}

export const serverLogger: StructuredLogger = loggerMod.getAppLogger('server') as StructuredLogger;

export function createComponentLogger(component: string): StructuredLogger {
  return serverLogger.child({ module: component });
}

export function flushServerLogs(): void {
  loggerMod.flushAllLoggers();
}

export function closeServerLogs(): void {
  loggerMod.closeAllLoggers();
}
