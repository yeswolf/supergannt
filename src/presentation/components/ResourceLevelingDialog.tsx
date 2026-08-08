import { useEffect, useRef, useMemo, type KeyboardEvent } from 'react'
import { levelResources } from '../../domain/services/ResourceLevelingService'
import { useWorkspaceDispatch, useWorkspaceState } from '../state/WorkspaceContext'
import { IconAction, IconActions } from './IconAction'
import styles from './ResourceLevelingDialog.module.css'

/**
 * Resource Leveling dialog — shows before/after summary and lets user
 * Accept or Cancel the leveling operation.
 */
export function ResourceLevelingDialog() {
  const { project, levelingDialogOpen } = useWorkspaceState()
  const dispatch = useWorkspaceDispatch()
  const dialogRef = useRef<HTMLDivElement>(null)

  const calendar = project.getCalendar()

  // Compute leveling preview when dialog opens
  const preview = useMemo(() => {
    if (!levelingDialogOpen) return null
    const result = levelResources(
      project.tasks,
      project.dependencies,
      project.resources,
      project.assignments,
      calendar,
      {
        scope: project.tasks.map((t) => t.id),
        order: 'priority',
      },
    )
    return result
  }, [levelingDialogOpen, project])

  useEffect(() => {
    if (!levelingDialogOpen) return
    const prev = document.activeElement as HTMLElement | null
    const focusable = dialogRef.current?.querySelector<HTMLElement>(
      'button, [tabindex]',
    )
    focusable?.focus()
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        dispatch({ type: 'closeLevelingDialog' })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      prev?.focus?.()
    }
  }, [levelingDialogOpen, dispatch])

  if (!levelingDialogOpen) return null

  const onAccept = () => {
    if (!preview) return
    dispatch({
      type: 'applyLeveling',
      tasks: preview.tasks,
      leveled: preview.leveled,
      finishAfter: preview.finishAfter,
    })
    dispatch({ type: 'closeLevelingDialog' })
  }

  const onDialogKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'Enter' || e.nativeEvent.isComposing) return
    const target = e.target as HTMLElement
    const tag = target.tagName
    if (tag === 'TEXTAREA' || tag === 'BUTTON' || tag === 'INPUT' || tag === 'SELECT') return
    e.preventDefault()
    onAccept()
  }

  const beforeCount = preview?.overallocationsBefore ?? 0
  const afterCount = preview?.overallocationsAfter ?? 0
  const resolved = beforeCount - afterCount
  const taskCount = preview?.leveled.length ?? 0
  const finishBefore = preview?.finishBefore
  const finishAfter = preview?.finishAfter

  return (
    <div
      className={styles.backdrop}
      role="presentation"
      onClick={() => dispatch({ type: 'closeLevelingDialog' })}
    >
      <div
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="leveling-title"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onDialogKeyDown}
      >
        <header className={styles.header}>
          <h2 id="leveling-title">Level Resources</h2>
          <IconAction
            label="Close"
            icon="cancel"
            tone="onDark"
            onClick={() => dispatch({ type: 'closeLevelingDialog' })}
          />
        </header>
        <div className={styles.body}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thStyle}>Metric</th>
                <th style={thStyle}>Before</th>
                <th style={thStyle}>After</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={tdStyle}>Overallocations</td>
                <td style={{ ...tdStyle, color: beforeCount > 0 ? 'var(--msp-danger)' : 'inherit' }}>
                  {beforeCount}
                </td>
                <td style={{ ...tdStyle, color: afterCount > 0 ? 'var(--msp-danger)' : 'inherit' }}>
                  {afterCount}
                </td>
              </tr>
              <tr>
                <td style={tdStyle}>Tasks delayed</td>
                <td style={tdStyle}>—</td>
                <td style={tdStyle}>{taskCount}</td>
              </tr>
              <tr>
                <td style={tdStyle}>Project finish</td>
                <td style={tdStyle}>
                  {finishBefore?.toISOString().slice(0, 10)}
                </td>
                <td style={tdStyle}>
                  {finishAfter?.toISOString().slice(0, 10)}
                </td>
              </tr>
            </tbody>
          </table>

          {taskCount > 0 && (
            <div style={{ marginTop: '1rem' }}>
              <h4 style={{ margin: '0 0 0.5rem' }}>Delayed Tasks</h4>
              <div
                style={{
                  maxHeight: '200px',
                  overflowY: 'auto',
                }}
              >
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Task</th>
                      <th style={thStyle}>Old Start</th>
                      <th style={thStyle}>New Start</th>
                      <th style={thStyle}>Delay</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview?.leveled.slice(0, 50).map((lt) => (
                      <tr key={lt.taskId}>
                        <td style={tdStyle}>{lt.name}</td>
                        <td style={tdStyle}>
                          {lt.oldStart.toISOString().slice(0, 10)}
                        </td>
                        <td style={tdStyle}>
                          {lt.newStart.toISOString().slice(0, 10)}
                        </td>
                        <td style={tdStyle}>
                          {formatDelayHours(lt.delayHours)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {taskCount > 0 && afterCount > 0 && (
            <p style={{ marginTop: '1rem', color: 'var(--msp-warning)' }}>
              {taskCount} task(s) delayed, {afterCount} overallocation(s) remain.
              Leveling could not fully resolve all conflicts.
            </p>
          )}

          {resolved === 0 && beforeCount === 0 && (
            <p style={{ marginTop: '1rem', color: 'var(--msp-success)' }}>
              No resource overallocations found. Nothing to level.
            </p>
          )}
        </div>
        <footer className={styles.footer}>
          <IconActions>
            <IconAction
              label={resolved > 0 ? 'Accept' : 'OK'}
              icon="ok"
              primary
              onClick={onAccept}
            />
            <IconAction
              label="Cancel"
              icon="cancel"
              onClick={() => dispatch({ type: 'closeLevelingDialog' })}
            />
          </IconActions>
        </footer>
      </div>
    </div>
  )
}

function formatDelayHours(hours: number): string {
  if (hours < 8) return `${hours.toFixed(1)}h`
  if (hours < 40) return `${(hours / 8).toFixed(1)}d`
  return `${(hours / 40).toFixed(1)}w`
}

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '0.4rem 0.5rem',
  borderBottom: '1px solid var(--msp-border)',
  fontWeight: 600,
  fontSize: 'var(--msp-text-sm)',
}

const tdStyle: React.CSSProperties = {
  padding: '0.35rem 0.5rem',
  borderBottom: '1px solid var(--msp-border)',
  fontSize: 'var(--msp-text-sm)',
}
