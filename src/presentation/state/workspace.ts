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
import { CsvCodec } from '../../infrastructure/csv/CsvCodec'
import { HttpMppToXmlConverter } from '../../infrastructure/mpp/HttpMppToXmlConverter'
import { HttpXmlToMppConverter } from '../../infrastructure/mpp/HttpXmlToMppConverter'
import { PreferTauriMppToXmlConverter } from '../../infrastructure/mpp/PreferTauriMppToXmlConverter'
import { PreferTauriXmlToMppConverter } from '../../infrastructure/mpp/PreferTauriXmlToMppConverter'
import type { InspectionFinding } from '../../application/services/ProjectInspector'
import { inspectProject } from '../../application/services/ProjectInspector'
import {
  createInitialFilterSortState,
  type TaskFilterSortState,
  type ColumnFilter,
  type TaskSort,
  type TaskGroupField,
} from '../../application/services/TaskFilterSortService'

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
    [new MppCodec(ids, mppConverter, mppWriter), new MspdiCodec(ids), new MpxCodec(), new CsvCodec(ids, 'task'), new CsvCodec(ids, 'resource')],
    new LocalStorageProjectRepository(),
  )
  return { ids, files }
}

/** Maximum undo stack depth. */
const MAX_UNDO_DEPTH = 50

/** Snapshot of project state saved before each mutation. */
interface UndoEntry {
  project: Project
  /** Human-readable label shown in UI (e.g. "Add task"). */
  label: string
}

export interface AutoSaveState {
  /** 'idle' | 'saving' | 'saved' — shown in the toolbar indicator. */
  status: 'idle' | 'saving' | 'saved'
  /** True when there are unsaved changes since the last explicit save. */
  dirty: boolean
  /** True when auto-save skipped because localStorage is near quota. */
  quotaWarning: boolean
  /** Non-null when a recovery snapshot exists on app open. */
  recoverySnapshot: {
    savedAt: string
    fileName: string | null
  } | null
  /** Incremented on every project mutation — a robust trigger for the auto-save
   *  hook that doesn't depend on object-reference identity. */
  mutationCounter: number
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
  /** Undo stack — most recent snapshot at the end. */
  undoStack: UndoEntry[]
  /** Redo stack — most recently undone at the end. */
  redoStack: UndoEntry[]
  /** Auto-save state for the toolbar indicator and recovery. */
  autoSave: AutoSaveState
  /** Project inspection findings updated after every mutation. */
  inspections: InspectionFinding[]
  /** AutoFilter state — filtering, sorting, and grouping for task views. */
  taskFilterSort: TaskFilterSortState
}

const INITIAL_AUTO_SAVE: AutoSaveState = {
  status: 'idle',
  dirty: false,
  quotaWarning: false,
  recoverySnapshot: null,
  mutationCounter: 0,
}

export function createInitialState(services = createAppServices()): WorkspaceState {
  const project = createEmptyProject(services.ids)
  return {
    project,
    view: 'gantt',
    selectedTaskId: null,
    selectedTaskIds: [],
    selectedResourceId: null,
    taskInfoOpen: false,
    taskInfoTab: 'general',
    assignDialogOpen: false,
    statusMessage: 'Blank plan — add a task or open a file.',
    busyMessage: null,
    services,
    undoStack: [],
    redoStack: [],
    autoSave: { ...INITIAL_AUTO_SAVE },
    inspections: inspectProject(project),
    taskFilterSort: createInitialFilterSortState(),
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
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'autoSaveSaving' }
  | { type: 'autoSaveSaved'; quotaWarning?: boolean }
  | { type: 'autoSaveIdle' }
  | { type: 'setRecoverySnapshot'; snapshot: AutoSaveState['recoverySnapshot'] }
  | { type: 'dismissRecoverySnapshot' }
  | { type: 'setTaskFilter'; filter: ColumnFilter }
  | { type: 'removeTaskFilter'; filterId: string }
  | { type: 'clearTaskFilters' }
  | { type: 'setTaskSort'; sort: TaskSort | null }
  | { type: 'setTaskGroup'; groupBy: TaskGroupField }

/** Push a snapshot onto the undo stack, capping at MAX_UNDO_DEPTH. */
function pushUndo(stack: UndoEntry[], entry: UndoEntry): UndoEntry[] {
  const next = [...stack, entry]
  if (next.length > MAX_UNDO_DEPTH) {
    return next.slice(next.length - MAX_UNDO_DEPTH)
  }
  return next
}

/** Project-mutating action types — these capture a snapshot before running. */
const PROJECT_MUTATIONS = new Set<string>([
  'addTask',
  'addMilestone',
  'updateTask',
  'deleteTask',
  'deleteSelection',
  'indentTask',
  'outdentTask',
  'linkTasks',
  'linkSelection',
  'unlinkSelection',
  'unlinkDependency',
  'setPredecessors',
  'setPredecessorLinks',
  'applyTaskInformation',
  'addResource',
  'updateResource',
  'setResourceCalendar',
  'ensureResourceCalendar',
  'deleteResource',
  'assignResource',
  'unassignResource',
  'setTaskAssignments',
  'setBaseline',
  'clearBaseline',
  'updateProjectInfo',
])

/** Human-readable labels for undo/redo entries. */
const ACTION_LABELS: Record<string, string> = {
  addTask: 'Add task',
  addMilestone: 'Add milestone',
  updateTask: 'Edit task',
  deleteTask: 'Delete task',
  deleteSelection: 'Delete selection',
  indentTask: 'Indent',
  outdentTask: 'Outdent',
  linkTasks: 'Link tasks',
  linkSelection: 'Link selection',
  unlinkSelection: 'Unlink selection',
  unlinkDependency: 'Unlink dependency',
  setPredecessors: 'Set predecessors',
  setPredecessorLinks: 'Set predecessors',
  applyTaskInformation: 'Edit task info',
  addResource: 'Add resource',
  updateResource: 'Edit resource',
  setResourceCalendar: 'Set resource calendar',
  ensureResourceCalendar: 'Create resource calendar',
  deleteResource: 'Delete resource',
  assignResource: 'Assign resource',
  unassignResource: 'Unassign resource',
  setTaskAssignments: 'Set task assignments',
  setBaseline: 'Set baseline',
  clearBaseline: 'Clear baseline',
  updateProjectInfo: 'Edit project info',
}

/** Increments the mutation counter and sets dirty — used by every
 *  project-mutating action so the auto-save hook can detect changes
 *  without relying on object-reference identity. */
function markDirty(autoSave: AutoSaveState): AutoSaveState {
  return { ...autoSave, dirty: true, mutationCounter: autoSave.mutationCounter + 1 }
}

/**
 * Wrap the base reducer to capture project snapshots before every mutation.
 *
 * Strategy (snapshot / memento):
 * - Before any project-mutating action, the current Project is pushed onto the
 *   undo stack (up to 50 entries; oldest evicted first).
 * - Undo pops from the undo stack, pushes the current Project onto the redo
 *   stack, and restores the popped snapshot.
 * - Redo pops from the redo stack, pushes the current Project onto the undo
 *   stack, and restores the popped snapshot.
 * - Any new mutation after an undo clears the redo stack (standard behaviour).
 * - setProject, newProject, and loadDemo reset both stacks (file open / new).
 * - UI-only actions (setView, selectTask, openTaskInfo, etc.) do NOT push
 *   snapshots and have no effect on the stacks.
 */
export function undoableReducer(
  state: WorkspaceState,
  action: WorkspaceAction,
): WorkspaceState {
  // --- Undo / Redo -------------------------------------------------------
  if (action.type === 'undo') {
    if (state.undoStack.length === 0) return state
    const entry = state.undoStack[state.undoStack.length - 1]
    const prev = entry.project
    return {
      ...state,
      undoStack: state.undoStack.slice(0, -1),
      redoStack: pushUndo(state.redoStack, {
        project: state.project,
        label: entry.label,
      }),
      project: prev,
      statusMessage: `Undo: ${entry.label}`,
      autoSave: markDirty(state.autoSave),
      inspections: inspectProject(prev),
    }
  }

  if (action.type === 'redo') {
    if (state.redoStack.length === 0) return state
    const entry = state.redoStack[state.redoStack.length - 1]
    const next = entry.project
    return {
      ...state,
      redoStack: state.redoStack.slice(0, -1),
      undoStack: pushUndo(state.undoStack, {
        project: state.project,
        label: entry.label,
      }),
      project: next,
      statusMessage: `Redo: ${entry.label}`,
      autoSave: markDirty(state.autoSave),
      inspections: inspectProject(next),
    }
  }

  // --- Stack-reset actions -----------------------------------------------
  if (
    action.type === 'setProject' ||
    action.type === 'newProject' ||
    action.type === 'loadDemo'
  ) {
    const result = workspaceReducer(state, action)
    return { ...result, undoStack: [], redoStack: [], autoSave: { ...result.autoSave, dirty: false }, inspections: inspectProject(result.project), taskFilterSort: createInitialFilterSortState() }
  }

  // --- Project-mutating actions: snapshot before, clear redo after -------
  if (PROJECT_MUTATIONS.has(action.type)) {
    const prevProject = state.project
    const result = workspaceReducer(state, action)
    // Only snapshot if the project actually changed (e.g. linkTasks may
    // return same project on error).
    if (result.project !== prevProject) {
      return {
        ...result,
        undoStack: pushUndo(state.undoStack, {
          project: prevProject,
          label: ACTION_LABELS[action.type] ?? action.type,
        }),
        redoStack: [],
        autoSave: markDirty(result.autoSave),
        inspections: inspectProject(result.project),
      }
    }
    return result
  }

  // --- UI-only actions: pass through ------------------------------------
  return workspaceReducer(state, action)
}

/** Base reducer — pure domain logic, unchanged from before undo/redo. */
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
      return {
        ...state,
        project,
        selectedTaskId: null,
        selectedTaskIds: [],
        statusMessage: ids.length > 1 ? 'Tasks deleted.' : 'Task deleted.',
      }
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
          // Forcing SNET here made "move Start back / into the past" a no-op.
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
        return {
          ...state,
          project,
          taskInfoOpen: false,
          statusMessage: 'Task updated.',
        }
      } catch (error) {
        return {
          ...state,
          statusMessage:
            error instanceof Error ? error.message : 'Could not apply task information.',
        }
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
    case 'setResourceCalendar':
      try {
        return {
          ...state,
          project: ResourceUseCases.setResourceCalendar(
            state.project,
            action.resourceId,
            action.calendarId,
          ),
          statusMessage: 'Resource calendar updated.',
        }
      } catch (error) {
        return {
          ...state,
          statusMessage:
            error instanceof Error ? error.message : 'Could not set resource calendar.',
        }
      }
    case 'ensureResourceCalendar':
      try {
        return {
          ...state,
          project: ResourceUseCases.ensureResourceCalendar(
            state.project,
            ids,
            action.resourceId,
          ),
          statusMessage: 'Resource calendar ready for exceptions.',
        }
      } catch (error) {
        return {
          ...state,
          statusMessage:
            error instanceof Error ? error.message : 'Could not create resource calendar.',
        }
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
    // --- Auto-save --------------------------------------------------------
    case 'autoSaveSaving':
      return { ...state, autoSave: { ...state.autoSave, status: 'saving' } }
    case 'autoSaveSaved':
      return {
        ...state,
        autoSave: {
          ...state.autoSave,
          status: 'saved',
          quotaWarning: action.quotaWarning ?? false,
        },
      }
    case 'autoSaveIdle':
      return { ...state, autoSave: { ...state.autoSave, status: 'idle' } }
    case 'setRecoverySnapshot':
      return { ...state, autoSave: { ...state.autoSave, recoverySnapshot: action.snapshot } }
    case 'dismissRecoverySnapshot':
      return { ...state, autoSave: { ...state.autoSave, recoverySnapshot: null } }
    // --- Filter / Sort / Group ----------------------------------------------
    case 'setTaskFilter':
      return {
        ...state,
        taskFilterSort: {
          ...state.taskFilterSort,
          filters: [
            ...state.taskFilterSort.filters.filter(
              (f) => f.column !== action.filter.column,
            ),
            action.filter,
          ],
        },
      }
    case 'removeTaskFilter':
      return {
        ...state,
        taskFilterSort: {
          ...state.taskFilterSort,
          filters: state.taskFilterSort.filters.filter(
            (f) => f.id !== action.filterId,
          ),
        },
      }
    case 'clearTaskFilters':
      return {
        ...state,
        taskFilterSort: { ...state.taskFilterSort, filters: [], sort: null, groupBy: 'none' },
      }
    case 'setTaskSort':
      return {
        ...state,
        taskFilterSort: { ...state.taskFilterSort, sort: action.sort },
      }
    case 'setTaskGroup':
      return {
        ...state,
        taskFilterSort: { ...state.taskFilterSort, groupBy: action.groupBy },
      }
    default:
      return state
  }
}

export type { ResourceType }
