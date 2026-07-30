import { describe, expect, it } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { renderWithWorkspace } from '../../test/workspaceTestUtils'
import { WbsView } from './WbsView'
import { RbsView } from './RbsView'
import { ReportsView } from './ReportsView'
import { TaskUsageView, ResourceUsageView } from './UsageViews'

describe('tree and report views', () => {
  it('renders WBS and selects tasks', () => {
    renderWithWorkspace(<WbsView />)
    expect(screen.getByRole('heading', { name: 'WBS' })).toBeInTheDocument()
    const buttons = screen.getAllByRole('button')
    expect(buttons.length).toBeGreaterThan(0)
    fireEvent.click(buttons[0]!)
  })

  it('renders RBS and selects resources', () => {
    renderWithWorkspace(<RbsView />)
    expect(screen.getByRole('heading', { name: 'RBS' })).toBeInTheDocument()
    const buttons = screen.getAllByRole('button')
    expect(buttons.length).toBeGreaterThan(0)
    fireEvent.click(buttons[0]!)
  })

  it('renders reports with earned value', () => {
    renderWithWorkspace(<ReportsView />)
    expect(screen.getByRole('heading', { name: 'Reports' })).toBeInTheDocument()
    expect(screen.getByText('Earned Value')).toBeInTheDocument()
    expect(screen.getByText('Resource Load')).toBeInTheDocument()
  })

  it('renders task and resource usage tables', () => {
    const { unmount } = renderWithWorkspace(<TaskUsageView />)
    expect(screen.getByRole('heading', { name: 'Task Usage' })).toBeInTheDocument()
    unmount()
    renderWithWorkspace(<ResourceUsageView />)
    expect(screen.getByRole('heading', { name: 'Resource Usage' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Histogram' })).toBeInTheDocument()
  })
})
