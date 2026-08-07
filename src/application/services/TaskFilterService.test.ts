import { describe, it, expect } from 'vitest'
import {
  applyFilters,
  applySorts,
  buildGroups,
  deriveTaskView,
  flattenForRendering,
  toggleSort,
  DEFAULT_FILTER_STATE,
} from './TaskFilterService'
import type { ColumnFilter, SortSpec, FilterState } from './TaskFilterService'
import { createDemoProject } from './ProjectFactory'
import { UuidIdGenerator } from '../../infrastructure/ids/UuidIdGenerator'

describe('TaskFilterService', () => {
  const ids = new UuidIdGenerator()
  const project = createDemoProject(ids)

  describe('applyFilters', () => {
    it('returns all tasks when no filters', () => {
      const result = applyFilters(project.tasks, project, [])
      expect(result).toHaveLength(project.tasks.length)
    })

    it('filters by text contains', () => {
      const tasks = project.tasks.filter((t) => !t.summary)
      if (tasks.length === 0) return
      const target = tasks[0]!
      const filter: ColumnFilter = {
        field: 'name',
        operator: 'contains',
        value: target.name.slice(0, 3),
      }
      const result = applyFilters(project.tasks, project, [filter])
      expect(result.some((t) => t.id === target.id)).toBe(true)
    })

    it('filters by numeric range (gte)', () => {
      const filter: ColumnFilter = {
        field: 'percent',
        operator: 'gte',
        value: 50,
      }
      const result = applyFilters(project.tasks, project, [filter])
      for (const t of result) {
        expect(t.percentComplete).toBeGreaterThanOrEqual(50)
      }
    })

    it('filters boolean fields', () => {
      const filter: ColumnFilter = {
        field: 'milestone',
        operator: 'equals',
        value: true,
      }
      const result = applyFilters(project.tasks, project, [filter])
      for (const t of result) {
        expect(t.milestone).toBe(true)
      }
    })

    it('combines multiple filters with AND logic', () => {
      const f1: ColumnFilter = {
        field: 'percent',
        operator: 'gte',
        value: 50,
      }
      const f2: ColumnFilter = {
        field: 'milestone',
        operator: 'equals',
        value: false,
      }
      const result = applyFilters(project.tasks, project, [f1, f2])
      for (const t of result) {
        expect(t.percentComplete).toBeGreaterThanOrEqual(50)
        expect(t.milestone).toBe(false)
      }
    })
  })

  describe('applySorts', () => {
    it('returns unsorted when no sorts', () => {
      const result = applySorts([...project.tasks], project, [])
      expect(result).toHaveLength(project.tasks.length)
    })

    it('sorts ascending by a field', () => {
      const sort: SortSpec = { field: 'percent', direction: 'asc' }
      const result = applySorts([...project.tasks], project, [sort])
      for (let i = 1; i < result.length; i++) {
        expect(result[i]!.percentComplete).toBeGreaterThanOrEqual(
          result[i - 1]!.percentComplete,
        )
      }
    })

    it('sorts descending by a field', () => {
      const sort: SortSpec = { field: 'percent', direction: 'desc' }
      const result = applySorts([...project.tasks], project, [sort])
      for (let i = 1; i < result.length; i++) {
        expect(result[i]!.percentComplete).toBeLessThanOrEqual(
          result[i - 1]!.percentComplete,
        )
      }
    })

    it('multi-column sort', () => {
      const sorts: SortSpec[] = [
        { field: 'outlineLevel', direction: 'asc' },
        { field: 'percent', direction: 'desc' },
      ]
      const result = applySorts([...project.tasks], project, sorts)
      expect(result.length).toBeGreaterThan(0)
    })
  })

  describe('buildGroups', () => {
    it('returns empty when groupBy is none', () => {
      const groups = buildGroups([...project.tasks], project, 'none', [])
      expect(groups).toHaveLength(0)
    })

    it('groups by status', () => {
      const groups = buildGroups([...project.tasks], project, 'status', [])
      expect(groups.length).toBeGreaterThan(0)
      for (const g of groups) {
        expect(g.taskIds.length).toBeGreaterThan(0)
        expect(g.totalWorkHours).toBeGreaterThanOrEqual(0)
      }
    })

    it('groups by outline level', () => {
      const groups = buildGroups(
        [...project.tasks],
        project,
        'outlineLevel',
        [],
      )
      expect(groups.length).toBeGreaterThan(0)
    })

    it('marks collapsed groups', () => {
      const groups = buildGroups([...project.tasks], project, 'status', [
        'Not Started',
      ])
      const ns = groups.find((g) => g.key === 'Not Started')
      expect(ns?.collapsed).toBe(true)
    })
  })

  describe('deriveTaskView', () => {
    it('returns all tasks with default state', () => {
      const view = deriveTaskView(project, DEFAULT_FILTER_STATE)
      expect(view.orderedTasks).toHaveLength(project.tasks.length)
      expect(view.groups).toHaveLength(0)
      expect(view.activeFilterCount).toBe(0)
    })

    it('applies filters and sorts', () => {
      const state: FilterState = {
        filters: [
          { field: 'percent', operator: 'gte', value: 80 },
        ],
        sorts: [{ field: 'percent', direction: 'desc' }],
        groupBy: 'none',
        collapsedGroups: [],
      }
      const view = deriveTaskView(project, state)
      expect(view.activeFilterCount).toBe(1)
      expect(view.activeSortCount).toBe(1)
    })

    it('groups tasks', () => {
      const state: FilterState = {
        ...DEFAULT_FILTER_STATE,
        groupBy: 'status',
      }
      const view = deriveTaskView(project, state)
      expect(view.groups.length).toBeGreaterThan(0)
      expect(view.groupIndex.size).toBeGreaterThan(0)
    })
  })

  describe('flattenForRendering', () => {
    it('returns flat task list without groups', () => {
      const view = deriveTaskView(project, DEFAULT_FILTER_STATE)
      const rows = flattenForRendering(view)
      expect(rows).toHaveLength(project.tasks.length)
      expect(rows[0]?.type).toBe('task')
    })

    it('returns groups and tasks when grouped', () => {
      const state: FilterState = {
        ...DEFAULT_FILTER_STATE,
        groupBy: 'status',
      }
      const view = deriveTaskView(project, state)
      const rows = flattenForRendering(view)
      expect(rows.some((r) => r.type === 'group')).toBe(true)
      expect(rows.some((r) => r.type === 'task')).toBe(true)
    })

    it('hides tasks in collapsed groups', () => {
      const groups = buildGroups([...project.tasks], project, 'status', [])
      if (groups.length === 0) return
      const allCollapsed = groups.map((g) => g.key)
      const state: FilterState = {
        ...DEFAULT_FILTER_STATE,
        groupBy: 'status',
        collapsedGroups: allCollapsed,
      }
      const view = deriveTaskView(project, state)
      const rows = flattenForRendering(view)
      // Only group headers, no task rows
      expect(rows.every((r) => r.type === 'group')).toBe(true)
    })
  })

  describe('toggleSort', () => {
    it('adds ascending sort when none exists', () => {
      const result = toggleSort([], 'name', false)
      expect(result).toEqual([{ field: 'name', direction: 'asc' }])
    })

    it('flips to descending on second click', () => {
      const result = toggleSort(
        [{ field: 'name', direction: 'asc' }],
        'name',
        false,
      )
      expect(result).toEqual([{ field: 'name', direction: 'desc' }])
    })

    it('removes sort on third click', () => {
      const result = toggleSort(
        [{ field: 'name', direction: 'desc' }],
        'name',
        false,
      )
      expect(result).toEqual([])
    })

    it('adds to multi-column sort when additive', () => {
      const result = toggleSort(
        [{ field: 'name', direction: 'asc' }],
        'percent',
        true,
      )
      expect(result).toHaveLength(2)
    })
  })

  describe('smoke test', () => {
    it('applies filter, sort and grouping across the demo project without error', () => {
      const state: FilterState = {
        filters: [
          { field: 'percent', operator: 'gte', value: 50 },
        ],
        sorts: [{ field: 'start', direction: 'asc' }],
        groupBy: 'status',
        collapsedGroups: [],
      }
      const view = deriveTaskView(project, state)
      expect(view.orderedTasks.length).toBeGreaterThan(0)
      expect(view.groups.length).toBeGreaterThan(0)
      expect(view.activeFilterCount).toBe(1)
      expect(view.activeSortCount).toBe(1)
    })
  })
})
