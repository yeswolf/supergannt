import { useEffect } from 'react'
import { describe, expect, it, vi, beforeAll } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { renderWithWorkspace } from '../test/workspaceTestUtils'
import { AppShell } from './AppShell'
import { useWorkspaceDispatch } from './state/WorkspaceContext'

vi.mock('./components/GanttView', () => ({
  GanttView: () => <div data-testid="gantt-view">Gantt</div>,
}))

vi.mock('./openPlanFile', () => ({
  openPlanFile: vi.fn().mockResolvedValue(undefined),
}))

beforeAll(() => {
  class RO {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal('ResizeObserver', RO)
})

function SetView({
  view,
}: {
  view:
    | 'tasks'
    | 'resources'
    | 'network'
    | 'wbs'
    | 'rbs'
    | 'taskUsage'
    | 'resourceUsage'
    | 'calendar'
    | 'reports'
    | 'gantt'
}) {
  const dispatch = useWorkspaceDispatch()
  useEffect(() => {
    dispatch({ type: 'setView', view })
  }, [dispatch, view])
  return null
}

function SetBusy() {
  const dispatch = useWorkspaceDispatch()
  useEffect(() => {
    dispatch({ type: 'setBusy', message: 'Opening demo.mpp…' })
  }, [dispatch])
  return null
}

describe('AppShell', () => {
  it('renders status bar for task sheet', async () => {
    renderWithWorkspace(
      <>
        <SetView view="tasks" />
        <AppShell />
      </>,
    )
    await waitFor(() => expect(screen.getByRole('status')).toBeInTheDocument())
    expect(screen.getByRole('heading', { name: 'Task Sheet' })).toBeInTheDocument()
  })

  it('renders resource and report views', async () => {
    const { unmount } = renderWithWorkspace(
      <>
        <SetView view="resources" />
        <AppShell />
      </>,
    )
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Resources' })).toBeInTheDocument(),
    )
    unmount()

    renderWithWorkspace(
      <>
        <SetView view="reports" />
        <AppShell />
      </>,
    )
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Reports' })).toBeInTheDocument(),
    )
  })

  it('renders gantt placeholder when view is gantt', async () => {
    renderWithWorkspace(
      <>
        <SetView view="gantt" />
        <AppShell />
      </>,
    )
    await waitFor(() => expect(screen.getByTestId('gantt-view')).toBeInTheDocument())
  })

  it('shows busy overlay', async () => {
    renderWithWorkspace(
      <>
        <SetBusy />
        <AppShell />
      </>,
    )
    await waitFor(() => expect(screen.getByRole('alertdialog')).toBeInTheDocument())
    expect(screen.getAllByText(/Opening demo.mpp/).length).toBeGreaterThan(0)
  })

  it('accepts file drag and drop when idle', async () => {
    const { openPlanFile } = await import('./openPlanFile')
    renderWithWorkspace(<AppShell />)
    const root = screen.getByRole('status').parentElement!
    const file = new File(['<Project/>'], 'drop.xml', { type: 'application/xml' })
    fireEvent.dragOver(root, {
      dataTransfer: { types: ['Files'], dropEffect: 'copy', files: [] },
    })
    fireEvent.drop(root, {
      dataTransfer: {
        types: ['Files'],
        files: [file],
      },
    })
    await waitFor(() => expect(openPlanFile).toHaveBeenCalled())
  })
})
