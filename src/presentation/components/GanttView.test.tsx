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
  }
  return { ganttMock, handlers, tasks }
})

vi.mock('dhtmlx-gantt', () => ({ default: ganttMock }))
vi.mock('dhtmlx-gantt/codebase/dhtmlxgantt.css', () => ({}))

describe('GanttView', () => {
  beforeEach(() => {
    handlers.clear()
    tasks.clear()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('initializes gantt, zooms, and wires interaction events', async () => {
    const user = userEvent.setup()
    renderWithWorkspace(<GanttView />)

    expect(screen.getByRole('region', { name: 'Gantt chart' })).toBeInTheDocument()
    expect(ganttMock.init).toHaveBeenCalled()
    expect(ganttMock.parse).toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Zoom In' }))
    await user.click(screen.getByRole('button', { name: 'Zoom Out' }))
    const dayBtn = screen.queryByRole('button', { name: 'Day' })
    if (dayBtn) await user.click(dayBtn)

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
})
