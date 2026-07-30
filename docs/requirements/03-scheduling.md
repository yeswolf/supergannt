# 03 — Scheduling and ProjectLibre parity

SuperGantt’s scheduling mental model MUST match **ProjectLibre / MS Project** closely enough that users are not surprised when moving between tools.

## 1. Time granularity (MUST)

- Minimal schedule slot is **hours**, not days.
- `Duration` canonical unit is working hours (8h/day, 40h/week, 160h/month conversions as implemented).
- Lag/lead on links is expressed in hours (UI and notation).

## 2. Working calendars (MUST)

Parity with ProjectLibre calendar editing:

- Project calendars with working / non-working time.
- User can mark **any day as holiday or non-working**.
- Scheduling uses calendar working time (not naive midnight date arithmetic).
- UI structure for calendars should expose the same *capabilities* as ProjectLibre’s calendar editing (exceptions, working weeks), even if chrome differs.

## 3. Tasks and milestones (MUST)

- Duration **0 hours** ⇒ task is a **milestone** (and conversely milestone policy keeps zero-effort consistent).
- Milestones MUST render on the Gantt as a **diamond**, not a zero-width bar.
- Summary tasks roll up from children; network diagram nodes exclude summaries (leaf network).

## 4. Dependencies / predecessors (MUST)

### 4.1 Link types

Support **FS, SS, FF, SF** with lag/lead.

### 4.2 Editing surfaces

Predecessors MUST be editable like ProjectLibre:

- Task Information → Predecessors tab (type + lag hours + predecessor picker).
- Task Sheet predecessors column with notation such as `2FS+8h`, `1SS`, comma-separated lists.
- Gantt link drawing maps to the same link types.
- Toolbar **Link** on multi-selection chains FS in selection order; **Unlink** clears predecessors for selection.

### 4.3 Immediate reschedule (MUST)

When dependencies are created or changed:

- Schedule MUST update **immediately**.
- Successor bars MUST shift **the same way as ProjectLibre** (ASAP / link-driven).

### 4.4 FS (“after”) successor shift (MUST)

If task B is linked as successor **FS** after predecessor A (“следующую после” / dependency type “после”):

1. Soft constraints on B that would block push-out (**SNET, SNLT, FNET, FNLT, ALAP**) MUST be cleared to **ASAP** so the link can drive the bar.
2. Hard locks (**MSO / MFO**) MUST be preserved.
3. B’s start MUST land on calendar snap of A’s finish (+ lag), i.e. working-time FS formula.

Implemented via `withLinkDrivenSuccessor` + `SchedulingService` + `refreshProject`.

### 4.5 Task Information OK interaction (MUST)

Saving Task Information MUST apply predecessors in an order that does **not** re-apply soft constraints *after* the link-driven clear. See [07-bugfixes-and-regressions.md](./07-bugfixes-and-regressions.md).

## 5. Constraints (MUST)

Supported constraint types include ASAP, ALAP, MSO, MFO, SNET, SNLT, FNET, FNLT (labels as in Task Information Advanced).

- Editing **Start** (sheet / dialog / Gantt drag) sets **Start No Earlier Than** when appropriate so predecessors can still push later (ProjectLibre behavior).
- Finish edits without explicit duration derive working hours between start and finish.

## 6. Effort / assignment triangle (MUST)

Reproduce ProjectLibre / MS Project rules. Core identity:

**Work = Duration × Units** (units = Σ assignment.units).

### 6.1 Task types

| Task type | Change duration | Change work | Change units |
|-----------|-----------------|-------------|--------------|
| Fixed Units | Work | Duration | Duration |
| Fixed Work | Units | Duration | Duration |
| Fixed Duration | Work | Units | Work |

### 6.2 Effort-driven

- Applies when **adding/removing** resources after the first assignment exists.
- Does **not** redefine unit edits on an existing set the same way; follow ProjectLibre tables.
- Fixed Work is always effort-driven.

### 6.3 First assign

- Duration unchanged; work = duration × units.
- Effort-driven does not apply on the initial 0→N assign the same as later membership changes.

### 6.4 UI triggers

Changing resource load / assignments on a task MUST recalculate duration (or work/units per type). Entry points:

- Resources tab / Assign dialog / Resource Names flows.
- `ResourceUseCases.setTaskAssignments` / assign / unassign.
- `TaskUseCases.updateTask` for duration/work edits.

### 6.5 Task Info OK hazard (MUST avoid)

Re-saving an **unchanged** Resources tab MUST NOT recreate assignments in a way that triangle-recalculates and **wipes a duration just edited on General**. Skip no-op assignment writes when resourceId+units sets are equal.

## 7. Critical path and baselines (SHOULD → MUST for views)

- Critical path from zero total float (ProjectLibre-like).
- Set / clear baseline from Project ribbon.
- Reports may include earned-value style summaries (PV/EV/AC/SPI/CPI style snapshots).

## 8. Resource assignment UX (MUST)

User MUST be able to assign resources:

- From Gantt (without making task-name click open Assign).
- From toolbar / Task Information Resources.
- From other sheets where Resource Names / Assign is exposed.

Empty assign control MUST NOT show a fake `--Assign` placeholder label when empty.

## 9. Gantt interaction specifics (MUST)

- Click **task name** → open **Task Information** (edit), not Assign.
- Zoom in / zoom out controls present and aligned with ProjectLibre-style view zoom expectations.
- Link creation updates schedule immediately (section 4.3).
