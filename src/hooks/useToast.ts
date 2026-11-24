import { useCallback, useEffect, useRef, useState } from 'react';

export interface UndoToastState {
  kind: 'todo' | 'category';
  id: string;
  label: string;
}

export interface InfoToastState {
  message: string;
  tone: 'info' | 'error';
}

const MAX_QUEUED_INFO_TOASTS = 6;

export function useToast() {
  const [undoToast, setUndoToast] = useState<UndoToastState | null>(null);
  const [infoToast, setInfoToast] = useState<InfoToastState | null>(null);

  const undoTimerRef = useRef<number | null>(null);
  const infoTimerRef = useRef<number | null>(null);
  const activeInfoRef = useRef<InfoToastState | null>(null);
  const infoQueueRef = useRef<InfoToastState[]>([]);

  const clearUndoToast = useCallback(() => {
    if (undoTimerRef.current !== null) {
      window.clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
    setUndoToast(null);
  }, []);

  const displayNextInfoToast = useCallback((next: InfoToastState | null) => {
    if (infoTimerRef.current !== null) {
      window.clearTimeout(infoTimerRef.current);
      infoTimerRef.current = null;
    }
    activeInfoRef.current = next;
    setInfoToast(next);
    if (!next) return;

    infoTimerRef.current = window.setTimeout(
      () => {
        infoTimerRef.current = null;
        const queued = infoQueueRef.current.shift() ?? null;
        displayNextInfoToast(queued);
      },
      next.tone === 'error' ? 4500 : 3500,
    );
  }, []);

  const clearInfoToast = useCallback(() => {
    const queued = infoQueueRef.current.shift() ?? null;
    displayNextInfoToast(queued);
  }, [displayNextInfoToast]);

  const showUndoToast = useCallback((kind: 'todo' | 'category', id: string, label: string) => {
    if (undoTimerRef.current !== null) {
      window.clearTimeout(undoTimerRef.current);
    }
    setUndoToast({ kind, id, label });
    undoTimerRef.current = window.setTimeout(() => {
      undoTimerRef.current = null;
      setUndoToast(null);
    }, 12000);
  }, []);

  const pauseUndoToast = useCallback(() => {
    if (undoTimerRef.current !== null) {
      window.clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
  }, []);

  const resumeUndoToast = useCallback(() => {
    if (undoTimerRef.current !== null) {
      window.clearTimeout(undoTimerRef.current);
    }
    undoTimerRef.current = window.setTimeout(() => {
      undoTimerRef.current = null;
      setUndoToast(null);
    }, 6000);
  }, []);

  const showInfoToast = useCallback(
    (message: string, tone: 'info' | 'error' = 'info') => {
      const next: InfoToastState = { message, tone };
      const current = activeInfoRef.current;

      // Errors always surface immediately; preserve displaced info toast at front of queue
      if (!current || tone === 'error' || current.message === message) {
        if (
          current &&
          tone === 'error' &&
          current.tone !== 'error' &&
          current.message !== message &&
          !infoQueueRef.current.some((item) => item.message === current.message)
        ) {
          infoQueueRef.current.unshift(current);
          if (infoQueueRef.current.length > MAX_QUEUED_INFO_TOASTS) {
            infoQueueRef.current.pop();
          }
        }
        displayNextInfoToast(next);
        return;
      }

      // Queue simultaneous info notifications (e.g. multiple due task reminders) FIFO without losing any
      const alreadyQueued = infoQueueRef.current.some((item) => item.message === message);
      if (!alreadyQueued) {
        if (infoQueueRef.current.length >= MAX_QUEUED_INFO_TOASTS) {
          infoQueueRef.current.shift();
        }
        infoQueueRef.current.push(next);
      }
    },
    [displayNextInfoToast],
  );

  useEffect(() => {
    return () => {
      if (undoTimerRef.current !== null) {
        window.clearTimeout(undoTimerRef.current);
      }
      if (infoTimerRef.current !== null) {
        window.clearTimeout(infoTimerRef.current);
      }
      infoQueueRef.current = [];
      activeInfoRef.current = null;
    };
  }, []);

  return {
    undoToast,
    infoToast,
    showUndoToast,
    clearUndoToast,
    pauseUndoToast,
    resumeUndoToast,
    showInfoToast,
    clearInfoToast,
  };
}
