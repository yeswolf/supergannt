import { describe, expect, it } from 'vitest'
import {
  isEditableKeyboardTarget,
  matchProjectShortcut,
} from './projectShortcuts'

function keyEvent(
  key: string,
  init: Partial<KeyboardEvent> & { code?: string } = {},
): KeyboardEvent {
  return {
    key,
    code: init.code ?? key,
    ctrlKey: Boolean(init.ctrlKey),
    metaKey: Boolean(init.metaKey),
    altKey: Boolean(init.altKey),
    shiftKey: Boolean(init.shiftKey),
    isComposing: Boolean(init.isComposing),
    target: init.target ?? document.body,
  } as KeyboardEvent
}

describe('matchProjectShortcut', () => {
  it('maps ProjectLibre / MS Project task chords', () => {
    expect(matchProjectShortcut(keyEvent('Insert'))).toBe('addTask')
    expect(matchProjectShortcut(keyEvent('Delete'))).toBe('deleteSelection')
    expect(
      matchProjectShortcut(keyEvent('ArrowRight', { altKey: true, shiftKey: true })),
    ).toBe('indent')
    expect(
      matchProjectShortcut(keyEvent('ArrowLeft', { altKey: true, shiftKey: true })),
    ).toBe('outdent')
    expect(matchProjectShortcut(keyEvent('F2', { ctrlKey: true }))).toBe('link')
    expect(
      matchProjectShortcut(keyEvent('F2', { ctrlKey: true, shiftKey: true })),
    ).toBe('unlink')
    expect(matchProjectShortcut(keyEvent('F2', { shiftKey: true }))).toBe('taskInfo')
  })

  it('maps file / zoom / palette chords', () => {
    expect(matchProjectShortcut(keyEvent('k', { ctrlKey: true }))).toBe('palette')
    expect(matchProjectShortcut(keyEvent('n', { ctrlKey: true }))).toBe('newBlank')
    expect(matchProjectShortcut(keyEvent('o', { metaKey: true }))).toBe('open')
    expect(matchProjectShortcut(keyEvent('s', { ctrlKey: true }))).toBe('saveXml')
    expect(matchProjectShortcut(keyEvent('=', { ctrlKey: true }))).toBe('zoomIn')
    expect(matchProjectShortcut(keyEvent('-', { ctrlKey: true }))).toBe('zoomOut')
  })

  it('does not steal Delete/Insert while typing in inputs', () => {
    const input = document.createElement('input')
    document.body.appendChild(input)
    expect(isEditableKeyboardTarget(input)).toBe(true)
    expect(matchProjectShortcut(keyEvent('Delete', { target: input }))).toBeNull()
    expect(matchProjectShortcut(keyEvent('Insert', { target: input }))).toBeNull()
    // Palette still works from inputs
    expect(
      matchProjectShortcut(keyEvent('k', { ctrlKey: true, target: input })),
    ).toBe('palette')
    input.remove()
  })
})
