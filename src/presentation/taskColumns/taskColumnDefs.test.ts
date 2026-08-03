import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import {
  DEFAULT_TASK_COLUMNS,
  normalizeTaskColumns,
} from './taskColumnDefs'
import { buildGanttTaskColumns } from './buildGanttTaskColumns'
import {
  TASK_COLUMNS_STORAGE_KEY,
  getTaskColumns,
  moveTaskColumn,
  reloadTaskColumnsFromStorage,
  resetTaskColumns,
  setTaskColumns,
  toggleTaskColumn,
} from './taskColumnStore'

describe('normalizeTaskColumns', () => {
  it('keeps order, drops unknowns, and forces name', () => {
    expect(normalizeTaskColumns(['finish', 'bogus', 'wbs'])).toEqual([
      'finish',
      'wbs',
      'name',
    ])
  })

  it('falls back to defaults when empty', () => {
    expect(normalizeTaskColumns([])).toEqual([...DEFAULT_TASK_COLUMNS])
  })
})

describe('buildGanttTaskColumns', () => {
  it('maps predecessors to an editable text column', () => {
    const { columns, gridWidth } = buildGanttTaskColumns([
      'wbs',
      'name',
      'predecessors',
    ])
    expect(columns.map((c) => c.name)).toEqual(['wbs', 'text', 'predecessors'])
    expect(columns[2]?.editor).toEqual({
      type: 'text',
      map_to: 'predecessors',
    })
    expect(gridWidth).toBeGreaterThan(100)
  })
})

describe('taskColumnStore', () => {
  beforeEach(() => {
    localStorage.removeItem(TASK_COLUMNS_STORAGE_KEY)
    reloadTaskColumnsFromStorage()
  })
  afterEach(() => {
    localStorage.removeItem(TASK_COLUMNS_STORAGE_KEY)
    reloadTaskColumnsFromStorage()
  })

  it('persists visibility and order', () => {
    setTaskColumns(['name', 'predecessors', 'start'])
    expect(getTaskColumns()).toEqual(['name', 'predecessors', 'start'])
    expect(JSON.parse(localStorage.getItem(TASK_COLUMNS_STORAGE_KEY)!)).toEqual([
      'name',
      'predecessors',
      'start',
    ])
  })

  it('toggles and moves columns', () => {
    setTaskColumns(['name', 'wbs', 'start'])
    toggleTaskColumn('wbs')
    expect(getTaskColumns()).toEqual(['name', 'start'])
    toggleTaskColumn('predecessors')
    expect(getTaskColumns()).toEqual(['name', 'start', 'predecessors'])
    moveTaskColumn('predecessors', -1)
    expect(getTaskColumns()).toEqual(['name', 'predecessors', 'start'])
  })

  it('resets to defaults', () => {
    setTaskColumns(['name', 'wbs'])
    resetTaskColumns()
    expect(getTaskColumns()).toEqual([...DEFAULT_TASK_COLUMNS])
  })
})
