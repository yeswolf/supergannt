import { describe, expect, it } from 'vitest'
import { Task } from '../entities/Task'
import { Dependency } from '../entities/Dependency'
import { Resource } from '../entities/Resource'
import { Assignment } from '../entities/Assignment'
import { WorkCalendar } from '../entities/WorkCalendar'
import { Duration } from '../value-objects/Duration'
import { Money } from '../value-objects/Money'
import {
  asTaskId,
  asDependencyId,
  asResourceId,
  asAssignmentId,
  asCalendarId,
} from '../value-objects/Ids'
import { levelResources, type LevelingOrder } from './ResourceLevelingService'

const day = (iso: string, hour = 8) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y!, m - 1, d!, hour, 0, 0, 0)
}

function finishDate(start: Date, durationHours: number): Date {
  const f = new Date(start.getTime())
  f.setHours(f.getHours() + durationHours)
  return f
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
  startIso: string,
  durationHours: number,
  extras: Partial<ReturnType<Task['toProps']>> = {},
) {
  const s = day(startIso)
  return Task.create({
    id: asTaskId(id),
    name,
    outlineLevel: 0,
    wbs: id,
    start: s,
    finish: finishDate(s, durationHours),
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
    totalSlackHours: null,
    freeSlackHours: null,
    ...extras,
  })
}

function calendar() {
  return WorkCalendar.standard(asCalendarId('cal-standard'), 'Standard')
}

function makeResource(id: string, name: string, maxUnits: number) {
  return Resource.create({
    id: asResourceId(id),
    name,
    type: 'work',
    email: '',
    group: '',
    maxUnits,
    standardRate: Money.zero(),
    overtimeRate: Money.zero(),
    costPerUse: Money.zero(),
    calendarId: null,
    notes: '',
  })
}

function makeAssignment(
  id: string,
  taskId: string,
  resourceId: string,
  units: number,
) {
  return Assignment.create({
    id: asAssignmentId(id),
    taskId: asTaskId(taskId),
    resourceId: asResourceId(resourceId),
    units,
    workHours: 0,
    cost: Money.zero(),
  })
}

describe('ResourceLevelingService', () => {
  it('is no-op when nothing is overallocated', () => {
    const cal = calendar()
    const t1 = task('1', 'Task 1', '2026-01-05', 8) // Mon 1 day
    const t2 = task('2', 'Task 2', '2026-01-06', 8) // Tue 1 day
    const res = makeResource('R1', 'Alice', 1.0)
    const assign1 = makeAssignment('a1', '1', 'R1', 0.5)
    const assign2 = makeAssignment('a2', '2', 'R1', 0.5)

    const result = levelResources(
      [t1, t2],
      [],
      [res],
      [assign1, assign2],
      cal,
      day('2026-01-05'),
    )

    expect(result.overallocationsBefore).toBe(0)
    expect(result.overallocationsAfter).toBe(0)
    expect(result.leveled).toHaveLength(0)
  })

  it('resolves single-resource overallocation by delaying lower-priority task', () => {
    const cal = calendar()
    // Both tasks start same day, same resource assigned at 100% each = 200% load
    const t1 = task('1', 'High priority', '2026-01-05', 8, { priority: 800 })
    const t2 = task('2', 'Low priority', '2026-01-05', 8, { priority: 200 })
    const res = makeResource('R1', 'Alice', 1.0)
    const assign1 = makeAssignment('a1', '1', 'R1', 1.0)
    const assign2 = makeAssignment('a2', '2', 'R1', 1.0)

    const result = levelResources(
      [t1, t2],
      [],
      [res],
      [assign1, assign2],
      cal,
      day('2026-01-05'),
      { scope: [asTaskId('1'), asTaskId('2')], order: 'priority' },
    )

    expect(result.overallocationsBefore).toBeGreaterThan(0)
    expect(result.overallocationsAfter).toBe(0)
    expect(result.leveled).toHaveLength(1)
    // The lower priority task (t2) should be delayed
    expect(result.leveled[0]!.taskId).toBe('2')
    expect(result.leveled[0]!.oldStart.toISOString().slice(0, 10)).toBe(
      '2026-01-05',
    )
    // Delayed past Jan 5
    expect(result.leveled[0]!.newStart.getTime()).toBeGreaterThan(
      result.leveled[0]!.oldStart.getTime(),
    )
  })

  it('cascades delays to successor tasks via dependency chain', () => {
    const cal = calendar()
    // Three sequential tasks, all assigned to same resource at 100%
    const t1 = task('1', 'First', '2026-01-05', 8, { priority: 300 })
    const t2 = task('2', 'Second', '2026-01-05', 8, { priority: 500 })
    const t3 = task('3', 'Third', '2026-01-06', 8, { priority: 700 })
    const res = makeResource('R1', 'Alice', 1.0)
    const assign1 = makeAssignment('a1', '1', 'R1', 1.0)
    const assign2 = makeAssignment('a2', '2', 'R1', 1.0)
    const assign3 = makeAssignment('a3', '3', 'R1', 1.0)

    // t3 depends on t2
    const dep = Dependency.create({
      id: asDependencyId('d1'),
      predecessorId: asTaskId('2'),
      successorId: asTaskId('3'),
      type: 'FS',
      lag: Duration.zero(),
    })

    const result = levelResources(
      [t1, t2, t3],
      [dep],
      [res],
      [assign1, assign2, assign3],
      cal,
      day('2026-01-05'),
      { scope: [asTaskId('1'), asTaskId('2'), asTaskId('3')], order: 'priority' },
    )

    expect(result.overallocationsBefore).toBeGreaterThan(0)
    expect(result.overallocationsAfter).toBe(0)
    // t1 (priority 300) should be delayed, and t2/t3 may be affected
    // or t2 (priority 500) delayed depending on load
    expect(result.leveled.length).toBeGreaterThan(0)
  })

  it('respects task priority ordering', () => {
    const cal = calendar()
    const high = task('H', 'High', '2026-01-05', 8, { priority: 900 })
    const med = task('M', 'Medium', '2026-01-05', 8, { priority: 500 })
    const low = task('L', 'Low', '2026-01-05', 8, { priority: 100 })
    const res = makeResource('R1', 'Alice', 1.0)
    const assignH = makeAssignment('ah', 'H', 'R1', 1.0)
    const assignM = makeAssignment('am', 'M', 'R1', 1.0)
    const assignL = makeAssignment('al', 'L', 'R1', 1.0)

    const result = levelResources(
      [high, med, low],
      [],
      [res],
      [assignH, assignM, assignL],
      cal,
      day('2026-01-05'),
      { scope: [asTaskId('H'), asTaskId('M'), asTaskId('L')], order: 'priority' },
    )

    expect(result.overallocationsAfter).toBe(0)
    // The lowest priority task (L) should be delayed first
    const leveledIds = result.leveled.map((l) => l.taskId)
    // Low-priority L (100) should be delayed; M (500) also delayed if still over
    expect(leveledIds).toContain('L')
    // High priority task should NOT be delayed
    expect(leveledIds).not.toContain('H')
  })

  it('skips tasks with Must Start On constraint', () => {
    const cal = calendar()
    const hardTask = task('1', 'Hard MSO', '2026-01-05', 8, {
      constraintType: 'mustStartOn',
      constraintDate: day('2026-01-05'),
      priority: 100,
    })
    const flexTask = task('2', 'Flexible', '2026-01-05', 8, { priority: 900 })
    const res = makeResource('R1', 'Alice', 1.0)
    const assign1 = makeAssignment('a1', '1', 'R1', 1.0)
    const assign2 = makeAssignment('a2', '2', 'R1', 1.0)

    const result = levelResources(
      [hardTask, flexTask],
      [],
      [res],
      [assign1, assign2],
      cal,
      day('2026-01-05'),
      { scope: [asTaskId('1'), asTaskId('2')], order: 'priority' },
    )

    // Hard MSO task should NOT be delayed even though it has low priority
    const hardLeveled = result.leveled.find((l) => l.taskId === '1')
    expect(hardLeveled).toBeUndefined()
    // Flexible task is delayed to resolve the over
    const flexLeveled = result.leveled.find((l) => l.taskId === '2')
    expect(flexLeveled).toBeDefined()
  })

  it('skips tasks with Must Finish On constraint', () => {
    const cal = calendar()
    const hardTask = task('1', 'Hard MFO', '2026-01-05', 8, {
      constraintType: 'mustFinishOn',
      constraintDate: day('2026-01-05'),
      priority: 100,
    })
    const flexTask = task('2', 'Flexible', '2026-01-05', 8, { priority: 900 })
    const res = makeResource('R1', 'Alice', 1.0)
    const assign1 = makeAssignment('a1', '1', 'R1', 1.0)
    const assign2 = makeAssignment('a2', '2', 'R1', 1.0)

    const result = levelResources(
      [hardTask, flexTask],
      [],
      [res],
      [assign1, assign2],
      cal,
      day('2026-01-05'),
      { scope: [asTaskId('1'), asTaskId('2')], order: 'priority' },
    )

    const hardLeveled = result.leveled.find((l) => l.taskId === '1')
    expect(hardLeveled).toBeUndefined()
    const flexLeveled = result.leveled.find((l) => l.taskId === '2')
    expect(flexLeveled).toBeDefined()
  })

  it('handles multi-resource cascade', () => {
    const cal = calendar()
    const t1 = task('1', 'Task 1', '2026-01-05', 8, { priority: 300 })
    const t2 = task('2', 'Task 2', '2026-01-05', 8, { priority: 300 })
    const t3 = task('3', 'Task 3', '2026-01-05', 8, { priority: 300 })
    const res1 = makeResource('R1', 'Alice', 1.0)
    const res2 = makeResource('R2', 'Bob', 1.0)

    // All assigned to both resources
    const assignments = [
      makeAssignment('a1r1', '1', 'R1', 1.0),
      makeAssignment('a1r2', '1', 'R2', 1.0),
      makeAssignment('a2r1', '2', 'R1', 1.0),
      makeAssignment('a2r2', '2', 'R2', 1.0),
      makeAssignment('a3r1', '3', 'R1', 1.0),
      makeAssignment('a3r2', '3', 'R2', 1.0),
    ]

    const result = levelResources(
      [t1, t2, t3],
      [],
      [res1, res2],
      assignments,
      cal,
      day('2026-01-05'),
      {
        scope: [asTaskId('1'), asTaskId('2'), asTaskId('3')],
        order: 'priority',
      },
    )

    expect(result.overallocationsAfter).toBe(0)
    // With 3 tasks at 100% on a 100% resource, 2 tasks should be delayed
    expect(result.leveled.length).toBe(2)
  })

  it('reports before/after finish dates', () => {
    const cal = calendar()
    const t1 = task('1', 'Task 1', '2026-01-05', 8, { priority: 800 })
    const t2 = task('2', 'Task 2', '2026-01-05', 8, { priority: 200 })
    const res = makeResource('R1', 'Alice', 1.0)
    const assign1 = makeAssignment('a1', '1', 'R1', 1.0)
    const assign2 = makeAssignment('a2', '2', 'R1', 1.0)

    const result = levelResources(
      [t1, t2],
      [],
      [res],
      [assign1, assign2],
      cal,
      day('2026-01-05'),
      { scope: [asTaskId('1'), asTaskId('2')], order: 'priority' },
    )

    expect(result.finishBefore).toBeDefined()
    expect(result.finishAfter).toBeDefined()
    expect(result.finishAfter.getTime()).toBeGreaterThanOrEqual(
      result.finishBefore.getTime(),
    )
  })
})
