# 04 — UI / UX requirements

## 1. Visual language (MUST)

- Modern UI inspired by **Microsoft Project 2026 / Fluent**:
  - Accent blue roughly `#0f6cbd` family (see `src/index.css` tokens).
  - Source Sans / Segoe UI stacks for readable chrome.
  - Surfaces, borders, selection rows consistent across views.
- Avoid generic “AI slop” aesthetics called out in design rules when building new marketing surfaces; inside the app, stay consistent with existing MSP tokens.
- Ribbon height MUST be **stable** across ribbon tabs (no jumping layout when switching File / Task / Resource / Project / View).

## 2. App chrome (MUST)

### 2.1 Branding

- Product name **SuperGantt** visible in title bar / brand mark.
- Application icon MUST be a proper branded mark (Gantt bars + milestone motif on blue rounded tile).
- Icon assets:
  - Web favicon SVG + PNG (`public/favicon.svg`, `public/app-icon.png`).
  - Tauri window / tray icons (`src-tauri/icons/*`).
  - Installer / shortcut ICO with **alpha** (`build/icon.ico`) — corners outside the rounded tile MUST be **transparent**, never opaque black.
  - ICO MUST embed PNG images with alpha (Vista+ style). BMP-only ICOs that paint transparent as black are unacceptable.

### 2.2 Ribbon and toolbar icons

- Beautiful multi-color ribbon glyphs for actions (File/Task/Resource/Project/View).
- Icons sized via CSS variables:
  - `--msp-icon-ribbon`
  - `--msp-icon-ribbon-large`
  - `--msp-icon-view`
  - `--msp-icon-brand`
- Icons SHOULD be large enough to read at a glance (explicit request: make icons larger).
- Brand mark in the title bar uses the app motif (`Icons.app`), not a random view icon.

### 2.3 Quick views

- Strip / chips to switch major views quickly (Gantt, Task Sheet, Network, etc.).

## 3. Required views (MUST — ProjectLibre coverage)

The product MUST expose planning surfaces comparable to ProjectLibre’s feature set, including at least:

| View id | Purpose |
|---------|---------|
| `gantt` | Interactive Gantt (DHTMLX) |
| `tasks` | Task Sheet |
| `resources` | Resource Sheet |
| `network` | Network / PERT diagram |
| `wbs` | Work breakdown structure |
| `rbs` | Resource breakdown |
| `taskUsage` | Task usage |
| `resourceUsage` | Resource usage + histogram |
| `calendar` | Calendars / exceptions / non-working days |
| `reports` | Reports / EV-style summaries |

Missing ProjectLibre capabilities discovered in review (predecessors UI, calendar holiday editing, assignment flows, zoom, milestones diamonds, etc.) are treated as **defects** until closed.

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

- Zoom In / Zoom Out controls present and usable.
- Milestone diamond marks.
- Task name click → Task Information.
- Assign affordance without `--Assign` empty label.
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

### 6.3 Wrap / reverse routing (MUST)

- When a link would go “back” or across the diagram, route on a **floor lane under the diagram**.
- MUST NOT draw a straight diagonal that crosses through unrelated task cards when wrapping at the right edge.

### 6.4 Stability (MUST)

- Measuring / drawing effects MUST NOT depend on fresh `nodes`/`edges` array identities from `toNetworkDiagram()` every render (that caused an infinite `setState` loop and a blank Network view).
- Depend on stable project identity / layout keys; guard setState when geometry unchanged.

## 7. Resource usage histogram (MUST)

- Histogram bar **heights proportional to hours** (load), not equal height for every column.
- Scale against max hours/capacity; overallocations visually distinct (e.g. red).
- CSS must use end alignment / explicit heights so flex stretch cannot equalize bars.

## 8. Loader / busy state (MUST)

- Any plan open (file picker or drag-drop) shows a full-app busy overlay with spinner + filename detail.
- Ribbon Open disabled while busy.
- Drop ignored while busy.
- Status bar shows busy message while active.

## 9. Accessibility / basics (SHOULD)

- Dialogs use `role="dialog"`, labelled tabs, aria-labels on inputs where tested.
- Keyboard: Enter→OK as specified; Escape/close patterns as implemented.

## 10. Localization

- UI currently English (README / chrome). Russian appears in chat only; no i18n requirement unless newly agreed.
