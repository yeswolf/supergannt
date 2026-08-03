# 06 — Testing and verification

## 1. Standing order (MUST)

From product owner:

> Always check **(a) tests** and **(b) build** before packaging or declaring work complete.

Never ship an installer or claim Network/scheduling fixes without running the relevant automated checks.

## 2. Coverage (MUST)

- Tooling: Vitest + `@vitest/coverage-v8`.
- Thresholds: **80%** statements, branches, functions, lines.
- Include essentially all application `src/**/*.{ts,tsx}` (expanded beyond early domain-only scope).
- Do not exclude presentation merely to inflate percentages.
- Command: `npm run test:coverage`.

Notable historically under-covered areas to keep improving:

- Network edge geometry helpers / SVG paths / viewport wrap placement.
- Some dialog keydown branches.
- AppChrome / command-palette file paths.

## 3. Fixture strategy (MUST)

- Real `.mpp` corpus (≥10 complex files) under `testdata/mpp`.
- Tests:
  - open each fixture;
  - binary identity save when unmodified;
  - semantic round-trip where rewrite occurs.
- Refresh: `npm run mpp:fixtures`.

## 4. Required regression suites (SHOULD → MUST for touched areas)

| Area | Example tests |
|------|----------------|
| FS successor shift | `FsSuccessorReschedule.test.ts` |
| Task Info OK order / Start | `TaskInfoOk.test.ts`, `dialogs.test.tsx`, `workspace.test.ts`, `StartEarlier.test.ts` |
| Effort triangle | `effortScheduling.test.ts`, use-case tests |
| Network routing | `NetworkView.test.tsx` (layers, viewport band wrap, orthogonal floor, render) |
| Gantt CE column resize / link / select | `ganttColumnResize.test.ts`, `GanttView.test.tsx`, `timelineRowSelect.test.ts` |
| Shortcuts | `projectShortcuts.test.ts` |
| App chrome / palette | `AppChrome.test.tsx` |
| Themes | `ThemeContext.test.tsx` |
| openPlanFile / loader | openPlanFile cases + AppShell busy; reset helpers between tests |
| MPP | `mpp.test.ts`, `mppRoundTrip.test.ts`, `realMpp.fixtures.test.ts` |
| Workspace | `workspace.test.ts` |

## 5. Test environment quirks (document for future agents)

- jsdom may lack `File.text()` → use `FileReader` fallback in production code (not only in tests).
- jsdom may lack `ResizeObserver` → stub in `src/test/setup.ts`.
- `userEvent.clear()` on required name fields throws domain validation mid-edit → prefer select-all + type in UI tests.
- Module-level open guards (`openPlanFile`) need reset helpers for isolation.

## 6. Manual verification checklist (when UI-heavy)

Use after Network / Task Info / installer changes:

1. Open demo or sample plan — loader appears.
2. Edit duration hours in Task Information → OK → hours stick on sheet/Gantt.
3. Add FS predecessor (“after”) → OK → successor bar moves after predecessor finish.
4. Draw FS with the **mouse** on desktop Gantt between two new tasks → successor moves immediately.
5. Change **Start** on the predecessor → OK → hours unchanged, finish moves, successors shift; bar does not snap back. Moving Start **earlier** / into the past also moves the chain.
6. Open Network — nodes visible, arrows orthogonal; narrow the pane so layers wrap to a new band; wrap edges use under-lane not diagonal slash.
7. Switch Theme (top bar) — Gantt borders/text/summary bars follow the theme; select a critical task — red bar still visible.
8. Click empty timeline row (not the bar) — toolbar shows Delete / Task Info like Task Sheet.
9. Command palette: Load sample plan — durations/finish dates scheduled; Save / Open still work.
10. Resource usage histogram bars differ by hours.
11. Packaged exe launches to real UI (not 404), even if something listens on 8787 without static files.
12. Desktop shortcut icon has transparent corners (not black squares).
13. Keyboard: Insert / Delete / Shift+F2 / Ctrl+F2 behave as in [`keyboard-shortcuts.md`](../keyboard-shortcuts.md).
