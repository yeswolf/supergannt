# 04 — UI / UX requirements

## 1. Visual language (MUST)

- Flat modern tool aesthetic (no gradients / soft shadows).
- Adaptive shell (not Office ribbon): works on **desktop, web, and phone**.
- **Geist Mono** (OFL) for UI chrome and content — developer/tool typography.
- Touch-first density: `--msp-row-h` / `--msp-control-h` = **44px** everywhere.
- Icon-only actions with `title` / `aria-label` (hover labels); no decorative help blurbs under view titles.
- **Themes** (MUST): switchable color themes via CSS variables (`data-theme` on `<html>`), persisted in `localStorage`. Built-ins: Light, Dark, High Contrast Light/Dark, Darcula (IntelliJ-like), Solarized Light/Dark. Entry points: **Theme** menu (top bar) + command palette (`Theme: …`).
- **Scrollbars** (SHOULD): modern thin thumbs, no classic arrow buttons; themed via `--msp-text-muted` / secondary (see `src/index.css`).

Color tokens live in `src/themes.css`; structural density tokens remain in `src/index.css`.

## 2. App chrome (MUST)

### 2.1 Adaptive shell (`AppChrome`)

- **Top bar:** brand, project name, **Theme** menu, command palette (`Ctrl/Cmd+K`).
- **No File menu.** File actions (blank / sample / open / save XML·MPP·MPX / export PDF) are **command-palette only**.
- **Views rail (wide):** flat list of all destinations (`role="navigation"` name `Views`).
- **Bottom tabs (narrow):** primary destinations + More sheet for the rest.
- **No separate global action row.** Each view has one title row (`ViewHeader`): screen name + tools on the same line (view-specific controls + selection-aware edit actions from `useWorkspaceActions`). Gantt scale/filters live there too — not a second toolbar.
- On narrow viewports: status sits **above** bottom tabs; Theme / More use bottom sheets with scrim when needed; safe-area insets on final chrome.
- Title-bar menus MUST NOT be clipped by `overflow: hidden` on the shell/title bar (dropdowns paint over main).

### 2.2 Branding

- Product name **SuperGantt** visible in the top bar.
- Application icon MUST be a proper branded mark.
- Icon assets:
  - Web favicon SVG + PNG (`public/favicon.svg`, `public/app-icon.png`).
  - Tauri window / tray icons (`src-tauri/icons/*`).
  - Installer / shortcut ICO with **alpha** (`build/icon.ico`).

### 2.3 Views

- Rail (wide): Gantt, Task Sheet, Resource Sheet, Network, WBS, RBS, Task Usage, Resource Usage, Calendar, Resource Calendar, Reports.
- Mobile More sheet: destinations beyond the four primary tabs.

## 3. Required views (MUST — ProjectLibre coverage)

| View id | Purpose |
|---------|---------|
| `gantt` | Interactive Gantt (DHTMLX CE) |
| `tasks` | Task Sheet |
| `resources` | Resource Sheet |
| `network` | Network / PERT diagram |
| `wbs` | Work breakdown structure |
| `rbs` | Resource breakdown |
| `taskUsage` | Task usage |
| `resourceUsage` | Resource usage + histogram |
| `calendar` | Project calendars / exceptions / working time |
| `resourceCalendar` | Per-resource calendars (month/year) |
| `reports` | Reports / EV-style summaries |

Missing ProjectLibre capabilities discovered in review are treated as **defects** until closed.

## 4. Task Information dialog (MUST)

Tabs: **General**, **Predecessors**, **Resources**, **Advanced**.

### 4.1 General

- Name, duration (hours), start, finish, percent complete, notes.
- Duration edits MUST persist on OK.

### 4.2 Predecessors

- Add/remove predecessors with type FS/SS/FF/SF and lag hours.
- Empty predecessor rows MUST NOT create invalid links (filter empty ids).

### 4.3 Resources

- Assign resources and units (ProjectLibre Resources tab behavior).

### 4.4 Advanced

- Constraint type + constraint date.

### 4.5 OK / Enter behavior (MUST)

- **OK** applies **all tabs** (ProjectLibre-like), not only the visible tab.
- **Enter** in any non-textarea, non-button field performs the same as OK (also Assign Resources dialog).
- Textarea Notes: Enter inserts newline.
- **Apply order (invariant):**
  1. Advanced  
  2. Resources  
  3. General  
  4. Predecessors **last**  
  Rationale: resources must not wipe duration; predecessors must clear soft pins after Advanced and drive FS shift last. See [07-bugfixes-and-regressions.md](./07-bugfixes-and-regressions.md).

### 4.6 Close

- Backdrop click / × closes; OK closes after apply.

## 5. Gantt view (MUST)

- Timescale presets + task filters in the **ViewHeader** (not a second toolbar).
- On **narrow viewports (≤820px)** the left task grid/tree is **hidden by default** and toggled via a **Show/Hide task list** control in the ViewHeader — timeline keeps the full width for touch pan/scroll.
- Row height touch-friendly (**44px**); task bars ~**34px**; milestones stay small diamonds (never `bar_height: full` without clamping).
- Touch: `touch: force`, longer `touch_drag`, timeline pan helper, and `order_branch` off on narrow so swipes scroll instead of reordering.
- Grid / tree cells have readable left padding; bar labels have horizontal inset.
- Theme remaps dhtmlx CSS variables (`--dhx-gantt-*` → `--msp-*`) so borders, text, summary bars, and row backgrounds follow the active theme.
- CE build: column resize via custom drag on header edges (`ganttColumnResize`) — PRO `columns[].resize` is unavailable.
- Milestone diamond marks (GPL `getTaskType` stub patched).
- Task name / dbl-click → Task Information.
- Assign affordance without empty `--Assign` label.
- Drag/link behaviors feed workspace actions that reschedule immediately.

## 6. Network Diagram (MUST)

### 6.1 Content

- PERT-style dependency graph of non-summary tasks.
- Critical path highlighting.
- Dependency arrows with visible **arrowheads** (polygon heads acceptable; SVG markers optional).
- Link type labels (FS/SS/…).

### 6.2 Layout (MUST)

- Nodes laid out by **dependency layers** (successors to the right of predecessors), not a naive `sqrt` CSS grid that forces wrap-around chords.
- Edges are **orthogonal** (horizontal/vertical elbows).
- **Viewport column wrap (MUST):** when layers exceed columns that fit the diagram width (`networkColumnsThatFit` / `placeNetworkBoxes`), continue on a **new band below** — never one infinite horizontal row. ResizeObserver updates column count.

### 6.3 Wrap / reverse routing (MUST)

- When a link would go “back” or across bands, route on a **floor lane under the diagram**.
- MUST NOT draw a straight diagonal that crosses through unrelated task cards when wrapping at the right edge.

### 6.4 Stability (MUST)

- Measuring / drawing effects MUST NOT depend on fresh `nodes`/`edges` array identities from `toNetworkDiagram()` every render (that caused an infinite `setState` loop and a blank Network view).
- Depend on stable project identity / layout keys; guard setState when geometry unchanged.

## 7. Tables / sheets (MUST)

- HTML data tables (Task Sheet, Resources, Usage, assignments editors) support **column resize** (`useResizableColumns`) with defaults that fit content.
- Wide tables MUST NOT blow the CSS grid (`min-width: 0` / `minmax(0, 1fr)` on main).

## 8. Resource usage histogram (MUST)

- Histogram bar **heights proportional to hours** (load), not equal height for every column.
- Scale against max hours/capacity; overallocations visually distinct (e.g. red).
- CSS must use end alignment / explicit heights so flex stretch cannot equalize bars.

## 9. Loader / busy state (MUST)

- Any plan open (file picker or drag-drop) shows a full-app busy overlay with spinner + filename detail.
- Open via palette / picker disabled while busy.
- Drop ignored while busy.
- Status bar shows busy message while active.

## 10. Sample plan (MUST)

- **Load sample plan** (palette) returns a scheduled project: `refreshProject`, FS chain, resource assignments with work hours — not a flat same-day draft with `finish === start`.

## 11. Accessibility / basics (SHOULD)

- Dialogs use `role="dialog"`, labelled tabs, aria-labels on inputs where tested.
- Keyboard: Enter→OK as specified; Escape/close patterns as implemented; `Ctrl/Cmd+K` opens palette.

## 12. Localization

- UI currently English (README / chrome). Russian appears in chat only; no i18n requirement unless newly agreed.
