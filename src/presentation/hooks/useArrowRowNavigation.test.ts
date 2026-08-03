import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useArrowRowNavigation } from './useArrowRowNavigation'

describe('useArrowRowNavigation', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('ArrowDown selects the next id', () => {
    const onSelect = vi.fn()
    renderHook(() =>
      useArrowRowNavigation({
        ids: ['a', 'b', 'c'],
        selectedId: 'a',
        onSelect,
        scroll: false,
      }),
    )

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }))
    })
    expect(onSelect).toHaveBeenCalledWith('b')
  })

  it('does not navigate while focus is in an input', () => {
    const onSelect = vi.fn()
    const input = document.createElement('input')
    document.body.appendChild(input)
    renderHook(() =>
      useArrowRowNavigation({
        ids: ['a', 'b'],
        selectedId: 'a',
        onSelect,
        scroll: false,
      }),
    )

    const ev = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })
    Object.defineProperty(ev, 'target', { value: input })
    act(() => {
      window.dispatchEvent(ev)
    })
    expect(onSelect).not.toHaveBeenCalled()
  })
})
