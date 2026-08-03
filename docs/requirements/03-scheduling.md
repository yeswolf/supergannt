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

When dependencies are created or changed (Task Info, Task Sheet notation, toolbar Link, **or Gantt mouse/touch link draw**):

- Schedule MUST update **immediately** (same gesture — no separate “Calculate”).
- Successor bars MUST shift **the same way as ProjectLibre** (ASAP / link-driven).
- Gantt MUST re-sync from workspace after the link (`setProject` / parse) so the bar does not stay painted at the old date.

### 4.4 FS (“after”) successor shift (MUST)

If task B is linked as successor **FS** after predecessor A (“next after” / finish-to-start):

1. Soft constraints on B that would block push-out (**SNET, SNLT, FNET, FNLT, ALAP**) MUST be cleared to **ASAP** so the link can drive the bar — **only when the predecessor set actually changes**.
2. Rewriting the **same** predecessor rows (typical Task Info OK) MUST **not** clear an intentional Start-driven SNET pin.
3. Hard locks (**MSO / MFO**) MUST be preserved.
4. B’s start MUST land on calendar snap of A’s finish (+ lag), i.e. working-time FS formula.

Implemented via `withLinkDrivenSuccessor` + `predecessorLinksChanged` + `SchedulingService` + `refreshProject`.

### 4.5 Gantt drag link orientation (MUST)

dhtmlx maps **start-handle → finish-handle** to SF. Product rule:

- Drag from the **start** of task X onto the **finish** of task Y MUST become **FS with Y predecessor of X** (swap ends, type FS) — so “from the start of the second onto the end of the first” makes the first the predecessor of the second.
- Forward finish→start drag remains normal FS.
- Implemented by `orientDraggedLink` before `linkTasks`.

### 4.6 Task Information OK and scheduling (MUST)

When Task Information OK includes link and/or Start changes:

1. Soft pins clear on predecessor **change** only (`withLinkDrivenSuccessor`); rewriting the same rows MUST NOT wipe Start-driven pins.
2. If General includes a **Start** edit, apply that Start **last** via `updateTask({ start })` (constraint later→SNET / earlier→MSO per §5.1). Advanced **ASAP** MUST NOT run first and undo the move.
3. Duration hours edited on General MUST survive OK when Resources are unchanged (`setTaskAssignments` no-op) — see [04](./04-ui-ux.md) Task Information OK order.

## 5. Constraints (MUST)

Supported constraint types include ASAP, ALAP, MSO, MFO, SNET, SNLT, FNET, FNLT (labels as in Task Information Advanced).

### 5.1 Start date edit (MUST — ProjectLibre)

Whenever the user changes a task’s **Start** (Task Sheet date, Task Information General, or Gantt **move** drag):

1. **Duration hours stay fixed** (do not shrink/expand from a stale Finish still in the form).
2. **Finish** = calendar `addWorkingHours(start, durationHours)`.
3. Constraint:
   - **Later** than the current start → **Start No Earlier Than** (predecessors may still push later).
   - **Earlier** than the current start (including **calendar past** / before project start) → **Must Start On** so the date sticks. Plain SNET cannot pull a task before the ASAP / project-start floor, so earlier edits must not no-op.
4. If the chosen Start is **before `project.startDate`**, pull **project start** back to that snapped date so the timeline includes the past.
5. All **link-driven successors** MUST reschedule — when the predecessor moves earlier, dependents shift earlier too.
6. Gantt **resize** may change duration; **move** MUST NOT send a stale finish that would be treated as a duration edit.

### 5.2 Finish edit

- Finish edits **without** an accompanying Start change derive working hours between start and finish.

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
- Zoom in / zoom out controls present and aligned with ProjectLibre-style view zoom expectations (`Ctrl+=` / `Ctrl+-` / Ctrl+wheel).
- Link creation updates schedule immediately (section 4.3).
- **Desktop / web:** do **not** force dhtmlx `touch: 'force'` (long-press); mouse link draw must work on click-drag. Force touch only on **Android / coarse pointer**.
- Own scheduling owns dates: `work_time` / `correct_work_time` off in dhtmlx so parse/link cannot silently undo successor shifts.
