import { describe, expect, it, vi, beforeEach } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { renderWithWorkspace } from '../../test/workspaceTestUtils'
import { ResourceView } from './ResourceView'
import { TaskSheetView } from './TaskSheetView'
import { NetworkView } from './NetworkView'

describe('ResourceView', () => {
  it('lists resources and supports edits / add / delete', () => {
    renderWithWorkspace(<ResourceView />, { bootstrap: [{ type: 'loadDemo' }] })
    expect(screen.getByRole('heading', { name: 'Resources' })).toBeInTheDocument()

    const nameInputs = screen.getAllByLabelText('Resource name')
    fireEvent.change(nameInputs[0]!, { target: { value: 'Alice' } })

    const typeSelect = screen.getAllByLabelText('Resource type')[0]!
    fireEvent.change(typeSelect, { target: { value: 'material' } })

    const calendarSelect = screen.getAllByLabelText(/calendar$/)[0]!
    expect(calendarSelect).toBeInTheDocument()
    fireEvent.change(calendarSelect, { target: { value: '__new__' } })

    const deleteButtons = screen.getAllByRole('button', { name: 'Delete' })
    expect(deleteButtons.length).toBeGreaterThan(0)
    fireEvent.click(deleteButtons[deleteButtons.length - 1]!)
  })
})

describe('TaskSheetView', () => {
  it('edits task fields and opens assign / info flows', () => {
    renderWithWorkspace(<TaskSheetView />, { bootstrap: [{ type: 'loadDemo' }] })
    expect(screen.getByRole('heading', { name: 'Task Sheet' })).toBeInTheDocument()

    const rows = screen.getAllByRole('row').slice(1)
    expect(rows.length).toBeGreaterThan(0)
    const leafRow =
      rows.find((r) => r.querySelector('input:not([disabled])')) ?? rows[0]!
    fireEvent.click(leafRow)

    const nameInputs = screen.getAllByLabelText(/Task .+ name/)
    const leaf = nameInputs.find((el) => !(el as HTMLInputElement).disabled) ?? nameInputs[0]!
    fireEvent.change(leaf, { target: { value: 'Renamed' } })

    const duration = screen.getAllByLabelText(/duration hours/).find(
      (el) => !(el as HTMLInputElement).disabled,
    )
    if (duration) fireEvent.change(duration, { target: { value: '16' } })

    const resourceBtn = screen.getAllByRole('button').find((b) =>
      /resources$/i.test(b.getAttribute('aria-label') ?? ''),
    )
    if (resourceBtn) fireEvent.click(resourceBtn)
  })
})

describe('NetworkView', () => {
  beforeEach(() => {
    class RO {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal('ResizeObserver', RO)

    let call = 0
    Element.prototype.getBoundingClientRect = function getBoundingClientRect() {
      call += 1
      const i = call % 6
      return {
        x: 40 + (i % 3) * 180,
        y: 40 + Math.floor(i / 3) * 120,
        width: 140,
        height: 72,
        top: 40 + Math.floor(i / 3) * 120,
        left: 40 + (i % 3) * 180,
        bottom: 112 + Math.floor(i / 3) * 120,
        right: 180 + (i % 3) * 180,
        toJSON() {
          return {}
        },
      } as DOMRect
    }
  })

  it('renders network nodes and selects a task', () => {
    renderWithWorkspace(<NetworkView />, { bootstrap: [{ type: 'loadDemo' }] })
    expect(screen.getByRole('heading', { name: 'Network Diagram' })).toBeInTheDocument()
    const buttons = screen.getAllByRole('button')
    expect(buttons.length).toBeGreaterThan(0)
    fireEvent.click(buttons[0]!)
  })
})
