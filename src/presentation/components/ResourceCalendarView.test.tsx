import { describe, expect, it } from 'vitest'
import { screen, fireEvent, within } from '@testing-library/react'
import { renderWithWorkspace } from '../../test/workspaceTestUtils'
import { ResourceCalendarView } from './ResourceCalendarView'
import { CalendarView } from './CalendarView'

describe('ResourceCalendarView', () => {
  it('shows resource month grid and working-time actions', () => {
    renderWithWorkspace(<ResourceCalendarView />)
    expect(screen.getByRole('heading', { name: 'Resource Calendar' })).toBeInTheDocument()
    expect(screen.getByLabelText('Resource calendar resource')).toBeInTheDocument()
    expect(screen.getByRole('grid', { name: 'Resource calendar month' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'New calendar for resource…' }))
    fireEvent.click(screen.getByRole('button', { name: 'Change Working Time…' }))
  })
})

describe('CalendarView resource scope', () => {
  it('switches For selector to a resource and can create a resource calendar', () => {
    renderWithWorkspace(<CalendarView />)
    expect(screen.getByRole('heading', { name: 'Change Working Time' })).toBeInTheDocument()
    const owner = screen.getByLabelText('Calendar applies to')
    const options = within(owner).getAllByRole('option')
    const resourceOption = options.find((o) => o.textContent?.startsWith('Resource:'))
    expect(resourceOption).toBeTruthy()
    fireEvent.change(owner, { target: { value: (resourceOption as HTMLOptionElement).value } })
    fireEvent.click(screen.getByRole('button', { name: 'New calendar for resource…' }))
  })
})
