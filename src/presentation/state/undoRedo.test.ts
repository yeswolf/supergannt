import { describe, expect, it } from 'vitest'
import {
  createInitialState,
  undoableReducer,
  workspaceReducer,
  type WorkspaceState,
} from './workspace'

function state(): WorkspaceState {
  return createInitialState()
}

describe('undoableReducer', () => {
  it('captures snapshot before a project mutation and restores on undo', () => {
    let s = workspaceReducer(state(), { type: 'newProject' })
    expect(s.undoStack).toHaveLength(0)

    s = undoableReducer(s, { type: 'addTask' })
    expect(s.undoStack).toHaveLength(1)
    expect(s.undoStack[0]!.label).toBe('Add task')
    expect(s.project.tasks).toHaveLength(1)

    s = undoableReducer(s, { type: 'undo' })
    expect(s.project.tasks).toHaveLength(0)
    expect(s.undoStack).toHaveLength(0)
    expect(s.redoStack).toHaveLength(1)
    expect(s.redoStack[0]!.label).toBe('Add task')
    expect(s.statusMessage).toMatch(/Undo/)
  })

  it('redo restores the previously undone state', () => {
    let s = workspaceReducer(state(), { type: 'newProject' })
    s = undoableReducer(s, { type: 'addTask' })
    const taskAfterAdd = s.project.tasks[0]!.id

    s = undoableReducer(s, { type: 'undo' })
    expect(s.project.tasks).toHaveLength(0)
    expect(s.redoStack).toHaveLength(1)

    s = undoableReducer(s, { type: 'redo' })
    expect(s.project.tasks).toHaveLength(1)
    expect(s.project.tasks[0]!.id).toBe(taskAfterAdd)
    expect(s.redoStack).toHaveLength(0)
    expect(s.undoStack).toHaveLength(1)
  })

  it('clears redo stack after a new mutation', () => {
    let s = workspaceReducer(state(), { type: 'newProject' })
    s = undoableReducer(s, { type: 'addTask' })
    s = undoableReducer(s, { type: 'undo' })
    expect(s.redoStack).toHaveLength(1)

    s = undoableReducer(s, { type: 'addMilestone' })
    expect(s.redoStack).toHaveLength(0)
    expect(s.undoStack).toHaveLength(1)
  })

  it('does nothing when undoing with empty stack', () => {
    const base = state()
    const s = undoableReducer(base, { type: 'undo' })
    expect(s.undoStack).toHaveLength(0)
  })

  it('does nothing when redoing with empty stack', () => {
    const base = state()
    const s = undoableReducer(base, { type: 'redo' })
    expect(s.redoStack).toHaveLength(0)
  })

  it('covers task field edits (updateTask)', () => {
    let s = workspaceReducer(state(), { type: 'newProject' })
    s = undoableReducer(s, { type: 'addTask' })
    const taskId = s.project.tasks[0]!.id
    const originalName = s.project.tasks[0]!.name

    s = undoableReducer(s, {
      type: 'updateTask',
      taskId,
      patch: { name: 'Alpha', durationHours: 24 },
    })
    expect(s.project.tasks[0]!.name).toBe('Alpha')
    expect(s.undoStack).toHaveLength(2)

    s = undoableReducer(s, { type: 'undo' })
    expect(s.project.tasks[0]!.name).toBe(originalName)
    expect(s.undoStack).toHaveLength(1)
    expect(s.redoStack).toHaveLength(1)
  })

  it('covers dependency link and unlink', () => {
    let s = workspaceReducer(state(), { type: 'newProject' })
    s = undoableReducer(s, { type: 'addTask' })
    s = undoableReducer(s, { type: 'addTask' })
    const [a, b] = s.project.tasks

    s = undoableReducer(s, {
      type: 'linkTasks',
      predecessorId: a!.id,
      successorId: b!.id,
    })
    expect(s.project.dependencies).toHaveLength(1)

    s = undoableReducer(s, { type: 'undo' })
    expect(s.project.dependencies).toHaveLength(0)
    expect(s.redoStack).toHaveLength(1)

    s = undoableReducer(s, { type: 'redo' })
    expect(s.project.dependencies).toHaveLength(1)
  })

  it('covers resource assignment and unassignment', () => {
    let s = workspaceReducer(state(), { type: 'newProject' })
    s = undoableReducer(s, { type: 'addResource' })
    s = undoableReducer(s, { type: 'addTask' })
    const taskId = s.project.tasks[0]!.id
    const resourceId = s.project.resources[0]!.id

    s = undoableReducer(s, {
      type: 'assignResource',
      taskId,
      resourceId,
      units: 1,
    })
    expect(s.project.assignments).toHaveLength(1)

    s = undoableReducer(s, { type: 'undo' })
    expect(s.project.assignments).toHaveLength(0)

    s = undoableReducer(s, { type: 'redo' })
    expect(s.project.assignments).toHaveLength(1)

    const assignmentId = s.project.assignments[0]!.id
    s = undoableReducer(s, { type: 'unassignResource', assignmentId })
    expect(s.project.assignments).toHaveLength(0)
  })

  it('covers baseline set and clear', () => {
    let s = workspaceReducer(state(), { type: 'newProject' })
    s = undoableReducer(s, { type: 'addTask' })

    s = undoableReducer(s, { type: 'setBaseline' })
    expect(s.project.tasks[0]!.baseline).toBeDefined()

    s = undoableReducer(s, { type: 'undo' })
    expect(s.project.tasks[0]!.baseline).toBeNull()

    s = undoableReducer(s, { type: 'redo' })
    expect(s.project.tasks[0]!.baseline).toBeDefined()

    s = undoableReducer(s, { type: 'clearBaseline' })
    expect(s.project.tasks[0]!.baseline).toBeNull()

    s = undoableReducer(s, { type: 'undo' })
    expect(s.project.tasks[0]!.baseline).toBeDefined()
  })

  it('covers indent and outdent', () => {
    let s = workspaceReducer(state(), { type: 'newProject' })
    s = undoableReducer(s, { type: 'addTask' })
    s = undoableReducer(s, { type: 'addTask' })
    const [, b] = s.project.tasks
    const originalOutline = b!.outlineLevel

    s = undoableReducer(s, { type: 'indentTask', taskId: b!.id })
    expect(s.project.tasks[1]!.outlineLevel).toBeGreaterThan(originalOutline)

    s = undoableReducer(s, { type: 'undo' })
    expect(s.project.tasks[1]!.outlineLevel).toBe(originalOutline)

    s = undoableReducer(s, { type: 'redo' })
    expect(s.project.tasks[1]!.outlineLevel).toBeGreaterThan(originalOutline)

    s = undoableReducer(s, { type: 'undo' })
    s = undoableReducer(s, { type: 'outdentTask', taskId: b!.id })
    expect(s.project.tasks[1]!.outlineLevel).toBe(originalOutline)
  })

  it('covers delete task', () => {
    let s = workspaceReducer(state(), { type: 'newProject' })
    s = undoableReducer(s, { type: 'addTask' })
    s = undoableReducer(s, { type: 'addTask' })
    const taskId = s.project.tasks[0]!.id

    s = undoableReducer(s, { type: 'deleteTask', taskId })
    expect(s.project.tasks).toHaveLength(1)

    s = undoableReducer(s, { type: 'undo' })
    expect(s.project.tasks).toHaveLength(2)
  })

  it('covers updateResource and deleteResource', () => {
    let s = workspaceReducer(state(), { type: 'newProject' })
    s = undoableReducer(s, { type: 'addResource' })
    const resourceId = s.project.resources[0]!.id

    s = undoableReducer(s, {
      type: 'updateResource',
      resourceId,
      patch: { name: 'Engineers' },
    })
    expect(s.project.resources[0]!.name).toBe('Engineers')

    s = undoableReducer(s, { type: 'undo' })
    expect(s.project.resources[0]!.name).not.toBe('Engineers')

    s = undoableReducer(s, { type: 'undo' })
    expect(s.project.resources).toHaveLength(0)
  })

  it('covers updateProjectInfo', () => {
    let s = workspaceReducer(state(), { type: 'newProject' })
    const originalTitle = s.project.title

    s = undoableReducer(s, {
      type: 'updateProjectInfo',
      patch: { title: 'New Title' },
    })
    expect(s.project.title).toBe('New Title')

    s = undoableReducer(s, { type: 'undo' })
    expect(s.project.title).toBe(originalTitle)
  })

  it('resets stack on newProject, loadDemo, and setProject', () => {
    let s = workspaceReducer(state(), { type: 'newProject' })
    s = undoableReducer(s, { type: 'addTask' })
    s = undoableReducer(s, { type: 'addTask' })
    expect(s.undoStack.length).toBeGreaterThan(0)

    s = undoableReducer(s, { type: 'newProject' })
    expect(s.undoStack).toHaveLength(0)
    expect(s.redoStack).toHaveLength(0)

    s = undoableReducer(s, { type: 'addTask' })
    expect(s.undoStack).toHaveLength(1)

    s = undoableReducer(s, { type: 'loadDemo' })
    expect(s.undoStack).toHaveLength(0)
    expect(s.redoStack).toHaveLength(0)

    s = undoableReducer(s, { type: 'addTask' })
    expect(s.undoStack).toHaveLength(1)

    s = undoableReducer(s, {
      type: 'setProject',
      project: s.project,
      message: 'Loaded file.',
    })
    expect(s.undoStack).toHaveLength(0)
    expect(s.redoStack).toHaveLength(0)
  })

  it('supports multi-step undo of 10+ consecutive actions', () => {
    let s = workspaceReducer(state(), { type: 'newProject' })

    for (let i = 0; i < 15; i++) {
      s = undoableReducer(s, { type: 'addTask' })
    }
    expect(s.undoStack).toHaveLength(15)
    expect(s.project.tasks).toHaveLength(15)

    for (let i = 0; i < 10; i++) {
      s = undoableReducer(s, { type: 'undo' })
    }
    expect(s.project.tasks).toHaveLength(5)
    expect(s.undoStack).toHaveLength(5)
    expect(s.redoStack).toHaveLength(10)

    for (let i = 0; i < 3; i++) {
      s = undoableReducer(s, { type: 'redo' })
    }
    expect(s.project.tasks).toHaveLength(8)
    expect(s.redoStack).toHaveLength(7)
    expect(s.undoStack).toHaveLength(8)
  })

  it('caps undo stack at 50 entries', () => {
    let s = workspaceReducer(state(), { type: 'newProject' })

    for (let i = 0; i < 60; i++) {
      s = undoableReducer(s, { type: 'addTask' })
    }
    expect(s.undoStack).toHaveLength(50)
    expect(s.project.tasks).toHaveLength(60)

    for (let i = 0; i < 50; i++) {
      s = undoableReducer(s, { type: 'undo' })
    }
    expect(s.project.tasks).toHaveLength(10)
    expect(s.undoStack).toHaveLength(0)
    expect(s.redoStack).toHaveLength(50)
  })

  it('does not snapshot when mutation returns same project (error path)', () => {
    let s = workspaceReducer(state(), { type: 'newProject' })
    s = undoableReducer(s, { type: 'addTask' })
    const taskId = s.project.tasks[0]!.id
    const stackBefore = s.undoStack.length

    s = undoableReducer(s, {
      type: 'linkTasks',
      predecessorId: taskId,
      successorId: taskId,
    })
    expect(s.undoStack.length).toBe(stackBefore)
  })

  it('UI-only actions pass through without affecting stacks', () => {
    let s = workspaceReducer(state(), { type: 'newProject' })
    s = undoableReducer(s, { type: 'addTask' })
    const stackLen = s.undoStack.length

    s = undoableReducer(s, { type: 'setView', view: 'tasks' })
    expect(s.undoStack).toHaveLength(stackLen)
    expect(s.view).toBe('tasks')

    s = undoableReducer(s, { type: 'selectTask', taskId: s.project.tasks[0]!.id })
    expect(s.undoStack).toHaveLength(stackLen)

    s = undoableReducer(s, { type: 'openTaskInfo' })
    expect(s.undoStack).toHaveLength(stackLen)

    s = undoableReducer(s, { type: 'closeTaskInfo' })
    expect(s.undoStack).toHaveLength(stackLen)

    s = undoableReducer(s, { type: 'setStatus', message: 'hello' })
    expect(s.undoStack).toHaveLength(stackLen)
  })
})
