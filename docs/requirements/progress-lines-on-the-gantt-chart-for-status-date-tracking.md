# Progress lines on the Gantt chart for status-date tracking

## Overview

MS Project-style progress lines drawn on the Gantt chart at a status date, connecting each task bar at the point corresponding to its % complete. A task that's 50% done shows the line through its bar midpoint; a task that should have been 50% done but is only 30% done shows the line lagging behind where it should be — an instant visual signal of schedule variance.

## User story

As a PM preparing for a weekly status review, I want to toggle progress lines on the Gantt chart at today's date (or a custom status date), so that I can see at a glance which tasks are ahead of schedule, on track, or slipping — and screenshot it for the stakeholder deck.

## Acceptance criteria

1. **Toggle control:** A "Progress Lines" toggle button in the Gantt toolbar. When enabled, progress lines are drawn on the Gantt chart.
2. **Status date:** Default status date is today. A date picker next to the toggle allows selecting a different status date. The line visual changes based on the chosen date.
3. **Line rendering:** For each task (non-summary, non-milestone): compute the expected progress at the status date as `(statusDate - start) / (finish - start)`. Compute actual progress as `percentComplete / 100`. Draw a vertical line segment at the status date: the line connects from the top of the task row to the bar at the expected-progress point, then bends to the actual-progress point on the bar. If actual < expected (behind schedule), the bend angles left; if actual > expected (ahead), it angles right.
4. **Visual style:** Progress lines use a distinct color (default: red/orange, theme-aware). Line width is 1–2px. Dashed for the vertical portion, solid for the progress connector.
5. **Peak/valley option:** A checkbox "Show peak" draws the line to the furthest-ahead and furthest-behind tasks only (simplified view). Default is all tasks.
6. **Performance:** Rendering progress lines for 500 tasks adds <50ms to the Gantt paint cycle.
7. **PDF export:** When exporting to PDF, if progress lines are enabled, they appear in the exported Gantt chart.
8. **Tests:** Unit test for the progress calculation function; visual snapshot test for a small plan with progress lines enabled.

## Technical notes

- The progress calculation is a pure function in `application/services/` (`computeProgressPoints(project, statusDate)` → array of `{taskId, expectedX, actualX, rowY}`) — no Gantt dependency.
- The rendering layer lives in `infrastructure/gantt/` — a new `ganttProgressLines.ts` that takes the computed points and draws SVG elements on the DHTMLX timeline.
- Theme colors: define `--progress-line-behind` and `--progress-line-ahead` CSS custom properties in `themes.css` so they adapt per theme.
- Interaction with zoom levels: progress points recalculate on zoom change (X positions change). Debounce the recompute.
- PDF: `exportProjectPdf.ts` already draws a Gantt chart — add the progress line overlay there too, reusing the same `computeProgressPoints()` function.
