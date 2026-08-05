import { useMemo } from 'react'
import { useWorkspaceState } from '../state/WorkspaceContext'
import { inspectDependencies } from '../../domain/services/CircularDependencyDetector'
import styles from './DependencyInspectionPanel.module.css'

/**
 * Runs dependency inspection on the current project and renders a panel
 * showing circular dependencies, orphan tasks, redundant edges, and
 * dangling references.
 */
export function DependencyInspectionPanel() {
  const { project } = useWorkspaceState()

  const report = useMemo(
    () => inspectDependencies(project.tasks, project.dependencies),
    [project.tasks, project.dependencies],
  )

  const { acyclic, cycles, orphanTasks, redundantDependencies, danglingReferences, summary } =
    report

  const hasIssues = !acyclic || orphanTasks.length > 0 ||
    redundantDependencies.length > 0 || danglingReferences.length > 0

  let panelClass = styles.panel
  let badgeClass = styles.badge
  let severity: 'error' | 'warning' | 'info' | 'ok' = 'ok'

  if (!acyclic) {
    panelClass += ` ${styles['inspection-error']}`
    badgeClass += ` ${styles['inspection-error']}`
    severity = 'error'
  } else if (danglingReferences.length > 0) {
    panelClass += ` ${styles['inspection-warning']}`
    badgeClass += ` ${styles['inspection-warning']}`
    severity = 'warning'
  } else if (orphanTasks.length > 0 || redundantDependencies.length > 0) {
    panelClass += ` ${styles['inspection-info']}`
    badgeClass += ` ${styles['inspection-info']}`
    severity = 'info'
  } else {
    panelClass += ` ${styles['inspection-ok']}`
    badgeClass += ` ${styles['inspection-ok']}`
  }

  return (
    <div className={panelClass} role="status" aria-label="Dependency inspection report">
      <div className={styles.header}>
        <h3>Dependency Inspection</h3>
        <span className={badgeClass}>
          {severity === 'error'
            ? `${cycles.length} cycle${cycles.length !== 1 ? 's' : ''}`
            : hasIssues
              ? 'warnings'
              : 'OK'}
        </span>
      </div>

      <p className={styles.summary}>{summary}</p>

      {cycles.length > 0 && (
        <div className={styles.section}>
          <h4>Circular Dependencies</h4>
          <ul className={styles.list}>
            {cycles.map((cycle, i) => (
              <li key={i} className={styles.cycleItem}>
                <div className={styles.cycleChips}>
                  {cycle.path.map((id, j) => (
                    <span key={j} className={styles.cycleChip}>
                      {String(id)}
                    </span>
                  ))}
                </div>
                <div className={styles.cyclePath}>{cycle.description}</div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {orphanTasks.length > 0 && (
        <div className={styles.section}>
          <h4>Orphan Tasks</h4>
          <ul className={styles.list}>
            {orphanTasks.map((o) => (
              <li key={o.taskId} className={`${styles.orphanItem} ${styles[`orphan-${o.reason}`]}`}>
                <span className={styles.orphanName}>
                  {o.taskName} <small>({String(o.taskId)})</small>
                </span>
                <span className={styles.orphanReason}>
                  {o.reason === 'isolated'
                    ? 'isolated'
                    : o.reason === 'noPredecessors'
                      ? 'no predecessors'
                      : 'no successors'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {redundantDependencies.length > 0 && (
        <div className={styles.section}>
          <h4>Redundant Dependencies</h4>
          <ul className={styles.list}>
            {redundantDependencies.map((r) => (
              <li key={r.dependencyId} className={styles.redundantItem}>
                <span className={styles.redundantEdge}>
                  {String(r.predecessorId)} → {String(r.successorId)}
                </span>
                <span className={styles.redundantDetail}>
                  Already reachable via: {r.transitivePath.map((id) => String(id)).join(' → ')}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {danglingReferences.length > 0 && (
        <div className={styles.section}>
          <h4>Dangling References</h4>
          <ul className={styles.list}>
            {danglingReferences.map((d, i) => (
              <li key={i} className={styles.danglingItem}>
                Dependency <code>{d.dependencyId}</code> references missing{' '}
                {d.role} <code>{String(d.missingTaskId)}</code>
              </li>
            ))}
          </ul>
        </div>
      )}

      {hasIssues && <div className={styles.allClear}>All dependencies are clean</div>}
    </div>
  )
}