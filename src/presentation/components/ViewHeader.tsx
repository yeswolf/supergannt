import type { ReactNode } from 'react'
import { IconActions } from './IconAction'
import { useWorkspaceActions } from './useWorkspaceActions'
import styles from './ViewHeader.module.css'

type Props = {
  title: string
  /** View-specific controls (scale, filters) — left of shared edit actions. */
  leading?: ReactNode
  /** Extra controls after shared edit actions. */
  trailing?: ReactNode
  /** Shared add/edit/link actions for the current selection. Default true. */
  workspaceActions?: boolean
}

export function ViewHeaderSep() {
  return <span className={styles.sep} aria-hidden />
}

/** Single title row: screen name + tools. No separate action bar. */
export function ViewHeader({
  title,
  leading,
  trailing,
  workspaceActions = true,
}: Props) {
  const shared = useWorkspaceActions()
  const hasTools =
    leading != null || trailing != null || (workspaceActions && shared.length > 0)

  return (
    <div className={styles.header}>
      <h2 className={styles.title}>{title}</h2>
      {hasTools ? (
        <div className={styles.tools} role="toolbar" aria-label={`${title} actions`}>
          {leading}
          {workspaceActions && shared.length > 0 ? (
            <IconActions>{shared}</IconActions>
          ) : null}
          {trailing}
        </div>
      ) : null}
    </div>
  )
}
