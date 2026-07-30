import { createEmptyProject, createDemoProject } from '../../application/services/ProjectFactory'
import { FileUseCases } from '../../application/use-cases/FileUseCases'
import * as TaskUseCases from '../../application/use-cases/TaskUseCases'
import * as HierarchyUseCases from '../../application/use-cases/HierarchyUseCases'
import * as DependencyUseCases from '../../application/use-cases/DependencyUseCases'
import * as ResourceUseCases from '../../application/use-cases/ResourceUseCases'
import * as ProjectUseCases from '../../application/use-cases/ProjectUseCases'
import type { LinkType } from '../../domain/entities/Dependency'
import type { ResourceType } from '../../domain/entities/Resource'
import type { Project } from '../../domain/entities/Project'
import { UuidIdGenerator } from '../../infrastructure/ids/UuidIdGenerator'
import { LocalStorageProjectRepository } from '../../infrastructure/persistence/LocalStorageProjectRepository'
import { MspdiCodec } from '../../infrastructure/mspdi/MspdiCodec'
import { MppCodec } from '../../infrastructure/mpp/MppCodec'
import { MpxCodec } from '../../infrastructure/mpx/MpxCodec'
import { HttpMppToXmlConverter } from '../../infrastructure/mpp/HttpMppToXmlConverter'
import { HttpXmlToMppConverter } from '../../infrastructure/mpp/HttpXmlToMppConverter'

export type AppView =
  | 'gantt'
  | 'tasks'
  | 'resources'
  | 'network'
  | 'wbs'
  | 'rbs'
  | 'taskUsage'
  | 'resourceUsage'
  | 'calendar'
  | 'reports'

export interface AppServices {
  ids: UuidIdGenerator
  files: FileUseCases
}

export function createAppServices(): AppServices {
  const ids = new UuidIdGenerator()
  const mppConverter = new HttpMppToXmlConverter()
  const mppWriter = new HttpXmlToMppConverter()
  const files = new FileUseCases(
    [new MppCodec(ids, mppConverter, mppWriter), new MspdiCodec(ids), new MpxCodec()],
    new LocalStorageProjectRepository(),
  )
  return { ids, files }
}

export interface WorkspaceState {
  project: Project
  view: AppView
  selectedTaskId: string | null
  /** Selection order for Link (ProjectLibre multi-select). */
  selectedTaskIds: string[]
  selectedResourceId: string | null
  taskInfoOpen: boolean
  /** Initial tab when Task Information opens. */
  taskInfoTab: 'general' | 'predecessors' | 'resources' | 'advanced'
  assignDialogOpen: boolean
  statusMessage: string | null
  /** Non-null while a plan file is being opened/imported. */
  busyMessage: string | null
  services: AppServices
}

export function createInitialState(services = createAppServices()): WorkspaceState {
  return {
    project: createDemoProject(services.ids),
    view: 'gantt',
    selectedTaskId: null,
    selectedTaskIds: [],
    selectedResourceId: null,
    taskInfoOpen: false,
    taskInfoTab: 'general',
    assignDialogOpen: false,
    statusMessage:
      'Select a task, then Assign (toolbar) or edit the Resources column / Task Info → Resources.',
    busyMessage: null,
    services,
  }
}

export type WorkspaceAction =
  | { type: 'setView'; view: AppView }
  | { type: 'selectTask'; taskId: string | null; additive?: boolean }
  | { type: 'selectResource'; resourceId: string | null }
  | {
      type: 'openTaskInfo'
      taskId?: string
      tab?: 'general' | 'predecessors' | 'resources' | 'advanced'
    }
  | { type: 'closeTaskInfo' }
  | { type: 'openAssignDialog'; taskId?: string }
  | { type: 'closeAssignDialog' }
  | { type: 'setProject'; project: Project; message?: string }
  | { type: 'setStatus'; message: string | null }
  | { type: 'setBusy'; message: string | null }
  | { type: 'newProject' }
  | { type: 'loadDemo' }
  | { type: 'addTask'; afterTaskId?: string }
  | { type: 'addMilestone'; afterTaskId?: string }
  | { type: 'updateTask'; taskId: string; patch: Parameters<typeof TaskUseCases.updateTask>[2] }
  | { type: 'deleteTask'; taskId: string }
  | { type: 'indentTask'; taskId: string }
  | { type: 'outdentTask'; taskId: string }
  | {
      type: 'linkTasks'
      predecessorId: string
      successorId: string
      linkType?: LinkType
      lagHours?: number
    }
  | { type: 'linkSelection' }
  | { type: 'unlinkSelection' }
  | { type: 'unlinkDependency'; dependencyId: string }
  | { type: 'setPredecessors'; taskId: string; notation: string }
  | {
      type: 'setPredecessorLinks'
      taskId: string
      links: { predecessorId: string; type: LinkType; lagHours: number }[]
    }
  | { type: 'addResource' }
  | {
      type: 'updateResource'
      resourceId: string
      patch: Parameters<typeof ResourceUseCases.updateResource>[2]
    }
  | { type: 'deleteResource'; resourceId: string }
  | { type: 'assignResource'; taskId: string; resourceId: string; units?: number }
  | { type: 'unassignResource'; assignmentId: string }
  | {
      type: 'setTaskAssignments'
      taskId: string
      links: { resourceId: string; units: number }[]
    }
  | { type: 'setBaseline' }
  | { type: 'clearBaseline' }
  | {
      type: 'updateProjectInfo'
      patch: Parameters<typeof ProjectUseCases.updateProjectInfo>[1]
    }

export function workspaceReducer(
  state: WorkspaceState,
  action: WorkspaceAction,
): WorkspaceState {
  const { ids } = state.services
  switch (action.type) {
    case 'setView':
      return { ...state, view: action.view }
    case 'selectTask': {
      if (action.taskId == null) {
        return { ...state, selectedTaskId: null, selectedTaskIds: [] }
      }
      if (action.additive) {
        const exists = state.selectedTaskIds.includes(action.taskId)
        const selectedTaskIds = exists
          ? state.selectedTaskIds.filter((id) => id !== action.taskId)
          : [...state.selectedTaskIds, action.taskId]
        return {
          ...state,
          selectedTaskId: action.taskId,
          selectedTaskIds,
        }
      }
      return {
        ...state,
        selectedTaskId: action.taskId,
        selectedTaskIds: [action.taskId],
      }
    }
    case 'selectResource':
      return { ...state, selectedResourceId: action.resourceId }
    case 'openTaskInfo':
      return {
        ...state,
        taskInfoOpen: true,
        assignDialogOpen: false,
        taskInfoTab: action.tab ?? 'general',
        selectedTaskId: action.taskId ?? state.selectedTaskId,
        selectedTaskIds: action.taskId
          ? [action.taskId]
          : state.selectedTaskIds,
      }
    case 'closeTaskInfo':
      return { ...state, taskInfoOpen: false }
    case 'openAssignDialog':
      return {
        ...state,
        assignDialogOpen: true,
        selectedTaskId: action.taskId ?? state.selectedTaskId,
        selectedTaskIds: action.taskId
          ? [action.taskId]
          : state.selectedTaskIds,
      }
    case 'closeAssignDialog':
      return { ...state, assignDialogOpen: false }
    case 'setProject':
      return {
        ...state,
        project: action.project,
        statusMessage: action.message ?? state.statusMessage,
      }
    case 'setStatus':
      return { ...state, statusMessage: action.message }
    case 'setBusy':
      return { ...state, busyMessage: action.message }
    case 'newProject':
      return {
        ...state,
        project: createEmptyProject(ids),
        selectedTaskId: null,
        selectedTaskIds: [],
        statusMessage: 'Created a blank project.',
      }
    case 'loadDemo':
      return {
        ...state,
        project: createDemoProject(ids),
        selectedTaskId: null,
        selectedTaskIds: [],
        statusMessage: 'Loaded sample project.',
      }
    case 'addTask':
      return {
        ...state,
        project: TaskUseCases.addTask(state.project, ids, {
          afterTaskId: action.afterTaskId,
        }),
        statusMessage: 'Task added.',
      }
    case 'addMilestone':
      return {
        ...state,
        project: TaskUseCases.addMilestone(state.project, ids, action.afterTaskId),
        statusMessage: 'Milestone added (0h).',
      }
    case 'updateTask':
      return {
        ...state,
        project: TaskUseCases.updateTask(state.project, action.taskId, action.patch),
      }
    case 'deleteTask':
      return {
        ...state,
        project: TaskUseCases.deleteTask(state.project, action.taskId),
        selectedTaskId:
          state.selectedTaskId === action.taskId ? null : state.selectedTaskId,
        selectedTaskIds: state.selectedTaskIds.filter((id) => id !== action.taskId),
        statusMessage: 'Task deleted.',
      }
    case 'indentTask':
      return {
        ...state,
        project: HierarchyUseCases.indentTaskUseCase(state.project, action.taskId),
      }
    case 'outdentTask':
      return {
        ...state,
        project: HierarchyUseCases.outdentTaskUseCase(state.project, action.taskId),
      }
    case 'linkTasks':
      try {
        return {
          ...state,
          project: DependencyUseCases.linkTasks(
            state.project,
            ids,
            action.predecessorId,
            action.successorId,
            action.linkType ?? 'FS',
            action.lagHours ?? 0,
          ),
          statusMessage: 'Dependency created.',
        }
      } catch (error) {
        return {
          ...state,
          statusMessage: error instanceof Error ? error.message : 'Link failed.',
        }
      }
    case 'linkSelection':
      try {
        return {
          ...state,
          project: DependencyUseCases.linkTaskChain(
            state.project,
            ids,
            state.selectedTaskIds,
          ),
          statusMessage: 'Linked selected tasks (FS).',
        }
      } catch (error) {
        return {
          ...state,
          statusMessage: error instanceof Error ? error.message : 'Link failed.',
        }
      }
    case 'unlinkSelection':
      return {
        ...state,
        project: DependencyUseCases.unlinkTasks(
          state.project,
          state.selectedTaskIds.length > 0
            ? state.selectedTaskIds
            : state.selectedTaskId
              ? [state.selectedTaskId]
              : [],
        ),
        statusMessage: 'Unlinked predecessors for selection.',
      }
    case 'unlinkDependency':
      return {
        ...state,
        project: DependencyUseCases.unlinkDependency(
          state.project,
          action.dependencyId,
        ),
      }
    case 'setPredecessors':
      try {
        return {
          ...state,
          project: DependencyUseCases.setPredecessorsFromNotation(
            state.project,
            ids,
            action.taskId,
            action.notation,
          ),
          statusMessage: 'Predecessors updated.',
        }
      } catch (error) {
        return {
          ...state,
          statusMessage: error instanceof Error ? error.message : 'Invalid predecessors.',
        }
      }
    case 'setPredecessorLinks':
      try {
        return {
          ...state,
          project: DependencyUseCases.setPredecessorLinks(
            state.project,
            ids,
            action.taskId,
            action.links,
          ),
          statusMessage: 'Predecessors updated.',
        }
      } catch (error) {
        return {
          ...state,
          statusMessage: error instanceof Error ? error.message : 'Invalid predecessors.',
        }
      }
    case 'addResource':
      return {
        ...state,
        project: ResourceUseCases.addResource(state.project, ids),
        statusMessage: 'Resource added.',
      }
    case 'updateResource':
      return {
        ...state,
        project: ResourceUseCases.updateResource(
          state.project,
          action.resourceId,
          action.patch,
        ),
      }
    case 'deleteResource':
      return {
        ...state,
        project: ResourceUseCases.deleteResource(state.project, action.resourceId),
        selectedResourceId:
          state.selectedResourceId === action.resourceId
            ? null
            : state.selectedResourceId,
      }
    case 'assignResource':
      return {
        ...state,
        project: ResourceUseCases.assignResource(
          state.project,
          ids,
          action.taskId,
          action.resourceId,
          action.units,
        ),
        statusMessage: 'Resource assigned.',
      }
    case 'unassignResource':
      return {
        ...state,
        project: ResourceUseCases.unassignResource(
          state.project,
          action.assignmentId,
        ),
        statusMessage: 'Resource unassigned.',
      }
    case 'setTaskAssignments':
      return {
        ...state,
        project: ResourceUseCases.setTaskAssignments(
          state.project,
          ids,
          action.taskId,
          action.links,
        ),
        statusMessage: 'Task resources updated.',
      }
    case 'setBaseline':
      return {
        ...state,
        project: ProjectUseCases.setBaseline(state.project),
        statusMessage: 'Baseline saved.',
      }
    case 'clearBaseline':
      return {
        ...state,
        project: ProjectUseCases.clearBaseline(state.project),
        statusMessage: 'Baseline cleared.',
      }
    case 'updateProjectInfo':
      return {
        ...state,
        project: ProjectUseCases.updateProjectInfo(state.project, action.patch),
      }
    default:
      return state
  }
}

export type { ResourceType }
