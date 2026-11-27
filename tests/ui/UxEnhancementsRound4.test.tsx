import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { EisenhowerMatrixView } from '../../src/components/boards/EisenhowerMatrixView';
import { KanbanBoardView } from '../../src/components/boards/KanbanBoardView';
import { InfoTooltip } from '../../src/components/InfoTooltip';
import { Sidebar } from '../../src/components/Sidebar';
import {
  AiOneClickSetupHero,
  type CustomAiModelSelection,
} from '../../src/components/settings/ai/AiOneClickSetupHero';
import { SettingsAdvancedSection } from '../../src/components/settings/SettingsAdvancedSection';
import { I18nProvider } from '../../src/i18n/I18nContext';
import type { AiStatusPayload, AiTierId, Category, Todo } from '../../src/types';

function createRichAiStatus(): AiStatusPayload {
  return {
    hardware: {
      cpuModel: 'AMD Ryzen 7',
      cpuCores: 8,
      ramGb: 16,
      gpuName: 'NVIDIA RTX 4060',
      vramGb: 8,
      hasDiscreteGpu: true,
      freeDiskGb: 120,
      recommendedTier: 'tier-medium',
    },
    recommendation: {
      primaryOptionId: 'tier-medium',
      recommendedProfileId: 'gpu-strong',
      recommendedProfileGroup: 'gpu',
      tiers: [],
      profiles: [
        {
          id: 'cpu-light',
          group: 'cpu',
          legacyTier: 'tier-light',
          minRamGb: 4,
          minVramGb: 0,
          sttModelId: 'whisper-base-q5_1',
          llmModelId: 'qwen3-0.6b-q8_0',
          embedModelId: 'multilingual-e5-small-q8_0',
          totalBytes: 830_000_000,
          recommended: false,
          fitsHardware: true,
          warningCode: null,
        },
        {
          id: 'cpu-balanced',
          group: 'cpu',
          legacyTier: 'tier-light',
          minRamGb: 8,
          minVramGb: 0,
          sttModelId: 'whisper-small-q5_1',
          llmModelId: 'qwen3-1.7b-q8_0',
          embedModelId: 'multilingual-e5-small-q8_0',
          totalBytes: 2_150_000_000,
          recommended: false,
          fitsHardware: true,
          warningCode: null,
        },
        {
          id: 'gpu-very-weak',
          group: 'gpu',
          legacyTier: 'tier-light',
          minRamGb: 4,
          minVramGb: 2,
          sttModelId: 'whisper-base-q5_1',
          llmModelId: 'qwen3-0.6b-q8_0',
          embedModelId: 'multilingual-e5-small-q8_0',
          totalBytes: 830_000_000,
          recommended: false,
          fitsHardware: true,
          warningCode: null,
        },
        {
          id: 'gpu-weak',
          group: 'gpu',
          legacyTier: 'tier-light',
          minRamGb: 8,
          minVramGb: 4,
          sttModelId: 'whisper-small-q5_1',
          llmModelId: 'qwen3-1.7b-q8_0',
          embedModelId: 'multilingual-e5-small-q8_0',
          totalBytes: 2_150_000_000,
          recommended: false,
          fitsHardware: true,
          warningCode: null,
        },
        {
          id: 'gpu-balanced',
          group: 'gpu',
          legacyTier: 'tier-medium',
          minRamGb: 12,
          minVramGb: 6,
          sttModelId: 'whisper-small-q5_1',
          llmModelId: 'qwen3-4b-q4_k_m',
          embedModelId: 'multilingual-e5-small-q8_0',
          totalBytes: 2_820_000_000,
          recommended: false,
          fitsHardware: true,
          warningCode: null,
        },
        {
          id: 'gpu-strong',
          group: 'gpu',
          legacyTier: 'tier-medium',
          minRamGb: 16,
          minVramGb: 8,
          sttModelId: 'whisper-large-v3-turbo-q5_0',
          llmModelId: 'qwen3-4b-q4_k_m',
          embedModelId: 'qwen3-embedding-0.6b-q8_0',
          totalBytes: 3_710_000_000,
          recommended: true,
          fitsHardware: true,
          warningCode: null,
        },
        {
          id: 'gpu-ultra',
          group: 'gpu',
          legacyTier: 'tier-strong',
          minRamGb: 16,
          minVramGb: 12,
          sttModelId: 'whisper-large-v3-turbo-q5_0',
          llmModelId: 'qwen3-8b-q4_k_m',
          embedModelId: 'qwen3-embedding-0.6b-q8_0',
          totalBytes: 6_240_000_000,
          recommended: false,
          fitsHardware: false,
          warningCode: 'LOW_VRAM',
        },
      ],
      externalOllama: { detected: false, baseUrl: 'http://127.0.0.1:11434', models: [] },
      externalLmStudio: { detected: false, baseUrl: 'http://127.0.0.1:1234', models: [] },
    },
    settings: {
      aiTier: 'gpu-strong',
      aiUseExternalOllama: false,
      aiOllamaModel: '',
      aiExternalBaseUrl: '',
      aiSttModelId: 'whisper-large-v3-turbo-q5_0',
      aiLlmModelId: 'qwen3-4b-q4_k_m',
      aiEmbedModelId: 'qwen3-embedding-0.6b-q8_0',
      voiceAutoStopMs: 2500,
      voiceTtsEnabled: true,
      voiceTtsVoice: '',
      voiceTtsStyle: 'natural',
      voiceChimePreset: 'soft',
      voiceMicDeviceId: '',
      voiceNoiseSuppression: true,
      voiceSensitivity: 'auto',
      voiceDictationLanguage: 'auto',
    },
    models: [
      {
        id: 'whisper-base-q5_1',
        role: 'stt',
        tier: 'tier-light',
        label: 'Whisper Base',
        license: 'mit',
        expectedBytes: 60_000_000,
        present: false,
        verified: false,
        downloading: false,
        fitsHardware: true,
        warningCode: null,
      },
      {
        id: 'qwen3-0.6b-q8_0',
        role: 'llm',
        tier: 'tier-light',
        label: 'Qwen3 0.6B',
        license: 'apache-2.0',
        expectedBytes: 639_000_000,
        present: false,
        verified: false,
        downloading: false,
        fitsHardware: true,
        warningCode: null,
      },
      {
        id: 'multilingual-e5-small-q8_0',
        role: 'embed',
        tier: 'tier-light',
        label: 'Multilingual E5 Small',
        license: 'mit',
        expectedBytes: 132_000_000,
        present: false,
        verified: false,
        downloading: false,
        fitsHardware: true,
        warningCode: null,
      },
    ],
    installedDiskBytes: 0,
    ragChunkCount: 0,
  } as unknown as AiStatusPayload;
}

const SAMPLE_CATEGORIES: Category[] = [
  {
    id: 'cat-1',
    name: 'Work',
    color: '#2563eb',
    pinned: false,
    sortOrder: 0,
    createdAt: '2026-11-01T00:00:00.000Z',
    deletedAt: null,
  },
];

const SAMPLE_TODOS: Todo[] = [
  {
    id: 'todo-1',
    title: 'Prepare sprint demo',
    notes: '',
    completed: false,
    important: true,
    pinned: false,
    priority: 'high',
    startDate: null,
    dueDate: '2026-11-27',
    dueTime: null,
    categoryId: 'cat-1',
    tags: [],
    sortOrder: 0,
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
    deletedAt: null,
    subtasks: [],
  },
];

type HarnessProfileId =
  | 'cpu-light'
  | 'cpu-balanced'
  | 'gpu-very-weak'
  | 'gpu-weak'
  | 'gpu-balanced'
  | 'gpu-strong'
  | 'gpu-ultra'
  | 'custom';

function AiProfileHeroHarness({
  status,
  onStartSetup,
}: {
  status: AiStatusPayload;
  onStartSetup: (payload: { profileId: AiTierId; customModels?: CustomAiModelSelection }) => void;
}) {
  const [profileId, setProfileId] = React.useState<HarnessProfileId>('gpu-strong');
  const [customModels, setCustomModels] = React.useState({
    sttModelId: '',
    llmModelId: '',
    embedModelId: '',
  });
  return (
    <I18nProvider lang="en" onChangeLanguage={vi.fn()}>
      <AiOneClickSetupHero
        status={status}
        loading={false}
        setup={null}
        selectedProfileId={profileId}
        customModels={customModels}
        isStartingSetup={false}
        isWarmingUp={false}
        onSelectProfileId={(id) => setProfileId(id as HarnessProfileId)}
        onChangeCustomModels={setCustomModels}
        onStartOneClickSetup={onStartSetup}
        onCancelSetup={vi.fn()}
        onWarmup={vi.fn()}
        onOpenAdvancedModels={vi.fn()}
      />
    </I18nProvider>
  );
}

describe('Round 4 UX Enhancements (InfoTooltip, Advanced Toggle, AI CPU/GPU/Custom Profiles, Context Menus)', () => {
  it('InfoTooltip opens on hover/focus and dismisses cleanly on Escape', async () => {
    const user = userEvent.setup();
    render(
      <I18nProvider lang="en" onChangeLanguage={vi.fn()}>
        <InfoTooltip text="Helpful guidance text" testId="sample-info" />
      </I18nProvider>,
    );

    const trigger = screen.getByTestId('sample-info');
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();

    await user.hover(trigger);
    expect(screen.getByRole('tooltip')).toHaveTextContent('Helpful guidance text');

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('SettingsAdvancedSection hides power-user controls by default, toggles on click, and honors forceOpen', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <I18nProvider lang="en" onChangeLanguage={vi.fn()}>
        <SettingsAdvancedSection toggleTestId="adv-btn">
          <div data-testid="adv-secret">Power Option</div>
        </SettingsAdvancedSection>
      </I18nProvider>,
    );

    expect(screen.queryByTestId('adv-secret')).not.toBeInTheDocument();
    await user.click(screen.getByTestId('adv-btn'));
    expect(screen.getByTestId('adv-secret')).toBeInTheDocument();
    await user.click(screen.getByTestId('adv-btn'));
    expect(screen.queryByTestId('adv-secret')).not.toBeInTheDocument();

    rerender(
      <I18nProvider lang="en" onChangeLanguage={vi.fn()}>
        <SettingsAdvancedSection forceOpen toggleTestId="adv-btn">
          <div data-testid="adv-secret">Power Option</div>
        </SettingsAdvancedSection>
      </I18nProvider>,
    );
    expect(screen.getByTestId('adv-secret')).toBeInTheDocument();
  });

  it('AiOneClickSetupHero exposes 5 GPU profiles, 2 CPU profiles, and Guided Custom Profile Builder requiring 3/3 roles', async () => {
    const user = userEvent.setup();
    const onStartSetup = vi.fn();
    const status = createRichAiStatus();
    render(<AiProfileHeroHarness status={status} onStartSetup={onStartSetup} />);

    // Default GPU group renders all 5 GPU tiers with recommended badge on gpu-strong
    expect(screen.getByTestId('ai-profile-gpu-very-weak')).toBeInTheDocument();
    expect(screen.getByTestId('ai-profile-gpu-weak')).toBeInTheDocument();
    expect(screen.getByTestId('ai-profile-gpu-balanced')).toBeInTheDocument();
    expect(screen.getByTestId('ai-profile-gpu-strong')).toBeInTheDocument();
    expect(screen.getByTestId('ai-profile-gpu-ultra')).toBeInTheDocument();
    expect(screen.getByTestId('ai-profile-rec-gpu-strong')).toBeInTheDocument();

    // Switch to CPU group -> 2 CPU profiles
    await user.click(screen.getByTestId('ai-profile-group-cpu'));
    expect(screen.getByTestId('ai-profile-cpu-light')).toBeInTheDocument();
    expect(screen.getByTestId('ai-profile-cpu-balanced')).toBeInTheDocument();

    // Switch to Custom Profile Builder -> enforces 1 STT + 1 LLM + 1 Embedding
    await user.click(screen.getByTestId('ai-profile-group-custom'));
    expect(screen.getByTestId('ai-custom-profile-builder')).toBeInTheDocument();
    expect(screen.getByTestId('ai-custom-selected-counter')).toHaveTextContent('0/3');
    expect(screen.getByTestId('ai-oneclick-setup-btn')).toBeDisabled();

    await user.selectOptions(screen.getByTestId('ai-custom-stt-select'), 'whisper-base-q5_1');
    expect(screen.getByTestId('ai-custom-selected-counter')).toHaveTextContent('1/3');
    expect(screen.getByTestId('ai-oneclick-setup-btn')).toBeDisabled();

    await user.selectOptions(screen.getByTestId('ai-custom-llm-select'), 'qwen3-0.6b-q8_0');
    expect(screen.getByTestId('ai-custom-selected-counter')).toHaveTextContent('2/3');
    expect(screen.getByTestId('ai-oneclick-setup-btn')).toBeDisabled();

    await user.selectOptions(
      screen.getByTestId('ai-custom-embed-select'),
      'multilingual-e5-small-q8_0',
    );
    expect(screen.getByTestId('ai-custom-selected-counter')).toHaveTextContent('3/3');
    expect(screen.getByTestId('ai-oneclick-setup-btn')).not.toBeDisabled();

    await user.click(screen.getByTestId('ai-oneclick-setup-btn'));
    expect(onStartSetup).toHaveBeenCalledWith({
      profileId: 'custom',
      customModels: {
        sttModelId: 'whisper-base-q5_1',
        llmModelId: 'qwen3-0.6b-q8_0',
        embedModelId: 'multilingual-e5-small-q8_0',
      },
    });
  });

  it('opens new right-click context menus on Sidebar Smart Views, Kanban Columns, and Eisenhower Matrix Quadrants', async () => {
    const user = userEvent.setup();
    const onSelectView = vi.fn();
    const onQuickAddInView = vi.fn();
    const onQuickCreateInBoard = vi.fn();

    const { unmount } = render(
      <I18nProvider lang="en" onChangeLanguage={vi.fn()}>
        <Sidebar
          activeView={{ type: 'smart', id: 'all' }}
          onSelectView={onSelectView}
          onNewTaskInView={onQuickAddInView}
          categories={SAMPLE_CATEGORIES}
          counts={{
            smart: { all: 1, today: 1, important: 1, completed: 0 },
            categories: { 'cat-1': 1 },
          }}
          dragLocked={false}
          isCollapsed={false}
          onToggleCollapse={vi.fn()}
          searchQuery=""
          onSearchChange={vi.fn()}
          searchInputRef={React.createRef<HTMLInputElement>()}
          onOpenSettings={vi.fn()}
          onCreateCategory={vi.fn().mockResolvedValue(undefined)}
          onUpdateCategory={vi.fn().mockResolvedValue(undefined)}
          onTogglePinCategory={vi.fn().mockResolvedValue(undefined)}
          onDeleteCategory={vi.fn().mockResolvedValue(undefined)}
          onReorderCategories={vi.fn()}
          isOpenMobile={false}
          onCloseMobile={vi.fn()}
        />
      </I18nProvider>,
    );

    const todayBtn = screen.getByRole('button', { name: /Today/i });
    fireEvent.contextMenu(todayBtn, { clientX: 80, clientY: 120 });
    expect(screen.getByTestId('smart-view-context-menu')).toBeInTheDocument();
    await user.click(screen.getByTestId('ctx-item-new-task-in-view'));
    expect(onQuickAddInView).toHaveBeenCalledWith({ type: 'smart', id: 'today' });
    unmount();

    // Kanban column right-click menu
    const categoryMap = new Map(SAMPLE_CATEGORIES.map((c) => [c.id, c]));
    const { unmount: unmountKanban } = render(
      <I18nProvider lang="en" onChangeLanguage={vi.fn()}>
        <KanbanBoardView
          todos={SAMPLE_TODOS}
          categoryMap={categoryMap}
          selectedTodoId={null}
          todayStr="2026-11-27"
          onSelectTodo={vi.fn()}
          onToggleComplete={vi.fn()}
          onToggleImportant={vi.fn()}
          onTogglePin={vi.fn()}
          onUpdateTodo={vi.fn().mockResolvedValue(true)}
          onTodoContextMenu={vi.fn()}
          onQuickCreateInBoard={onQuickCreateInBoard}
        />
      </I18nProvider>,
    );

    fireEvent.contextMenu(screen.getByTestId('kanban-col-high'), { clientX: 200, clientY: 160 });
    expect(screen.getByTestId('kanban-col-context-menu')).toBeInTheDocument();
    await user.click(screen.getByTestId('ctx-item-add-in-column'));
    expect(onQuickCreateInBoard).toHaveBeenCalledWith({ priority: 'high' });
    unmountKanban();

    // Eisenhower Matrix info tooltip + quadrant right-click menu
    render(
      <I18nProvider lang="en" onChangeLanguage={vi.fn()}>
        <EisenhowerMatrixView
          todos={SAMPLE_TODOS}
          categoryMap={categoryMap}
          selectedTodoId={null}
          todayStr="2026-11-27"
          onSelectTodo={vi.fn()}
          onToggleComplete={vi.fn()}
          onToggleImportant={vi.fn()}
          onTogglePin={vi.fn()}
          onUpdateTodo={vi.fn().mockResolvedValue(true)}
          onTodoContextMenu={vi.fn()}
          onQuickCreateInBoard={onQuickCreateInBoard}
        />
      </I18nProvider>,
    );

    expect(screen.getByTestId('matrix-guide-info')).toBeInTheDocument();
    fireEvent.contextMenu(screen.getByTestId('matrix-quadrant-q2'), { clientX: 250, clientY: 180 });
    expect(screen.getByTestId('matrix-quadrant-context-menu')).toBeInTheDocument();
    await user.click(screen.getByTestId('ctx-item-add-in-quadrant'));
    expect(onQuickCreateInBoard).toHaveBeenCalledWith({
      important: true,
      priority: 'high',
      dueDate: '2026-11-28',
    });
  });
});
