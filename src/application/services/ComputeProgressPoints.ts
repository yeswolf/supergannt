import type { Project } from '../../domain/entities/Project'

export interface ProgressPoint {
  taskId: string
  /** Expected progress ratio at the status date: (statusDate - start) / (finish - start), clamped to [0, 1]. */
  expectedRatio: number
  /** Actual progress ratio: percentComplete / 100. */
  actualRatio: number
  /** Variance: actualRatio - expectedRatio. Positive = ahead of schedule. */
  variance: number
  /** 0-based index of the task within the project's task list (for Y positioning). */
  rowIndex: number
}

/**
 * Pure function: compute progress-line data points from domain objects.
 * Returns one ProgressPoint per non-summary, non-milestone task whose bar
 * intersects the status date window (start ≤ statusDate ≤ finish).
 *
 * Rows with no meaningful progress information (summary, milestone, or
 * status date outside the task window) are excluded.
 */
export function computeProgressPoints(
  project: Project,
  statusDate: Date,
): ProgressPoint[] {
  const statusMs = statusDate.getTime()
  const points: ProgressPoint[] = []

  const tasks = project.tasks
  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i]!

    // Skip summary tasks and milestones — progress lines only apply to leaf tasks.
    if (task.summary || task.milestone) continue

    const startMs = task.start.getTime()
    const finishMs = task.finish.getTime()
    const span = finishMs - startMs

    // Tasks that haven't started yet or have zero duration have no bar to draw on.
    if (span <= 0) continue

    // Skip tasks where the status date is completely outside the bar window.
    if (statusMs < startMs || statusMs > finishMs) continue

    const expectedRatio = Math.max(0, Math.min(1, (statusMs - startMs) / span))
    const actualRatio = Math.max(0, Math.min(1, task.percentComplete / 100))
    const variance = actualRatio - expectedRatio

    points.push({
      taskId: task.id,
      expectedRatio,
      actualRatio,
      variance,
      rowIndex: i,
    })
  }

  return points
}

/**
 * Filter progress points to only the peak ahead and peak behind tasks.
 * Useful for the "Show peak" simplified view.
 * Returns at most 2 points: the one with the largest positive variance and
 * the one with the largest negative variance.
 */
export function filterPeakPoints(points: ProgressPoint[]): ProgressPoint[] {
  if (points.length === 0) return []

  let bestAhead: ProgressPoint | null = null
  let bestBehind: ProgressPoint | null = null

  for (const p of points) {
    if (p.variance > 0) {
      if (!bestAhead || p.variance > bestAhead.variance) {
        bestAhead = p
      }
    } else if (p.variance < 0) {
      if (!bestBehind || p.variance < bestBehind.variance) {
        bestBehind = p
      }
    }
    // variance === 0: neither ahead nor behind — ignore for peaks.
  }

  const result: ProgressPoint[] = []
  if (bestAhead) result.push(bestAhead)
  if (bestBehind) result.push(bestBehind)
  return result
}