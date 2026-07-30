import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { act, screen, waitFor, within, fireEvent } from '@testing-library/react'
import { renderWithWorkspace } from '../../test/workspaceTestUtils'
import { Toolbar } from './Toolbar'

function ribbonCmd(name: string | RegExp) {
  const body = document.querySelector('[class*="ribbonBody"]') as HTMLElement
  return within(body).getByRole('button', { name })
}

describe('Toolbar', () => {
  beforeEach(() => {
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    URL.createObjectURL = vi.fn(() => 'blob:mock')
    URL.revokeObjectURL = vi.fn()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it(
    'switches ribbon tabs and exercises commands',
    async () => {
      renderWithWorkspace(<Toolbar />)
      expect(screen.getByText('SuperGantt')).toBeInTheDocument()

      const tabs = within(screen.getByRole('navigation', { name: 'Ribbon tabs' }))

      fireEvent.click(tabs.getByRole('button', { name: 'File' }))
      fireEvent.click(ribbonCmd('Sample'))
      fireEvent.click(ribbonCmd('Blank'))
      fireEvent.click(ribbonCmd('Sample'))
      fireEvent.click(ribbonCmd('Save XML'))
      await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalled())

      fireEvent.click(tabs.getByRole('button', { name: 'Task' }))
      fireEvent.click(ribbonCmd('Milestone'))

      fireEvent.click(tabs.getByRole('button', { name: 'Resource' }))
      fireEvent.click(ribbonCmd('Add Resource'))
      fireEvent.click(ribbonCmd('Resource Sheet'))

      fireEvent.click(tabs.getByRole('button', { name: 'Project' }))
      fireEvent.click(ribbonCmd('Set Baseline'))
      fireEvent.click(ribbonCmd('Clear Baseline'))
      fireEvent.click(ribbonCmd('Reports'))

      fireEvent.click(tabs.getByRole('button', { name: 'View' }))
      fireEvent.click(ribbonCmd('Network Diagram'))
      fireEvent.click(ribbonCmd('WBS'))
      fireEvent.click(ribbonCmd('Task Usage'))

      const strip = within(screen.getByLabelText('Quick views'))
      fireEvent.click(strip.getByRole('button', { name: 'Gantt Chart' }))
      fireEvent.click(tabs.getByRole('button', { name: 'Task' }))
      fireEvent.click(ribbonCmd('Zoom In'))
      fireEvent.click(ribbonCmd('Zoom Out'))
    },
    20_000,
  )

  it(
    'exports PDF from File ribbon',
    async () => {
      renderWithWorkspace(<Toolbar />)
      const tabs = within(screen.getByRole('navigation', { name: 'Ribbon tabs' }))
      fireEvent.click(tabs.getByRole('button', { name: 'File' }))
      fireEvent.click(ribbonCmd('Export PDF'))
      await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalled())
    },
    15_000,
  )

  it('saves MPX and opens file picker', async () => {
    renderWithWorkspace(<Toolbar />)
    const tabs = within(screen.getByRole('navigation', { name: 'Ribbon tabs' }))
    fireEvent.click(tabs.getByRole('button', { name: 'File' }))
    fireEvent.click(ribbonCmd('Save MPX'))
    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalled())
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    expect(input).toBeTruthy()
    fireEvent.click(ribbonCmd('Open…'))
  })

  it('handles Electron desktop menu commands', async () => {
    let menuHandler: ((command: string) => void) | undefined
    window.superGanttDesktop = {
      platform: 'win32',
      isDesktop: true,
      onMenuCommand(handler) {
        menuHandler = handler
        return () => {
          menuHandler = undefined
        }
      },
    }

    renderWithWorkspace(<Toolbar />)
    expect(menuHandler).toBeTypeOf('function')

    await act(async () => {
      menuHandler!('file.new.sample')
      menuHandler!('view.set.network')
    })
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Network Diagram' }).className).toMatch(
        /Active|active/,
      )
    })

    await act(async () => {
      menuHandler!('task.insert.milestone')
      menuHandler!('resource.insert.add')
      menuHandler!('project.schedule.setBaseline')
      menuHandler!('file.save.mspdi')
    })
    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalled())

    delete window.superGanttDesktop
  })
})
