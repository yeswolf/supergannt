import { describe, expect, it } from 'vitest'
import { Task } from '../entities/Task'
import { Dependency } from '../entities/Dependency'
import { WorkCalendar } from '../entities/WorkCalendar'
import { Duration } from '../value-objects/Duration'
import { Money } from '../value-objects/Money'
import {
  asCalendarId,
  asDependencyId,
  asTaskId,
} from '../value-objects/Ids'
import {
  indentTask,
  outdentTask,
  rebuildHierarchy,
} from './HierarchyService'
import {
  applyFloatToTasks,
  computeFloat,
  scheduleProject,
} from './SchedulingService'
import {
  computeResourceUtilization,
  recalculateTaskCosts,
} from './CostService'
import { Resource } from '../entities/Resource'
import { Assignment } from '../entities/Assignment'
import { asAssignmentId, asResourceId } from '../value-objects/Ids'

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

function task(
  id: string,
  name: string,
  level: number,
  durationHours: number,
  extras: Partial<ReturnType<Task['toProps']>> = {},
) {
  return Task.create({
    id: asTaskId(id),
    name,
    outlineLevel: level,
    wbs: '',
    start: day('2026-01-05'),
    finish: day('2026-01-05'),
    duration: Duration.hours(durationHours),
    percentComplete: 0,
    milestone: durationHours === 0,
    summary: false,
    critical: false,
    notes: '',
    priority: 500,
    constraintType: 'asSoonAsPossible',
    constraintDate: null,
    fixedCost: Money.zero(),
    cost: Money.zero(),
    workHours: durationHours,
    schedulingType: 'fixedUnits',
    effortDriven: true,
    parentId: null,
    baseline: null,
    collapsed: false,
    ...extras,
  })
}

describe('HierarchyService', () => {
  it('rebuilds WBS and parents', () => {
    const tasks = rebuildHierarchy([
      task('1', 'A', 0, 1),
      task('2', 'A1', 1, 1),
      task('3', 'A2', 1, 1),
      task('4', 'B', 0, 1),
    ])
    expect(tasks.map((t) => t.wbs)).toEqual(['1', '1.1', '1.2', '2'])
    expect(tasks[0]!.summary).toBe(true)
    expect(tasks[1]!.parentId).toBe('1')
  })

  it('indents and outdents', () => {
    const base = rebuildHierarchy([task('1', 'A', 0, 1), task('2', 'B', 0, 1)])
    const indented = indentTask(base, asTaskId('2'))
    expect(indented[1]!.outlineLevel).toBe(1)
    expect(indented[1]!.wbs).toBe('1.1')
    const out = outdentTask(indented, asTaskId('2'))
    expect(out[1]!.outlineLevel).toBe(0)
    expect(indentTask(base, asTaskId('1'))).toEqual(base)
    expect(outdentTask(base, asTaskId('1'))).toEqual(base)
  })
})

describe('SchedulingService', () => {
  it('schedules FS chain on working days and marks critical path', () => {
    const calendar = WorkCalendar.standard(asCalendarId('c'))
    const tasks = rebuildHierarchy([
      task('1', 'A', 0, 16),
      task('2', 'B', 0, 16),
      task('3', 'C', 0, 8),
    ])
    const deps = [
      Dependency.create({
        id: asDependencyId('d1'),
        predecessorId: asTaskId('1'),
        successorId: asTaskId('2'),
        type: 'FS',
        lag: Duration.zero(),
      }),
      Dependency.create({
        id: asDependencyId('d2'),
        predecessorId: asTaskId('2'),
        successorId: asTaskId('3'),
        type: 'FS',
        lag: Duration.zero(),
      }),
    ]
    const scheduled = scheduleProject(tasks, deps, calendar, day('2026-01-05'))
    expect(localIso(scheduled[0]!.start)).toBe('2026-01-05')
    expect(scheduled[0]!.duration.toHours()).toBe(16)
    expect(scheduled[1]!.start.getTime()).toBeGreaterThanOrEqual(scheduled[0]!.finish.getTime())
    const floatMap = computeFloat(scheduled, deps, calendar)
    const flagged = applyFloatToTasks(scheduled, floatMap)
    // Last task (C) is on the critical path (total slack = 0)
    expect(flagged.find((t) => t.id === '3')!.critical).toBe(true)
    expect(flagged.find((t) => t.id === '3')!.totalSlackHours).toBe(0)
  })

  it('shifts successors immediately like ProjectLibre (FS, lag, lead, SS/FF/SF)', () => {
    const calendar = WorkCalendar.standard(asCalendarId('c'))
    const base = rebuildHierarchy([
      task('1', 'A', 0, 8),
      task('2', 'B', 0, 8),
      task('3', 'C', 0, 8),
      task('4', 'D', 0, 8),
      task('5', 'E', 0, 0), // milestone — SF pins to predecessor start
    ])
    const projectStart = day('2026-01-05')

    // FS: B starts when A finishes
    let scheduled = scheduleProject(
      base,
      [
        Dependency.create({
          id: asDependencyId('fs'),
          predecessorId: asTaskId('1'),
          successorId: asTaskId('2'),
          type: 'FS',
          lag: Duration.zero(),
        }),
      ],
      calendar,
      projectStart,
    )
    const a = scheduled.find((t) => t.id === '1')!
    const b = scheduled.find((t) => t.id === '2')!
    // End-of-day finish (16:00) snaps successor to next work start — ProjectLibre ASAP.
    expect(b.start.getTime()).toBe(calendar.snapToWorkStart(a.finish).getTime())

    // FS + 8h lag
    scheduled = scheduleProject(
      base,
      [
        Dependency.create({
          id: asDependencyId('fslag'),
          predecessorId: asTaskId('1'),
          successorId: asTaskId('2'),
          type: 'FS',
          lag: Duration.hours(8),
        }),
      ],
      calendar,
      projectStart,
    )
    expect(
      scheduled.find((t) => t.id === '2')!.start.getTime(),
    ).toBe(calendar.snapToWorkStart(calendar.addWorkingHours(a.finish, 8)).getTime())

    // FS lead (−4h): successor may start during predecessor
    scheduled = scheduleProject(
      base,
      [
        Dependency.create({
          id: asDependencyId('fslead'),
          predecessorId: asTaskId('1'),
          successorId: asTaskId('2'),
          type: 'FS',
          lag: Duration.hours(-4),
        }),
      ],
      calendar,
      projectStart,
    )
    const leadStart = scheduled.find((t) => t.id === '2')!.start
    expect(leadStart.getTime()).toBe(
      calendar.snapToWorkStart(calendar.addWorkingHours(a.finish, -4)).getTime(),
    )
    expect(leadStart.getTime()).toBeLessThan(a.finish.getTime())

    // SS: same start (+ lag)
    scheduled = scheduleProject(
      base,
      [
        Dependency.create({
          id: asDependencyId('ss'),
          predecessorId: asTaskId('1'),
          successorId: asTaskId('3'),
          type: 'SS',
          lag: Duration.hours(0),
        }),
      ],
      calendar,
      projectStart,
    )
    expect(scheduled.find((t) => t.id === '3')!.start.getTime()).toBe(a.start.getTime())

    // FF: finishes together
    scheduled = scheduleProject(
      base,
      [
        Dependency.create({
          id: asDependencyId('ff'),
          predecessorId: asTaskId('1'),
          successorId: asTaskId('4'),
          type: 'FF',
          lag: Duration.zero(),
        }),
      ],
      calendar,
      projectStart,
    )
    expect(scheduled.find((t) => t.id === '4')!.finish.getTime()).toBe(a.finish.getTime())

    // SF + milestone: sits on predecessor start
    scheduled = scheduleProject(
      base,
      [
        Dependency.create({
          id: asDependencyId('sf'),
          predecessorId: asTaskId('1'),
          successorId: asTaskId('5'),
          type: 'SF',
          lag: Duration.zero(),
        }),
      ],
      calendar,
      projectStart,
    )
    const e = scheduled.find((t) => t.id === '5')!
    expect(e.start.getTime()).toBe(a.start.getTime())
    expect(e.finish.getTime()).toBe(a.start.getTime())
  })

  it('propagates chain shifts and respects SNET after manual move', () => {
    const calendar = WorkCalendar.standard(asCalendarId('c'))
    const projectStart = day('2026-01-05')
    const tasks = rebuildHierarchy([
      task('1', 'A', 0, 8),
      task('2', 'B', 0, 8),
      task('3', 'C', 0, 8),
    ])
    const deps = [
      Dependency.create({
        id: asDependencyId('d1'),
        predecessorId: asTaskId('1'),
        successorId: asTaskId('2'),
        type: 'FS',
        lag: Duration.zero(),
      }),
      Dependency.create({
        id: asDependencyId('d2'),
        predecessorId: asTaskId('2'),
        successorId: asTaskId('3'),
        type: 'FS',
        lag: Duration.zero(),
      }),
    ]
    let scheduled = scheduleProject(tasks, deps, calendar, projectStart)
    const bFinish = scheduled.find((t) => t.id === '2')!.finish
    expect(scheduled.find((t) => t.id === '3')!.start.getTime()).toBe(
      calendar.snapToWorkStart(bFinish).getTime(),
    )

    // Manual SNET on B later than FS-implied start — C follows B
    const lateB = calendar.addWorkingHours(projectStart, 24)
    const withSnet = tasks.map((t) =>
      t.id === '2'
        ? t.with({
            constraintType: 'startNoEarlierThan',
            constraintDate: lateB,
          })
        : t,
    )
    scheduled = scheduleProject(withSnet, deps, calendar, projectStart)
    const b = scheduled.find((t) => t.id === '2')!
    expect(b.start.getTime()).toBe(calendar.snapToWorkStart(lateB).getTime())
    expect(scheduled.find((t) => t.id === '3')!.start.getTime()).toBe(
      calendar.snapToWorkStart(b.finish).getTime(),
    )
  })

  it('uses rolled-up summary dates when linking from a summary', () => {
    const calendar = WorkCalendar.standard(asCalendarId('c'))
    const tasks = rebuildHierarchy([
      task('1', 'Summary', 0, 8),
      task('2', 'ChildA', 1, 8),
      task('3', 'ChildB', 1, 16),
      task('4', 'After', 0, 8),
    ])
    const deps = [
      Dependency.create({
        id: asDependencyId('d1'),
        predecessorId: asTaskId('2'),
        successorId: asTaskId('3'),
        type: 'FS',
        lag: Duration.zero(),
      }),
      Dependency.create({
        id: asDependencyId('d2'),
        predecessorId: asTaskId('1'),
        successorId: asTaskId('4'),
        type: 'FS',
        lag: Duration.zero(),
      }),
    ]
    const scheduled = scheduleProject(tasks, deps, calendar, day('2026-01-05'))
    const summary = scheduled.find((t) => t.id === '1')!
    const after = scheduled.find((t) => t.id === '4')!
    expect(summary.summary).toBe(true)
    expect(after.start.getTime()).toBe(calendar.snapToWorkStart(summary.finish).getTime())
  })

  it('detects circular dependencies', () => {
    const calendar = WorkCalendar.standard(asCalendarId('c'))
    const tasks = [task('1', 'A', 0, 1), task('2', 'B', 0, 1)]
    const deps = [
      Dependency.create({
        id: asDependencyId('d1'),
        predecessorId: asTaskId('1'),
        successorId: asTaskId('2'),
        type: 'FS',
        lag: Duration.zero(),
      }),
      Dependency.create({
        id: asDependencyId('d2'),
        predecessorId: asTaskId('2'),
        successorId: asTaskId('1'),
        type: 'FS',
        lag: Duration.zero(),
      }),
    ]
    expect(() => scheduleProject(tasks, deps, calendar, day('2026-01-05'))).toThrow(
      /Circular/,
    )
  })

  it('rolls up summary tasks', () => {
    const calendar = WorkCalendar.standard(asCalendarId('c'))
    const tasks = rebuildHierarchy([
      task('1', 'Summary', 0, 8),
      task('2', 'Child', 1, 24),
    ])
    const scheduled = scheduleProject(tasks, [], calendar, day('2026-01-05'))
    expect(scheduled[0]!.summary).toBe(true)
    expect(scheduled[0]!.duration.toHours()).toBeGreaterThan(0)
  })

  describe('FloatService', () => {
    it('computes zero slack for a simple FS chain (all critical)', () => {
      const calendar = WorkCalendar.standard(asCalendarId('c'))
      const tasks = rebuildHierarchy([
        task('1', 'A', 0, 8),
        task('2', 'B', 0, 8),
        task('3', 'C', 0, 8),
      ])
      const deps = [
        Dependency.create({
          id: asDependencyId('d1'),
          predecessorId: asTaskId('1'),
          successorId: asTaskId('2'),
          type: 'FS',
          lag: Duration.zero(),
        }),
        Dependency.create({
          id: asDependencyId('d2'),
          predecessorId: asTaskId('2'),
          successorId: asTaskId('3'),
          type: 'FS',
          lag: Duration.zero(),
        }),
      ]
      const scheduled = scheduleProject(tasks, deps, calendar, day('2026-01-05'))
      const floatMap = computeFloat(scheduled, deps, calendar)
      const flagged = applyFloatToTasks(scheduled, floatMap)

      // All three tasks on the critical path — zero total slack
      for (const id of ['1', '2', '3']) {
        const t = flagged.find((x) => x.id === id)!
        expect(t.totalSlackHours).toBe(0)
        expect(t.freeSlackHours).toBe(0)
        expect(t.critical).toBe(true)
      }
    })

    it('computes positive slack for a non-critical parallel branch', () => {
      const calendar = WorkCalendar.standard(asCalendarId('c'))
      const tasks = rebuildHierarchy([
        task('1', 'A', 0, 8),
        task('2', 'B', 0, 16), // long task — drives the critical path
        task('3', 'C', 0, 8), // short parallel task — has slack
      ])
      const deps = [
        Dependency.create({
          id: asDependencyId('d1'),
          predecessorId: asTaskId('1'),
          successorId: asTaskId('2'),
          type: 'FS',
          lag: Duration.zero(),
        }),
        Dependency.create({
          id: asDependencyId('d2'),
          predecessorId: asTaskId('1'),
          successorId: asTaskId('3'),
          type: 'FS',
          lag: Duration.zero(),
        }),
      ]
      const scheduled = scheduleProject(tasks, deps, calendar, day('2026-01-05'))
      const floatMap = computeFloat(scheduled, deps, calendar)
      const flagged = applyFloatToTasks(scheduled, floatMap)

      // A is on both paths → critical
      expect(flagged.find((t) => t.id === '1')!.critical).toBe(true)
      expect(flagged.find((t) => t.id === '1')!.totalSlackHours).toBe(0)

      // B is the long task → critical
      expect(flagged.find((t) => t.id === '2')!.critical).toBe(true)
      expect(flagged.find((t) => t.id === '2')!.totalSlackHours).toBe(0)

      // C is shorter → has slack (B takes 16h, C takes 8h, so C has 8h slack)
      expect(flagged.find((t) => t.id === '3')!.critical).toBe(false)
      expect(flagged.find((t) => t.id === '3')!.totalSlackHours).toBe(8)
      expect(flagged.find((t) => t.id === '3')!.freeSlackHours).toBe(8)
    })

    it('handles diamond structure with one path critical and one with slack', () => {
      const calendar = WorkCalendar.standard(asCalendarId('c'))
      const tasks = rebuildHierarchy([
        task('1', 'Start', 0, 8),
        task('2', 'Upper', 0, 24), // long upper path
        task('3', 'Lower', 0, 8),  // short lower path
        task('4', 'End', 0, 8),
      ])
      const deps = [
        Dependency.create({
          id: asDependencyId('d1'),
          predecessorId: asTaskId('1'),
          successorId: asTaskId('2'),
          type: 'FS',
          lag: Duration.zero(),
        }),
        Dependency.create({
          id: asDependencyId('d2'),
          predecessorId: asTaskId('1'),
          successorId: asTaskId('3'),
          type: 'FS',
          lag: Duration.zero(),
        }),
        Dependency.create({
          id: asDependencyId('d3'),
          predecessorId: asTaskId('2'),
          successorId: asTaskId('4'),
          type: 'FS',
          lag: Duration.zero(),
        }),
        Dependency.create({
          id: asDependencyId('d4'),
          predecessorId: asTaskId('3'),
          successorId: asTaskId('4'),
          type: 'FS',
          lag: Duration.zero(),
        }),
      ]
      const scheduled = scheduleProject(tasks, deps, calendar, day('2026-01-05'))
      const floatMap = computeFloat(scheduled, deps, calendar)
      const flagged = applyFloatToTasks(scheduled, floatMap)

      // Start and End are critical
      expect(flagged.find((t) => t.id === '1')!.critical).toBe(true)
      expect(flagged.find((t) => t.id === '4')!.critical).toBe(true)

      // Upper path is critical (24h)
      expect(flagged.find((t) => t.id === '2')!.critical).toBe(true)
      expect(flagged.find((t) => t.id === '2')!.totalSlackHours).toBe(0)

      // Lower path has slack (8h vs 24h upper → 16h slack)
      const lower = flagged.find((t) => t.id === '3')!
      expect(lower.critical).toBe(false)
      expect(lower.totalSlackHours).toBe(16)
    })

    it('respects lag in slack computation', () => {
      const calendar = WorkCalendar.standard(asCalendarId('c'))
      const tasks = rebuildHierarchy([
        task('1', 'A', 0, 8),
        task('2', 'B', 0, 8),
        task('3', 'C', 0, 8),
      ])
      const deps = [
        Dependency.create({
          id: asDependencyId('d1'),
          predecessorId: asTaskId('1'),
          successorId: asTaskId('2'),
          type: 'FS',
          lag: Duration.zero(),
        }),
        Dependency.create({
          id: asDependencyId('d2'),
          predecessorId: asTaskId('1'),
          successorId: asTaskId('3'),
          type: 'FS',
          lag: Duration.hours(16), // 16h lag on A→C makes this path longer
        }),
      ]
      const scheduled = scheduleProject(tasks, deps, calendar, day('2026-01-05'))
      const floatMap = computeFloat(scheduled, deps, calendar)
      const flagged = applyFloatToTasks(scheduled, floatMap)

      // Path A→B: A(8h) + B(8h) = 16h. Path A→C: A(8h) + 16h lag + C(8h) = 32h.
      // So the A→C path is the project spine; C is critical, B has slack.
      const c = flagged.find((t) => t.id === '3')!
      const b = flagged.find((t) => t.id === '2')!
      // A is on both paths → critical
      expect(flagged.find((t) => t.id === '1')!.critical).toBe(true)
      // C is on the longer lag path → critical
      expect(c.critical).toBe(true)
      expect(c.totalSlackHours).toBe(0)
      // B is on the shorter path → has slack
      expect(b.critical).toBe(false)
      expect(b.totalSlackHours).toBeGreaterThan(0)
    })

    it('returns null slack for summary tasks', () => {
      const calendar = WorkCalendar.standard(asCalendarId('c'))
      const tasks = rebuildHierarchy([
        task('1', 'Summary', 0, 0),
        task('2', 'Child', 1, 8),
      ])
      const scheduled = scheduleProject(tasks, [], calendar, day('2026-01-05'))
      const floatMap = computeFloat(scheduled, [], calendar)
      const flagged = applyFloatToTasks(scheduled, floatMap)

      expect(flagged.find((t) => t.id === '1')!.totalSlackHours).toBeNull()
      expect(flagged.find((t) => t.id === '1')!.freeSlackHours).toBeNull()
      expect(flagged.find((t) => t.id === '2')!.totalSlackHours).toBe(0)
    })

    it('handles calendar gaps where a non-working day creates float on one branch', () => {
      // Standard Mon-Fri calendar with Tuesday Jan 6 as a non-working holiday.
      // The gap pushes both parallel branches by one day, but the shorter branch
      // picks up slack because the longer branch still drives the project end.
      const calendar = WorkCalendar.standard(asCalendarId('c')).with({
        exceptions: [
          {
            date: new Date(2026, 0, 6), // Tuesday
            working: false,
            name: 'Holiday',
          },
        ],
      })
      const tasks = rebuildHierarchy([
        task('1', 'Start', 0, 8),  // Mon
        task('2', 'Upper', 0, 8),  // 1 working day — non-critical
        task('3', 'Lower', 0, 16), // 2 working days — critical path
        task('4', 'End', 0, 8),
      ])
      const deps = [
        Dependency.create({
          id: asDependencyId('d1'),
          predecessorId: asTaskId('1'),
          successorId: asTaskId('2'),
          type: 'FS',
          lag: Duration.zero(),
        }),
        Dependency.create({
          id: asDependencyId('d2'),
          predecessorId: asTaskId('1'),
          successorId: asTaskId('3'),
          type: 'FS',
          lag: Duration.zero(),
        }),
        Dependency.create({
          id: asDependencyId('d3'),
          predecessorId: asTaskId('2'),
          successorId: asTaskId('4'),
          type: 'FS',
          lag: Duration.zero(),
        }),
        Dependency.create({
          id: asDependencyId('d4'),
          predecessorId: asTaskId('3'),
          successorId: asTaskId('4'),
          type: 'FS',
          lag: Duration.zero(),
        }),
      ]
      const scheduled = scheduleProject(tasks, deps, calendar, day('2026-01-05'))
      const floatMap = computeFloat(scheduled, deps, calendar)
      const flagged = applyFloatToTasks(scheduled, floatMap)

      // Start and End are critical (zero slack)
      expect(flagged.find((t) => t.id === '1')!.critical).toBe(true)
      expect(flagged.find((t) => t.id === '1')!.totalSlackHours).toBe(0)
      expect(flagged.find((t) => t.id === '4')!.critical).toBe(true)
      expect(flagged.find((t) => t.id === '4')!.totalSlackHours).toBe(0)

      // Lower path is critical (16h across the gap: Wed+Thu)
      expect(flagged.find((t) => t.id === '3')!.critical).toBe(true)
      expect(flagged.find((t) => t.id === '3')!.totalSlackHours).toBe(0)

      // Upper path has slack (8h vs 16h lower = 8h slack across the gap)
      const upper = flagged.find((t) => t.id === '2')!
      expect(upper.critical).toBe(false)
      expect(upper.totalSlackHours).toBe(8)
    })
  })
})

describe('CostService', () => {
  it('computes utilization and task costs', () => {
    const resource = Resource.create({
      id: asResourceId('r1'),
      name: 'Dev',
      type: 'work',
      email: '',
      group: '',
      maxUnits: 1,
      standardRate: Money.of(100),
      overtimeRate: Money.zero(),
      costPerUse: Money.of(10),
      calendarId: null,
      notes: '',
    })
    const tasks = [task('1', 'A', 0, 16)]
    const assignments = [
      Assignment.create({
        id: asAssignmentId('a1'),
        taskId: asTaskId('1'),
        resourceId: asResourceId('r1'),
        units: 1.5,
        workHours: 0,
        cost: Money.zero(),
      }),
    ]
    const util = computeResourceUtilization([resource], assignments, tasks, 'USD')
    expect(util[0]!.overallocated).toBe(true)
    expect(util[0]!.workHours).toBe(24)
    const priced = recalculateTaskCosts(tasks, assignments, [resource], 'USD')
    expect(priced[0]!.cost.amount).toBe(100 * 24 + 10)
  })
})
