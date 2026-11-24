import { api } from '../api/client';
import type { AppSettings, WebhookEndpointOverride, WebhookFormat } from '../types';
import {
  createSelectorStore,
  type EqualityFn,
  type SelectorStore,
  shallowEqual,
  useSelectorStore,
} from './createSelectorStore';
import { reportStoreError } from './storeErrorBus';

export interface WebhookSettingsSavePatch {
  webhookEnabled: boolean;
  webhookUrl: string;
  webhookSecret: string;
  webhookEvents?: string;
  webhookFormat?: WebhookFormat;
  webhookIncomingEnabled?: boolean;
  webhookIncomingSecret?: string;
  webhookAllowLocalNetwork?: boolean;
  webhookEndpointOverrides?: Record<string, WebhookEndpointOverride>;
}

export interface WebhookStoreState {
  webhookEnabled: boolean;
  webhookUrl: string;
  webhookSecret: string;
  webhookEvents: string;
  webhookFormat: WebhookFormat;
  webhookIncomingEnabled: boolean;
  webhookIncomingSecret: string;
  webhookAllowLocalNetwork: boolean;
  webhookEndpointOverrides: Record<string, WebhookEndpointOverride>;
}

export interface WebhookStore extends SelectorStore<WebhookStoreState> {
  hydrate: (settings: AppSettings) => void;
  save: (patch: WebhookSettingsSavePatch) => Promise<void>;
}

function getInitialWebhookState(): WebhookStoreState {
  return {
    webhookEnabled: false,
    webhookUrl: '',
    webhookSecret: '',
    webhookEvents: '*',
    webhookFormat: 'auto',
    webhookIncomingEnabled: false,
    webhookIncomingSecret: '',
    webhookAllowLocalNetwork: true,
    webhookEndpointOverrides: {},
  };
}

export function createWebhookStore(
  persistSettings: (patch: Partial<AppSettings>) => Promise<AppSettings> = (patch) =>
    api.updateSettings(patch),
  onError: (err: unknown) => void = (err) => reportStoreError(err),
): WebhookStore {
  const base = createSelectorStore<WebhookStoreState>(getInitialWebhookState);
  let saveSeq = 0;

  const hydrate = (settings: AppSettings): void => {
    base.patchState({
      webhookEnabled: Boolean(settings.webhookEnabled),
      webhookUrl: settings.webhookUrl ?? '',
      webhookSecret: settings.webhookSecret ?? '',
      webhookEvents: settings.webhookEvents ?? '*',
      webhookFormat: settings.webhookFormat ?? 'auto',
      webhookIncomingEnabled: Boolean(settings.webhookIncomingEnabled),
      webhookIncomingSecret: settings.webhookIncomingSecret ?? '',
      webhookAllowLocalNetwork: settings.webhookAllowLocalNetwork !== false,
      webhookEndpointOverrides: settings.webhookEndpointOverrides ?? {},
    });
  };

  const save = async (patch: WebhookSettingsSavePatch): Promise<void> => {
    const seq = ++saveSeq;
    const prev = base.getState();
    base.patchState({
      webhookEnabled: patch.webhookEnabled,
      webhookUrl: patch.webhookUrl,
      webhookSecret: patch.webhookSecret,
      webhookEvents: patch.webhookEvents ?? prev.webhookEvents,
      webhookFormat: patch.webhookFormat ?? prev.webhookFormat,
      webhookIncomingEnabled: patch.webhookIncomingEnabled ?? prev.webhookIncomingEnabled,
      webhookIncomingSecret: patch.webhookIncomingSecret ?? prev.webhookIncomingSecret,
      webhookAllowLocalNetwork: patch.webhookAllowLocalNetwork ?? prev.webhookAllowLocalNetwork,
      webhookEndpointOverrides: patch.webhookEndpointOverrides ?? prev.webhookEndpointOverrides,
    });
    try {
      const updated = await persistSettings(patch);
      if (seq !== saveSeq) return;
      hydrate(updated);
    } catch (err) {
      if (seq !== saveSeq) return;
      onError(err);
    }
  };

  const reset = (): void => {
    saveSeq += 1;
    base.reset();
  };

  return {
    ...base,
    reset,
    hydrate,
    save,
  };
}

export const webhookStore = createWebhookStore();

export function useWebhookSelector<S>(
  selector: (state: WebhookStoreState) => S,
  isEqual: EqualityFn<S> = shallowEqual,
): S {
  return useSelectorStore(webhookStore, selector, isEqual);
}
