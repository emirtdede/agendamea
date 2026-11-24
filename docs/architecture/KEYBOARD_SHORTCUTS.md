# Keyboard Shortcuts & Accessibility (`v1.1.0`)

Agendamea supports full keyboard-driven planning and accessible navigation across all views and modals. All global and in-app shortcuts can be customized interactively in **Settings > General & Language** (and **Settings > AI & Dictation** for voice dictation).

## Default Shortcuts

| Shortcut                     | Action                                                                                                                                                                              |
| :--------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Ctrl + Alt + N`             | Global OS Quick Add (opens Agendamea and focuses new task bar)                                                                                                                      |
| `Ctrl + Alt + Space`         | Global OS Voice Dictation overlay toggle                                                                                                                                            |
| `Ctrl + K` / `Cmd + K` / `/` | Focus sidebar search input (automatically opens sidebar on narrow viewports)                                                                                                        |
| `N`                          | Focus the Quick Add task input bar                                                                                                                                                  |
| `Ctrl + ,`                   | Open Settings                                                                                                                                                                       |
| `1` / `2` / `3` / `4`        | Switch views (List, Kanban, Calendar, Eisenhower Matrix)                                                                                                                            |
| `Alt + ArrowUp`              | Move the currently selected task or focused category up within its pin group                                                                                                        |
| `Alt + ArrowDown`            | Move the currently selected task or focused category down within its pin group                                                                                                      |
| `Escape`                     | Close active overlay/popover in priority order: Settings sub-view -> Settings modal -> Detail panel -> active `#tag` filter -> active search query -> inline category edit/add form |

## Reordering Guardrails

- Manual reordering (both pointer drag-and-drop and `Alt + ArrowUp/Down`) respects the **Drag Lock** toggle (`dragLocked`) across List, Kanban, Calendar, Eisenhower Matrix, and Sidebar categories.
- Pinned items stay strictly grouped above unpinned items; keyboard swaps only occur between neighbors in the same pin group.
- When a `#tag` filter or non-manual sort order is active, manual task dragging is disabled to prevent misleading visual jumps.

## Undo & Recovery Accessibility

- Soft-deleting a task or category triggers a **12-second Undo toast** with `role="status"`.
- Hovering over or focusing the Undo toast pauses the auto-dismiss timer until the pointer or focus leaves.
- All interactive controls include localized `aria-label` / `title` attributes, visible focus rings, and RTL layout mirroring for right-to-left locales (`ar`, `fa`, `he`, `ur`).
