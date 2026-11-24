import { type RefObject, useEffect } from 'react';
import { subscribeServerEvents } from '../api/eventStream';
import type { UiDictionary } from '../i18n/translations';
import { workspaceUiStore } from '../store/workspaceUiStore';

interface UseServerSseSyncOptions {
  tRef: RefObject<UiDictionary>;
  quickAddRef: RefObject<HTMLInputElement | null>;
  launchViewOverriddenRef?: { current: boolean };
  scheduleFocus: (fn: () => void, delayMs: number) => void;
  focusTodoFromNotification: (todoId: string) => void;
  dispatchVoiceNotification: (payload: {
    title: string;
    body?: string;
    variant?: 'info' | 'error';
  }) => void;
  loadData: (silent?: boolean, fromExternalSse?: boolean) => Promise<void>;
}

/**
 * Bridges Electron IPC window events, shared backend SSE streams (live sync + AI/TTS download
 * notifications), and PWA / Windows Jump List launch query parameters.
 */
export function useServerSseSync({
  tRef,
  quickAddRef,
  launchViewOverriddenRef,
  scheduleFocus,
  focusTodoFromNotification,
  dispatchVoiceNotification,
  loadData,
}: UseServerSseSyncOptions): void {
  // Listen for Electron close / global quick-add / desktop notification click / Windows Jump List events
  useEffect(() => {
    const unsubClose = window.agendameaWindow?.onCloseRequested?.(() => {
      workspaceUiStore.setIsCloseModalOpen(true);
    });
    const unsubQuickAdd = window.agendameaWindow?.onFocusQuickAdd?.(() => {
      workspaceUiStore.dismissModals();
      scheduleFocus(() => quickAddRef.current?.focus(), 60);
    });
    const unsubNavView = window.agendameaWindow?.onNavigateSmartView?.((viewId) => {
      if (viewId === 'today' || viewId === 'important' || viewId === 'all') {
        if (launchViewOverriddenRef) launchViewOverriddenRef.current = true;
        workspaceUiStore.dismissModals();
        workspaceUiStore.setActiveView({ type: 'smart', id: viewId });
      }
    });
    const unsubFocusTodo = window.agendameaWindow?.onFocusTodo?.(focusTodoFromNotification);
    return () => {
      if (typeof unsubClose === 'function') unsubClose();
      if (typeof unsubQuickAdd === 'function') unsubQuickAdd();
      if (typeof unsubNavView === 'function') unsubNavView();
      if (typeof unsubFocusTodo === 'function') unsubFocusTodo();
    };
  }, [focusTodoFromNotification, launchViewOverriddenRef, quickAddRef, scheduleFocus]);

  // Live refresh whenever external CLI, MCP server, or Incoming Webhook mutates tasks (shared SSE bus)
  useEffect(() => {
    let refreshTimer: number | null = null;
    const unsub = subscribeServerEvents((parsed) => {
      if (parsed?.type === 'ai.download.progress' && parsed.done === true && parsed.ok === true) {
        const modelLabel = typeof parsed.modelId === 'string' ? parsed.modelId : '';
        dispatchVoiceNotification({
          title: tRef.current.notificationsEventVoice,
          body: modelLabel
            ? `${modelLabel} (${tRef.current.aiModelInstalledBadge})`
            : tRef.current.aiModelInstalledBadge,
        });
        return;
      }
      if (parsed?.type === 'tts.download.progress' && parsed.done === true && parsed.ok === true) {
        const voiceLabel = typeof parsed.voiceId === 'string' ? parsed.voiceId : '';
        dispatchVoiceNotification({
          title: tRef.current.notificationsEventVoice,
          body: voiceLabel
            ? `${voiceLabel} (${tRef.current.aiModelInstalledBadge})`
            : tRef.current.aiModelInstalledBadge,
        });
        return;
      }
      if (parsed?.type && parsed.type !== 'changed') {
        return;
      }
      if (refreshTimer !== null) window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => {
        refreshTimer = null;
        void loadData(true, true);
      }, 120);
    });
    return () => {
      if (refreshTimer !== null) window.clearTimeout(refreshTimer);
      unsub();
    };
  }, [dispatchVoiceNotification, loadData, tRef]);

  // Handle Windows Jump List / PWA shortcut launch query params (?view=... & ?action=new)
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const viewParam = params.get('view');
      const actionParam = params.get('action');

      if (
        viewParam === 'today' ||
        viewParam === 'important' ||
        viewParam === 'completed' ||
        viewParam === 'all'
      ) {
        if (launchViewOverriddenRef) launchViewOverriddenRef.current = true;
        workspaceUiStore.setActiveView({ type: 'smart', id: viewParam });
      }
      if (actionParam === 'new') {
        scheduleFocus(() => quickAddRef.current?.focus(), 120);
      }
      if (viewParam || actionParam) {
        window.history.replaceState({}, '', window.location.pathname);
      }
    } catch {
      // Ignore invalid URL environments
    }
  }, [launchViewOverriddenRef, quickAddRef, scheduleFocus]);
}
