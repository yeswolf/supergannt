# Compute and display total slack (float) and free slack for critical path analysis

## Overview

SuperGantt already marks critical tasks (`task.critical`) and exposes critical status in the Network Diagram and Views. However, the scheduling engine does not compute **total slack** (the amount a task can delay without delaying the project finish) or **free slack** (delay without delaying any successor). MS Project and ProjectLibre expose these as first-class fields in the Task Sheet and use them to drive the critical path definition (slack = 0 → critical). Without computed slack, SuperGantt has only a crude critical flag and cannot show PMs exactly *how much* float each non-critical task has — a key piece of information for trade-off decisions.

## User story

As a PM optimizing a schedule, I want to see the total slack and free slack for each task in the Task Sheet columns, so that I know which tasks I can delay safely and by how much, without recalculating manually.

## Acceptance criteria

1. **Domain computation:** `SchedulingService` or a new `FloatService` computes total slack and free slack for every task in the project, respecting working-time calendars.
2. **Slack fields on Task:** `Task` entity gains optional `totalSlackHours: number | null` and `freeSlackHours: number | null` — computed during scheduling, null for summary tasks or when not yet calculated.
3. **Critical path redefinition:** A task is critical when `totalSlackHours <= 0` (instead of the current flag). The existing `task.critical` boolean is populated from slack computation.
4. **Task Sheet columns:** Two new optional columns — "Total Slack" and "Free Slack" — display in the configurable column set, formatted as hours or days based on project settings.
5. **Critical Path toggle on Gantt:** A toolbar toggle highlights only critical tasks (red bars), implemented as a Gantt-level filter — uses the computed critical flag.
6. **Performance:** Slack computation for a 500-task plan with 200 dependencies completes in <100ms.
7. **Tests:** Unit tests covering: simple chain, diamond structure, tasks with lag, calendar gaps affecting slack.

## Technical notes

- Classic forward-pass/backward-pass algorithm on the precedence graph. Forward pass computes early start/finish; backward pass computes late start/finish; slack = late - early.
- Must respect working-time calendars: the backward pass moves through calendar working hours, not wall-clock time. `WorkCalendar` already supports `addHours()` and working-time queries — reuse these.
- The existing `SchedulingService.ts` (323 lines) already computes early dates during ASAP scheduling. The forward pass exists; add a backward pass and slack computation there or in a companion `FloatService`.
- Integration: call slack computation after every schedule refresh (`ProjectRefresh.ts`). Slack is deterministic from the schedule — it does not need persistence in `.mpp`; recompute on load and on every mutation.
- Display: add "Total Slack" and "Free Slack" to the column registry in `taskColumnStore.ts`.
