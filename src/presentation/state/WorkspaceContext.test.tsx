import { describe, expect, it, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { WorkspaceProvider, useWorkspaceState, useWorkspaceDispatch } from './WorkspaceContext'

function Probe() {
  const state = useWorkspaceState()
  const dispatch = useWorkspaceDispatch()
  return (
    <div>
      <span data-testid="view">{state.view}</span>
      <button type="button" onClick={() => dispatch({ type: 'setView', view: 'reports' })}>
        Go reports
      </button>
    </div>
  )
}

function OutsideState() {
  useWorkspaceState()
  return null
}

function OutsideDispatch() {
  useWorkspaceDispatch()
  return null
}

describe('WorkspaceContext', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('provides state and dispatch', async () => {
    const user = userEvent.setup()
    render(
      <WorkspaceProvider>
        <Probe />
      </WorkspaceProvider>,
    )
    expect(screen.getByTestId('view').textContent).toBe('gantt')
    await user.click(screen.getByRole('button', { name: 'Go reports' }))
    expect(screen.getByTestId('view').textContent).toBe('reports')
  })

  it('throws without provider', () => {
    expect(() => render(<OutsideState />)).toThrow(/WorkspaceProvider missing/)
    expect(() => render(<OutsideDispatch />)).toThrow(/WorkspaceProvider missing/)
  })
})
