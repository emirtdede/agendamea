# Keyboard Shortcuts & Accessibility (`v1.1.0`)

Agendamea supports full keyboard-driven planning and accessible navigation across all views and modals. All global and in-app shortcuts can be customized interactively in **Settings -> Keyboard Shortcuts** (and **Settings -> Local AI & Dictation** for voice dictation). All workspace hotkeys are automatically suppressed while **App PIN / Password Lock** is active.

## Default Shortcuts

| Shortcut               | Action                                                                                                                                                                |
| :--------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Ctrl + Alt + N`       | Global OS Quick Add (opens Agendamea and focuses new task bar)                                                                                                        |
| `Ctrl + Alt + D`       | Global OS Voice Dictation overlay toggle (auto-fallback if reserved by OS; blocked while App Lock is active)                                                          |
| `Ctrl + K` / `Cmd + K` | Open Spotlight Command Palette (search tasks, switch views/tabs, quick-create task, lock app)                                                                         |
| `/`                    | Focus sidebar search input (automatically opens sidebar on narrow viewports)                                                                                          |
| `N`                    | Focus the Quick Add task input bar                                                                                                                                    |
| `Ctrl + ,`             | Open Settings                                                                                                                                                         |
| `Ctrl + +` / `-` / `0` | Increase, decrease, or reset accessibility zoom (`80%` to `150%`)                                                                                                     |
| `1` / `2` / `3` / `4`  | Switch views (List, Kanban, Calendar, Eisenhower Matrix)                                                                                                              |
| `Alt + ArrowUp`        | Move the currently selected task or focused category up within its pin group                                                                                          |
| `Alt + ArrowDown`      | Move the currently selected task or focused category down within its pin group                                                                                        |
| `Escape`               | Close active overlay/popover in priority order: Command Palette -> Settings sub-view -> Settings modal -> Detail panel -> active search query -> active `#tag` filter |

## Reordering Guardrails

- Manual reordering (both pointer drag-and-drop and `Alt + ArrowUp/Down`) respects the **Drag Lock** toggle (`dragLocked`) across List, Kanban, Calendar, Eisenhower Matrix, and Sidebar categories.
- Pinned items stay strictly grouped above unpinned items; keyboard swaps only occur between neighbors in the same pin group.
- When a `#tag` filter or non-manual sort order is active, manual task dragging is disabled to prevent misleading visual jumps.

## Undo & Recovery Accessibility

- Soft-deleting a task or category triggers a **12-second Undo toast** with `role="status"`.
- Hovering over or focusing the Undo toast pauses the auto-dismiss timer until the pointer or focus leaves.
- All interactive controls include localized `aria-label` / `title` attributes, visible focus rings, High Contrast & Reduced Motion support, and RTL layout mirroring for right-to-left locales (`ar`, `fa`, `he`, `ur`).
