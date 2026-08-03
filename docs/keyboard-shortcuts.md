# Keyboard shortcuts

SuperGantt follows **ProjectLibre / Microsoft Project** habits where they map cleanly, plus a few modern conveniences (command palette, zoom).

On macOS, **Ctrl** means **⌘ Command** unless noted.

> Task-row chords (`Insert`, `Delete`, indent, link, …) are **off while typing** in an input, textarea, select, or dialog field — so you can edit dates and notes normally. **Ctrl+K** still works from fields.

---

## File & app

| Shortcut | Action |
|:---------|:-------|
| <kbd>Ctrl</kbd>+<kbd>K</kbd> | Command palette |
| <kbd>Ctrl</kbd>+<kbd>N</kbd> | New blank project |
| <kbd>Ctrl</kbd>+<kbd>O</kbd> | Open file |
| <kbd>Ctrl</kbd>+<kbd>S</kbd> | Save (MSPDI XML) |
| <kbd>Esc</kbd> | Close palette / menus |

---

## Tasks

| Shortcut | Action |
|:---------|:-------|
| <kbd>Insert</kbd> | Add task |
| <kbd>Delete</kbd> | Delete selection |
| <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>→</kbd> | Indent |
| <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>←</kbd> | Outdent |
| <kbd>Ctrl</kbd>+<kbd>F2</kbd> | Link selected tasks (FS chain) |
| <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>F2</kbd> | Unlink selection |
| <kbd>Shift</kbd>+<kbd>F2</kbd> | Task Information |
| <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>F</kbd> | Assign resources |

---

## Gantt zoom

| Shortcut | Action |
|:---------|:-------|
| <kbd>Ctrl</kbd>+<kbd>=</kbd> / <kbd>Ctrl</kbd>+<kbd>+</kbd> | Zoom in |
| <kbd>Ctrl</kbd>+<kbd>-</kbd> | Zoom out |
| <kbd>Ctrl</kbd>+scroll wheel | Zoom in / out (over the chart) |

---

## Dialogs & palette

| Shortcut | Where | Action |
|:---------|:------|:-------|
| <kbd>Enter</kbd> | Task Information / Assign Resources | OK (save & close) |
| <kbd>Shift</kbd>+<kbd>Enter</kbd> | Notes field | New line (does not OK) |
| <kbd>Esc</kbd> | Any dialog | Cancel / close |
| <kbd>↑</kbd> / <kbd>↓</kbd> | Command palette | Move highlight |
| <kbd>Enter</kbd> | Command palette | Run highlighted command |

---

## Tips

- Select a task first for Task Info, Assign, Indent/Outdent, Link/Unlink, and Delete.
- Multi-select with <kbd>Ctrl</kbd>/<kbd>⌘</kbd> or <kbd>Shift</kbd>+click (Gantt grid / bars / timeline row).
- Clicking the **empty part of a Gantt row** (outside the bar) also selects that task.
- Toolbar buttons show the same chords in their tooltips when available.

---

*Source of truth in code: [`src/presentation/projectShortcuts.ts`](../src/presentation/projectShortcuts.ts).*
