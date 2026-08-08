# Resource Leveling: Automatically Resolve Overallocations

## Overview

SuperGantt's Reports view already detects resource overallocation via `CostService.computeResourceUtilization()`, but provides no automated remediation. This feature adds a "Level Resources" command that automatically delays lower-priority tasks to resolve overallocations, similar to MS Project's resource leveling engine.

## User Story

As a PM managing a resource-constrained project, when the Reports view shows that "Alice" is 150% allocated next week, I want to click "Level Resources" and have the scheduler automatically delay lower-priority (or higher-float) tasks so Alice's allocation drops to 100% or below, respecting dependency chains and task priorities, with the option to preview changes before applying them.

## Acceptance Criteria

1. **Leveling command:** A "Level Resources" button in the toolbar or Reports view triggers resource leveling on the current project. A "Level Resources…" dialog allows configuring scope (selected tasks / entire project) and leveling order (priority, standard — later: float/slack).
2. **Leveling algorithm:** The scheduler resolves overallocations period-by-period (default: day granularity, respecting working-time calendars). When an overallocation is detected, tasks are delayed in order of: (a) lower priority first, (b) higher total slack first (ties broken by task ID). Leveling never violates finish-to-start dependencies or "Must Start On" / "Must Finish On" constraints.
3. **Leveling respects:** Task priorities (0–1000), dependency chains (delaying one task cascades to successors), hard constraints (Must Start On, Must Finish On are not violated — tasks with these constraints are skipped), and resource max units.
4. **Leveling does NOT:** Split tasks, change resource assignments, or modify resource max units. It only delays task start dates (shifting successors via dependency chains).
5. **Preview & apply:** The leveling dialog shows a before/after summary: number of overallocations resolved, tasks delayed, and the new project finish date. User can Accept or Cancel. Canceling reverts to pre-leveling state.
6. **Undo integration:** Leveling is a single undoable operation — Ctrl+Z after leveling reverts the entire leveling pass.
7. **Performance:** Leveling a 500-task plan with 200 dependencies and 20 resources completes in <2 seconds.
8. **Tests:** Unit tests covering: single-resource overallocation, multi-resource cascade, priority ordering, hard constraint bypass, and no-op when nothing is overallocated.

## Technical Notes

- The existing `CostService.computeResourceUtilization()` already produces per-resource allocation data. Leveling builds on this: iterate day-by-day across the project date range, detect periods where `assignedUnits > maxUnits`, and delay lower-priority tasks.
- Implement in `domain/services/ResourceLevelingService.ts` (domain layer — pure logic, no UI).
- The leveling algorithm is a greedy forward-pass: for each time period, sort tasks by priority (ascending) then slack (descending), and delay tasks that push allocation over max units. After each delay, reschedule successors via the existing `SchedulingService`.
- `ProjectRefresh.ts` already orchestrates scheduling passes — leveling should be a callable step in the refresh pipeline, not automatically applied on every edit.
- The dialog UI lives in `presentation/components/` — a new `ResourceLevelingDialog.tsx` with a summary table.
- Reuse the undo/redo command stack: leveling creates a single snapshot before the operation; accept or undo restores it.
