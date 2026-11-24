import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';

export type StoreListener = () => void;
export type EqualityFn<S> = (prev: S, next: S) => boolean;

export interface SelectorStore<T> {
  getState: () => T;
  setState: (updater: T | ((prev: T) => T)) => void;
  patchState: (partial: Partial<T>) => void;
  subscribe: (listener: StoreListener) => () => void;
  reset: () => void;
  getListenerCount: () => number;
}

/**
 * Shallow structural equality helper matching React/Zustand useShallow semantics.
 * Prevents React 19 "The result of getSnapshot should be cached" infinite loops
 * when selectors project a subset object or array.
 */
export function shallowEqual<T>(a: T, b: T): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) {
    return false;
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      if (!Object.is(a[i], b[i])) return false;
    }
    return true;
  }
  const keysA = Object.keys(a as Record<string, unknown>);
  const keysB = Object.keys(b as Record<string, unknown>);
  if (keysA.length !== keysB.length) return false;
  const recA = a as Record<string, unknown>;
  const recB = b as Record<string, unknown>;
  for (const key of keysA) {
    if (!Object.hasOwn(recB, key) || !Object.is(recA[key], recB[key])) {
      return false;
    }
  }
  return true;
}

/**
 * Factory creating an isolated, immutable external store compatible with React 19
 * useSyncExternalStore. Every instance has its own state and listener set so unit
 * tests can instantiate fresh stores with zero cross-test singleton leakage.
 */
export function createSelectorStore<T extends object>(
  initialState: T | (() => T),
): SelectorStore<T> {
  const resolveInitial = (): T =>
    typeof initialState === 'function' ? (initialState as () => T)() : { ...initialState };

  let state: T = resolveInitial();
  const listeners = new Set<StoreListener>();

  const getState = (): T => state;

  const notify = (): void => {
    listeners.forEach((listener) => {
      listener();
    });
  };

  const setState = (updater: T | ((prev: T) => T)): void => {
    const next = typeof updater === 'function' ? (updater as (prev: T) => T)(state) : updater;
    if (Object.is(next, state)) return;
    state = next;
    notify();
  };

  const patchState = (partial: Partial<T>): void => {
    const keys = Object.keys(partial) as Array<keyof T>;
    let changed = false;
    for (const k of keys) {
      if (!Object.is(state[k], partial[k])) {
        changed = true;
        break;
      }
    }
    if (!changed) return;
    state = { ...state, ...partial };
    notify();
  };

  const subscribe = (listener: StoreListener): (() => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };

  const reset = (): void => {
    const next = resolveInitial();
    if (shallowEqual(state, next)) return;
    state = next;
    notify();
  };

  const getListenerCount = (): number => listeners.size;

  return {
    getState,
    setState,
    patchState,
    subscribe,
    reset,
    getListenerCount,
  };
}

/**
 * React 19 concurrent-safe selector hook implementing React's official
 * useSyncExternalStoreWithSelector contract (instRef + useMemo-scoped snapshot/selection
 * caching + optional equality comparator + commit sync + deterministic server snapshot).
 */
export function useSelectorStore<T extends object, S>(
  store: SelectorStore<T>,
  selector: (state: T) => S,
  isEqual: EqualityFn<S> = Object.is,
): S {
  const instRef = useRef<{ hasValue: boolean; value: S | null } | null>(null);
  if (instRef.current === null) {
    instRef.current = { hasValue: false, value: null };
  }
  const inst = instRef.current;

  const [getSelection, getServerSelection] = useMemo(() => {
    let hasMemo = false;
    let memoizedSnapshot: T;
    let memoizedSelection: S;

    const memoizedSelector = (nextSnapshot: T): S => {
      if (!hasMemo) {
        hasMemo = true;
        memoizedSnapshot = nextSnapshot;
        const nextSelection = selector(nextSnapshot);
        if (inst.hasValue && isEqual(inst.value as S, nextSelection)) {
          memoizedSelection = inst.value as S;
          return memoizedSelection;
        }
        memoizedSelection = nextSelection;
        return nextSelection;
      }

      if (Object.is(memoizedSnapshot, nextSnapshot)) {
        return memoizedSelection;
      }

      const nextSelection = selector(nextSnapshot);
      if (isEqual(memoizedSelection, nextSelection)) {
        memoizedSnapshot = nextSnapshot;
        return memoizedSelection;
      }

      memoizedSnapshot = nextSnapshot;
      memoizedSelection = nextSelection;
      return nextSelection;
    };

    const getClient = () => memoizedSelector(store.getState());
    return [getClient, getClient] as const;
  }, [store, selector, isEqual, inst]);

  const value = useSyncExternalStore(store.subscribe, getSelection, getServerSelection);

  useEffect(() => {
    inst.hasValue = true;
    inst.value = value;
  }, [inst, value]);

  return value;
}

/**
 * Convenience helper for memoized object/array slice projections using shallow equality.
 */
export function useShallowSelector<T extends object, S>(
  store: SelectorStore<T>,
  selector: (state: T) => S,
): S {
  return useSelectorStore(store, selector, shallowEqual);
}
