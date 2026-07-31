/** Theme ids applied as `data-theme` on `<html>`. */
export const THEME_IDS = [
  'light',
  'dark',
  'contrast-light',
  'contrast-dark',
  'darcula',
  'solarized-light',
  'solarized-dark',
] as const

export type ThemeId = (typeof THEME_IDS)[number]

export type ThemeMeta = {
  id: ThemeId
  label: string
  /** Command-palette / search keywords */
  keywords: string
  scheme: 'light' | 'dark'
}

export const THEMES: ThemeMeta[] = [
  {
    id: 'light',
    label: 'Light',
    keywords: 'theme light day',
    scheme: 'light',
  },
  {
    id: 'dark',
    label: 'Dark',
    keywords: 'theme dark night',
    scheme: 'dark',
  },
  {
    id: 'contrast-light',
    label: 'High Contrast Light',
    keywords: 'theme contrast a11y accessibility light',
    scheme: 'light',
  },
  {
    id: 'contrast-dark',
    label: 'High Contrast Dark',
    keywords: 'theme contrast a11y accessibility dark',
    scheme: 'dark',
  },
  {
    id: 'darcula',
    label: 'Darcula',
    keywords: 'theme darcula intellij idea jetbrains',
    scheme: 'dark',
  },
  {
    id: 'solarized-light',
    label: 'Solarized Light',
    keywords: 'theme solarized light ethan schoonover',
    scheme: 'light',
  },
  {
    id: 'solarized-dark',
    label: 'Solarized Dark',
    keywords: 'theme solarized dark ethan schoonover',
    scheme: 'dark',
  },
]

export const DEFAULT_THEME: ThemeId = 'light'
export const THEME_STORAGE_KEY = 'supergantt.theme'

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && (THEME_IDS as readonly string[]).includes(value)
}

export function readStoredTheme(): ThemeId {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY)
    if (isThemeId(raw)) return raw
  } catch {
    /* private mode / SSR */
  }
  return DEFAULT_THEME
}

export function themeMeta(id: ThemeId): ThemeMeta {
  return THEMES.find((t) => t.id === id) ?? THEMES[0]!
}
