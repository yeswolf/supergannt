import type { MouseEvent, ReactNode } from 'react'
import { Icons, type RibbonIconName } from './icons/RibbonIcons'
import styles from './IconAction.module.css'

type IconActionProps = {
  label: string
  icon?: RibbonIconName
  /** Compact text glyph when no SVG icon fits (e.g. timescale H/D/W). */
  glyph?: string
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void
  disabled?: boolean
  pressed?: boolean
  primary?: boolean
  /** Ghost icon on dark titlebars. */
  tone?: 'default' | 'onDark'
}

export function IconAction({
  label,
  icon,
  glyph,
  onClick,
  disabled,
  pressed,
  primary,
  tone = 'default',
}: IconActionProps) {
  const Icon = icon ? Icons[icon] : null
  const base = pressed ? styles.active : primary ? styles.primary : styles.btn
  const className = tone === 'onDark' ? `${base} ${styles.onDark}` : base
  return (
    <button
      type="button"
      className={className}
      aria-label={label}
      title={label}
      aria-pressed={pressed === undefined ? undefined : pressed}
      disabled={disabled}
      data-icon-action=""
      onClick={onClick}
    >
      {Icon ? <Icon /> : <span className={styles.glyph}>{glyph ?? label.slice(0, 1)}</span>}
    </button>
  )
}

export function IconActionGroup({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <div className={styles.group} role="group" aria-label={label}>
      {children}
    </div>
  )
}

export function IconActions({ children }: { children: ReactNode }) {
  return <div className={styles.actions}>{children}</div>
}
