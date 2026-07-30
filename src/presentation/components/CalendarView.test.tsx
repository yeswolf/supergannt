import { describe, expect, it } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { renderWithWorkspace } from '../../test/workspaceTestUtils'
import { CalendarView } from './CalendarView'

describe('CalendarView', () => {
  it(
    'navigates month, toggles days, and edits work week / exceptions',
    () => {
      renderWithWorkspace(<CalendarView />)

      expect(screen.getByRole('heading', { name: 'Change Working Time' })).toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: 'Create New Calendar…' }))
      fireEvent.click(screen.getByRole('button', { name: 'Use for project' }))

      fireEvent.click(screen.getByRole('button', { name: 'Next month' }))
      fireEvent.click(screen.getByRole('button', { name: 'Previous month' }))

      const dayButtons = screen.getAllByRole('button').filter((b) =>
        /^\d+$/.test(b.querySelector('span')?.textContent?.trim() ?? ''),
      )
      if (dayButtons[5]) {
        fireEvent.click(dayButtons[5])
        fireEvent.click(dayButtons[5])
      }

      fireEvent.click(screen.getByRole('button', { name: 'Work Weeks' }))
      const monStart = screen.getByLabelText('Mon start hour')
      fireEvent.change(monStart, { target: { value: '9' } })
      const monEnd = screen.getByLabelText('Mon end hour')
      fireEvent.change(monEnd, { target: { value: '17' } })
      const checkboxes = screen.getAllByRole('checkbox')
      if (checkboxes[0] && !(checkboxes[0] as HTMLInputElement).checked) {
        fireEvent.click(checkboxes[0])
      }

      fireEvent.click(screen.getByRole('button', { name: 'Exceptions' }))
      const dateInput = document.querySelector('input[type="date"]') as HTMLInputElement
      fireEvent.change(dateInput, { target: { value: '2025-12-25' } })
      const nameInput = screen.getByPlaceholderText('Name')
      fireEvent.change(nameInput, { target: { value: 'Christmas' } })
      fireEvent.click(screen.getByRole('button', { name: 'Add exception' }))
      const remove = screen.queryByRole('button', { name: 'Remove' })
      if (remove) fireEvent.click(remove)

      fireEvent.click(screen.getByRole('button', { name: 'Calendar' }))
    },
    15_000,
  )
})
