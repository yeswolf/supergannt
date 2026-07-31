import { describe, expect, it } from 'vitest'
import { screen, fireEvent, within } from '@testing-library/react'
import { renderWithWorkspace } from '../../test/workspaceTestUtils'
import { ResourceCalendarView } from './ResourceCalendarView'
import { CalendarView } from './CalendarView'

const withDemo = { bootstrap: [{ type: 'loadDemo' as const }] }

describe('ResourceCalendarView', () => {
  it('shows resource month grid and working-time actions', () => {
    renderWithWorkspace(<ResourceCalendarView />, withDemo)
    expect(screen.getByRole('heading', { name: 'Resource Calendar' })).toBeInTheDocument()
    expect(screen.getByLabelText('Resource calendar resource')).toBeInTheDocument()
    expect(screen.getByRole('grid', { name: 'Resource calendar month' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'New calendar for resource…' }))
    fireEvent.click(screen.getByRole('button', { name: 'Change Working Time…' }))
  })

  it('switches between month and year scale', () => {
    renderWithWorkspace(<ResourceCalendarView />, withDemo)
    const scale = screen.getByRole('group', { name: 'Calendar scale' })
    fireEvent.click(within(scale).getByRole('button', { name: 'Year' }))
    expect(screen.getByRole('grid', { name: 'Resource calendar year' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Next year' }))
    fireEvent.click(screen.getByRole('button', { name: 'Previous year' }))
    const jan = screen.getByRole('button', { name: /January \d+/ })
    fireEvent.click(jan)
    expect(screen.getByRole('grid', { name: 'Resource calendar month' })).toBeInTheDocument()
    fireEvent.click(within(scale).getByRole('button', { name: 'Month' }))
  })
})

describe('CalendarView resource scope', () => {
  it('switches For selector to a resource and can create a resource calendar', () => {
    renderWithWorkspace(<CalendarView />, withDemo)
    expect(screen.getByRole('heading', { name: 'Working Time' })).toBeInTheDocument()
    const owner = screen.getByLabelText('Calendar applies to')
    const options = within(owner).getAllByRole('option')
    const resourceOption = options.find((o) => o.textContent?.startsWith('Resource:'))
    expect(resourceOption).toBeTruthy()
    fireEvent.change(owner, { target: { value: (resourceOption as HTMLOptionElement).value } })
    fireEvent.click(screen.getByRole('button', { name: 'New calendar for resource…' }))
  })
})
