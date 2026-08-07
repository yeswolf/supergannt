# Task filtering, sorting, and grouping (AutoFilter) for Task Sheet and Gantt

## Overview

Add AutoFilter capabilities to the Task Sheet and Gantt tree side — filter tasks by column values, sort by any column, and group tasks into collapsible sections with summary rows. This brings SuperGantt to parity with Microsoft Project and ProjectLibre for managing plans with 100+ tasks.

## User story

As a PM managing a 200-task plan, I want to filter the task list to show only tasks that are behind schedule (finish variance < 0), sort them by finish date, and group them by assigned resource, so that I can run my weekly status review without scrolling through irrelevant rows.

## Acceptance criteria

1. **Filter UI:** A filter bar or column-header dropdown on Task Sheet and Gantt (tree side) allows applying one or more column-based filters.
2. **Filter types supported:** Text contains/equals, numeric range, date range, boolean (milestone, critical, summary), and resource name (assignment-based).
3. **Sorting:** Clicking a column header sorts ascending/descending; the sort indicator is visible. Multi-column sort is nice-to-have.
4. **Grouping:** User can select a grouping field (e.g., Resource, Status, Outline Level) that partitions the task list into collapsible groups with summary rows showing group-level totals (cost, work).
5. **AutoFilter indicator:** Filtered columns show a funnel icon; a "Clear all filters" action is always reachable.
6. **Persistence:** Filter/sort/group state survives view switches (Gantt ↔ Task Sheet) but resets on file open.
7. **Performance:** Filtering/sorting a 500-task plan completes in <100ms (client-side, no server round-trip).

## Technical notes

- Task Sheet (`TaskSheetView.tsx`) and Gantt tree side render from `project.tasks`. Filtering/sorting should produce a derived view model (ordered, filtered list) without mutating the domain model.
- DHTMLX Gantt has its own built-in filtering API (`gantt.attachEvent("onBeforeTaskDisplay")` or `gantt.filter()`) — leverage this for the Gantt tree side to avoid reimplementing row visibility logic.
- The toolbar already has space for a filter-toggle button; a collapsible filter bar below the toolbar is the natural layout.
- Grouping is the hardest part: it requires inserting synthetic "group header" rows into the task list. For the Gantt tree, DHTMLX may not natively support injected group rows — a custom rendering approach or a pre-processed task tree with group nodes may be needed.
- Follows CLEAN architecture: filtering logic in application services, UI in presentation layer.
