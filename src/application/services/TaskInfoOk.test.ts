import { describe, expect, it } from 'vitest'
import type { IdGenerator } from '../ports/IdGenerator'
import { createEmptyProject } from './ProjectFactory'
import * as DependencyUseCases from '../use-cases/DependencyUseCases'
import * as ResourceUseCases from '../use-cases/ResourceUseCases'
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

describe('Task Information OK (duration + FS predecessor)', () => {
  it('keeps edited duration hours when Resources tab is re-saved unchanged', () => {
    const ids = new SeqIds()
    let project = createEmptyProject(ids)
    project = TaskUseCases.addTask(project, ids, { name: 'A', durationHours: 8 })
    project = ResourceUseCases.addResource(project, ids, { name: 'Dev' })
    const task = project.tasks[0]!
    const resource = project.resources[0]!
    project = ResourceUseCases.assignResource(project, ids, task.id, resource.id, 1)

    // OK order: advanced → resources (same) → general (new hours) → predecessors
    project = TaskUseCases.updateTask(project, task.id, {
      constraintType: 'asSoonAsPossible',
      constraintDate: null,
    })
    project = ResourceUseCases.setTaskAssignments(project, ids, task.id, [
      { resourceId: resource.id, units: 1 },
    ])
    project = TaskUseCases.updateTask(project, task.id, {
      name: 'A',
      durationHours: 40,
      percentComplete: 0,
      notes: '',
    })

    expect(project.tasks.find((t) => t.id === task.id)!.duration.toHours()).toBe(40)
  })

  it('shifts successor after FS even when Advanced SNLT was applied earlier in OK', () => {
    const ids = new SeqIds()
    let project = createEmptyProject(ids)
    project = TaskUseCases.addTask(project, ids, { name: 'A', durationHours: 16 })
    project = TaskUseCases.addTask(project, ids, { name: 'B', durationHours: 8 })
    const a = project.tasks[0]!
    const b = project.tasks[1]!
    const pinnedStart = b.start

    project = TaskUseCases.updateTask(project, b.id, {
      constraintType: 'startNoLaterThan',
      constraintDate: pinnedStart,
    })
    project = TaskUseCases.updateTask(project, b.id, {
      name: 'B',
      durationHours: 8,
      percentComplete: 0,
      notes: '',
    })
    project = DependencyUseCases.setPredecessorLinks(project, ids, b.id, [
      { predecessorId: a.id, type: 'FS', lagHours: 0 },
    ])

    const a2 = project.tasks.find((t) => t.id === a.id)!
    const b2 = project.tasks.find((t) => t.id === b.id)!
    expect(b2.constraintType).toBe('asSoonAsPossible')
    expect(b2.start.getTime()).toBe(
      project.getCalendar().snapToWorkStart(a2.finish).getTime(),
    )
    expect(b2.start.getTime()).toBeGreaterThan(pinnedStart.getTime())
  })

  it('workspace OK sequence preserves hours and FS shift together', () => {
    let state = createInitialState()
    state = workspaceReducer(state, { type: 'newProject' })
    state = workspaceReducer(state, { type: 'addTask' })
    state = workspaceReducer(state, { type: 'addTask' })
    state = workspaceReducer(state, { type: 'addResource' })
    const pred = state.project.tasks[0]!
    const succ = state.project.tasks[1]!
    const res = state.project.resources[0]!
    state = workspaceReducer(state, {
      type: 'assignResource',
      taskId: succ.id,
      resourceId: res.id,
      units: 1,
    })
    state = workspaceReducer(state, {
      type: 'updateTask',
      taskId: succ.id,
      patch: { constraintType: 'startNoLaterThan', constraintDate: succ.start },
    })

    state = workspaceReducer(state, {
      type: 'applyTaskInformation',
      taskId: succ.id,
      advanced: {
        constraintType: 'startNoLaterThan',
        constraintDate: succ.start,
      },
      assignments: [{ resourceId: res.id, units: 1 }],
      general: {
        name: succ.name,
        durationHours: 24,
        percentComplete: 0,
        notes: '',
      },
      predecessors: [{ predecessorId: pred.id, type: 'FS', lagHours: 0 }],
    })

    const pred2 = state.project.tasks.find((t) => t.id === pred.id)!
    const succ2 = state.project.tasks.find((t) => t.id === succ.id)!
    expect(state.taskInfoOpen).toBe(false)
    expect(succ2.duration.toHours()).toBe(24)
    expect(succ2.start.getTime()).toBe(
      state.project.getCalendar().snapToWorkStart(pred2.finish).getTime(),
    )
  })
})
