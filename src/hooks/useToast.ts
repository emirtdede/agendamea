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

export function useToast() {
  const [undoToast, setUndoToast] = useState<UndoToastState | null>(null);
  const [infoToast, setInfoToast] = useState<InfoToastState | null>(null);

  const undoTimerRef = useRef<number | null>(null);
  const infoTimerRef = useRef<number | null>(null);

  const clearUndoToast = useCallback(() => {
    if (undoTimerRef.current !== null) {
      window.clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
    setUndoToast(null);
  }, []);

  const clearInfoToast = useCallback(() => {
    if (infoTimerRef.current !== null) {
      window.clearTimeout(infoTimerRef.current);
      infoTimerRef.current = null;
    }
    setInfoToast(null);
  }, []);

  const showUndoToast = useCallback(
    (kind: 'todo' | 'category', id: string, label: string) => {
      if (undoTimerRef.current !== null) {
        window.clearTimeout(undoTimerRef.current);
      }
      setUndoToast({ kind, id, label });
      undoTimerRef.current = window.setTimeout(() => {
        undoTimerRef.current = null;
        setUndoToast(null);
      }, 12000);
    },
    [],
  );

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
      if (infoTimerRef.current !== null) {
        window.clearTimeout(infoTimerRef.current);
      }
      setInfoToast({ message, tone });
      infoTimerRef.current = window.setTimeout(() => {
        infoTimerRef.current = null;
        setInfoToast(null);
      }, tone === 'error' ? 4500 : 3500);
    },
    [],
  );

  useEffect(() => {
    return () => {
      if (undoTimerRef.current !== null) {
        window.clearTimeout(undoTimerRef.current);
      }
      if (infoTimerRef.current !== null) {
        window.clearTimeout(infoTimerRef.current);
      }
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
