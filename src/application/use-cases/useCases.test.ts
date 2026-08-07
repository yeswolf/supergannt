import { describe, expect, it } from 'vitest'
import type { IdGenerator } from '../ports/IdGenerator'
import { createDemoProject, createEmptyProject } from '../services/ProjectFactory'
import { refreshProject } from '../services/ProjectRefresh'
import * as TaskUseCases from '../use-cases/TaskUseCases'
import * as HierarchyUseCases from '../use-cases/HierarchyUseCases'
import * as DependencyUseCases from '../use-cases/DependencyUseCases'
import * as ResourceUseCases from '../use-cases/ResourceUseCases'
import * as ProjectUseCases from '../use-cases/ProjectUseCases'
import { FileUseCases } from '../use-cases/FileUseCases'
import { MspdiCodec } from '../../infrastructure/mspdi/MspdiCodec'
import type { ProjectRepository } from '../ports/ProjectRepository'
import type { Project } from '../../domain/entities/Project'
import {
  computeEarnedValue,
  toNetworkDiagram,
  toResourceSheet,
} from '../services/ReportingService'

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

class MemoryRepo implements ProjectRepository {
  draft: Project | null = null
  autoSnapshot: Project | null = null
  autoMeta: import('../ports/ProjectRepository').AutoSnapshotMetadata | null = null
  async saveDraft(project: Project) {
    this.draft = project
  }
  async loadDraft() {
    return this.draft
  }
  async clearDraft() {
    this.draft = null
  }
  async saveAutoSnapshot(project: Project, meta: import('../ports/ProjectRepository').AutoSnapshotMetadata) {
    this.autoSnapshot = project
    this.autoMeta = meta
  }
  async getAutoSnapshotMetadata() {
    return this.autoMeta
  }
  async loadAutoSnapshot() {
    return this.autoSnapshot
  }
  async clearAutoSnapshot() {
    this.autoSnapshot = null
    this.autoMeta = null
  }
}

describe('use cases', () => {
  const ids = new SeqIds()

  it('adds milestones and reassigns resources updating units', () => {
    let project = createEmptyProject(ids)
    project = TaskUseCases.addMilestone(project, ids)
    expect(project.tasks[0]!.milestone).toBe(true)
    expect(project.tasks[0]!.duration.toHours()).toBe(0)

    project = TaskUseCases.addTask(project, ids, { name: 'Work' })
    const taskId = project.tasks[1]!.id
    project = ResourceUseCases.addResource(project, ids, { name: 'Dev' })
    const resourceId = project.resources[0]!.id
    project = ResourceUseCases.assignResource(project, ids, taskId, resourceId, 1)
    project = ResourceUseCases.assignResource(project, ids, taskId, resourceId, 0.75)
    expect(project.assignments).toHaveLength(1)
    expect(project.assignments[0]!.units).toBe(0.75)
    // Fixed Units: units 1→0.75 holds work, duration = 8 / 0.75
    expect(project.tasks.find((t) => t.id === taskId)!.duration.toHours()).toBeCloseTo(
      8 / 0.75,
      2,
    )
    expect(ResourceUseCases.formatTaskResourceNames(project, taskId)).toContain('[0.75]')

    project = TaskUseCases.updateTask(project, taskId, {
      milestone: true,
      durationHours: 0,
    })
    expect(project.tasks.find((t) => t.id === taskId)!.milestone).toBe(true)
    project = TaskUseCases.deleteTask(project, 'missing-id')
    expect(project.tasks.length).toBe(2)
  })

  it('recalculates duration when adding a second effort-driven resource', () => {
    let project = createEmptyProject(ids)
    project = TaskUseCases.addTask(project, ids, { name: 'Build', durationHours: 16 })
    const taskId = project.tasks[0]!.id
    project = ResourceUseCases.addResource(project, ids, { name: 'A' })
    project = ResourceUseCases.addResource(project, ids, { name: 'B' })
    const [r1, r2] = project.resources
    project = ResourceUseCases.assignResource(project, ids, taskId, r1!.id, 1)
    expect(project.tasks[0]!.duration.toHours()).toBe(16)
    project = ResourceUseCases.assignResource(project, ids, taskId, r2!.id, 1)
    expect(project.tasks[0]!.duration.toHours()).toBe(8)
    expect(project.tasks[0]!.workHours).toBe(16)
  })

  it('fixed duration units change grows work without changing duration', () => {
    let project = createEmptyProject(ids)
    project = TaskUseCases.addTask(project, ids, { name: 'Meeting', durationHours: 8 })
    const taskId = project.tasks[0]!.id
    project = TaskUseCases.updateTask(project, taskId, { schedulingType: 'fixedDuration' })
    project = ResourceUseCases.addResource(project, ids, { name: 'Facilitator' })
    const resourceId = project.resources[0]!.id
    project = ResourceUseCases.assignResource(project, ids, taskId, resourceId, 1)
    project = ResourceUseCases.assignResource(project, ids, taskId, resourceId, 2)
    expect(project.tasks[0]!.duration.toHours()).toBe(8)
    expect(project.tasks[0]!.workHours).toBe(16)
  })

  it('adds updates deletes tasks and hierarchy', () => {
    let project = createEmptyProject(ids)
    project = TaskUseCases.addTask(project, ids, { name: 'Parent' })
    const parentId = project.tasks[0]!.id
    project = TaskUseCases.addTask(project, ids, { name: 'Child', afterTaskId: parentId })
    const childId = project.tasks[1]!.id
    project = HierarchyUseCases.indentTaskUseCase(project, childId)
    expect(project.tasks[1]!.outlineLevel).toBe(1)
    project = TaskUseCases.updateTask(project, childId, {
      durationHours: 32,
      percentComplete: 25,
      notes: 'hi',
    })
    expect(project.tasks[1]!.duration.toHours()).toBe(32)
    project = HierarchyUseCases.outdentTaskUseCase(project, childId)
    project = TaskUseCases.deleteTask(project, parentId)
    expect(project.tasks.find((t) => t.id === parentId)).toBeUndefined()
  })

  it('links resources and baselines', () => {
    let project = refreshProject(createDemoProject(ids))
    const a = project.tasks.find((t) => !t.summary)!
    const b = project.tasks.find((t) => !t.summary && t.id !== a.id)!
    project = DependencyUseCases.linkTasks(project, ids, a.id, b.id, 'FS', 1)
    expect(project.dependencies.length).toBeGreaterThan(0)
    const depId = project.dependencies[0]!.id
    project = DependencyUseCases.updateDependency(project, depId, {
      type: 'SS',
      lagHours: 0,
    })
    expect(project.dependencies[0]!.type).toBe('SS')
    project = DependencyUseCases.unlinkDependency(project, depId)

    project = ResourceUseCases.addResource(project, ids, {
      name: 'QA',
      standardRate: 50,
    })
    const resourceId = project.resources.at(-1)!.id
    project = ResourceUseCases.updateResource(project, resourceId, {
      group: 'Quality',
      maxUnits: 2,
    })
    project = ResourceUseCases.assignResource(project, ids, a.id, resourceId, 1)
    expect(project.assignments.some((x) => x.taskId === a.id)).toBe(true)
    expect(ResourceUseCases.formatTaskResourceNames(project, a.id)).toContain('QA')
    project = ResourceUseCases.setTaskAssignments(project, ids, a.id, [
      { resourceId, units: 0.5 },
    ])
    expect(project.assignments.find((x) => x.taskId === a.id)!.units).toBe(0.5)
    const assignmentId = project.assignments.find((x) => x.resourceId === resourceId)!.id
    project = ResourceUseCases.unassignResource(project, assignmentId)
    project = ResourceUseCases.deleteResource(project, resourceId)

    project = ProjectUseCases.setBaseline(project)
    expect(project.tasks.every((t) => t.baseline != null)).toBe(true)
    project = ProjectUseCases.clearBaseline(project)
    expect(project.tasks.every((t) => t.baseline == null)).toBe(true)
    project = ProjectUseCases.updateProjectInfo(project, {
      name: 'Renamed',
      manager: 'Ada',
    })
    expect(project.name).toBe('Renamed')
  })

  it('opens and saves via FileUseCases round-trip', async () => {
    const repo = new MemoryRepo()
    const codec = new MspdiCodec(ids)
    const files = new FileUseCases([codec], repo)
    const original = refreshProject(createDemoProject(ids))
    const { content } = await codec.serialize(original)
    const opened = await files.openFile(content, 'plan.xml')
    expect(opened.tasks.length).toBe(original.tasks.length)
    const saved = await files.saveFile(opened, 'out.xml')
    expect(saved.fileName).toBe('out.xml')
    expect(saved.blob.type).toContain('xml')
    await files.persistDraft(saved.project)
    const draft = await files.loadDraft()
    expect(draft?.name).toBe(opened.name)
  })

  it('recalculates duration when assignment units change (Fixed Units)', () => {
    let project = createEmptyProject(ids)
    project = TaskUseCases.addTask(project, ids, {
      name: 'Build',
      durationHours: 40,
    })
    const taskId = project.tasks[0]!.id
    project = ResourceUseCases.addResource(project, ids, { name: 'Dev' })
    const resourceId = project.resources[0]!.id
    project = ResourceUseCases.assignResource(project, ids, taskId, resourceId, 1)
    expect(project.tasks[0]!.duration.toHours()).toBe(40)
    expect(project.tasks[0]!.workHours).toBe(40)

    project = ResourceUseCases.assignResource(project, ids, taskId, resourceId, 0.5)
    expect(project.tasks[0]!.duration.toHours()).toBe(80)
    expect(project.tasks[0]!.workHours).toBe(40)
  })

  it('shortens duration when adding a second resource (effort-driven)', () => {
    let project = createEmptyProject(ids)
    project = TaskUseCases.addTask(project, ids, {
      name: 'Build',
      durationHours: 40,
      effortDriven: true,
    })
    const taskId = project.tasks[0]!.id
    project = ResourceUseCases.addResource(project, ids, { name: 'Dev' })
    project = ResourceUseCases.addResource(project, ids, { name: 'QA' })
    const r1 = project.resources[0]!.id
    const r2 = project.resources[1]!.id
    project = ResourceUseCases.assignResource(project, ids, taskId, r1, 1)
    project = ResourceUseCases.assignResource(project, ids, taskId, r2, 1)
    expect(project.tasks[0]!.duration.toHours()).toBe(20)
    expect(project.tasks[0]!.workHours).toBe(40)
  })

  it('builds reports', () => {
    const project = ProjectUseCases.setBaseline(refreshProject(createDemoProject(ids)))
    const network = toNetworkDiagram(project)
    expect(network.nodes.length).toBeGreaterThan(0)
    expect(toResourceSheet(project).length).toBe(project.resources.length)
    const ev = computeEarnedValue(project)
    expect(ev.spi).toBeTypeOf('number')
    expect(ev.cpi).toBeTypeOf('number')
  })
})
