import type { Project } from '../../domain/entities/Project'
import { rebuildHierarchy } from '../../domain/services/HierarchyService'
import {
  computeFloat,
  applyFloatToTasks,
  scheduleProject,
} from '../../domain/services/SchedulingService'
import { recalculateTaskCosts } from '../../domain/services/CostService'

/** Single pipeline: hierarchy → schedule → float → critical → costs. */
export function refreshProject(project: Project): Project {
  const hierarchical = rebuildHierarchy(project.tasks)
  const withParents = project.with({ tasks: hierarchical })
  const calendar = withParents.getCalendar()
  const scheduled = scheduleProject(
    withParents.tasks,
    withParents.dependencies,
    calendar,
    withParents.startDate,
  )
  const floatMap = computeFloat(scheduled, withParents.dependencies, calendar)
  const flagged = applyFloatToTasks(scheduled, floatMap)
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
