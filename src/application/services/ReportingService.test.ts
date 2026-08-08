import { describe, expect, it } from 'vitest'
import type { IdGenerator } from '../ports/IdGenerator'
import { createEmptyProject, createDemoProject } from './ProjectFactory'
import { refreshProject } from './ProjectRefresh'
import { computeResourceHistogram } from './ReportingService'
import type { HistogramGranularity } from './ReportingService'
import * as CalendarUseCases from '../use-cases/CalendarUseCases'
import * as ResourceUseCases from '../use-cases/ResourceUseCases'
import * as TaskUseCases from '../use-cases/TaskUseCases'

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

describe('computeResourceHistogram', () => {
  it('returns empty array for an empty project', () => {
    const ids = new SeqIds()
    const project = createEmptyProject(ids)
    const result = computeResourceHistogram(project)
    expect(result).toEqual([])
  })

  it('returns empty array when no tasks have assignments', () => {
    const ids = new SeqIds()
    let project = createEmptyProject(ids)
    project = ResourceUseCases.addResource(project, ids, { name: 'Dev' })
    project = TaskUseCases.addTask(project, ids, { name: 'Work', durationHours: 16 })
    const result = computeResourceHistogram(project)
    expect(result).toEqual([])
  })

  it('skips summary tasks', () => {
    const ids2 = new SeqIds()
    let p2 = refreshProject(createDemoProject(ids2))
    const task = p2.tasks.find((t) => !t.summary && !t.milestone)!
    const resource = p2.resources[0]!
    p2 = ResourceUseCases.assignResource(p2, ids2, task.id, resource.id, 1)
    p2 = TaskUseCases.updateTask(p2, task.id, { durationHours: 16 })
    const result = computeResourceHistogram(p2, 'week')
    // The non-summary assigned task should produce buckets
    const forResource = result.filter((b) => b.resourceId === resource.id)
    expect(forResource.length).toBeGreaterThan(0)
    // Summary tasks should not appear in taskIds (they have no direct assignments)
    const summaryIds = p2.tasks.filter((t) => t.summary).map((t) => t.id)
    for (const bucket of result) {
      for (const tid of bucket.taskIds) {
        expect(summaryIds).not.toContain(tid)
      }
    }
  })

  it('skips milestone tasks', () => {
    const ids = new SeqIds()
    let project = createEmptyProject(ids)
    project = ResourceUseCases.addResource(project, ids, { name: 'Dev' })
    const resourceId = project.resources[0]!.id
    project = TaskUseCases.addTask(project, ids, { name: 'Milestone', durationHours: 0 })
    const task = project.tasks[0]!
    expect(task.milestone).toBe(true)
    project = ResourceUseCases.assignResource(project, ids, task.id, resourceId, 1)
    const result = computeResourceHistogram(project)
    expect(result).toEqual([])
  })

  it('spreads work hours evenly across working days for a single task and resource', () => {
    const ids = new SeqIds()
    let project = createEmptyProject(ids)
    project = ResourceUseCases.addResource(project, ids, { name: 'Dev' })
    // A task starting on Monday with 16h across 2 working days
    project = TaskUseCases.addTask(project, ids, {
      name: 'Work',
      durationHours: 16,
    })
    const taskId = project.tasks[0]!.id
    const resourceId = project.resources[0]!.id
    project = ResourceUseCases.assignResource(project, ids, taskId, resourceId, 1)
    project = TaskUseCases.updateTask(project, taskId, { durationHours: 16 })

    const result = computeResourceHistogram(project, 'day')
    const forResource = result.filter((b) => b.resourceId === resourceId)
    expect(forResource.length).toBeGreaterThan(0)

    for (const bucket of forResource) {
      expect(bucket.allocatedHours).toBe(8) // 16h / 2 working days
    }
    const totalAllocated = forResource.reduce((s, b) => s + b.allocatedHours, 0)
    expect(totalAllocated).toBeCloseTo(16, 0)
  })

  it('falls back to duration * units when workHours is zero', () => {
    const ids = new SeqIds()
    let project = createEmptyProject(ids)
    project = ResourceUseCases.addResource(project, ids, { name: 'Dev' })
    project = TaskUseCases.addTask(project, ids, { name: 'Work', durationHours: 24 })
    const taskId = project.tasks[0]!.id
    const resourceId = project.resources[0]!.id
    // Assign with units=0.5 — workHours will be 0, so fallback to 24h * 0.5 = 12h
    project = ResourceUseCases.assignResource(project, ids, taskId, resourceId, 0.5)
    const result = computeResourceHistogram(project, 'day')
    const forResource = result.filter((b) => b.resourceId === resourceId)
    const totalAllocated = forResource.reduce((s, b) => s + b.allocatedHours, 0)
    expect(totalAllocated).toBeCloseTo(12, 0)
  })

  it('groups allocations into week buckets', () => {
    const ids = new SeqIds()
    let project = createEmptyProject(ids)
    project = ResourceUseCases.addResource(project, ids, { name: 'Dev' })
    // Task that spans ~5 working days (Mon-Fri), 40h
    project = TaskUseCases.addTask(project, ids, { name: 'Work', durationHours: 40 })
    const taskId = project.tasks[0]!.id
    const resourceId = project.resources[0]!.id
    project = ResourceUseCases.assignResource(project, ids, taskId, resourceId, 1)

    const result = computeResourceHistogram(project, 'week')
    const forResource = result.filter((b) => b.resourceId === resourceId)
    expect(forResource.length).toBe(1)
    expect(forResource[0]!.allocatedHours).toBeCloseTo(40, 0)
  })

  it('groups allocations into month buckets', () => {
    const ids = new SeqIds()
    let project = createEmptyProject(ids)
    project = ResourceUseCases.addResource(project, ids, { name: 'Dev' })
    project = TaskUseCases.addTask(project, ids, { name: 'Work', durationHours: 80 })
    const taskId = project.tasks[0]!.id
    const resourceId = project.resources[0]!.id
    project = ResourceUseCases.assignResource(project, ids, taskId, resourceId, 1)

    const result = computeResourceHistogram(project, 'month')
    const forResource = result.filter((b) => b.resourceId === resourceId)
    expect(forResource.length).toBe(1)
    expect(forResource[0]!.allocatedHours).toBeCloseTo(80, 0)
  })

  it('computes capacity and flags overallocation', () => {
    const ids = new SeqIds()
    let project = createEmptyProject(ids)
    project = ResourceUseCases.addResource(project, ids, { name: 'Dev' })
    project = ResourceUseCases.addResource(project, ids, { name: 'QA' })
    const devId = project.resources[0]!.id
    const qaId = project.resources[1]!.id

    // Two tasks overlapping, each 40h, assigned to Dev — should overallocate
    project = TaskUseCases.addTask(project, ids, { name: 'Task A', durationHours: 40 })
    const taskA = project.tasks[0]!.id
    project = TaskUseCases.addTask(project, ids, { name: 'Task B', durationHours: 40 })
    const taskB = project.tasks[1]!.id
    project = ResourceUseCases.assignResource(project, ids, taskA, devId, 1)
    project = ResourceUseCases.assignResource(project, ids, taskB, devId, 1)
    // QA gets only Task A — should not be overallocated
    project = ResourceUseCases.assignResource(project, ids, taskA, qaId, 1)
    project = refreshProject(project)

    const result = computeResourceHistogram(project, 'week')

    // Dev has two 40h tasks in the same period → overallocated
    const devBuckets = result.filter((b) => b.resourceId === devId)
    expect(devBuckets.length).toBeGreaterThan(0)
    for (const bucket of devBuckets) {
      expect(bucket.overallocated).toBe(true)
      expect(bucket.allocatedHours).toBeGreaterThan(bucket.capacityHours)
    }

    const qaBuckets = result.filter((b) => b.resourceId === qaId)
    for (const bucket of qaBuckets) {
      expect(bucket.overallocated).toBe(false)
    }
  })

  it('uses resource calendar for both allocation spread and capacity', () => {
    const ids = new SeqIds()
    let project = createEmptyProject(ids)
    project = ResourceUseCases.addResource(project, ids, { name: 'PartTimer' })
    const resourceId = project.resources[0]!.id

    // Give the resource a personal calendar where Friday is non-working
    project = ResourceUseCases.ensureResourceCalendar(project, ids, resourceId)
    const resCalendarId = project.resources[0]!.calendarId!
    const workDays = project.getResourceCalendar(resourceId).workDays.map((d) =>
      d.dayOfWeek === 5 ? { ...d, working: false } : d,
    )
    project = CalendarUseCases.updateWorkWeek(project, resCalendarId, workDays)

    // Task spanning Mon-Fri (5 calendar days) but only 4 working days for this resource
    project = TaskUseCases.addTask(project, ids, { name: 'Work', durationHours: 32 })
    const taskId = project.tasks[0]!.id
    project = ResourceUseCases.assignResource(project, ids, taskId, resourceId, 1)

    const result = computeResourceHistogram(project, 'day')
    const forResource = result.filter((b) => b.resourceId === resourceId)
    // Should have 4 days of allocation, not 5
    expect(forResource.length).toBe(4)
    // 32h spread over 4 days = 8h/day
    for (const bucket of forResource) {
      expect(bucket.allocatedHours).toBeCloseTo(8, 0)
    }

    // Capacity should reflect 4-day week, not 5-day
    const weekResult = computeResourceHistogram(project, 'week')
    const weekBucket = weekResult.find((b) => b.resourceId === resourceId)
    expect(weekBucket).toBeDefined()
    // 4 working days * 8h = 32h capacity
    expect(weekBucket!.capacityHours).toBeCloseTo(32, 0)
  })

  it('handles empty work calendar for a task (no working days)', () => {
    const ids = new SeqIds()
    let project = createEmptyProject(ids)
    project = ResourceUseCases.addResource(project, ids, { name: 'Dev' })
    const resourceId = project.resources[0]!.id

    // Give the resource a personal calendar where Sat/Sun are the ONLY working days.
    // Since the allocation loop now uses the resource calendar, a task that only
    // spans Mon-Fri will have zero working days for this resource.
    project = ResourceUseCases.ensureResourceCalendar(project, ids, resourceId)
    const resCalendarId = project.resources[0]!.calendarId!
    const satSunWork = project.getResourceCalendar(resourceId).workDays.map((d) => ({
      ...d,
      working: d.dayOfWeek === 6 || d.dayOfWeek === 0,
    }))
    project = CalendarUseCases.updateWorkWeek(project, resCalendarId, satSunWork)

    // Task on a Monday (non-working in resource's calendar) — single-day duration
    const monday = new Date(2026, 7, 3) // Aug 3, 2026 is a Monday
    project = TaskUseCases.addTask(project, ids, {
      name: 'MondayOnly',
      durationHours: 8,
    })
    const taskId = project.tasks[0]!.id
    project = TaskUseCases.updateTask(project, taskId, {
      start: monday,
      finish: monday,
    })
    project = ResourceUseCases.assignResource(project, ids, taskId, resourceId, 1)

    const result = computeResourceHistogram(project, 'day')
    expect(result).toEqual([])
  })

  it('respects the overallocation epsilon', () => {
    const ids = new SeqIds()
    let project = createEmptyProject(ids)
    project = ResourceUseCases.addResource(project, ids, { name: 'Dev' })
    project = TaskUseCases.addTask(project, ids, { name: 'Work', durationHours: 40 })
    const taskId = project.tasks[0]!.id
    const resourceId = project.resources[0]!.id
    project = ResourceUseCases.assignResource(project, ids, taskId, resourceId, 1)

    // With a standard 5-day week, capacity is 40h — exactly at capacity
    // The epsilon check (0.01) should keep this as NOT overallocated
    const result = computeResourceHistogram(project, 'week')
    const bucket = result.find((b) => b.resourceId === resourceId)
    expect(bucket).toBeDefined()
    expect(bucket!.overallocated).toBe(false)
  })

  it('includes task IDs in each bucket', () => {
    const ids = new SeqIds()
    let project = createEmptyProject(ids)
    project = ResourceUseCases.addResource(project, ids, { name: 'Dev' })
    project = TaskUseCases.addTask(project, ids, { name: 'Work', durationHours: 16 })
    const taskId = project.tasks[0]!.id
    const resourceId = project.resources[0]!.id
    project = ResourceUseCases.assignResource(project, ids, taskId, resourceId, 1)

    const result = computeResourceHistogram(project, 'day')
    for (const bucket of result) {
      expect(bucket.taskIds).toContain(taskId)
    }
  })

  it('sorts results by period then resource name', () => {
    const ids = new SeqIds()
    let project = createEmptyProject(ids)
    project = ResourceUseCases.addResource(project, ids, { name: 'B-Dev' })
    project = ResourceUseCases.addResource(project, ids, { name: 'A-Dev' })
    const r1 = project.resources[0]!.id
    const r2 = project.resources[1]!.id
    project = TaskUseCases.addTask(project, ids, { name: 'Work', durationHours: 16 })
    const taskId = project.tasks[0]!.id
    project = ResourceUseCases.assignResource(project, ids, taskId, r1, 1)
    project = ResourceUseCases.assignResource(project, ids, taskId, r2, 1)

    const result = computeResourceHistogram(project, 'day')
    for (let i = 1; i < result.length; i++) {
      const prev = result[i - 1]!
      const curr = result[i]!
      if (prev.periodStart === curr.periodStart) {
        expect(prev.resourceName.localeCompare(curr.resourceName)).toBeLessThanOrEqual(0)
      } else {
        expect(prev.periodStart.localeCompare(curr.periodStart)).toBeLessThanOrEqual(0)
      }
    }
  })

  it('works with default granularity (week)', () => {
    const ids = new SeqIds()
    let project = createEmptyProject(ids)
    project = ResourceUseCases.addResource(project, ids, { name: 'Dev' })
    project = TaskUseCases.addTask(project, ids, { name: 'Work', durationHours: 40 })
    const taskId = project.tasks[0]!.id
    const resourceId = project.resources[0]!.id
    project = ResourceUseCases.assignResource(project, ids, taskId, resourceId, 1)

    const result = computeResourceHistogram(project)
    expect(result.length).toBeGreaterThan(0)
    // Week buckets start on Monday
    const periodStart = new Date(result[0]!.periodStart + 'T00:00:00')
    expect(periodStart.getDay()).toBe(1) // Monday
  })
})
