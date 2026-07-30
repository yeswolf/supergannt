import type { Assignment } from '../entities/Assignment'

/**
 * ProjectLibre / MS Project effort & assignment rules.
 *
 * Core identity: Work = Duration × Units (Units = Σ assignment.units).
 *
 * Task type — which field is recalculated when another is edited:
 *
 * | Task type       | Change duration | Change work     | Change units    |
 * |-----------------|-----------------|-----------------|-----------------|
 * | Fixed Units     | Work            | Duration        | Duration        |
 * | Fixed Work      | Units           | Duration        | Duration        |
 * | Fixed Duration  | Work            | Units           | Work            |
 *
 * Effort-driven — only when adding/removing resources *after* the first
 * assignment (ProjectLibre / MS Project). Does not apply to unit edits on an
 * existing resource set, nor to the initial 0→N assign.
 *
 * | Effort-driven | Add/remove resources                         |
 * |---------------|----------------------------------------------|
 * | On            | Hold work; duration = work / units (unless   |
 * |               | fixedDuration → redistribute work, keep dur) |
 * | Off           | Hold duration; work = duration × units       |
 *
 * Fixed Work is always effort-driven (enforced on Task.create).
 */

export type TaskSchedulingType = 'fixedUnits' | 'fixedWork' | 'fixedDuration'

export type AssignmentChangeKind = 'units' | 'membership'

export interface AssignmentEffortSlice {
  units: number
  workHours: number
}

export interface EffortRecalcInput {
  schedulingType: TaskSchedulingType
  effortDriven: boolean
  durationHours: number
  workHours: number
  previous: readonly AssignmentEffortSlice[]
  next: readonly AssignmentEffortSlice[]
  kind: AssignmentChangeKind
}

export interface EffortRecalcResult {
  durationHours: number
  workHours: number
  /** When Fixed Work + duration edit scales units; parallel to `next`. */
  nextUnits?: number[]
}

const PRECISION = 1000

export function roundHours(hours: number): number {
  if (!Number.isFinite(hours) || hours < 0) return 0
  return Math.round(hours * PRECISION) / PRECISION
}

export function totalAssignmentUnits(
  assignments: readonly { units: number }[],
): number {
  return assignments.reduce((s, a) => s + Math.max(0, a.units), 0)
}

/** Work from assignment slices, else task.workHours, else duration × units / duration alone. */
export function effectiveTaskWork(
  taskWorkHours: number,
  durationHours: number,
  assignments: readonly AssignmentEffortSlice[],
): number {
  if (assignments.length > 0) {
    const fromAssignments = assignments.reduce((s, a) => {
      if (a.workHours > 0) return s + a.workHours
      return s + durationHours * Math.max(0, a.units)
    }, 0)
    return roundHours(fromAssignments)
  }
  if (taskWorkHours > 0) return roundHours(taskWorkHours)
  return roundHours(durationHours)
}

function sameResourceCountAndIds(
  previous: readonly Assignment[],
  next: readonly Assignment[],
): boolean {
  if (previous.length !== next.length) return false
  const ids = new Set(previous.map((a) => a.resourceId))
  return next.every((a) => ids.has(a.resourceId))
}

/**
 * Classify an assignment-set replacement: same resources → units edit,
 * otherwise membership (add/remove/replace).
 */
export function detectAssignmentChangeKind(
  previous: readonly Assignment[],
  next: readonly Assignment[],
): AssignmentChangeKind {
  if (previous.length === 0 || next.length === 0) return 'membership'
  return sameResourceCountAndIds(previous, next) ? 'units' : 'membership'
}

/**
 * Recalculate duration/work when assignments change (units or membership).
 */
export function recalculateForAssignmentChange(
  input: EffortRecalcInput,
): EffortRecalcResult {
  const schedulingType = input.schedulingType
  const durationHours = Math.max(0, input.durationHours)
  const prevUnits = totalAssignmentUnits(input.previous)
  const nextUnits = totalAssignmentUnits(input.next)
  const work = effectiveTaskWork(
    input.workHours,
    durationHours,
    input.previous,
  )

  // Cleared assignments — keep duration and residual work.
  if (input.next.length === 0) {
    return { durationHours, workHours: work }
  }

  // First assignment(s): duration unchanged; work = duration × units.
  // Effort-driven does not apply until after the first resource is present.
  if (input.previous.length === 0) {
    return {
      durationHours,
      workHours: roundHours(durationHours * nextUnits),
    }
  }

  if (input.kind === 'membership') {
    const effortDriven =
      schedulingType === 'fixedWork' ? true : input.effortDriven

    if (effortDriven) {
      if (schedulingType === 'fixedDuration') {
        // Hold duration + total work; scale units so Σ units = work / duration.
        const targetUnits =
          durationHours > 0 ? roundHours(work / durationHours) : nextUnits
        const scale =
          nextUnits > 0 ? targetUnits / nextUnits : 1
        return {
          durationHours,
          workHours: work,
          nextUnits: input.next.map((a) =>
            roundHours(Math.max(0, a.units) * scale),
          ),
        }
      }
      // Fixed Units / Fixed Work: hold work, duration = work / units.
      return {
        durationHours:
          nextUnits > 0 ? roundHours(work / nextUnits) : durationHours,
        workHours: work,
      }
    }

    // Not effort-driven: hold duration; work grows/shrinks with units.
    return {
      durationHours,
      workHours: roundHours(durationHours * nextUnits),
    }
  }

  // kind === 'units' — same resource set, load edited; effort-driven N/A.
  // Task Info OK often re-saves identical units; do not rewrite duration from
  // stale assignment work shares.
  if (Math.abs(prevUnits - nextUnits) < 1e-9) {
    return {
      durationHours,
      workHours: roundHours(Math.max(0, input.workHours) || work),
    }
  }

  const conservedWork =
    prevUnits > 0
      ? effectiveTaskWork(input.workHours, durationHours, input.previous)
      : work

  if (schedulingType === 'fixedDuration') {
    return {
      durationHours,
      workHours: roundHours(durationHours * nextUnits),
    }
  }

  // Fixed Units / Fixed Work: hold work, recalculate duration.
  return {
    durationHours:
      nextUnits > 0 ? roundHours(conservedWork / nextUnits) : durationHours,
    workHours: conservedWork,
  }
}

/**
 * User edited task duration — apply task-type rules to work/units.
 */
export function recalculateForDurationChange(input: {
  schedulingType: TaskSchedulingType
  workHours: number
  durationHours: number
  assignments: readonly AssignmentEffortSlice[]
}): EffortRecalcResult {
  const durationHours = Math.max(0, input.durationHours)
  const units = totalAssignmentUnits(input.assignments)

  if (input.assignments.length === 0) {
    return { durationHours, workHours: durationHours }
  }

  if (input.schedulingType === 'fixedWork') {
    const work =
      input.workHours > 0
        ? input.workHours
        : effectiveTaskWork(input.workHours, durationHours, input.assignments)
    const unitsNew = durationHours > 0 ? roundHours(work / durationHours) : 0
    const oldTotal = units > 0 ? units : 1
    const nextUnits = input.assignments.map((a) =>
      roundHours(Math.max(0, a.units) * (unitsNew / oldTotal)),
    )
    return {
      durationHours,
      workHours: roundHours(work),
      nextUnits,
    }
  }

  // Fixed Units / Fixed Duration: units held, work = duration × units.
  return {
    durationHours,
    workHours: roundHours(durationHours * units),
  }
}

/**
 * User edited task work — apply task-type rules to duration/units.
 */
export function recalculateForWorkChange(input: {
  schedulingType: TaskSchedulingType
  durationHours: number
  workHours: number
  assignments: readonly AssignmentEffortSlice[]
}): EffortRecalcResult {
  const workHours = Math.max(0, input.workHours)
  const durationHours = Math.max(0, input.durationHours)
  const units = totalAssignmentUnits(input.assignments)

  if (input.assignments.length === 0) {
    // Unassigned: 1 FTE implied → duration tracks work.
    return { durationHours: workHours, workHours }
  }

  if (input.schedulingType === 'fixedDuration') {
    const unitsNew =
      durationHours > 0 ? roundHours(workHours / durationHours) : 0
    const oldTotal = units > 0 ? units : 1
    const nextUnits = input.assignments.map((a) =>
      roundHours(Math.max(0, a.units) * (unitsNew / oldTotal)),
    )
    return { durationHours, workHours, nextUnits }
  }

  // Fixed Units / Fixed Work: duration = work / units.
  return {
    durationHours: units > 0 ? roundHours(workHours / units) : durationHours,
    workHours,
  }
}
