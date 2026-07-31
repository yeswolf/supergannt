import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { screen, waitFor, fireEvent } from '@testing-library/react'
import { within } from '@testing-library/react'
import { renderWithWorkspace } from '../../test/workspaceTestUtils'
import { AppChrome } from './AppChrome'
import { GanttView } from './GanttView'

vi.mock('dhtmlx-gantt', () => ({
  default: {
    plugins: vi.fn(),
    config: {
      types: { task: 'task', project: 'project', milestone: 'milestone' },
      min_column_width: 40,
      scales: [],
    },
    templates: {},
    init: vi.fn(),
    clearAll: vi.fn(),
    parse: vi.fn(),
    attachEvent: vi.fn(() => 'id'),
    detachEvent: vi.fn(),
    getTask: vi.fn(),
    isTaskExists: vi.fn(() => false),
    selectTask: vi.fn(),
    render: vi.fn(),
  },
}))
vi.mock('dhtmlx-gantt/codebase/dhtmlxgantt.css', () => ({}))

function runPaletteCommand(label: string | RegExp) {
  fireEvent.click(screen.getByRole('button', { name: /Command palette|Ctrl K/i }))
  const dialog = screen.getByRole('dialog', { name: 'Command palette' })
  fireEvent.click(within(dialog).getByRole('option', { name: label }))
}

describe('AppChrome', () => {
  beforeEach(() => {
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    URL.createObjectURL = vi.fn(() => 'blob:mock')
    URL.revokeObjectURL = vi.fn()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('navigates views from the rail and runs file commands via palette', async () => {
    renderWithWorkspace(<AppChrome />)
    expect(screen.getByText('SuperGantt')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'File' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Theme' })).toBeInTheDocument()

    const views = within(screen.getByRole('navigation', { name: 'Views' }))
    fireEvent.click(views.getByRole('button', { name: 'Task Sheet' }))
    fireEvent.click(views.getByRole('button', { name: 'Network Diagram' }))
    fireEvent.click(views.getByRole('button', { name: 'Gantt Chart' }))

    runPaletteCommand('Load sample plan')
    runPaletteCommand(/Save as XML/)
    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalled())
  })

  it('puts edit actions in the view title row and supports the command palette', async () => {
    renderWithWorkspace(
      <>
        <AppChrome />
        <GanttView />
      </>,
    )

    expect(screen.getByRole('heading', { name: 'Gantt Chart' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Add task' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add milestone' }))

    fireEvent.click(screen.getByRole('button', { name: /Command palette|Ctrl K/i }))
    expect(screen.getByRole('dialog', { name: 'Command palette' })).toBeInTheDocument()
    fireEvent.change(screen.getByPlaceholderText('Type a command…'), {
      target: { value: 'baseline' },
    })
    fireEvent.click(screen.getByRole('option', { name: 'Set baseline' }))
  })

  it('exports PDF and opens file picker from the command palette', async () => {
    renderWithWorkspace(<AppChrome />)
    runPaletteCommand('Export PDF')
    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalled())

    runPaletteCommand(/Save as MPX/)
    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalled())
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    expect(fileInput).toBeTruthy()
    expect(fileInput.accept).toContain('.mpp')
    runPaletteCommand(/Open/)
  })
})
