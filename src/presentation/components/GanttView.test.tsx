import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { act, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { renderWithWorkspace } from '../../test/workspaceTestUtils'
import { useWorkspaceState } from '../state/WorkspaceContext'
import { GanttView } from './GanttView'

type Handler = (...args: unknown[]) => unknown

const { ganttMock, handlers, tasks, links } = vi.hoisted(() => {
  const handlers = new Map<string, Handler>()
  const tasks = new Map<string, Record<string, unknown>>()
  const links = new Map<string, Record<string, unknown>>()
  const ganttMock = {
    plugins: vi.fn(),
    config: {
      types: { task: 'task', project: 'project', milestone: 'milestone' },
      min_column_width: 40,
      scales: [] as unknown[],
    },
    templates: {} as Record<string, unknown>,
    init: vi.fn(),
    clearAll: vi.fn(() => {
      // Mirror dhtmlx: clearing fires delete for every link currently loaded.
      const ids = [...links.keys()]
      links.clear()
      tasks.clear()
      const onDelete = handlers.get('onAfterLinkDelete')
      for (const id of ids) onDelete?.(id)
    }),
    parse: vi.fn(
      (payload: {
        data: { id: string; start_date?: string; end_date?: string }[]
        links?: { id: string; source: string; target: string; type: string }[]
      }) => {
        tasks.clear()
        links.clear()
        for (const t of payload.data) {
          tasks.set(String(t.id), t as Record<string, unknown>)
        }
        for (const l of payload.links ?? []) {
          links.set(String(l.id), l as Record<string, unknown>)
          // dhtmlx may emit add while parsing — production guards this via syncingRef.
          handlers.get('onAfterLinkAdd')?.(l.id, l)
        }
      },
    ),
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
    deleteLink: vi.fn((id: string) => {
      links.delete(String(id))
      handlers.get('onAfterLinkDelete')?.(String(id))
    }),
    render: vi.fn(),
    getScrollState: vi.fn(() => ({ x: 0, y: 0 })),
    scrollTo: vi.fn(),
  }
  return { ganttMock, handlers, tasks, links }
})

vi.mock('dhtmlx-gantt', () => ({ default: ganttMock }))
vi.mock('dhtmlx-gantt/codebase/dhtmlxgantt.css', () => ({}))

function GanttProbe() {
  const { project } = useWorkspaceState()
  const [showGantt, setShowGantt] = useState(true)
  const leaf = project.tasks.filter((t) => !t.summary)
  return (
    <div>
      {showGantt ? <GanttView /> : null}
      <button type="button" onClick={() => setShowGantt(false)}>
        hide-gantt
      </button>
      <output data-testid="dep-count">{project.dependencies.length}</output>
      <output data-testid="task-starts">
        {leaf.map((t) => `${t.name}:${t.start.toISOString()}`).join('|')}
      </output>
    </div>
  )
}

describe('GanttView', () => {
  const originalUserAgent = navigator.userAgent

  beforeEach(() => {
    handlers.clear()
    tasks.clear()
    links.clear()
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
    // Desktop / fine pointer: do not force touch (avoids 750ms link-drag delay).
    expect((ganttMock.config as { touch?: boolean | string }).touch).toBe(true)
    expect((ganttMock.config as { touch_drag?: number | boolean }).touch_drag).toBe(true)
    expect((ganttMock.config as { work_time?: boolean }).work_time).toBe(false)
    expect((ganttMock.config as { correct_work_time?: boolean }).correct_work_time).toBe(
      false,
    )

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

    expect((ganttMock.config as { touch?: boolean | string }).touch).toBe('force')
    expect((ganttMock.config as { touch_drag?: number | boolean }).touch_drag).toBe(750)

    const toggle = screen.getByRole('button', { name: 'Show task list' })
    expect(toggle).toBeInTheDocument()
    expect((ganttMock.config as { show_grid?: boolean }).show_grid).toBe(false)

    await user.click(toggle)
    expect(screen.getByRole('button', { name: 'Hide task list' })).toBeInTheDocument()
    expect((ganttMock.config as { show_grid?: boolean }).show_grid).toBe(true)
  })

  it('mouse FS link keeps dependency and shifts successor start after clearAll/parse sync', async () => {
    renderWithWorkspace(<GanttProbe />, {
      bootstrap: [{ type: 'newProject' }, { type: 'addTask' }, { type: 'addTask' }],
    })

    // Let bootstrap actions flush and gantt parse.
    await act(async () => {
      await Promise.resolve()
    })

    const startsBefore = screen.getByTestId('task-starts').textContent ?? ''
    const ids = [...tasks.keys()]
    expect(ids.length).toBeGreaterThanOrEqual(2)
    const [predId, succId] = ids

    // User draws a link in dhtmlx (transient id, not our dependency id).
    links.set('gantt-temp-1', {
      id: 'gantt-temp-1',
      source: predId,
      target: succId,
      type: '0',
    })
    await act(async () => {
      handlers.get('onAfterLinkAdd')?.('gantt-temp-1', {
        source: predId,
        target: succId,
        type: 0,
      })
      await Promise.resolve()
    })

    // Immediate schedule + sync must keep FS and move the successor bar.
    expect(screen.getByTestId('dep-count')).toHaveTextContent('1')
    const startsAfter = screen.getByTestId('task-starts').textContent ?? ''
    expect(startsAfter).not.toBe(startsBefore)
    const succParts = startsAfter.split('|')
    expect(succParts.length).toBe(2)
    const t0 = Date.parse(succParts[0]!.split(':').slice(1).join(':'))
    const t1 = Date.parse(succParts[1]!.split(':').slice(1).join(':'))
    expect(t1).toBeGreaterThan(t0)

    // Unmount Gantt (cleanup clearAll) must not wipe the scheduled dependency.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'hide-gantt' }))
      await Promise.resolve()
    })
    expect(screen.getByTestId('dep-count')).toHaveTextContent('1')
    expect(screen.getByTestId('task-starts').textContent).toBe(startsAfter)
  })

  it('start→finish drag becomes FS with finish-side task as predecessor', async () => {
    renderWithWorkspace(<GanttProbe />, {
      bootstrap: [{ type: 'newProject' }, { type: 'addTask' }, { type: 'addTask' }],
    })
    await act(async () => {
      await Promise.resolve()
    })

    const ids = [...tasks.keys()]
    const [firstId, secondId] = ids
    // dhtmlx SF: drag from start of task2 onto end of task1
    const link = { source: secondId!, target: firstId!, type: '3' as string | number }
    await act(async () => {
      handlers.get('onLinkCreated')?.(link)
      handlers.get('onAfterLinkAdd')?.('gantt-temp-sf', link)
      await Promise.resolve()
    })

    expect(String(link.source)).toBe(firstId)
    expect(String(link.target)).toBe(secondId)
    expect(String(link.type)).toBe('0')
    expect(screen.getByTestId('dep-count')).toHaveTextContent('1')
    const starts = screen.getByTestId('task-starts').textContent ?? ''
    const parts = starts.split('|')
    const t0 = Date.parse(parts[0]!.split(':').slice(1).join(':'))
    const t1 = Date.parse(parts[1]!.split(':').slice(1).join(':'))
    expect(t1).toBeGreaterThan(t0)
  })
})
