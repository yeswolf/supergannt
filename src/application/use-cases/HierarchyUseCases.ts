import type { Project } from '../../domain/entities/Project'
import type { TaskId } from '../../domain/value-objects/Ids'
import { asTaskId } from '../../domain/value-objects/Ids'
import { indentTask, outdentTask } from '../../domain/services/HierarchyService'
import { refreshProject } from '../services/ProjectRefresh'

export function indentTaskUseCase(project: Project, taskId: string): Project {
  const tasks = indentTask(project.tasks, asTaskId(taskId) as TaskId)
  return refreshProject(project.with({ tasks }).markDirty())
}

export function outdentTaskUseCase(project: Project, taskId: string): Project {
  const tasks = outdentTask(project.tasks, asTaskId(taskId) as TaskId)
  return refreshProject(project.with({ tasks }).markDirty())
}
