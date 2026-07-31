import { describe, expect, it } from 'vitest'
import { errorMessage } from './errorMessage'

describe('errorMessage', () => {
  it('reads Error.message', () => {
    expect(errorMessage(new Error('boom'))).toBe('boom')
  })

  it('reads string and object.message (Tauri reject shapes)', () => {
    expect(errorMessage('nope')).toBe('nope')
    expect(errorMessage({ message: 'denied' })).toBe('denied')
    expect(errorMessage({ error: 'x' })).toBe('x')
  })
})
