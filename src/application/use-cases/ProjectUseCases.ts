import type { Project } from '../../domain/entities/Project'
import { Duration } from '../../domain/value-objects/Duration'
import { Money } from '../../domain/value-objects/Money'
import { refreshProject } from '../services/ProjectRefresh'

export function setBaseline(project: Project): Project {
  const tasks = project.tasks.map((task) =>
    task.with({
      baseline: {
        start: task.start,
        finish: task.finish,
        duration: Duration.hours(task.duration.toHours()),
        cost: Money.of(task.cost.amount, project.currency),
      },
    }),
  )
  return project.with({ tasks }).markDirty()
}

export function clearBaseline(project: Project): Project {
  const tasks = project.tasks.map((task) => task.with({ baseline: null }))
  return project.with({ tasks }).markDirty()
}

export function updateProjectInfo(
  project: Project,
  patch: Partial<{ name: string; title: string; manager: string; currency: string }>,
): Project {
  return refreshProject(
    project
      .with({
        name: patch.name ?? project.name,
        title: patch.title ?? project.title,
        manager: patch.manager ?? project.manager,
        currency: patch.currency ?? project.currency,
      })
      .markDirty(),
  )
}
