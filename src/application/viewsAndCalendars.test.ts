import { describe, expect, it } from 'vitest'
import type { IdGenerator } from './ports/IdGenerator'
import { createDemoProject, createEmptyProject } from './services/ProjectFactory'
import { refreshProject } from './services/ProjectRefresh'
import * as CalendarUseCases from './use-cases/CalendarUseCases'
import {
  buildRbsTree,
  buildResourceHistogram,
  buildResourceUsage,
  buildTaskUsage,
  buildWbsTree,
} from './services/ViewModels'
import * as ResourceUseCases from './use-cases/ResourceUseCases'
import * as TaskUseCases from './use-cases/TaskUseCases'

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

describe('CalendarUseCases', () => {
  it('adds calendars, exceptions, and work weeks', () => {
    const ids = new SeqIds()
    let project = createEmptyProject(ids)
    project = CalendarUseCases.addCalendar(project, ids, 'Night Shift')
    expect(project.calendars).toHaveLength(2)
    const custom = project.calendars[1]!
    project = CalendarUseCases.setProjectCalendar(project, custom.id)
    expect(project.calendarId).toBe(custom.id)

    const workDays = custom.workDays.map((d) =>
      d.dayOfWeek === 6 ? { ...d, working: true, startHour: 9, endHour: 13 } : d,
    )
    project = CalendarUseCases.updateWorkWeek(project, custom.id, workDays)
    expect(project.getCalendar().workDays[6]!.working).toBe(true)

    project = CalendarUseCases.addCalendarException(project, custom.id, {
      date: new Date(2026, 0, 1),
      working: false,
      name: 'New Year',
    })
    expect(project.getCalendar().exceptions).toHaveLength(1)
    project = CalendarUseCases.renameCalendar(project, custom.id, 'Ops')
    expect(project.calendars.find((c) => c.id === custom.id)?.name).toBe('Ops')
    project = CalendarUseCases.removeCalendarException(
      project,
      custom.id,
      new Date(2026, 0, 1),
    )
    expect(project.getCalendar().exceptions).toHaveLength(0)
  })

  it('toggles any day as holiday / working exception like ProjectLibre', () => {
    const ids = new SeqIds()
    let project = createEmptyProject(ids)
    const calId = project.calendarId
    const monday = new Date(2026, 6, 27) // Mon
    expect(monday.getDay()).toBe(1)

    project = CalendarUseCases.toggleCalendarDay(project, calId, monday, 'Company Day')
    expect(project.getCalendar().exceptions).toHaveLength(1)
    expect(project.getCalendar().exceptions[0]!.working).toBe(false)
    expect(project.getCalendar().exceptions[0]!.name).toBe('Company Day')

    project = CalendarUseCases.toggleCalendarDay(project, calId, monday)
    expect(project.getCalendar().exceptions).toHaveLength(0)

    const sunday = new Date(2026, 6, 26)
    expect(sunday.getDay()).toBe(0)
    project = CalendarUseCases.toggleCalendarDay(project, calId, sunday, 'OT')
    expect(project.getCalendar().exceptions[0]!.working).toBe(true)
  })
})

describe('ViewModels', () => {
  it('builds WBS/RBS/usage/histogram with hour slots', () => {
    const ids = new SeqIds()
    let project = refreshProject(createDemoProject(ids))
    const task = project.tasks.find((t) => !t.summary && !t.milestone)!
    const resource = project.resources[0]!
    project = ResourceUseCases.assignResource(project, ids, task.id, resource.id, 1)
    project = TaskUseCases.updateTask(project, task.id, { durationHours: 16 })

    const wbs = buildWbsTree(project)
    expect(wbs.length).toBeGreaterThan(0)
    expect(wbs[0]!.children.length).toBeGreaterThan(0)

    const rbs = buildRbsTree(project)
    expect(rbs.some((g) => g.children.length > 0)).toBe(true)

    const taskUsage = buildTaskUsage(project)
    expect(taskUsage.some((r) => r.totalHours > 0)).toBe(true)

    const resourceUsage = buildResourceUsage(project)
    expect(resourceUsage.length).toBeGreaterThan(0)

    const histogram = buildResourceHistogram(project)
    expect(histogram.length).toBeGreaterThan(0)
  })
})
