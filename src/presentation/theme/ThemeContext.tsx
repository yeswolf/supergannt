import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  DEFAULT_THEME,
  THEME_STORAGE_KEY,
  THEMES,
  isThemeId,
  readStoredTheme,
  themeMeta,
  type ThemeId,
  type ThemeMeta,
} from './themes'

type ThemeContextValue = {
  theme: ThemeId
  setTheme: (id: ThemeId) => void
  themes: ThemeMeta[]
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function applyThemeToDocument(id: ThemeId) {
  const root = document.documentElement
  root.setAttribute('data-theme', id)
  const meta = themeMeta(id)
  root.style.colorScheme = meta.scheme
  const themeColor = getComputedStyle(root).getPropertyValue('--msp-titlebar').trim()
  const tag = document.querySelector('meta[name="theme-color"]')
  if (tag && themeColor) tag.setAttribute('content', themeColor)
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>(() => readStoredTheme())

  useLayoutEffect(() => {
    applyThemeToDocument(theme)
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme)
    } catch {
      /* ignore */
    }
  }, [theme])

  const setTheme = useCallback((id: ThemeId) => {
    if (!isThemeId(id)) return
    setThemeState(id)
  }, [])

  const value = useMemo(
    () => ({ theme, setTheme, themes: THEMES }),
    [theme, setTheme],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) {
    return {
      theme: DEFAULT_THEME,
      setTheme: () => undefined,
      themes: THEMES,
    }
  }
  return ctx
}
