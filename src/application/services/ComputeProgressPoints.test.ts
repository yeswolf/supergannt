import { describe, expect, it } from 'vitest'
import {
  computeProgressPoints,
  filterPeakPoints,
} from '../../application/services/ComputeProgressPoints'
import { createDemoProject } from '../../application/services/ProjectFactory'
import { refreshProject } from '../../application/services/ProjectRefresh'
import type { IdGenerator } from '../../application/ports/IdGenerator'

class SeqIds implements IdGenerator {
  private n = 0
  private next(prefix: string) {
    this.n += 1
    return `${prefix}${this.n}`
  }
  projectId() { return this.next('p') }
  taskId() { return this.next('t') }
  resourceId() { return this.next('r') }
  dependencyId() { return this.next('d') }
  assignmentId() { return this.next('a') }
  calendarId() { return this.next('c') }
}

describe('computeProgressPoints', () => {
  it('returns points for non-summary, non-milestone tasks within the status date window', () => {
    const project = refreshProject(createDemoProject(new SeqIds()))
    // Find a leaf task and use a date in the middle of its bar.
    const leaf = project.tasks.find((t) => !t.summary && !t.milestone)!
    const midMs = (leaf.start.getTime() + leaf.finish.getTime()) / 2
    const statusDate = new Date(midMs)

    const points = computeProgressPoints(project, statusDate)

    expect(points.length).toBeGreaterThan(0)
    for (const pt of points) {
      const task = project.tasks.find((t) => t.id === pt.taskId)!
      expect(task.summary).toBe(false)
      expect(task.milestone).toBe(false)
      expect(pt.expectedRatio).toBeGreaterThanOrEqual(0)
      expect(pt.expectedRatio).toBeLessThanOrEqual(1)
      expect(pt.actualRatio).toBeGreaterThanOrEqual(0)
      expect(pt.actualRatio).toBeLessThanOrEqual(1)
      expect(pt.variance).toBe(pt.actualRatio - pt.expectedRatio)
      expect(pt.rowIndex).toBeGreaterThanOrEqual(0)
    }
  })

  it('excludes summary tasks', () => {
    const project = refreshProject(createDemoProject(new SeqIds()))
    const leaf = project.tasks.find((t) => !t.summary && !t.milestone)!
    const midMs = (leaf.start.getTime() + leaf.finish.getTime()) / 2
    const statusDate = new Date(midMs)

    const points = computeProgressPoints(project, statusDate)
    const summaryIds = new Set(
      project.tasks.filter((t) => t.summary).map((t) => t.id),
    )

    for (const pt of points) {
      expect(summaryIds.has(pt.taskId)).toBe(false)
    }
  })

  it('excludes milestones', () => {
    const project = refreshProject(createDemoProject(new SeqIds()))
    const leaf = project.tasks.find((t) => !t.summary && !t.milestone)!
    const midMs = (leaf.start.getTime() + leaf.finish.getTime()) / 2
    const statusDate = new Date(midMs)

    const points = computeProgressPoints(project, statusDate)
    const milestoneIds = new Set(
      project.tasks.filter((t) => t.milestone).map((t) => t.id),
    )

    for (const pt of points) {
      expect(milestoneIds.has(pt.taskId)).toBe(false)
    }
  })

  it('returns empty array when status date is before all tasks', () => {
    const project = refreshProject(createDemoProject(new SeqIds()))
    const statusDate = new Date('2020-01-01')

    expect(computeProgressPoints(project, statusDate)).toEqual([])
  })

  it('returns empty array when status date is after all tasks', () => {
    const project = refreshProject(createDemoProject(new SeqIds()))
    const statusDate = new Date('2035-01-01')

    expect(computeProgressPoints(project, statusDate)).toEqual([])
  })

  it('clamps expectedRatio to [0, 1]', () => {
    const project = refreshProject(createDemoProject(new SeqIds()))
    // Use a status date that covers all leaf tasks: pick a task start.
    const leaf = project.tasks.find((t) => !t.summary && !t.milestone)!
    const statusDate = new Date(leaf.start.getTime() + (leaf.finish.getTime() - leaf.start.getTime()) / 2)

    const points = computeProgressPoints(project, statusDate)
    for (const pt of points) {
      expect(pt.expectedRatio).toBeGreaterThanOrEqual(0)
      expect(pt.expectedRatio).toBeLessThanOrEqual(1)
    }
  })
})

describe('filterPeakPoints', () => {
  it('returns at most 2 points', () => {
    const points = [
      {
        taskId: 'a',
        expectedRatio: 0.5,
        actualRatio: 0.3,
        variance: -0.2,
        rowIndex: 0,
      },
      {
        taskId: 'b',
        expectedRatio: 0.5,
        actualRatio: 0.8,
        variance: 0.3,
        rowIndex: 1,
      },
      {
        taskId: 'c',
        expectedRatio: 0.5,
        actualRatio: 0.4,
        variance: -0.1,
        rowIndex: 2,
      },
      {
        taskId: 'd',
        expectedRatio: 0.5,
        actualRatio: 0.9,
        variance: 0.4,
        rowIndex: 3,
      },
      {
        taskId: 'e',
        expectedRatio: 0.5,
        actualRatio: 0.5,
        variance: 0,
        rowIndex: 4,
      },
    ]

    const peaks = filterPeakPoints(points)
    expect(peaks.length).toBeLessThanOrEqual(2)
    // The biggest ahead (0.4) and biggest behind (-0.2) should be selected.
    const ids = new Set(peaks.map((p) => p.taskId))
    expect(ids.has('d')).toBe(true) // biggest ahead
    expect(ids.has('a')).toBe(true) // biggest behind
  })

  it('returns empty for empty input', () => {
    expect(filterPeakPoints([])).toEqual([])
  })

  it('returns only ahead peak when all tasks are ahead', () => {
    const points = [
      {
        taskId: 'a',
        expectedRatio: 0.3,
        actualRatio: 0.5,
        variance: 0.2,
        rowIndex: 0,
      },
      {
        taskId: 'b',
        expectedRatio: 0.3,
        actualRatio: 0.7,
        variance: 0.4,
        rowIndex: 1,
      },
    ]

    const peaks = filterPeakPoints(points)
    expect(peaks.length).toBe(1)
    expect(peaks[0]!.taskId).toBe('b')
    expect(peaks[0]!.variance).toBeGreaterThan(0)
  })

  it('returns only behind peak when all tasks are behind', () => {
    const points = [
      {
        taskId: 'a',
        expectedRatio: 0.7,
        actualRatio: 0.5,
        variance: -0.2,
        rowIndex: 0,
      },
      {
        taskId: 'b',
        expectedRatio: 0.7,
        actualRatio: 0.3,
        variance: -0.4,
        rowIndex: 1,
      },
    ]

    const peaks = filterPeakPoints(points)
    expect(peaks.length).toBe(1)
    expect(peaks[0]!.taskId).toBe('b')
    expect(peaks[0]!.variance).toBeLessThan(0)
  })
})
