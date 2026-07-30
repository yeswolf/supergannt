import { Duration } from '../value-objects/Duration'
import type { Task, TaskProps } from '../entities/Task'

/** Zero working hours ⇒ milestone (ProjectLibre / MS Project rule). */
export function isZeroEffort(duration: Duration): boolean {
  return duration.toHours() <= 0
}

/**
 * Normalize milestone + duration. Minimal non-milestone slot = 1 hour.
 */
export function applyMilestoneRules(
  props: TaskProps,
  options: { forceMilestone?: boolean; forceNotMilestone?: boolean } = {},
): Partial<TaskProps> {
  const wantMilestone =
    options.forceMilestone === true
      ? true
      : options.forceNotMilestone === true
        ? false
        : props.milestone || isZeroEffort(props.duration)

  if (wantMilestone) {
    return {
      milestone: true,
      duration: Duration.zero(),
      workHours: 0,
      finish: props.start,
    }
  }

  const hours = props.duration.toHours()
  const duration = hours <= 0 ? Duration.hours(1) : Duration.hours(hours)
  return {
    milestone: false,
    duration,
    workHours: props.workHours > 0 ? props.workHours : duration.toHours(),
  }
}

export function withMilestoneRules(task: Task): Task {
  return task.with(applyMilestoneRules(task.toProps()))
}
