import { useEffect, useId, useRef } from 'react'
import {
  TASK_COLUMN_DEFS,
  TASK_COLUMN_IDS,
  TASK_SHEET_LABELS,
  type TaskColumnId,
} from './taskColumnDefs'
import { useTaskColumns } from './taskColumnStore'
import { IconAction, IconActions } from '../components/IconAction'
import styles from './TaskColumnsDialog.module.css'

type Props = {
  open: boolean
  onClose: () => void
}

export function TaskColumnsDialog({ open, onClose }: Props) {
  const titleId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const { columns, toggle, move, reset, setColumns } = useTaskColumns()
  const visible = new Set(columns)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  useEffect(() => {
    if (!open) return
    dialogRef.current?.querySelector<HTMLElement>('button, [href], input')?.focus()
  }, [open])

  if (!open) return null

  const orderedCatalog: TaskColumnId[] = [
    ...columns,
    ...TASK_COLUMN_IDS.filter((id) => !visible.has(id)),
  ]

  return (
    <div
      className={styles.backdrop}
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className={styles.header}>
          <h2 id={titleId}>Task columns</h2>
          <button
            type="button"
            className={styles.close}
            aria-label="Close"
            onClick={onClose}
          >
            ×
          </button>
        </header>
        <p className={styles.hint}>
          Choose which columns appear on the Gantt task tree and Task Sheet, and
          their order.
        </p>
        <ul className={styles.list}>
          {orderedCatalog.map((id) => {
            const checked = visible.has(id)
            const index = columns.indexOf(id)
            return (
              <li key={id} className={styles.row}>
                <label className={styles.check}>
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={id === 'name'}
                    aria-label={`Show ${TASK_SHEET_LABELS[id]}`}
                    onChange={() => toggle(id)}
                  />
                  <span>{TASK_COLUMN_DEFS[id].label}</span>
                </label>
                <div className={styles.movers}>
                  <button
                    type="button"
                    disabled={!checked || index <= 0}
                    aria-label={`Move ${TASK_SHEET_LABELS[id]} up`}
                    onClick={() => move(id, -1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    disabled={!checked || index < 0 || index >= columns.length - 1}
                    aria-label={`Move ${TASK_SHEET_LABELS[id]} down`}
                    onClick={() => move(id, 1)}
                  >
                    ↓
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
        <footer className={styles.footer}>
          <button
            type="button"
            className={styles.reset}
            onClick={() => {
              reset()
            }}
          >
            Reset defaults
          </button>
          <IconActions>
            <IconAction
              icon="ok"
              label="OK"
              primary
              onClick={() => {
                setColumns(columns)
                onClose()
              }}
            />
          </IconActions>
        </footer>
      </div>
    </div>
  )
}
