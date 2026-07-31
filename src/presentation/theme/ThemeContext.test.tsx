import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { ThemeProvider, useTheme } from './ThemeContext'
import { THEME_STORAGE_KEY, THEMES } from './themes'

function ThemeProbe() {
  const { theme, setTheme, themes } = useTheme()
  return (
    <div>
      <span data-testid="current">{theme}</span>
      {themes.map((t) => (
        <button key={t.id} type="button" onClick={() => setTheme(t.id)}>
          {t.label}
        </button>
      ))}
    </div>
  )
}

describe('ThemeProvider', () => {
  beforeEach(() => {
    localStorage.removeItem(THEME_STORAGE_KEY)
    document.documentElement.removeAttribute('data-theme')
  })

  it('defaults to light and applies data-theme', () => {
    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    )
    expect(screen.getByTestId('current')).toHaveTextContent('light')
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })

  it('switches themes and persists', () => {
    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Darcula' }))
    expect(screen.getByTestId('current')).toHaveTextContent('darcula')
    expect(document.documentElement.getAttribute('data-theme')).toBe('darcula')
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('darcula')
  })

  it('exposes all built-in themes', () => {
    expect(THEMES.map((t) => t.id)).toEqual([
      'light',
      'dark',
      'contrast-light',
      'contrast-dark',
      'darcula',
      'solarized-light',
      'solarized-dark',
    ])
  })
})
