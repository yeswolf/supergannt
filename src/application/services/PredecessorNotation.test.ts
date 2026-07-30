import { describe, expect, it } from 'vitest'
import type { IdGenerator } from '../ports/IdGenerator'
import { createEmptyProject } from './ProjectFactory'
import {
  formatPredecessors,
  parsePredecessorToken,
  parsePredecessorsField,
} from './PredecessorNotation'
import * as DependencyUseCases from '../use-cases/DependencyUseCases'
import * as TaskUseCases from '../use-cases/TaskUseCases'
import { Duration } from '../../domain/value-objects/Duration'
import { asDependencyId, asTaskId } from '../../domain/value-objects/Ids'
import { Dependency } from '../../domain/entities/Dependency'

class SeqIds implements IdGenerator {
  private n = 0
  private next(prefix: string) {
    this.n += 1
    return `${prefix}${this.n}`
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

function threeTasks() {
  const ids = new SeqIds()
  let project = createEmptyProject(ids)
  project = TaskUseCases.addTask(project, ids, { name: 'A' })
  project = TaskUseCases.addTask(project, ids, { name: 'B' })
  project = TaskUseCases.addTask(project, ids, { name: 'C' })
  return { ids, project, tasks: project.tasks }
}

describe('PredecessorNotation', () => {
  it('parses and formats ProjectLibre-style predecessors', () => {
    const { ids, project: base, tasks } = threeTasks()
    let project = base
    const [a, b, c] = tasks
    project = DependencyUseCases.linkTasks(project, ids, a!.id, c!.id, 'FS', 8)
    project = DependencyUseCases.linkTasks(project, ids, b!.id, c!.id, 'SS', 0)

    const formatted = formatPredecessors(project, c!.id)
    expect(formatted).toMatch(/1/)
    expect(formatted).toMatch(/2SS|SS/)

    const parsed = parsePredecessorsField('1FS+8h,2SS', project.tasks)
    expect(parsed).toHaveLength(2)
    expect(parsed[0]!.lagHours).toBe(8)
    expect(parsed[1]!.type).toBe('SS')
  })

  it('parses lag units days/weeks, negative lag, WBS refs, and empty field', () => {
    const { project } = threeTasks()
    expect(parsePredecessorsField('  ', project.tasks)).toEqual([])
    expect(parsePredecessorToken('   ', project.tasks)).toBeNull()

    const byDay = parsePredecessorToken('1FS+2d', project.tasks)
    expect(byDay!.lagHours).toBe(16)
    const byWeek = parsePredecessorToken('2SS-1w', project.tasks)
    expect(byWeek!.lagHours).toBe(-40)
    expect(byWeek!.type).toBe('SS')

    const wbs = project.tasks[0]!.wbs
    const byWbs = parsePredecessorToken(`${wbs}FF+4h`, project.tasks)
    expect(byWbs!.taskId).toBe(project.tasks[0]!.id)
    expect(byWbs!.type).toBe('FF')

    expect(() => parsePredecessorToken('nope', project.tasks)).toThrow(/Invalid predecessor/)
    expect(() => parsePredecessorToken('99', project.tasks)).toThrow(/Unknown predecessor/)
  })

  it('formats non-FS types and skips missing predecessor ids', () => {
    const { ids, project: base, tasks } = threeTasks()
    let project = base
    const [a, , c] = tasks
    project = DependencyUseCases.linkTasks(project, ids, a!.id, c!.id, 'FF', 0)
    expect(formatPredecessors(project, c!.id)).toBe('1FF')

    const ghost = Dependency.create({
      id: asDependencyId('ghost'),
      predecessorId: asTaskId('missing'),
      successorId: asTaskId(c!.id),
      type: 'FS',
      lag: Duration.zero(),
    })
    project = project.with({
      dependencies: [...project.dependencies, ghost],
    })
    expect(formatPredecessors(project, c!.id)).toBe('1FF')
  })
})

describe('DependencyUseCases', () => {
  it('links a chain and unlinks predecessors', () => {
    const { ids, project: base } = threeTasks()
    let project = base
    const idsList = project.tasks.map((t) => t.id)

    project = DependencyUseCases.linkTaskChain(project, ids, idsList)
    expect(project.dependencies).toHaveLength(2)

    project = DependencyUseCases.setPredecessorsFromNotation(
      project,
      ids,
      idsList[2]!,
      '1FS+4h',
    )
    expect(project.dependencies.filter((d) => d.successorId === idsList[2]).length).toBe(
      1,
    )
    expect(
      project.dependencies.find((d) => d.successorId === idsList[2])!.lag.toHours(),
    ).toBe(4)

    project = DependencyUseCases.unlinkTasks(project, [idsList[1]!, idsList[2]!])
    expect(project.dependencies).toHaveLength(0)
  })

  it('rejects short chains, self-links, and empty unlink', () => {
    const { ids, project: base, tasks } = threeTasks()
    let project = base
    expect(() => DependencyUseCases.linkTaskChain(project, ids, [tasks[0]!.id])).toThrow(
      /two tasks/,
    )
    expect(() =>
      DependencyUseCases.linkTasks(project, ids, tasks[0]!.id, tasks[0]!.id),
    ).toThrow(/itself/)

    const before = project
    project = DependencyUseCases.unlinkTasks(project, [])
    expect(project).toBe(before)

    expect(() =>
      DependencyUseCases.setPredecessorsFromNotation(
        project,
        ids,
        tasks[0]!.id,
        '1',
      ),
    ).toThrow(/itself/)

    expect(() =>
      DependencyUseCases.setPredecessorLinks(project, ids, tasks[1]!.id, [
        { predecessorId: tasks[1]!.id, type: 'FS', lagHours: 0 },
      ]),
    ).toThrow(/itself/)
  })

  it('updates dependency type/lag and replaces predecessor links', () => {
    const { ids, project: base, tasks } = threeTasks()
    let project = base
    const [a, b, c] = tasks
    project = DependencyUseCases.linkTasks(project, ids, a!.id, c!.id, 'FS', 0)
    const depId = project.dependencies[0]!.id

    project = DependencyUseCases.updateDependency(project, depId, { lagDays: 1 })
    expect(project.dependencies[0]!.lag.toHours()).toBe(8)

    project = DependencyUseCases.updateDependency(project, depId, { type: 'SS' })
    expect(project.dependencies[0]!.type).toBe('SS')

    project = DependencyUseCases.setPredecessorLinks(project, ids, c!.id, [
      { predecessorId: a!.id, type: 'FS', lagHours: 2 },
      { predecessorId: b!.id, type: 'FF', lagHours: 0 },
    ])
    expect(project.dependencies.filter((d) => d.successorId === c!.id)).toHaveLength(2)
  })

  it('applies lead (negative lag) and shifts the successor immediately', () => {
    const { ids, project: base, tasks } = threeTasks()
    const [a, , c] = tasks
    let project = DependencyUseCases.linkTasks(base, ids, a!.id, c!.id, 'FS', 0)
    const fsStart = project.tasks.find((t) => t.id === c!.id)!.start.getTime()

    project = DependencyUseCases.setPredecessorsFromNotation(
      project,
      ids,
      c!.id,
      '1FS-4h',
    )
    expect(project.dependencies.find((d) => d.successorId === c!.id)!.lag.toHours()).toBe(
      -4,
    )
    const leadStart = project.tasks.find((t) => t.id === c!.id)!.start.getTime()
    expect(leadStart).toBeLessThan(fsStart)
  })
})
