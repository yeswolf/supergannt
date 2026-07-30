import { describe, expect, it } from 'vitest'
import type { IdGenerator } from '../../application/ports/IdGenerator'
import { createEmptyProject } from '../../application/services/ProjectFactory'
import * as CalendarUseCases from '../../application/use-cases/CalendarUseCases'
import * as ResourceUseCases from '../../application/use-cases/ResourceUseCases'
import { MspdiCodec } from './MspdiCodec'

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

describe('MspdiCodec resource calendars', () => {
  it('round-trips CalendarUID per resource', async () => {
    const ids = new SeqIds()
    let project = createEmptyProject(ids)
    project = ResourceUseCases.addResource(project, ids, { name: 'Pat' })
    project = ResourceUseCases.ensureResourceCalendar(project, ids, project.resources[0]!.id)
    const personalName = project.getResourceCalendar(project.resources[0]!.id).name
    project = CalendarUseCases.addCalendarException(
      project,
      project.resources[0]!.calendarId!,
      {
        date: new Date(2026, 11, 25),
        working: false,
        name: 'Holiday',
      },
    )

    const codec = new MspdiCodec(ids)
    const { content } = await codec.serialize(project)
    expect(content).toContain('<CalendarUID>')
    expect(content).toMatch(/<Name>Pat Calendar<\/Name>/)

    const reopened = await codec.parse(content, 'plan.xml')
    expect(reopened.calendars.length).toBeGreaterThanOrEqual(2)
    const pat = reopened.resources.find((r) => r.name === 'Pat')!
    expect(pat.calendarId).toBeTruthy()
    expect(reopened.getResourceCalendar(pat.id).name).toBe(personalName)
    expect(reopened.getResourceCalendar(pat.id).id).not.toBe(reopened.calendarId)
  })
})
