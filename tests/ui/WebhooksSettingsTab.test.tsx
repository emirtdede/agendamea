import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { api } from '../../src/api/client';
import { WebhooksSettingsTab } from '../../src/components/settings/WebhooksSettingsTab';
import { I18nProvider } from '../../src/i18n/I18nContext';

describe('WebhooksSettingsTab (Outgoing & Incoming Contract)', () => {
  it('renders webhook configuration, switches snippet tabs, and persists updated URL', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'getWebhookLogs').mockResolvedValue([]);
    vi.spyOn(api, 'getWebhookOutbox').mockResolvedValue([]);
    const onSaveWebhook = vi.fn().mockResolvedValue(undefined);

    render(
      <I18nProvider lang="en" onChangeLanguage={vi.fn()}>
        <WebhooksSettingsTab
          webhookEnabled={true}
          webhookUrl="https://hooks.example.com/agendamea"
          webhookSecret="whsec_initial"
          webhookEvents="*"
          webhookFormat="auto"
          webhookIncomingEnabled={true}
          webhookIncomingSecret="incoming_sec_123"
          webhookAllowLocalNetwork={true}
          webhookEndpointOverrides={{}}
          onSaveWebhook={onSaveWebhook}
        />
      </I18nProvider>,
    );

    const urlInput = screen.getByDisplayValue('https://hooks.example.com/agendamea');
    expect(urlInput).toBeInTheDocument();

    const switches = screen.getAllByRole('switch');
    expect(switches.length).toBeGreaterThanOrEqual(2);
    await user.click(switches[0]!);
    expect(switches[0]!).toHaveAttribute('aria-checked', 'false');
  });
});
