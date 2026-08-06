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
import { inspectProject, type InspectionIssue } from '../../application/services/ProjectInspector'
import { UuidIdGenerator } from '../../infrastructure/ids/UuidIdGenerator'
import { LocalStorageProjectRepository } from '../../infrastructure/persistence/LocalStorageProjectRepository'
import { MspdiCodec } from '../../infrastructure/mspdi/MspdiCodec'
import { MppCodec } from '../../infrastructure/mpp/MppCodec'
import { MpxCodec } from '../../infrastructure/mpx/MpxCodec'
import { HttpMppToXmlConverter } from '../../infrastructure/mpp/HttpMppToXmlConverter'
import { HttpXmlToMppConverter } from '../../infrastructure/mpp/HttpXmlToMppConverter'
import { PreferTauriMppToXmlConverter } from '../../infrastructure/mpp/PreferTauriMppToXmlConverter'
import { PreferTauriXmlToMppConverter } from '../../infrastructure/mpp/PreferTauriXmlToMppConverter'

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
  | 'resourceCalendar'
  | 'reports'

export interface AppServices {
  ids: UuidIdGenerator
  files: FileUseCases
}

export function createAppServices(): AppServices {
  const ids = new UuidIdGenerator()
  const mppConverter = new PreferTauriMppToXmlConverter(new HttpMppToXmlConverter())
  const mppWriter = new PreferTauriXmlToMppConverter(new HttpXmlToMppConverter())
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
  /** Inspection issues for the current project (circular deps, orphans, etc). */
  inspectionIssues: readonly InspectionIssue[]
  services: AppServices
}

export function createInitialState(services = createAppServices()): WorkspaceState {
  return {
    project: createEmptyProject(services.ids),
    view: 'gantt',
    selectedTaskId: null,
    selectedTaskIds: [],
    selectedResourceId: null,
    taskInfoOpen: false,
    taskInfoTab: 'general',
    assignDialogOpen: false,
    statusMessage: 'Blank plan — add a task or open a file.',
    busyMessage: null,
    inspectionIssues: [],
    services,
  }
}


function withInspections(state: WorkspaceState, project: Project): WorkspaceState {
  return { ...state, project, inspectionIssues: inspectProject(project) }
}

function withInspectionsAndProject(
  state: WorkspaceState,
  project: Project,
  extra: Partial<WorkspaceState>,
): WorkspaceState {
  return { ...state, ...extra, project, inspectionIssues: inspectProject(project) }
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
  | { type: 'deleteSelection' }
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
  /** Task Information OK — one reducer pass so FS can clear soft pins last. */
  | {
      type: 'applyTaskInformation'
      taskId: string
      advanced: {
        constraintType: Parameters<typeof TaskUseCases.updateTask>[2]['constraintType']
        constraintDate: Date | null
      }
      assignments: { resourceId: string; units: number }[]
      general: Parameters<typeof TaskUseCases.updateTask>[2]
      predecessors: { predecessorId: string; type: LinkType; lagHours: number }[]
    }
  | { type: 'addResource' }
  | {
      type: 'updateResource'
      resourceId: string
      patch: Parameters<typeof ResourceUseCases.updateResource>[2]
    }
  | { type: 'setResourceCalendar'; resourceId: string; calendarId: string }
  | { type: 'ensureResourceCalendar'; resourceId: string }
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
    case 'openAssignDialog': {
      const taskId = action.taskId ?? state.selectedTaskId
      if (!taskId) {
        return {
          ...state,
          assignDialogOpen: false,
          statusMessage: 'Select a task to assign resources.',
        }
      }
      return {
        ...state,
        assignDialogOpen: true,
        selectedTaskId: taskId,
        selectedTaskIds: action.taskId ? [action.taskId] : state.selectedTaskIds,
      }
    }
    case 'closeAssignDialog':
      return { ...state, assignDialogOpen: false }
    case 'setProject':
      return withInspectionsAndProject(state, action.project, {
        statusMessage: action.message ?? state.statusMessage,
      })
    case 'setStatus':
      return { ...state, statusMessage: action.message }
    case 'setBusy':
      return { ...state, busyMessage: action.message }
    case 'newProject':
      return withInspectionsAndProject(state, createEmptyProject(ids), {
        selectedTaskId: null,
        selectedTaskIds: [],
        statusMessage: 'Created a blank project.',
      })
    case 'loadDemo':
      return withInspectionsAndProject(state, createDemoProject(ids), {
        selectedTaskId: null,
        selectedTaskIds: [],
        statusMessage: 'Loaded sample project.',
      })
    case 'addTask':
      return withInspectionsAndProject(state, TaskUseCases.addTask(state.project, ids, {
          afterTaskId: action.afterTaskId,
        }), { statusMessage: 'Task added.' })
    case 'addMilestone':
      return withInspectionsAndProject(state, TaskUseCases.addMilestone(state.project, ids, action.afterTaskId), {
        statusMessage: 'Milestone added (0h).',
      })
    case 'updateTask':
      return withInspections(state, TaskUseCases.updateTask(state.project, action.taskId, action.patch))
    case 'deleteTask':
      return withInspectionsAndProject(state, TaskUseCases.deleteTask(state.project, action.taskId), {
        selectedTaskId:
          state.selectedTaskId === action.taskId ? null : state.selectedTaskId,
        selectedTaskIds: state.selectedTaskIds.filter((id) => id !== action.taskId),
        statusMessage: 'Task deleted.',
      })
    case 'deleteSelection': {
      const ids =
        state.selectedTaskIds.length > 0
          ? [...state.selectedTaskIds]
          : state.selectedTaskId
            ? [state.selectedTaskId]
            : []
      if (ids.length === 0) return state
      let project = state.project
      for (const id of ids) {
        if (project.tasks.some((t) => t.id === id)) {
          project = TaskUseCases.deleteTask(project, id)
        }
      }
      return withInspectionsAndProject(state, project, {
        selectedTaskId: null,
        selectedTaskIds: [],
        statusMessage: ids.length > 1 ? 'Tasks deleted.' : 'Task deleted.',
      })
    }
    case 'indentTask':
      return withInspections(state, HierarchyUseCases.indentTaskUseCase(state.project, action.taskId))
    case 'outdentTask':
      return withInspections(state, HierarchyUseCases.outdentTaskUseCase(state.project, action.taskId))
    case 'linkTasks':
      try {
        return withInspectionsAndProject(state, DependencyUseCases.linkTasks(
            state.project,
            ids,
            action.predecessorId,
            action.successorId,
            action.linkType ?? 'FS',
            action.lagHours ?? 0,
          ), { statusMessage: 'Dependency created.' })
      } catch (error) {
        return {
          ...state,
          inspectionIssues: inspectProject(state.project),
          statusMessage: error instanceof Error ? error.message : 'Link failed.',
        }
      }
    case 'linkSelection':
      try {
        return withInspectionsAndProject(state, DependencyUseCases.linkTaskChain(
            state.project,
            ids,
            state.selectedTaskIds,
          ), { statusMessage: 'Linked selected tasks (FS).' })
      } catch (error) {
        return {
          ...state,
          inspectionIssues: inspectProject(state.project),
          statusMessage: error instanceof Error ? error.message : 'Link failed.',
        }
      }
    case 'unlinkSelection':
      return withInspectionsAndProject(state, DependencyUseCases.unlinkTasks(
          state.project,
          state.selectedTaskIds.length > 0
            ? state.selectedTaskIds
            : state.selectedTaskId
              ? [state.selectedTaskId]
              : [],
        ), { statusMessage: 'Unlinked predecessors for selection.' })
    case 'unlinkDependency':
      return withInspections(state, DependencyUseCases.unlinkDependency(
          state.project,
          action.dependencyId,
        ))
    case 'setPredecessors':
      try {
        return withInspectionsAndProject(state, DependencyUseCases.setPredecessorsFromNotation(
            state.project,
            ids,
            action.taskId,
            action.notation,
          ), { statusMessage: 'Predecessors updated.' })
      } catch (error) {
        return {
          ...state,
          inspectionIssues: inspectProject(state.project),
          statusMessage: error instanceof Error ? error.message : 'Invalid predecessors.',
        }
      }
    case 'setPredecessorLinks':
      try {
        return withInspectionsAndProject(state, DependencyUseCases.setPredecessorLinks(
            state.project,
            ids,
            action.taskId,
            action.links,
          ), { statusMessage: 'Predecessors updated.' })
      } catch (error) {
        return {
          ...state,
          inspectionIssues: inspectProject(state.project),
          statusMessage: error instanceof Error ? error.message : 'Invalid predecessors.',
        }
      }
    case 'applyTaskInformation': {
      try {
        // Advanced → Resources → General (non-date) → Predecessors → Start/Finish last.
        // Predecessors can clear soft SNET; Start must win afterward. A Start edit also
        // must not be undone by Advanced ASAP applied earlier in the same OK.
        const { start, finish, ...generalRest } = action.general
        const startMove = start !== undefined
        let project = state.project
        if (!startMove) {
          project = TaskUseCases.updateTask(project, action.taskId, {
            constraintType: action.advanced.constraintType,
            constraintDate: action.advanced.constraintDate,
          })
        }
        project = ResourceUseCases.setTaskAssignments(
          project,
          ids,
          action.taskId,
          action.assignments,
        )
        project = TaskUseCases.updateTask(project, action.taskId, generalRest)
        project = DependencyUseCases.setPredecessorLinks(
          project,
          ids,
          action.taskId,
          action.predecessors,
        )
        if (startMove && start) {
          // Direction (earlier→MSO / later→SNET) is decided inside updateTask.
          // Forcing SNET here made “move Start back / into the past” a no-op.
          project = TaskUseCases.updateTask(project, action.taskId, { start })
        } else if (finish !== undefined) {
          project = TaskUseCases.updateTask(project, action.taskId, {
            finish,
            ...(action.advanced.constraintType !== 'asSoonAsPossible'
              ? {
                  constraintType: action.advanced.constraintType,
                  constraintDate: action.advanced.constraintDate,
                }
              : {}),
          })
        }
        return withInspectionsAndProject(state, project, {
          taskInfoOpen: false,
          statusMessage: 'Task updated.',
        })
      } catch (error) {
        return {
          ...state,
          inspectionIssues: inspectProject(state.project),
          statusMessage:
            error instanceof Error ? error.message : 'Could not apply task information.',
        }
      }
    }
    case 'addResource':
      return withInspectionsAndProject(state, ResourceUseCases.addResource(state.project, ids), {
        statusMessage: 'Resource added.',
      })
    case 'updateResource':
      return withInspections(state, ResourceUseCases.updateResource(
          state.project,
          action.resourceId,
          action.patch,
        ))
    case 'setResourceCalendar':
      try {
        return withInspectionsAndProject(state, ResourceUseCases.setResourceCalendar(
            state.project,
            action.resourceId,
            action.calendarId,
          ), { statusMessage: 'Resource calendar updated.' })
      } catch (error) {
        return {
          ...state,
          inspectionIssues: inspectProject(state.project),
          statusMessage:
            error instanceof Error ? error.message : 'Could not set resource calendar.',
        }
      }
    case 'ensureResourceCalendar':
      try {
        return withInspectionsAndProject(state, ResourceUseCases.ensureResourceCalendar(
            state.project,
            ids,
            action.resourceId,
          ), { statusMessage: 'Resource calendar ready for exceptions.' })
      } catch (error) {
        return {
          ...state,
          inspectionIssues: inspectProject(state.project),
          statusMessage:
            error instanceof Error ? error.message : 'Could not create resource calendar.',
        }
      }
    case 'deleteResource':
      return withInspectionsAndProject(state, ResourceUseCases.deleteResource(state.project, action.resourceId), {
        selectedResourceId:
          state.selectedResourceId === action.resourceId
            ? null
            : state.selectedResourceId,
      })
    case 'assignResource':
      return withInspectionsAndProject(state, ResourceUseCases.assignResource(
          state.project,
          ids,
          action.taskId,
          action.resourceId,
          action.units,
        ), { statusMessage: 'Resource assigned.' })
    case 'unassignResource':
      return withInspectionsAndProject(state, ResourceUseCases.unassignResource(
          state.project,
          action.assignmentId,
        ), { statusMessage: 'Resource unassigned.' })
    case 'setTaskAssignments':
      return withInspectionsAndProject(state, ResourceUseCases.setTaskAssignments(
          state.project,
          ids,
          action.taskId,
          action.links,
        ), { statusMessage: 'Task resources updated.' })
    case 'setBaseline':
      return withInspectionsAndProject(state, ProjectUseCases.setBaseline(state.project), {
        statusMessage: 'Baseline saved.',
      })
    case 'clearBaseline':
      return withInspectionsAndProject(state, ProjectUseCases.clearBaseline(state.project), {
        statusMessage: 'Baseline cleared.',
      })
    case 'updateProjectInfo':
      return withInspections(state, ProjectUseCases.updateProjectInfo(state.project, action.patch))
    default:
      return state
  }
}

export type { ResourceType }
