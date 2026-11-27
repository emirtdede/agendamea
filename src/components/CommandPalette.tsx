import {
  Bell,
  BookOpen,
  Calendar,
  Check,
  CheckCircle2,
  Circle,
  Cloud,
  Columns3,
  Folder,
  Grid2x2,
  HelpCircle,
  Inbox,
  Keyboard,
  List,
  Lock,
  Mic,
  Monitor,
  Moon,
  Palette,
  PanelLeft,
  Plus,
  Search,
  Settings,
  Shield,
  SlidersHorizontal,
  Sparkles,
  Star,
  Sun,
  Trash2,
  ZoomIn,
} from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../i18n/I18nContext';
import { preferencesStore, usePreferencesSelector } from '../store/preferencesStore';
import { shortcutStore } from '../store/shortcutStore';
import type {
  ActiveView,
  Category,
  LayoutMode,
  SettingsTabId,
  ThemeId,
  ThemeMode,
  Todo,
} from '../types';
import { formatShortcutDisplay } from '../utils/shortcuts';
import { COLOR_THEMES } from '../utils/themes';

type CommandGroupKey = 'actions' | 'records' | 'navigation' | 'themes';

interface CommandItem {
  id: string;
  group: CommandGroupKey;
  title: string;
  subtitle?: string;
  keywords: string;
  badge?: string;
  icon: React.ReactNode;
  onSelect: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  todos: Todo[];
  categories: Category[];
  counts: {
    smart: Record<'all' | 'today' | 'important' | 'completed', number>;
    categories: Record<string, number>;
  };
  onNewTask: () => void;
  onStartDictation: () => void;
  onSelectView: (view: ActiveView) => void;
  onSelectLayout: (mode: LayoutMode) => void;
  onSelectTodo: (todo: Todo) => void;
  onOpenSettings: (tab: SettingsTabId) => void;
  onOpenWelcomeWizard: () => void;
  appLockEnabled?: boolean;
  onLockAppNow?: () => void;
}

const CLOSE_ANIMATION_MS = 110;

function foldLocaleSearchText(raw: string): string {
  return raw
    .replace(/\u0130/g, 'i')
    .replace(/I/g, 'i')
    .replace(/\u0131/g, 'i')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u011f/g, 'g')
    .replace(/\u00fc/g, 'u')
    .replace(/\u015f/g, 's')
    .replace(/\u00f6/g, 'o')
    .replace(/\u00e7/g, 'c')
    .trim();
}

function matchesCommandQuery(haystackFolded: string, tokens: string[]): boolean {
  if (tokens.length === 0) return true;
  for (const tok of tokens) {
    if (!haystackFolded.includes(tok)) return false;
  }
  return true;
}

export function CommandPalette({
  open,
  onClose,
  todos,
  categories,
  counts,
  onNewTask,
  onStartDictation,
  onSelectView,
  onSelectLayout,
  onSelectTodo,
  onOpenSettings,
  onOpenWelcomeWizard,
  appLockEnabled = false,
  onLockAppNow,
}: CommandPaletteProps) {
  const { t } = useI18n();
  const prefs = usePreferencesSelector((s) => ({
    themeMode: s.themeMode,
    themeId: s.themeId,
    sidebarCollapsed: s.sidebarCollapsed,
  }));

  const [mounted, setMounted] = useState(open);
  const [isClosing, setIsClosing] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const closeTimerRef = useRef<number | null>(null);
  const isClosingRef = useRef(false);

  useEffect(() => {
    if (open) {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
      isClosingRef.current = false;
      setMounted(true);
      setIsClosing(false);
      setQuery('');
      setActiveIndex(0);
      const raf = window.requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
      return () => window.cancelAnimationFrame(raf);
    }
    if (mounted && !isClosingRef.current) {
      isClosingRef.current = true;
      setIsClosing(true);
      closeTimerRef.current = window.setTimeout(() => {
        closeTimerRef.current = null;
        isClosingRef.current = false;
        setIsClosing(false);
        setMounted(false);
      }, CLOSE_ANIMATION_MS);
    }
  }, [open, mounted]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  const requestClose = useCallback(() => {
    if (isClosingRef.current) return;
    isClosingRef.current = true;
    setIsClosing(true);
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null;
      isClosingRef.current = false;
      setIsClosing(false);
      setMounted(false);
      onClose();
    }, CLOSE_ANIMATION_MS);
  }, [onClose]);

  const runAndClose = useCallback(
    (action: () => void) => {
      requestClose();
      window.setTimeout(() => {
        action();
      }, 25);
    },
    [requestClose],
  );

  const categoryById = useMemo(() => new Map(categories.map((cat) => [cat.id, cat])), [categories]);

  const shortcuts = shortcutStore.getState().customShortcuts;

  const allItems = useMemo<CommandItem[]>(() => {
    // Skip rebuilding command & todo index completely while palette is closed
    if (!open && !mounted) return [];
    const isDarkEffective =
      prefs.themeMode === 'dark' ||
      (prefs.themeMode === 'system' &&
        typeof window !== 'undefined' &&
        window.matchMedia?.('(prefers-color-scheme: dark)').matches);

    const actions: CommandItem[] = [
      {
        id: 'act-new-task',
        group: 'actions',
        title: t.cmdPaletteActionNewTask,
        subtitle: t.addTaskPlaceholder,
        keywords: 'new task add create gorev ekle yeni olustur',
        badge: formatShortcutDisplay(shortcuts.newTask || 'N'),
        icon: <Plus className="h-[15px] w-[15px]" />,
        onSelect: () => onNewTask(),
      },
      {
        id: 'act-dictate',
        group: 'actions',
        title: t.cmdPaletteActionDictate,
        subtitle: t.settingsTabAi,
        keywords: 'voice dictate mic speech ai sesli dikte mikrofon konus yapay zeka',
        badge: formatShortcutDisplay(shortcutStore.getState().voiceShortcut || 'Ctrl+Alt+Space'),
        icon: <Mic className="h-[15px] w-[15px]" />,
        onSelect: () => onStartDictation(),
      },
      {
        id: 'act-toggle-sidebar',
        group: 'actions',
        title: t.cmdPaletteActionToggleSidebar,
        subtitle: prefs.sidebarCollapsed ? t.expandSidebar : t.collapseSidebar,
        keywords: 'sidebar minimal collapse expand menu kenar daralt genislet',
        icon: <PanelLeft className="h-[15px] w-[15px]" />,
        onSelect: () => preferencesStore.toggleSidebarCollapsed(),
      },
      {
        id: 'act-toggle-theme',
        group: 'actions',
        title: t.cmdPaletteActionToggleTheme,
        subtitle: isDarkEffective ? t.lightMode : t.darkMode,
        keywords: 'dark light mode theme toggle koyu aydinlik acik gece gunduz tema',
        icon: isDarkEffective ? (
          <Sun className="h-[15px] w-[15px]" />
        ) : (
          <Moon className="h-[15px] w-[15px]" />
        ),
        onSelect: () => preferencesStore.setThemeMode(isDarkEffective ? 'light' : 'dark'),
      },
      {
        id: 'act-welcome-wizard',
        group: 'actions',
        title: t.welcomeReplayButton,
        subtitle: t.settingsNavGroupSystem,
        keywords: 'welcome wizard onboarding setup karsilama baslangic kurulum sihirbaz',
        icon: <Sparkles className="h-[15px] w-[15px]" />,
        onSelect: () => onOpenWelcomeWizard(),
      },
      {
        id: 'act-open-settings',
        group: 'actions',
        title: t.settings,
        subtitle: t.settingsTabAppearance,
        keywords: 'settings preferences config ayarlar tercihler',
        badge: formatShortcutDisplay(shortcuts.openSettings || 'Ctrl+,'),
        icon: <Settings className="h-[15px] w-[15px]" />,
        onSelect: () => onOpenSettings('appearance'),
      },
      ...(appLockEnabled && onLockAppNow
        ? [
            {
              id: 'act-lock-app',
              group: 'actions' as const,
              title: t.appLockCommandTitle,
              subtitle: t.appLockTitle,
              keywords: 'lock pin password security kilit sifre parola guvenlik',
              badge: formatShortcutDisplay('Ctrl+Shift+L'),
              icon: <Lock className="h-[15px] w-[15px]" />,
              onSelect: () => onLockAppNow(),
            },
          ]
        : []),
    ];

    const records: CommandItem[] = todos.map((todo) => {
      const cat = todo.categoryId ? categoryById.get(todo.categoryId) : undefined;
      const subParts: string[] = [];
      if (cat) subParts.push(cat.name);
      if (todo.dueDate)
        subParts.push(todo.dueTime ? `${todo.dueDate} ${todo.dueTime}` : todo.dueDate);
      if (todo.tags && todo.tags.length > 0)
        subParts.push(todo.tags.map((tg) => `#${tg}`).join(' '));
      return {
        id: `todo-${todo.id}`,
        group: 'records',
        title: todo.title,
        subtitle: subParts.join(' · ') || undefined,
        keywords: `${todo.title} ${todo.notes} ${cat?.name ?? ''} ${(todo.tags ?? []).join(' ')}`,
        badge: todo.completed
          ? t.completed
          : todo.priority === 'high'
            ? t.priorityHigh
            : todo.important
              ? t.important
              : undefined,
        icon: todo.completed ? (
          <CheckCircle2 className="h-[15px] w-[15px]" />
        ) : (
          <Circle className="h-[15px] w-[15px]" />
        ),
        onSelect: () => onSelectTodo(todo),
      };
    });

    const navigation: CommandItem[] = [
      {
        id: 'nav-all',
        group: 'navigation',
        title: t.allTasks,
        keywords: 'all tasks inbox tum gorevler',
        badge: String(counts.smart.all),
        icon: <Inbox className="h-[15px] w-[15px] text-[var(--text-muted)]" />,
        onSelect: () => onSelectView({ type: 'smart', id: 'all' }),
      },
      {
        id: 'nav-today',
        group: 'navigation',
        title: t.today,
        keywords: 'today daily bugun gunluk',
        badge: String(counts.smart.today),
        icon: <Sun className="h-[15px] w-[15px] text-[var(--text-muted)]" />,
        onSelect: () => onSelectView({ type: 'smart', id: 'today' }),
      },
      {
        id: 'nav-important',
        group: 'navigation',
        title: t.important,
        keywords: 'important star starred onemli yildiz',
        badge: String(counts.smart.important),
        icon: <Star className="h-[15px] w-[15px] text-[var(--text-muted)]" />,
        onSelect: () => onSelectView({ type: 'smart', id: 'important' }),
      },
      {
        id: 'nav-completed',
        group: 'navigation',
        title: t.completed,
        keywords: 'completed done finished tamamlanan biten',
        badge: String(counts.smart.completed),
        icon: <CheckCircle2 className="h-[15px] w-[15px] text-[var(--text-muted)]" />,
        onSelect: () => onSelectView({ type: 'smart', id: 'completed' }),
      },
      ...categories.map((cat) => ({
        id: `nav-cat-${cat.id}`,
        group: 'navigation' as const,
        title: cat.name,
        subtitle: t.categories,
        keywords: `category list kategori liste ${cat.name}`,
        badge: String(counts.categories[cat.id] ?? 0),
        icon: <Folder className="h-[15px] w-[15px]" />,
        onSelect: () => onSelectView({ type: 'category', id: cat.id }),
      })),
      {
        id: 'nav-layout-list',
        group: 'navigation',
        title: t.viewList,
        keywords: 'layout list view liste gorunum',
        badge: formatShortcutDisplay(shortcuts.viewList || '1'),
        icon: <List className="h-[15px] w-[15px] text-[var(--text-muted)]" />,
        onSelect: () => onSelectLayout('list'),
      },
      {
        id: 'nav-layout-kanban',
        group: 'navigation',
        title: t.viewKanban,
        keywords: 'layout kanban board pano gorunum',
        badge: formatShortcutDisplay(shortcuts.viewKanban || '2'),
        icon: <Columns3 className="h-[15px] w-[15px] text-[var(--text-muted)]" />,
        onSelect: () => onSelectLayout('kanban'),
      },
      {
        id: 'nav-layout-calendar',
        group: 'navigation',
        title: t.viewCalendar,
        keywords: 'layout calendar planner takvim gorunum',
        badge: formatShortcutDisplay(shortcuts.viewCalendar || '3'),
        icon: <Calendar className="h-[15px] w-[15px] text-[var(--text-muted)]" />,
        onSelect: () => onSelectLayout('calendar'),
      },
      {
        id: 'nav-layout-matrix',
        group: 'navigation',
        title: t.viewMatrix,
        keywords: 'layout matrix eisenhower matris gorunum',
        badge: formatShortcutDisplay(shortcuts.viewMatrix || '4'),
        icon: <Grid2x2 className="h-[15px] w-[15px] text-[var(--text-muted)]" />,
        onSelect: () => onSelectLayout('matrix'),
      },
      {
        id: 'nav-settings-ai',
        group: 'navigation',
        title: t.settingsTabAi,
        subtitle: t.settings,
        keywords: 'ai voice dictation whisper llm model setup yapay zeka dikte kurulum',
        icon: <Mic className="h-[15px] w-[15px] text-[var(--text-muted)]" />,
        onSelect: () => onOpenSettings('ai'),
      },
      {
        id: 'nav-settings-guide',
        group: 'navigation',
        title: t.settingsTabUserGuide,
        subtitle: t.settingsNavGroupSystem,
        keywords: 'guide manual help docs kullanim kilavuzu rehber yardim',
        icon: <HelpCircle className="h-[15px] w-[15px] text-[var(--text-muted)]" />,
        onSelect: () => onOpenSettings('guide'),
      },
      {
        id: 'nav-settings-general',
        group: 'navigation',
        title: t.settingsTabGeneral,
        subtitle: t.settings,
        keywords: 'general language dil genel ayarlar',
        icon: <SlidersHorizontal className="h-[15px] w-[15px] text-[var(--text-muted)]" />,
        onSelect: () => onOpenSettings('general'),
      },
      {
        id: 'nav-settings-notifications',
        group: 'navigation',
        title: t.settingsTabNotifications,
        subtitle: t.settings,
        keywords: 'notifications reminders bildirim hatirlatma',
        icon: <Bell className="h-[15px] w-[15px] text-[var(--text-muted)]" />,
        onSelect: () => onOpenSettings('notifications'),
      },
      {
        id: 'nav-settings-shortcuts',
        group: 'navigation',
        title: t.keyboardShortcutsTitle,
        subtitle: t.settings,
        keywords: 'shortcuts hotkeys klavye kisayollar',
        icon: <Keyboard className="h-[15px] w-[15px] text-[var(--text-muted)]" />,
        onSelect: () => onOpenSettings('shortcuts'),
      },
      {
        id: 'nav-settings-accessibility',
        group: 'navigation',
        title: t.accessibilitySectionTitle,
        subtitle: t.settings,
        keywords: 'accessibility zoom contrast erisilebilirlik yakinlastirma kontrast',
        icon: <ZoomIn className="h-[15px] w-[15px] text-[var(--text-muted)]" />,
        onSelect: () => onOpenSettings('accessibility'),
      },
      {
        id: 'nav-settings-data',
        group: 'navigation',
        title: t.dataAndBackupTitle,
        subtitle: t.settings,
        keywords: 'backup cloud sync export import veri yedekleme bulut',
        icon: <Cloud className="h-[15px] w-[15px] text-[var(--text-muted)]" />,
        onSelect: () => onOpenSettings('data'),
      },
      {
        id: 'nav-settings-trash',
        group: 'navigation',
        title: t.tabTrash,
        subtitle: t.settings,
        keywords: 'trash deleted restore cop kutusu silinenler',
        icon: <Trash2 className="h-[15px] w-[15px] text-[var(--text-muted)]" />,
        onSelect: () => onOpenSettings('trash'),
      },
      {
        id: 'nav-settings-docs',
        group: 'navigation',
        title: t.settingsTabAutomation,
        subtitle: t.settingsNavGroupSystem,
        keywords: 'automation cli mcp webhooks api otomasyon gelistirici',
        icon: <BookOpen className="h-[15px] w-[15px] text-[var(--text-muted)]" />,
        onSelect: () => onOpenSettings('docs'),
      },
      {
        id: 'nav-settings-about',
        group: 'navigation',
        title: t.settingsTabAbout,
        subtitle: t.settingsNavGroupSystem,
        keywords: 'about updates legal privacy license hakkinda guncelleme yasal gizlilik',
        icon: <Shield className="h-[15px] w-[15px] text-[var(--text-muted)]" />,
        onSelect: () => onOpenSettings('about'),
      },
    ];

    const modeItems: Array<{ mode: ThemeMode; label: string; kw: string; icon: React.ReactNode }> =
      [
        {
          mode: 'light',
          label: t.lightMode,
          kw: 'light theme mode acik aydinlik tema mod',
          icon: <Sun className="h-[15px] w-[15px]" />,
        },
        {
          mode: 'dark',
          label: t.darkMode,
          kw: 'dark theme mode koyu karanlik gece tema mod',
          icon: <Moon className="h-[15px] w-[15px]" />,
        },
        {
          mode: 'system',
          label: t.systemMode,
          kw: 'system auto theme mode sistem otomatik tema mod',
          icon: <Monitor className="h-[15px] w-[15px]" />,
        },
      ];

    const themes: CommandItem[] = [
      ...modeItems.map((m) => ({
        id: `theme-mode-${m.mode}`,
        group: 'themes' as const,
        title: m.label,
        subtitle: t.appearanceModeTitle,
        keywords: m.kw,
        badge: prefs.themeMode === m.mode ? t.cmdPaletteActiveBadge : undefined,
        icon: m.icon,
        onSelect: () => preferencesStore.setThemeMode(m.mode),
      })),
      ...COLOR_THEMES.map((theme) => {
        const isCurrent = prefs.themeId === theme.id;
        return {
          id: `theme-color-${theme.id}`,
          group: 'themes' as const,
          title: theme.name,
          subtitle: t.colorThemeTitle,
          keywords: `theme color palette renk tema ${theme.id} ${theme.name}`,
          badge: isCurrent ? t.cmdPaletteActiveBadge : undefined,
          icon: isCurrent ? (
            <Check className="h-[15px] w-[15px]" />
          ) : (
            <Palette className="h-[15px] w-[15px]" />
          ),
          onSelect: () => preferencesStore.setThemeId(theme.id as ThemeId),
        };
      }),
      {
        id: 'theme-appearance-page',
        group: 'themes',
        title: t.settingsTabAppearance,
        subtitle: t.settings,
        keywords: 'appearance font density icon gorunum yazi tipi yogunluk',
        icon: <Palette className="h-[15px] w-[15px] text-[var(--text-muted)]" />,
        onSelect: () => onOpenSettings('appearance'),
      },
    ];

    return [...actions, ...records, ...navigation, ...themes];
  }, [
    categories,
    categoryById,
    counts.categories,
    counts.smart.all,
    counts.smart.completed,
    counts.smart.important,
    counts.smart.today,
    mounted,
    appLockEnabled,
    onLockAppNow,
    onNewTask,
    onOpenSettings,
    onOpenWelcomeWizard,
    onSelectLayout,
    onSelectTodo,
    onSelectView,
    onStartDictation,
    open,
    prefs.sidebarCollapsed,
    prefs.themeId,
    prefs.themeMode,
    shortcuts.newTask,
    shortcuts.openSettings,
    shortcuts.viewCalendar,
    shortcuts.viewKanban,
    shortcuts.viewList,
    shortcuts.viewMatrix,
    t,
    todos,
  ]);

  const { groupedSections, flatItems } = useMemo(() => {
    const folded = foldLocaleSearchText(query);
    const tokens = folded ? folded.split(/\s+/).filter(Boolean) : [];
    const hasQuery = tokens.length > 0;

    const filtered = hasQuery
      ? allItems.filter((item) => {
          const hay = foldLocaleSearchText(`${item.title} ${item.subtitle ?? ''} ${item.keywords}`);
          return matchesCommandQuery(hay, tokens);
        })
      : allItems;

    const groupMeta: Array<{ key: CommandGroupKey; label: string; limit: number }> = [
      { key: 'actions', label: t.cmdPaletteGroupActions, limit: hasQuery ? 12 : 6 },
      { key: 'records', label: t.cmdPaletteGroupRecords, limit: hasQuery ? 20 : 6 },
      { key: 'navigation', label: t.cmdPaletteGroupNavigation, limit: hasQuery ? 18 : 10 },
      { key: 'themes', label: t.cmdPaletteGroupThemes, limit: hasQuery ? 20 : 6 },
    ];

    const sections: Array<{ key: CommandGroupKey; label: string; items: CommandItem[] }> = [];
    const flat: CommandItem[] = [];

    for (const meta of groupMeta) {
      const bucket = filtered.filter((item) => item.group === meta.key).slice(0, meta.limit);
      if (bucket.length > 0) {
        sections.push({ key: meta.key, label: meta.label, items: bucket });
        for (const item of bucket) flat.push(item);
      }
    }

    return { groupedSections: sections, flatItems: flat };
  }, [
    allItems,
    query,
    t.cmdPaletteGroupActions,
    t.cmdPaletteGroupNavigation,
    t.cmdPaletteGroupRecords,
    t.cmdPaletteGroupThemes,
  ]);

  // Keep activeIndex in bounds whenever filtered results change
  useEffect(() => {
    setActiveIndex((prev) => {
      if (flatItems.length === 0) return 0;
      return prev >= flatItems.length ? 0 : prev;
    });
  }, [flatItems.length]);

  // Ensure active row scrolls smoothly into view on keyboard navigation
  useEffect(() => {
    const node = itemRefs.current[activeIndex];
    if (node && typeof node.scrollIntoView === 'function') {
      node.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIndex]);

  useEffect(() => {
    if (!mounted) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        requestClose();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        e.stopPropagation();
        requestClose();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (flatItems.length === 0) return;
        setActiveIndex((prev) => (prev + 1) % flatItems.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (flatItems.length === 0) return;
        setActiveIndex((prev) => (prev - 1 + flatItems.length) % flatItems.length);
        return;
      }
      if (e.key === 'Enter') {
        if (flatItems.length === 0) return;
        const selected = flatItems[activeIndex];
        if (selected) {
          e.preventDefault();
          runAndClose(selected.onSelect);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [mounted, flatItems, activeIndex, requestClose, runAndClose]);

  if (!mounted) return null;

  let runningIndex = 0;
  const activeOptionId = flatItems[activeIndex]
    ? `cmd-palette-option-${flatItems[activeIndex].id}`
    : undefined;

  return (
    <div className="fixed inset-0 z-[75] flex items-start justify-center px-4 pt-[12vh]">
      <button
        type="button"
        tabIndex={-1}
        aria-label={t.closeMenu}
        data-testid="command-palette-backdrop"
        onClick={requestClose}
        className={`fixed inset-0 border-0 bg-black/50 backdrop-blur-[2px] ${
          isClosing ? 'animate-cmd-backdrop-out' : 'animate-cmd-backdrop-in'
        }`}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t.cmdPaletteAriaLabel}
        data-testid="command-palette"
        className={`relative z-10 flex w-full max-w-[560px] max-h-[70vh] flex-col overflow-hidden rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] text-[var(--text-primary)] shadow-2xl ${
          isClosing ? 'animate-cmd-panel-out' : 'animate-cmd-panel-in'
        }`}
      >
        {/* 1. Top Search Bar (h-12, thin bottom border) */}
        <div className="flex h-12 shrink-0 items-center gap-2.5 border-b border-[var(--border)] px-3.5">
          <Search aria-hidden="true" className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            data-testid="command-palette-input"
            role="combobox"
            aria-expanded="true"
            aria-controls="command-palette-listbox"
            aria-activedescendant={activeOptionId}
            aria-label={t.cmdPalettePlaceholder}
            placeholder={t.cmdPalettePlaceholder}
            autoComplete="off"
            spellCheck={false}
            className="flex-1 min-w-0 border-0 bg-transparent text-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:outline-none focus:ring-0"
          />
          <button
            type="button"
            onClick={requestClose}
            aria-label={t.closeMenu}
            className="shrink-0 rounded-md border border-[var(--border)] bg-[var(--canvas)] px-1.5 py-0.5 font-mono-tabular text-[11px] text-[var(--text-muted)] ag-hover-card-glow"
          >
            Esc
          </button>
        </div>

        {/* 2. Scrollable Results List (p-2, overflow-y-auto) */}
        <div
          id="command-palette-listbox"
          role="listbox"
          aria-label={t.cmdPaletteAriaLabel}
          className="flex-1 min-h-0 overflow-y-auto p-2"
        >
          {groupedSections.length === 0 ? (
            <div
              data-testid="command-palette-empty"
              className="flex flex-col items-center justify-center py-10 text-center"
            >
              <p className="text-[13.5px] font-medium text-[var(--text-muted)]">
                {t.cmdPaletteNoResults}
              </p>
            </div>
          ) : (
            <div className="space-y-1.5 min-w-0">
              {groupedSections.map((section) => (
                <fieldset
                  key={section.key}
                  aria-label={section.label}
                  className="m-0 min-w-0 w-full border-0 p-0"
                >
                  <div className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                    {section.label}
                  </div>
                  <div className="space-y-0.5 min-w-0">
                    {section.items.map((item) => {
                      const idx = runningIndex;
                      runningIndex += 1;
                      const isActive = idx === activeIndex;
                      return (
                        <button
                          key={item.id}
                          id={`cmd-palette-option-${item.id}`}
                          ref={(el) => {
                            itemRefs.current[idx] = el;
                          }}
                          type="button"
                          role="option"
                          aria-selected={isActive}
                          data-testid={`cmd-option-${item.id}`}
                          data-active={isActive ? 'true' : 'false'}
                          onMouseEnter={() => setActiveIndex(idx)}
                          onClick={() => runAndClose(item.onSelect)}
                          className={`flex w-full min-w-0 items-center justify-between gap-2.5 rounded-lg px-3 py-2 text-start transition-colors duration-100 ${
                            isActive
                              ? 'bg-[var(--surface-hover)] text-[var(--text-primary)]'
                              : 'text-[var(--text-secondary)]'
                          }`}
                        >
                          <span className="flex min-w-0 flex-1 items-center gap-2.5 overflow-hidden">
                            <span
                              className={`flex h-[15px] w-[15px] shrink-0 items-center justify-center transition-colors ${
                                isActive ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'
                              }`}
                            >
                              {item.icon}
                            </span>
                            <span className="shrink-0 max-w-[62%] truncate text-[13.5px] font-medium text-[var(--text-primary)]">
                              {item.title}
                            </span>
                            {item.subtitle && (
                              <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--text-muted)]">
                                {item.subtitle}
                              </span>
                            )}
                          </span>
                          {item.badge && (
                            <span className="shrink-0 whitespace-nowrap rounded border border-[var(--border)] bg-[var(--canvas)] px-1.5 py-0.5 font-mono-tabular text-[11px] text-[var(--text-muted)]">
                              {item.badge}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
              ))}
            </div>
          )}
        </div>

        {/* 3. Footer Hint Bar (border-t, 11.5px) */}
        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-[var(--border)] bg-[var(--surface-subtle)]/55 px-3.5 py-2 text-[11.5px] text-[var(--text-muted)]">
          <span className="truncate">{t.cmdPaletteFooterHint}</span>
          <span
            data-testid="command-palette-count"
            className="shrink-0 font-mono-tabular tabular-nums"
          >
            {flatItems.length} {t.cmdPaletteResultsCount}
          </span>
        </div>
      </div>
    </div>
  );
}
