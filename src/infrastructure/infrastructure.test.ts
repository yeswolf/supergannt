import { describe, expect, it } from 'vitest'
import { MspdiCodec, formatMspdiDuration, parseMspdiDuration } from './mspdi/MspdiCodec'
import { createDemoProject } from '../application/services/ProjectFactory'
import { refreshProject } from '../application/services/ProjectRefresh'
import type { IdGenerator } from '../application/ports/IdGenerator'
import { Duration } from '../domain/value-objects/Duration'
import {
  deserializeProject,
  serializeProject,
} from './serialization/ProjectJsonSerializer'
import { LocalStorageProjectRepository } from './persistence/LocalStorageProjectRepository'
import { toGanttData, DHTMLX_TO_LINK, orientDraggedLink } from './gantt/GanttMapper'
import { UuidIdGenerator } from './ids/UuidIdGenerator'

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

describe('MspdiCodec', () => {
  it('parses and formats durations', () => {
    expect(parseMspdiDuration('PT2D0H0M0S').toDays()).toBe(2)
    expect(parseMspdiDuration('PT16H0M0S').toDays()).toBe(2)
    expect(formatMspdiDuration(Duration.of(2, 'd'))).toContain('PT2D')
  })

  it('round-trips a project to MSPDI XML', async () => {
    const ids = new SeqIds()
    const codec = new MspdiCodec(ids)
    expect(codec.canHandle('plan.XML')).toBe(true)
    expect(codec.canHandle('plan.mpp')).toBe(false)

    const project = refreshProject(createDemoProject(ids))
    const { content, mimeType, extension } = await codec.serialize(project)
    expect(mimeType).toBe('application/xml')
    expect(extension).toBe('.xml')
    expect(content).toContain('<Project')

    const parsed = await codec.parse(content, 'roundtrip.xml')
    expect(parsed.tasks.length).toBe(project.tasks.length)
    expect(parsed.resources.length).toBe(project.resources.length)
  })

  it('rejects invalid XML', async () => {
    const codec = new MspdiCodec(new SeqIds())
    await expect(codec.parse('<nope/>', 'x.xml')).rejects.toThrow(/MSPDI/)
  })
})

describe('serialization + repository', () => {
  it('serializes to JSON and restores', () => {
    const project = refreshProject(createDemoProject(new SeqIds()))
    const withBaseline = project.with({
      tasks: project.tasks.map((t) =>
        t.with({
          baseline: {
            start: t.start,
            finish: t.finish,
            duration: t.duration,
            cost: t.cost,
          },
        }),
      ),
    })
    const restored = deserializeProject(serializeProject(withBaseline))
    expect(restored.tasks.length).toBe(withBaseline.tasks.length)
    expect(restored.tasks[0]!.baseline).not.toBeNull()
  })

  it('stores drafts in memory storage', async () => {
    const map = new Map<string, string>()
    const storage = {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => {
        map.set(k, v)
      },
      removeItem: (k: string) => {
        map.delete(k)
      },
    } as Storage
    const repo = new LocalStorageProjectRepository(storage)
    const project = createDemoProject(new SeqIds())
    await repo.saveDraft(project)
    const loaded = await repo.loadDraft()
    expect(loaded?.name).toBe(project.name)
    await repo.clearDraft()
    expect(await repo.loadDraft()).toBeNull()
  })
})

describe('GanttMapper + UuidIdGenerator', () => {
  it('maps project to gantt dtos', () => {
    const project = refreshProject(createDemoProject(new SeqIds()))
    const { data, links } = toGanttData(project)
    expect(data.length).toBe(project.tasks.length)
    expect(DHTMLX_TO_LINK['0']).toBe('FS')
    expect(orientDraggedLink({ source: '2', target: '1', type: '3' })).toEqual({
      source: '1',
      target: '2',
      type: '0',
    })
    expect(orientDraggedLink({ source: '1', target: '2', type: '0' })).toEqual({
      source: '1',
      target: '2',
      type: '0',
    })
    expect(links.every((l) => l.source && l.target)).toBe(true)
    const milestone = data.find((t) => t.type === 'milestone')
    expect(milestone).toBeTruthy()
    expect(milestone!.duration).toBe(0)
    expect(milestone!.start_date).toBe(milestone!.end_date)
  })

  it('generates ids', () => {
    const ids = new UuidIdGenerator()
    expect(ids.taskId()).toBeTruthy()
    expect(ids.projectId()).not.toBe(ids.resourceId())
  })
})
