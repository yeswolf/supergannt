import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithWorkspace } from '../../test/workspaceTestUtils'
import { GanttView } from './GanttView'

type Handler = (...args: unknown[]) => unknown

const { ganttMock, handlers, tasks } = vi.hoisted(() => {
  const handlers = new Map<string, Handler>()
  const tasks = new Map<string, Record<string, unknown>>()
  const ganttMock = {
    plugins: vi.fn(),
    config: {
      types: { task: 'task', project: 'project', milestone: 'milestone' },
      min_column_width: 40,
      scales: [] as unknown[],
    },
    templates: {} as Record<string, unknown>,
    init: vi.fn(),
    clearAll: vi.fn(),
    parse: vi.fn((payload: { data: { id: string }[] }) => {
      tasks.clear()
      for (const t of payload.data) tasks.set(String(t.id), t as Record<string, unknown>)
    }),
    attachEvent: vi.fn((name: string, fn: Handler) => {
      handlers.set(name, fn)
      return name
    }),
    detachEvent: vi.fn(),
    getTask: vi.fn((id: string) =>
      tasks.get(String(id)) ?? {
        start_date: new Date('2024-01-02'),
        end_date: new Date('2024-01-04'),
        duration: 16,
        progress: 0.25,
      },
    ),
    isTaskExists: vi.fn((id: string) => tasks.has(String(id))),
    selectTask: vi.fn(),
    render: vi.fn(),
    getScrollState: vi.fn(() => ({ x: 0, y: 0 })),
    scrollTo: vi.fn(),
  }
  return { ganttMock, handlers, tasks }
})

vi.mock('dhtmlx-gantt', () => ({ default: ganttMock }))
vi.mock('dhtmlx-gantt/codebase/dhtmlxgantt.css', () => ({}))

describe('GanttView', () => {
  const originalUserAgent = navigator.userAgent

  beforeEach(() => {
    handlers.clear()
    tasks.clear()
    vi.clearAllMocks()
    Object.defineProperty(window.navigator, 'userAgent', {
      configurable: true,
      writable: true,
      value: originalUserAgent,
    })
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    })
  })

  afterEach(() => {
    Object.defineProperty(window.navigator, 'userAgent', {
      configurable: true,
      writable: true,
      value: originalUserAgent,
    })
    vi.restoreAllMocks()
  })

  it('initializes gantt, zooms, and wires interaction events', async () => {
    const user = userEvent.setup()
    renderWithWorkspace(<GanttView />)

    expect(screen.getByRole('region', { name: 'Gantt chart' })).toBeInTheDocument()
    expect(ganttMock.init).toHaveBeenCalled()
    expect(ganttMock.parse).toHaveBeenCalled()
    expect((ganttMock.config as { touch?: string }).touch).toBe('force')
    expect((ganttMock.config as { touch_drag?: number }).touch_drag).toBe(750)

    await user.selectOptions(screen.getByRole('combobox', { name: 'Timescale' }), 'hours')
    expect(screen.getByRole('combobox', { name: 'Timescale' })).toHaveValue('hours')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Timescale' }), 'days')
    expect(screen.getByRole('combobox', { name: 'Timescale' })).toHaveValue('days')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Timescale' }), 'week')
    expect(screen.getByRole('combobox', { name: 'Timescale' })).toHaveValue('week')

    await user.click(screen.getByRole('button', { name: 'Critical' }))
    await user.click(screen.getByRole('button', { name: 'Milestones' }))
    await user.click(screen.getByRole('button', { name: 'Incomplete' }))
    await user.click(screen.getByRole('button', { name: 'All tasks' }))

    window.dispatchEvent(new CustomEvent('supergantt:gantt-zoom', { detail: 'in' }))
    window.dispatchEvent(new CustomEvent('supergantt:gantt-zoom', { detail: 'out' }))
    fireEvent.keyDown(window, { key: '=', ctrlKey: true })
    fireEvent.keyDown(window, { key: '-', ctrlKey: true })

    const chart = screen.getByRole('region', { name: 'Gantt chart' })
    fireEvent.wheel(chart, { deltaY: -10, ctrlKey: true })
    fireEvent.wheel(chart, { deltaY: 10, ctrlKey: true })

    handlers.get('onTaskSelected')?.('t1')
    handlers.get('onTaskDblClick')?.('t1')
    handlers.get('onAfterTaskDrag')?.('t1', 'move')
    handlers.get('onAfterLinkAdd')?.('l1', { source: 'a', target: 'b', type: '0' })
    handlers.get('onAfterLinkDelete')?.('dep1')

    const ganttAny = ganttMock as typeof ganttMock & {
      getTaskType: (v: unknown) => string
    }
    expect(ganttAny.getTaskType({ type: 'milestone' })).toBe('milestone')
    expect(ganttAny.getTaskType({ type: 'project' })).toBe('project')
    expect(ganttAny.getTaskType('task')).toBe('task')

    const taskClass = ganttMock.templates.task_class as (
      a: Date,
      b: Date,
      t: { type?: string; critical?: boolean },
    ) => string
    expect(taskClass(new Date(), new Date(), { type: 'milestone', critical: true })).toContain(
      'super-milestone',
    )
  })

  it('keeps the task grid visible on desktop/web after timescale change', async () => {
    const user = userEvent.setup()
    renderWithWorkspace(<GanttView />)
    expect((ganttMock.config as { show_grid?: boolean }).show_grid).toBe(true)

    await user.selectOptions(screen.getByRole('combobox', { name: 'Timescale' }), 'week')
    expect(screen.getByRole('combobox', { name: 'Timescale' })).toHaveValue('week')
    expect((ganttMock.config as { show_grid?: boolean }).show_grid).toBe(true)
    expect(screen.queryByRole('button', { name: 'Show task list' })).not.toBeInTheDocument()
  })

  it('toggles the task grid only on Android', async () => {
    Object.defineProperty(window.navigator, 'userAgent', {
      configurable: true,
      writable: true,
      value:
        'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36',
    })

    const user = userEvent.setup()
    renderWithWorkspace(<GanttView />)

    const toggle = screen.getByRole('button', { name: 'Show task list' })
    expect(toggle).toBeInTheDocument()
    expect((ganttMock.config as { show_grid?: boolean }).show_grid).toBe(false)

    await user.click(toggle)
    expect(screen.getByRole('button', { name: 'Hide task list' })).toBeInTheDocument()
    expect((ganttMock.config as { show_grid?: boolean }).show_grid).toBe(true)
  })
})
