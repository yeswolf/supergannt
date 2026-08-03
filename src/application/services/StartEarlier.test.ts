import { describe, expect, it } from 'vitest'
import {
  createInitialState,
  workspaceReducer,
} from '../../presentation/state/workspace'

describe('start earlier cascade', () => {
  it('moving start earlier shifts task and FS successors back', () => {
    let s = workspaceReducer(createInitialState(), { type: 'newProject' })
    s = workspaceReducer(s, { type: 'addTask' })
    s = workspaceReducer(s, { type: 'addTask' })
    const [a, b] = s.project.tasks
    s = workspaceReducer(s, {
      type: 'linkTasks',
      predecessorId: a!.id,
      successorId: b!.id,
    })
    const cal = s.project.getCalendar()
    const a0 = s.project.tasks.find((t) => t.id === a!.id)!
    const later = cal.addWorkingHours(a0.start, 40)
    s = workspaceReducer(s, {
      type: 'updateTask',
      taskId: a!.id,
      patch: { start: later },
    })
    const aLate = s.project.tasks.find((t) => t.id === a!.id)!
    const bLate = s.project.tasks.find((t) => t.id === b!.id)!
    expect(aLate.constraintType).toBe('startNoEarlierThan')

    const earlier = cal.addWorkingHours(a0.start, 8)
    s = workspaceReducer(s, {
      type: 'updateTask',
      taskId: a!.id,
      patch: { start: earlier },
    })
    const aEarly = s.project.tasks.find((t) => t.id === a!.id)!
    const bEarly = s.project.tasks.find((t) => t.id === b!.id)!
    expect(aEarly.constraintType).toBe('mustStartOn')
    expect(aEarly.start.getTime()).toBeLessThan(aLate.start.getTime())
    expect(bEarly.start.getTime()).toBeLessThan(bLate.start.getTime())
    expect(bEarly.start.getTime()).toBe(cal.snapToWorkStart(aEarly.finish).getTime())
  })

  it('explicit start before project start is honored and pulls project start back', () => {
    let s = workspaceReducer(createInitialState(), { type: 'newProject' })
    s = workspaceReducer(s, { type: 'addTask' })
    s = workspaceReducer(s, { type: 'addTask' })
    const [a, b] = s.project.tasks
    s = workspaceReducer(s, {
      type: 'linkTasks',
      predecessorId: a!.id,
      successorId: b!.id,
    })
    const projectStart = s.project.startDate
    const past = new Date(projectStart.getTime() - 14 * 86400000)
    s = workspaceReducer(s, {
      type: 'updateTask',
      taskId: a!.id,
      patch: { start: past },
    })
    const a2 = s.project.tasks.find((t) => t.id === a!.id)!
    const b2 = s.project.tasks.find((t) => t.id === b!.id)!
    const cal = s.project.getCalendar()
    expect(a2.constraintType).toBe('mustStartOn')
    expect(a2.start.getTime()).toBeLessThan(projectStart.getTime())
    expect(s.project.startDate.getTime()).toBeLessThanOrEqual(a2.start.getTime())
    expect(b2.start.getTime()).toBe(cal.snapToWorkStart(a2.finish).getTime())
  })

  it('Task Info OK earlier Start moves the chain back', () => {
    let s = workspaceReducer(createInitialState(), { type: 'newProject' })
    s = workspaceReducer(s, { type: 'addTask' })
    s = workspaceReducer(s, { type: 'addTask' })
    const [a, b] = s.project.tasks
    s = workspaceReducer(s, {
      type: 'linkTasks',
      predecessorId: a!.id,
      successorId: b!.id,
    })
    const cal = s.project.getCalendar()
    const a0 = s.project.tasks.find((t) => t.id === a!.id)!
    const later = cal.addWorkingHours(a0.start, 40)
    s = workspaceReducer(s, {
      type: 'updateTask',
      taskId: a!.id,
      patch: { start: later },
    })
    const aLate = s.project.tasks.find((t) => t.id === a!.id)!
    const earlier = cal.addWorkingHours(a0.start, 8)
    s = workspaceReducer(s, {
      type: 'applyTaskInformation',
      taskId: a!.id,
      advanced: { constraintType: 'asSoonAsPossible', constraintDate: null },
      assignments: [],
      general: {
        name: aLate.name,
        percentComplete: aLate.percentComplete,
        notes: aLate.notes,
        start: earlier,
      },
      predecessors: [],
    })
    const a2 = s.project.tasks.find((t) => t.id === a!.id)!
    const b2 = s.project.tasks.find((t) => t.id === b!.id)!
    expect(a2.start.getTime()).toBeLessThan(aLate.start.getTime())
    expect(a2.constraintType).toBe('mustStartOn')
    expect(b2.start.getTime()).toBe(cal.snapToWorkStart(a2.finish).getTime())
  })
})
