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

function ensureConnection(): void {
  if (sharedSource || typeof EventSource === 'undefined') return;
  try {
    const source = new EventSource('/api/events');
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
    sharedSource = source;
  } catch {
    sharedSource = null;
  }
}

function releaseConnectionIfIdle(): void {
  if (listeners.size === 0 && sharedSource) {
    try {
      sharedSource.close();
    } catch {
      // Ignore close errors
    }
    sharedSource = null;
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
