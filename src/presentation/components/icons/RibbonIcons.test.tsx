import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { Icons, type RibbonIconName } from './RibbonIcons'

describe('RibbonIcons', () => {
  it('renders every ribbon glyph', () => {
    const names = Object.keys(Icons) as RibbonIconName[]
    expect(names.length).toBeGreaterThan(20)
    for (const name of names) {
      const Icon = Icons[name]
      const { container, unmount } = render(<Icon data-testid={name} />)
      expect(container.querySelector('svg')).toBeTruthy()
      unmount()
    }
  })
})
