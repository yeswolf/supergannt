import type { Project } from '../../domain/entities/Project'
import { rebuildHierarchy } from '../../domain/services/HierarchyService'
import {
  applyCriticalFlags,
  computeCriticalPath,
  scheduleProject,
} from '../../domain/services/SchedulingService'
import { recalculateTaskCosts } from '../../domain/services/CostService'

/** Single pipeline: hierarchy → schedule → critical path → costs. */
export function refreshProject(project: Project): Project {
  const hierarchical = rebuildHierarchy(project.tasks)
  const withParents = project.with({ tasks: hierarchical })
  const scheduled = scheduleProject(
    withParents.tasks,
    withParents.dependencies,
    withParents.getCalendar(),
    withParents.startDate,
  )
  const critical = computeCriticalPath(
    scheduled,
    withParents.dependencies,
    withParents.getCalendar(),
  )
  const flagged = applyCriticalFlags(scheduled, critical)
  const priced = recalculateTaskCosts(
    flagged,
    withParents.assignments,
    withParents.resources,
    withParents.currency,
  )
  const finish = priced.reduce(
    (max, t) => (t.finish.getTime() > max.getTime() ? t.finish : max),
    withParents.startDate,
  )
  return withParents.with({
    tasks: priced,
    finishDate: finish,
  })
}
