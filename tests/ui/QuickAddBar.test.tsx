import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../src/api/client';
import { QuickAddBar } from '../../src/components/QuickAddBar';
import { I18nProvider } from '../../src/i18n/I18nContext';
import type { Category } from '../../src/types';
import { VoiceAudioCapture } from '../../src/voice/audioCapture';

const SAMPLE_CATEGORIES: Category[] = [
  {
    id: 'cat-work',
    name: 'Work',
    color: '#2563eb',
    pinned: false,
    sortOrder: 0,
    createdAt: '2026-11-01T10:00:00.000Z',
    deletedAt: null,
  },
];

describe('QuickAddBar (React 19 UI Contract)', () => {
  it('submits a trimmed task payload with default category and ignores blank input', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn().mockResolvedValue({ id: 'todo-1' });
    const inputRef = React.createRef<HTMLInputElement>();

    render(
      <I18nProvider lang="en" onChangeLanguage={vi.fn()}>
        <QuickAddBar
          inputRef={inputRef}
          categories={SAMPLE_CATEGORIES}
          todayStr="2026-11-23"
          defaultCategoryId="cat-work"
          defaultImportant={false}
          defaultDueDate="2026-11-23"
          onAdd={onAdd}
        />
      </I18nProvider>,
    );

    const input = screen.getByRole('textbox');
    await user.type(input, '   {Enter}');
    expect(onAdd).not.toHaveBeenCalled();

    await user.type(input, 'Prepare Q4 architecture deck{Enter}');
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Prepare Q4 architecture deck',
        categoryId: 'cat-work',
        dueDate: '2026-11-23',
        priority: 'normal',
        important: false,
      }),
    );
    expect((input as HTMLInputElement).value).toBe('');
  });

  it('cycles priority, toggles quick dates, configures date popover, and selects categories', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn().mockResolvedValue({ id: 'todo-2' });
    const inputRef = React.createRef<HTMLInputElement>();

    render(
      <I18nProvider lang="en" onChangeLanguage={vi.fn()}>
        <QuickAddBar
          inputRef={inputRef}
          categories={[
            ...SAMPLE_CATEGORIES,
            {
              id: 'cat-personal',
              name: 'Personal',
              color: '#16a34a',
              pinned: false,
              sortOrder: 1,
              createdAt: '2026-11-01T10:00:00.000Z',
              deletedAt: null,
            },
          ]}
          todayStr="2026-11-23"
          defaultCategoryId={null}
          defaultImportant={true}
          defaultDueDate={null}
          onAdd={onAdd}
        />
      </I18nProvider>,
    );

    // Cycle priority: normal -> high -> low -> normal -> high
    const priorityBtn = screen.getByRole('button', { name: /Priority/i });
    await user.click(priorityBtn);
    expect(priorityBtn).toHaveTextContent(/High/i);

    // Cycle quick date: none -> today -> tomorrow -> none
    const dateBtn = screen.getByRole('button', { name: /^Date:/i });
    await user.click(dateBtn);
    expect(dateBtn).toHaveTextContent(/Today/i);
    await user.click(dateBtn);
    expect(dateBtn).toHaveTextContent(/Tomorrow/i);
    await user.click(dateBtn);
    expect(dateBtn).toHaveTextContent(/Date/i);

    // Open date-range popover, pick Tomorrow, then clear, then set start/due/time
    const popoverToggle = screen.getByRole('button', { name: /Start Date/i });
    await user.click(popoverToggle);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();

    const tomorrowBtn = screen.getByRole('button', { name: /^Tomorrow$/i });
    await user.click(tomorrowBtn);
    const clearBtn = screen.getByRole('button', { name: /Clear/i });
    await user.click(clearBtn);

    const todayBtn = screen.getByRole('button', { name: /^Today$/i });
    await user.click(todayBtn);

    // Close popover with Escape
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    // Open category dropdown and choose Personal
    const catTrigger = screen.getByRole('button', { name: /Categories:/i });
    await user.click(catTrigger);
    const listbox = screen.getByRole('listbox');
    expect(listbox).toBeInTheDocument();
    await user.click(screen.getByRole('option', { name: /Personal/i }));
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

    // Submit and verify enriched payload
    const input = screen.getByRole('textbox');
    await user.type(input, 'Audit release checklist{Enter}');
    expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Audit release checklist',
        priority: 'high',
        dueDate: '2026-11-23',
        categoryId: 'cat-personal',
        important: true,
      }),
    );
  });

  it('preserves user title on failed submission for idempotent retry', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn().mockRejectedValueOnce(new Error('network error')).mockResolvedValueOnce({
      id: 'todo-retry',
    });
    const inputRef = React.createRef<HTMLInputElement>();

    render(
      <I18nProvider lang="en" onChangeLanguage={vi.fn()}>
        <QuickAddBar
          inputRef={inputRef}
          categories={SAMPLE_CATEGORIES}
          todayStr="2026-11-23"
          defaultCategoryId={null}
          defaultImportant={false}
          defaultDueDate={null}
          onAdd={onAdd}
        />
      </I18nProvider>,
    );

    const input = screen.getByRole('textbox') as HTMLInputElement;
    await user.type(input, 'Retryable task{Enter}');
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(input.value).toBe('Retryable task');

    await user.type(input, '{Enter}');
    expect(onAdd).toHaveBeenCalledTimes(2);
    expect(onAdd.mock.calls[0]?.[0]?.id).toBe(onAdd.mock.calls[1]?.[0]?.id);
    expect(input.value).toBe('');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows on-screen confirmation bar after dictation, applies parsed date/time/priority, and confirms with one click without Enter', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn().mockResolvedValue({ id: 'todo-voice-1' });
    const onNotifyInfo = vi.fn();
    const inputRef = React.createRef<HTMLInputElement>();

    vi.spyOn(api, 'getAiStatus').mockResolvedValue({
      readiness: {
        dictationReady: true,
        assistantReady: true,
        semanticSearchReady: true,
        fullyReady: true,
      },
      models: [],
      settings: {
        voiceAutoStopMs: 1500,
        voiceMicDeviceId: '',
        voiceNoiseSuppression: true,
        voiceSensitivity: 'auto',
      },
    } as unknown as Awaited<ReturnType<typeof api.getAiStatus>>);

    vi.spyOn(api, 'transcribeAudio').mockResolvedValue({
      ok: true,
      text: 'Yarın saat 15:00 dişçi randevusu acil',
      parsed: {
        intent: 'add_task',
        title: 'Dişçi randevusu',
        dueDate: '2026-11-28',
        dueTime: '15:00',
        priority: 'high',
        important: true,
        category: null,
        tags: [],
      },
    });

    vi.spyOn(VoiceAudioCapture.prototype, 'start').mockImplementation(async (cbs) => {
      setTimeout(() => {
        cbs?.onAutoStop?.(new Float32Array(16000).fill(0.1), 'silence');
      }, 10);
      return true;
    });

    render(
      <I18nProvider lang="tr" onChangeLanguage={vi.fn()}>
        <QuickAddBar
          inputRef={inputRef}
          categories={SAMPLE_CATEGORIES}
          todayStr="2026-11-27"
          defaultCategoryId={null}
          defaultImportant={false}
          defaultDueDate={null}
          onAdd={onAdd}
          onNotifyInfo={onNotifyInfo}
        />
      </I18nProvider>,
    );

    await user.click(screen.getByTestId('quick-add-mic-btn'));
    const confirmBar = await screen.findByTestId('quick-add-dictation-confirm-bar');
    expect(confirmBar).toBeInTheDocument();
    expect(screen.getByTestId('quick-add-dictation-countdown')).toBeInTheDocument();

    // Confirm with single click (no Enter required)
    await user.click(screen.getByTestId('quick-add-dictation-confirm-btn'));
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Dişçi randevusu',
        dueDate: '2026-11-28',
        dueTime: '15:00',
        priority: 'high',
        important: true,
      }),
    );
    expect(screen.queryByTestId('quick-add-dictation-confirm-bar')).not.toBeInTheDocument();
  });

  it('auto-adds dictated task hands-free when countdown completes and reports mic errors accurately', async () => {
    const onAdd = vi.fn().mockResolvedValue({ id: 'todo-auto-1' });
    const onNotifyInfo = vi.fn();
    const inputRef = React.createRef<HTMLInputElement>();

    vi.spyOn(api, 'getAiStatus').mockResolvedValue({
      readiness: {
        dictationReady: true,
        assistantReady: true,
        semanticSearchReady: true,
        fullyReady: true,
      },
      models: [],
      settings: {
        voiceAutoStopMs: 1500,
        voiceMicDeviceId: '',
        voiceNoiseSuppression: true,
        voiceSensitivity: 'auto',
      },
    } as unknown as Awaited<ReturnType<typeof api.getAiStatus>>);

    let captureHandler: ((pcm: Float32Array, reason: 'silence') => void) | undefined;
    let errorHandler: ((code: string, message: string) => void) | undefined;
    vi.spyOn(VoiceAudioCapture.prototype, 'start').mockImplementation(async (cbs) => {
      captureHandler = cbs?.onAutoStop;
      errorHandler = cbs?.onError;
      return true;
    });
    vi.spyOn(api, 'transcribeAudio').mockResolvedValue({
      ok: true,
      text: 'Süt al',
      parsed: {
        intent: 'unknown',
        title: 'Süt al',
        dueDate: null,
        dueTime: null,
        priority: 'normal',
        important: false,
        category: null,
        tags: [],
      },
    });

    render(
      <I18nProvider lang="tr" onChangeLanguage={vi.fn()}>
        <QuickAddBar
          inputRef={inputRef}
          categories={SAMPLE_CATEGORIES}
          todayStr="2026-11-27"
          defaultCategoryId={null}
          defaultImportant={false}
          defaultDueDate={null}
          onAdd={onAdd}
          onNotifyInfo={onNotifyInfo}
        />
      </I18nProvider>,
    );

    vi.useFakeTimers();
    try {
      await act(async () => {
        screen.getByTestId('quick-add-mic-btn').click();
        await Promise.resolve();
        await Promise.resolve();
      });

      // Trigger auto-stop dictation completion
      await act(async () => {
        captureHandler?.(new Float32Array(16000).fill(0.1), 'silence');
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(screen.getByTestId('quick-add-dictation-confirm-bar')).toBeInTheDocument();

      // Advance 3 seconds -> hands-free auto-add fires with zero Enter / click
      for (let i = 0; i < 4; i += 1) {
        await act(async () => {
          vi.advanceTimersByTime(1000);
          await Promise.resolve();
        });
      }
      expect(onAdd).toHaveBeenCalledTimes(1);
      expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ title: 'Süt al' }));

      // Now verify MIC_ERROR does NOT falsely display sttErrorUnavailable
      await act(async () => {
        screen.getByTestId('quick-add-mic-btn').click();
        await Promise.resolve();
        await Promise.resolve();
        errorHandler?.('MIC_ERROR', 'Microphone unavailable.');
      });
      expect(onNotifyInfo).toHaveBeenLastCalledWith(expect.stringContaining('Mikrofon'), 'error');
    } finally {
      vi.useRealTimers();
    }
  });
});
