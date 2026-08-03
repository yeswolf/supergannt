import { describe, expect, it } from 'vitest'
import {
  createInitialState,
  workspaceReducer,
  type WorkspaceState,
} from './workspace'

function state(): WorkspaceState {
  return createInitialState()
}

describe('workspaceReducer', () => {
  it('switches views and selection', () => {
    let s = state()
    s = workspaceReducer(s, { type: 'setView', view: 'resources' })
    expect(s.view).toBe('resources')
    s = workspaceReducer(s, { type: 'selectTask', taskId: 'x' })
    expect(s.selectedTaskId).toBe('x')
    s = workspaceReducer(s, { type: 'selectResource', resourceId: 'r' })
    expect(s.selectedResourceId).toBe('r')
    s = workspaceReducer(s, { type: 'setStatus', message: 'ok' })
    expect(s.statusMessage).toBe('ok')
    s = workspaceReducer(s, { type: 'setBusy', message: 'Opening plan.xml…' })
    expect(s.busyMessage).toBe('Opening plan.xml…')
    s = workspaceReducer(s, { type: 'setBusy', message: null })
    expect(s.busyMessage).toBeNull()
  })

  it('creates projects and mutates tasks/resources', () => {
    let s = workspaceReducer(state(), { type: 'newProject' })
    expect(s.project.tasks).toHaveLength(0)
    s = workspaceReducer(s, { type: 'addTask' })
    expect(s.project.tasks).toHaveLength(1)
    const taskId = s.project.tasks[0]!.id
    s = workspaceReducer(s, {
      type: 'updateTask',
      taskId,
      patch: { name: 'Alpha', durationHours: 24 },
    })
    expect(s.project.tasks[0]!.name).toBe('Alpha')
    const laterStart = new Date(s.project.tasks[0]!.start.getTime() + 7 * 24 * 60 * 60 * 1000)
    s = workspaceReducer(s, {
      type: 'updateTask',
      taskId,
      patch: { start: laterStart },
    })
    expect(s.project.tasks[0]!.constraintType).toBe('startNoEarlierThan')
    expect(s.project.tasks[0]!.start.getTime()).toBeGreaterThanOrEqual(laterStart.getTime() - 86400000)
    const finishOnly = new Date(s.project.tasks[0]!.start.getTime() + 14 * 24 * 60 * 60 * 1000)
    const hoursBefore = s.project.tasks[0]!.duration.toHours()
    s = workspaceReducer(s, {
      type: 'updateTask',
      taskId,
      patch: { finish: finishOnly },
    })
    expect(s.project.tasks[0]!.duration.toHours()).toBeGreaterThan(hoursBefore)
    s = workspaceReducer(s, { type: 'indentTask', taskId })
    s = workspaceReducer(s, { type: 'outdentTask', taskId })
    s = workspaceReducer(s, { type: 'addResource' })
    const resourceId = s.project.resources[0]!.id
    s = workspaceReducer(s, {
      type: 'assignResource',
      taskId,
      resourceId,
    })
    s = workspaceReducer(s, { type: 'addTask' })
    const second = s.project.tasks[1]!.id
    const succBefore = s.project.tasks.find((t) => t.id === second)!.start.getTime()
    s = workspaceReducer(s, {
      type: 'linkTasks',
      predecessorId: taskId,
      successorId: second,
    })
    expect(s.project.dependencies.length).toBe(1)
    const pred = s.project.tasks.find((t) => t.id === taskId)!
    const succ = s.project.tasks.find((t) => t.id === second)!
    expect(succ.start.getTime()).toBeGreaterThan(succBefore)
    expect(succ.start.getTime()).toBe(
      s.project.getCalendar().snapToWorkStart(pred.finish).getTime(),
    )
    s = workspaceReducer(s, {
      type: 'unlinkDependency',
      dependencyId: s.project.dependencies[0]!.id,
    })
    s = workspaceReducer(s, { type: 'setBaseline' })
    s = workspaceReducer(s, { type: 'clearBaseline' })
    s = workspaceReducer(s, {
      type: 'updateProjectInfo',
      patch: { title: 'T' },
    })
    s = workspaceReducer(s, {
      type: 'updateResource',
      resourceId,
      patch: { name: 'Eng' },
    })
    s = workspaceReducer(s, { type: 'deleteResource', resourceId })
    s = workspaceReducer(s, { type: 'deleteTask', taskId })
    s = workspaceReducer(s, { type: 'loadDemo' })
    expect(s.project.tasks.length).toBeGreaterThan(0)
    s = workspaceReducer(s, {
      type: 'linkTasks',
      predecessorId: 'same',
      successorId: 'same',
    })
    expect(s.statusMessage).toMatch(/itself|Link|Cannot/i)
  })

  it('supports multi-select link/unlink and predecessors notation', () => {
    let s = workspaceReducer(state(), { type: 'newProject' })
    s = workspaceReducer(s, { type: 'addTask' })
    s = workspaceReducer(s, { type: 'addTask' })
    s = workspaceReducer(s, { type: 'addTask' })
    const [a, b, c] = s.project.tasks.map((t) => t.id)

    s = workspaceReducer(s, { type: 'selectTask', taskId: a! })
    s = workspaceReducer(s, { type: 'selectTask', taskId: b!, additive: true })
    s = workspaceReducer(s, { type: 'selectTask', taskId: c!, additive: true })
    expect(s.selectedTaskIds).toEqual([a, b, c])

    s = workspaceReducer(s, { type: 'linkSelection' })
    expect(s.project.dependencies).toHaveLength(2)

    s = workspaceReducer(s, {
      type: 'setPredecessors',
      taskId: c!,
      notation: '1FS+8h',
    })
    expect(
      s.project.dependencies.find((d) => d.successorId === c)!.lag.toHours(),
    ).toBe(8)

    s = workspaceReducer(s, { type: 'openTaskInfo', taskId: c })
    expect(s.taskInfoOpen).toBe(true)
    s = workspaceReducer(s, { type: 'closeTaskInfo' })
    expect(s.taskInfoOpen).toBe(false)

    s = workspaceReducer(s, { type: 'selectTask', taskId: a! })
    s = workspaceReducer(s, { type: 'selectTask', taskId: b!, additive: true })
    s = workspaceReducer(s, { type: 'selectTask', taskId: c!, additive: true })
    s = workspaceReducer(s, { type: 'unlinkSelection' })
    expect(s.project.dependencies).toHaveLength(0)

    s = workspaceReducer(s, { type: 'addResource' })
    const resourceId = s.project.resources[0]!.id
    s = workspaceReducer(s, {
      type: 'assignResource',
      taskId: a!,
      resourceId,
      units: 1,
    })
    expect(s.project.assignments).toHaveLength(1)
    s = workspaceReducer(s, { type: 'openAssignDialog', taskId: a })
    expect(s.assignDialogOpen).toBe(true)
    s = workspaceReducer(s, {
      type: 'setTaskAssignments',
      taskId: a!,
      links: [{ resourceId, units: 0.5 }],
    })
    expect(s.project.assignments[0]!.units).toBe(0.5)
    s = workspaceReducer(s, {
      type: 'unassignResource',
      assignmentId: s.project.assignments[0]!.id,
    })
    expect(s.project.assignments).toHaveLength(0)
    s = workspaceReducer(s, { type: 'closeAssignDialog' })
    expect(s.assignDialogOpen).toBe(false)

    s = workspaceReducer(s, { type: 'linkSelection' })
    expect(s.statusMessage).toMatch(/two|Link|Select/i)

    s = workspaceReducer(s, {
      type: 'setPredecessors',
      taskId: a!,
      notation: '1',
    })
    expect(s.statusMessage).toMatch(/itself|Invalid/i)

    s = workspaceReducer(s, {
      type: 'setPredecessorLinks',
      taskId: a!,
      links: [{ predecessorId: a!, type: 'FS', lagHours: 0 }],
    })
    expect(s.statusMessage).toMatch(/itself|Invalid/i)

    s = workspaceReducer(s, { type: 'unlinkSelection' })
    s = workspaceReducer(s, { type: 'selectTask', taskId: null })
    s = workspaceReducer(s, { type: 'unlinkSelection' })
    expect(s.project.dependencies.length).toBeGreaterThanOrEqual(0)

    s = workspaceReducer(s, {
      type: 'openTaskInfo',
      taskId: b!,
      tab: 'resources',
    })
    expect(s.taskInfoTab).toBe('resources')
  })

  it('linkTasks shifts successor; unknown unlinkDependency is a no-op', () => {
    let s = workspaceReducer(state(), { type: 'newProject' })
    s = workspaceReducer(s, { type: 'addTask' })
    s = workspaceReducer(s, { type: 'addTask' })
    const [a, b] = s.project.tasks
    const before = b!.start.getTime()

    s = workspaceReducer(s, {
      type: 'linkTasks',
      predecessorId: a!.id,
      successorId: b!.id,
      linkType: 'FS',
    })
    expect(s.project.dependencies).toHaveLength(1)
    const depId = s.project.dependencies[0]!.id
    const shifted = s.project.tasks.find((t) => t.id === b!.id)!.start.getTime()
    expect(shifted).toBeGreaterThan(before)

    // Transient dhtmlx link id must not remove our dependency / unshift the bar.
    const afterLink = s.project
    s = workspaceReducer(s, { type: 'unlinkDependency', dependencyId: 'gantt-temp-1' })
    expect(s.project).toBe(afterLink)
    expect(s.project.dependencies).toHaveLength(1)
    expect(s.project.tasks.find((t) => t.id === b!.id)!.start.getTime()).toBe(shifted)

    s = workspaceReducer(s, { type: 'unlinkDependency', dependencyId: '1' })
    expect(s.project).toBe(afterLink)

    s = workspaceReducer(s, { type: 'unlinkDependency', dependencyId: depId })
    expect(s.project.dependencies).toHaveLength(0)
  })
})
