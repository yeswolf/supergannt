import { describe, expect, it } from 'vitest'
import type { IdGenerator } from '../ports/IdGenerator'
import { createEmptyProject } from './ProjectFactory'
import * as DependencyUseCases from '../use-cases/DependencyUseCases'
import * as TaskUseCases from '../use-cases/TaskUseCases'
import {
  createInitialState,
  workspaceReducer,
} from '../../presentation/state/workspace'

class SeqIds implements IdGenerator {
  private n = 0
  private next(prefix: string) {
    this.n += 1
    return prefix + this.n
  }
  projectId() {
    return this.next('p')
  }
  taskId() {
    return this.next('t')
  }
  resourceId() {
    return this.next('r')
  }
  dependencyId() {
    return this.next('d')
  }
  assignmentId() {
    return this.next('a')
  }
  calendarId() {
    return this.next('c')
  }
}

describe('FS successor reschedule on predecessor link', () => {
  it('shifts successor start after predecessor finish when FS link is added', () => {
    const ids = new SeqIds()
    let project = createEmptyProject(ids)
    project = TaskUseCases.addTask(project, ids, { name: 'A', durationHours: 16 })
    project = TaskUseCases.addTask(project, ids, { name: 'B', durationHours: 8 })
    const a = project.tasks[0]!
    const b = project.tasks[1]!
    const before = b.start.getTime()
    expect(before).toBe(a.start.getTime())

    project = DependencyUseCases.linkTasks(project, ids, a.id, b.id, 'FS', 0)

    const a2 = project.tasks.find((t) => t.id === a.id)!
    const b2 = project.tasks.find((t) => t.id === b.id)!
    const cal = project.getCalendar()
    expect(b2.start.getTime()).toBe(cal.snapToWorkStart(a2.finish).getTime())
    expect(b2.start.getTime()).toBeGreaterThan(before)
  })

  it('shifts when predecessor is set via Task Information links API', () => {
    const ids = new SeqIds()
    let project = createEmptyProject(ids)
    project = TaskUseCases.addTask(project, ids, { name: 'A', durationHours: 8 })
    project = TaskUseCases.addTask(project, ids, { name: 'B', durationHours: 8 })
    const a = project.tasks[0]!
    const b = project.tasks[1]!

    project = DependencyUseCases.setPredecessorLinks(project, ids, b.id, [
      { predecessorId: a.id, type: 'FS', lagHours: 0 },
    ])

    const a2 = project.tasks.find((t) => t.id === a.id)!
    const b2 = project.tasks.find((t) => t.id === b.id)!
    expect(b2.start.getTime()).toBe(
      project.getCalendar().snapToWorkStart(a2.finish).getTime(),
    )
    expect(b2.constraintType).toBe('asSoonAsPossible')
  })

  it('shifts via setPredecessorsFromNotation (Task Sheet style)', () => {
    const ids = new SeqIds()
    let project = createEmptyProject(ids)
    project = TaskUseCases.addTask(project, ids, { name: 'A', durationHours: 8 })
    project = TaskUseCases.addTask(project, ids, { name: 'B', durationHours: 8 })
    const a = project.tasks[0]!
    const b = project.tasks[1]!

    project = DependencyUseCases.setPredecessorsFromNotation(
      project,
      ids,
      b.id,
      '1FS',
    )

    const a2 = project.tasks.find((t) => t.id === a.id)!
    const b2 = project.tasks.find((t) => t.id === b.id)!
    expect(b2.start.getTime()).toBe(
      project.getCalendar().snapToWorkStart(a2.finish).getTime(),
    )
  })

  it('clears soft SNLT/SNET so FS can push a newly linked successor', () => {
    const ids = new SeqIds()
    let project = createEmptyProject(ids)
    project = TaskUseCases.addTask(project, ids, { name: 'A', durationHours: 16 })
    project = TaskUseCases.addTask(project, ids, { name: 'B', durationHours: 8 })
    const a = project.tasks[0]!
    const b = project.tasks[1]!

    // Soft pin at current start — SNLT would otherwise block FS push-out.
    project = TaskUseCases.updateTask(project, b.id, {
      constraintType: 'startNoLaterThan',
      constraintDate: b.start,
    })

    project = DependencyUseCases.linkTasks(project, ids, a.id, b.id, 'FS', 0)
    const a2 = project.tasks.find((t) => t.id === a.id)!
    const b2 = project.tasks.find((t) => t.id === b.id)!
    expect(b2.constraintType).toBe('asSoonAsPossible')
    expect(b2.start.getTime()).toBe(
      project.getCalendar().snapToWorkStart(a2.finish).getTime(),
    )
  })

  it('still shifts successor that has SNET at its original overlapping start', () => {
    const ids = new SeqIds()
    let project = createEmptyProject(ids)
    project = TaskUseCases.addTask(project, ids, { name: 'A', durationHours: 8 })
    project = TaskUseCases.addTask(project, ids, { name: 'B', durationHours: 8 })
    const a = project.tasks[0]!
    const b = project.tasks[1]!

    project = TaskUseCases.updateTask(project, b.id, {
      constraintType: 'startNoEarlierThan',
      constraintDate: a.start,
      start: a.start,
    })

    project = DependencyUseCases.linkTasks(project, ids, a.id, b.id, 'FS', 0)
    const a2 = project.tasks.find((t) => t.id === a.id)!
    const b2 = project.tasks.find((t) => t.id === b.id)!
    expect(b2.start.getTime()).toBe(
      project.getCalendar().snapToWorkStart(a2.finish).getTime(),
    )
  })

  it('workspace linkSelection and setPredecessorLinks shift successor bars', () => {
    let s = createInitialState()
    s = workspaceReducer(s, { type: 'newProject' })
    s = workspaceReducer(s, { type: 'addTask' })
    s = workspaceReducer(s, { type: 'addTask' })
    const [a, b] = s.project.tasks
    const before = b!.start.getTime()

    s = workspaceReducer(s, { type: 'selectTask', taskId: a!.id })
    s = workspaceReducer(s, { type: 'selectTask', taskId: b!.id, additive: true })
    s = workspaceReducer(s, { type: 'linkSelection' })

    const a2 = s.project.tasks.find((t) => t.id === a!.id)!
    const b2 = s.project.tasks.find((t) => t.id === b!.id)!
    expect(b2.start.getTime()).toBeGreaterThan(before)
    expect(b2.start.getTime()).toBe(
      s.project.getCalendar().snapToWorkStart(a2.finish).getTime(),
    )

    s = workspaceReducer(s, { type: 'unlinkSelection' })
    s = workspaceReducer(s, { type: 'addTask' })
    const c = s.project.tasks.find((t) => t.id !== a!.id && t.id !== b!.id)!
    s = workspaceReducer(s, {
      type: 'setPredecessorLinks',
      taskId: c.id,
      links: [{ predecessorId: b!.id, type: 'FS', lagHours: 0 }],
    })
    const b3 = s.project.tasks.find((t) => t.id === b!.id)!
    const c2 = s.project.tasks.find((t) => t.id === c.id)!
    expect(c2.start.getTime()).toBe(
      s.project.getCalendar().snapToWorkStart(b3.finish).getTime(),
    )
  })

  it('keeps mustStartOn hard lock when linking', () => {
    const ids = new SeqIds()
    let project = createEmptyProject(ids)
    project = TaskUseCases.addTask(project, ids, { name: 'A', durationHours: 16 })
    project = TaskUseCases.addTask(project, ids, { name: 'B', durationHours: 8 })
    const a = project.tasks[0]!
    const b = project.tasks[1]!
    const pinned = b.start

    project = TaskUseCases.updateTask(project, b.id, {
      constraintType: 'mustStartOn',
      constraintDate: pinned,
    })
    project = DependencyUseCases.linkTasks(project, ids, a.id, b.id, 'FS', 0)
    const b2 = project.tasks.find((t) => t.id === b.id)!
    expect(b2.constraintType).toBe('mustStartOn')
    expect(b2.start.getTime()).toBe(
      project.getCalendar().snapToWorkStart(pinned).getTime(),
    )
  })
})
