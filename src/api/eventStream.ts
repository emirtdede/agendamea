/**
 * Shared singleton Server-Sent Events (/api/events) subscription bus.
 * Ensures the entire SPA maintains at most ONE active EventSource connection
 * regardless of how many views or settings tabs listen for live server events.
 */

export interface ServerEventPayload {
  type?: string;
  reason?: string;
  modelId?: string;
  receivedBytes?: number;
  totalBytes?: number;
  percent?: number;
  resumed?: boolean;
  done?: boolean;
  [key: string]: unknown;
}

type EventListener = (payload: ServerEventPayload | null) => void;

const listeners = new Set<EventListener>();
let sharedSource: EventSource | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempt = 0;

function clearReconnectTimer(): void {
  if (reconnectTimer !== null) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

function scheduleReconnect(): void {
  if (reconnectTimer !== null || listeners.size === 0) return;
  const delayMs = Math.min(15_000, 1000 * 2 ** reconnectAttempt);
  reconnectAttempt = Math.min(reconnectAttempt + 1, 5);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    ensureConnection();
  }, delayMs);
}

function ensureConnection(): void {
  if (typeof EventSource === 'undefined' || listeners.size === 0) return;
  if (sharedSource && sharedSource.readyState !== EventSource.CLOSED) return;
  if (sharedSource) {
    try {
      sharedSource.close();
    } catch {
      // Ignore close error on closed source
    }
    sharedSource = null;
  }
  clearReconnectTimer();
  try {
    const source = new EventSource('/api/events');
    source.onopen = () => {
      reconnectAttempt = 0;
    };
    source.onmessage = (evt) => {
      let parsed: ServerEventPayload | null = null;
      try {
        parsed = JSON.parse(evt.data) as ServerEventPayload;
      } catch {
        parsed = null;
      }
      for (const listener of listeners) {
        try {
          listener(parsed);
        } catch {
          // Isolate individual subscriber errors
        }
      }
    };
    source.onerror = () => {
      if (source.readyState === EventSource.CLOSED) {
        try {
          source.close();
        } catch {
          // Ignore close errors
        }
        if (sharedSource === source) {
          sharedSource = null;
        }
        scheduleReconnect();
      }
    };
    sharedSource = source;
  } catch {
    sharedSource = null;
    scheduleReconnect();
  }
}

function releaseConnectionIfIdle(): void {
  if (listeners.size === 0) {
    clearReconnectTimer();
    reconnectAttempt = 0;
    if (sharedSource) {
      try {
        sharedSource.close();
      } catch {
        // Ignore close errors
      }
      sharedSource = null;
    }
  }
}

export function subscribeServerEvents(listener: EventListener): () => void {
  listeners.add(listener);
  ensureConnection();
  return () => {
    listeners.delete(listener);
    releaseConnectionIfIdle();
  };
}
