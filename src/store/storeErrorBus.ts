export type StoreErrorReporter = (err: unknown, fallback?: string) => void;

let activeErrorReporter: StoreErrorReporter | null = null;

export function setStoreErrorReporter(reporter: StoreErrorReporter | null): void {
  activeErrorReporter = reporter;
}

export function reportStoreError(err: unknown, fallback?: string): void {
  activeErrorReporter?.(err, fallback);
}
