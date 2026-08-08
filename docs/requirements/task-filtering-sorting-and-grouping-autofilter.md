# Task filtering, sorting, and grouping (AutoFilter)

## Overview

Add AutoFilter capability to the Task Sheet and Gantt tree side — column-based filters, single-column sorting, and grouping by resource/status/outline-level with collapsible group header rows. Filter/sort/group state survives view switches but resets on file open.

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

- Filtering/sorting/grouping produces derived view models (ordered, filtered lists) without mutating the domain model.
- A new application service `TaskFilterSort.ts` contains the pure filtering/sorting/grouping logic.
- Workspace state holds `taskFilterSort: TaskFilterSortState` — actions `setTaskFilter`, `removeTaskFilter`, `clearTaskFilters`, `setTaskSort`, `setTaskGroup`.
- Task Sheet and Gantt tree side both consume the same derived task list.
- For the Gantt tree, DHTMLX Gantt's `gantt.filter()` API or `onBeforeTaskDisplay` is used to reflect the filtered/sorted task set.
- Grouping injects synthetic group header rows into the task list with collapsible groups and summary totals.
- Filter/sort/group state resets in `setProject` (file open / new project).
