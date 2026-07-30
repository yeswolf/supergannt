import { describe, expect, it } from 'vitest'
import { Task } from '../entities/Task'
import { Resource } from '../entities/Resource'
import { Dependency } from '../entities/Dependency'
import { Assignment } from '../entities/Assignment'
import { WorkCalendar } from '../entities/WorkCalendar'
import { Project } from '../entities/Project'
import { Duration } from '../value-objects/Duration'
import { Money } from '../value-objects/Money'
import {
  asAssignmentId,
  asCalendarId,
  asDependencyId,
  asProjectId,
  asResourceId,
  asTaskId,
} from '../value-objects/Ids'

const day = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y!, m! - 1, d!, 8, 0, 0, 0)
}

const localIso = (date: Date) => {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function sampleTask(overrides: Partial<ReturnType<Task['toProps']>> = {}) {
  return Task.create({
    id: asTaskId('t1'),
    name: 'Task',
    outlineLevel: 0,
    wbs: '1',
    start: day('2026-01-05'),
    finish: day('2026-01-07'),
    duration: Duration.hours(24),
    percentComplete: 0,
    milestone: false,
    summary: false,
    critical: false,
    notes: '',
    priority: 500,
    constraintType: 'asSoonAsPossible',
    constraintDate: null,
    fixedCost: Money.zero(),
    cost: Money.zero(),
    workHours: 0,
    schedulingType: 'fixedUnits',
    effortDriven: true,
    parentId: null,
    baseline: null,
    collapsed: false,
    ...overrides,
  })
}

describe('entities', () => {
  it('validates task invariants', () => {
    expect(() => sampleTask({ name: '  ' })).toThrow(/name/)
    expect(() => sampleTask({ percentComplete: 120 })).toThrow(/Percent/)
    expect(() => sampleTask({ outlineLevel: -1 })).toThrow(/Outline/)
    expect(() =>
      sampleTask({
        finish: day('2026-01-01'),
        start: day('2026-01-05'),
        milestone: false,
      }),
    ).toThrow(/Finish/)
  })

  it('updates task via with()', () => {
    const task = sampleTask().with({ name: 'Renamed', percentComplete: 40 })
    expect(task.name).toBe('Renamed')
    expect(task.percentComplete).toBe(40)
    expect(task.toProps().name).toBe('Renamed')
  })

  it('validates resources, dependencies, assignments', () => {
    expect(() =>
      Resource.create({
        id: asResourceId('r'),
        name: '',
        type: 'work',
        email: '',
        group: '',
        maxUnits: 1,
        standardRate: Money.zero(),
        overtimeRate: Money.zero(),
        costPerUse: Money.zero(),
        calendarId: null,
        notes: '',
      }),
    ).toThrow(/name/)

    expect(() =>
      Resource.create({
        id: asResourceId('r'),
        name: 'Dev',
        type: 'work',
        email: '',
        group: '',
        maxUnits: -1,
        standardRate: Money.zero(),
        overtimeRate: Money.zero(),
        costPerUse: Money.zero(),
        calendarId: null,
        notes: '',
      }),
    ).toThrow(/Max units/)

    expect(() =>
      Dependency.create({
        id: asDependencyId('d'),
        predecessorId: asTaskId('a'),
        successorId: asTaskId('a'),
        type: 'FS',
        lag: Duration.zero(),
      }),
    ).toThrow(/itself/)

    expect(() =>
      Assignment.create({
        id: asAssignmentId('a'),
        taskId: asTaskId('t'),
        resourceId: asResourceId('r'),
        units: -1,
        workHours: 0,
        cost: Money.zero(),
      }),
    ).toThrow(/units/)

    expect(() =>
      Assignment.create({
        id: asAssignmentId('a'),
        taskId: asTaskId('t'),
        resourceId: asResourceId('r'),
        units: 1,
        workHours: -2,
        cost: Money.zero(),
      }),
    ).toThrow(/Work hours/)

    const assignment = Assignment.create({
      id: asAssignmentId('a1'),
      taskId: asTaskId('t'),
      resourceId: asResourceId('r'),
      units: 1,
      workHours: 8,
      cost: Money.of(100),
    })
    expect(assignment.id).toBe('a1')
    expect(assignment.taskId).toBe('t')
    expect(assignment.resourceId).toBe('r')
    expect(assignment.units).toBe(1)
    expect(assignment.workHours).toBe(8)
    expect(assignment.cost.amount).toBe(100)
    expect(assignment.with({ units: 0.5 }).units).toBe(0.5)
    expect(assignment.toProps().workHours).toBe(8)
  })

  it('computes working days and hours on calendars', () => {
    const calendar = WorkCalendar.standard(asCalendarId('c'))
    expect(calendar.isWorkingDay(day('2026-01-05'))).toBe(true) // Monday
    expect(calendar.isWorkingDay(day('2026-01-04'))).toBe(false) // Sunday
    expect(calendar.hoursOn(day('2026-01-05'))).toBe(8)
    const next = calendar.addWorkingHours(day('2026-01-05'), 16)
    expect(localIso(next)).toBe('2026-01-06') // Mon 8:00 + 16h → Tue 16:00
    const threeDays = calendar.addWorkingHours(day('2026-01-05'), 24)
    expect(localIso(threeDays)).toBe('2026-01-07')
    expect(calendar.addWorkingDays(day('2026-01-05'), 2).getDate()).toBe(6)
    expect(calendar.workingDaysBetween(day('2026-01-05'), day('2026-01-07'))).toBe(2)
    expect(calendar.workingHoursBetween(day('2026-01-07'), day('2026-01-05'))).toBe(0)
    expect(() => WorkCalendar.create({ ...calendar.toProps(), workDays: [] })).toThrow(/7/)
  })

  it('aggregates project cost and calendar lookup', () => {
    const calendar = WorkCalendar.standard(asCalendarId('c'))
    const task = sampleTask({ cost: Money.of(100, 'USD') })
    const project = Project.create({
      id: asProjectId('p'),
      name: 'P',
      title: 'P',
      manager: '',
      startDate: day('2026-01-05'),
      finishDate: day('2026-01-07'),
      statusDate: null,
      currency: 'USD',
      calendarId: calendar.id,
      tasks: [task],
      resources: [],
      dependencies: [],
      assignments: [],
      calendars: [calendar],
      dirty: false,
      fileName: null,
    })
    expect(project.totalCost().amount).toBe(100)
    expect(project.getCalendar().id).toBe(calendar.id)
    expect(project.getTask(asTaskId('t1'))?.name).toBe('Task')
    expect(project.markDirty().dirty).toBe(true)
    expect(project.markDirty().markClean().dirty).toBe(false)
    expect(() => Project.create({ ...project.toProps(), name: ' ' })).toThrow()
    expect(() =>
      Project.create({ ...project.toProps(), calendars: [], calendarId: asCalendarId('x') }).getCalendar(),
    ).toThrow(/calendar/)
  })
})
