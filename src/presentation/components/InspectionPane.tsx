import { useMemo } from 'react'
import { inspectProject, type InspectionFinding } from '../../domain/services/ProjectInspector'
import { useWorkspaceState } from '../state/WorkspaceContext'
import styles from './InspectionPane.module.css'

function severityClass(severity: InspectionFinding['severity']): string {
  if (severity === 'error') return styles.error
  if (severity === 'warning') return styles.warning
  return styles.info
}

function categoryLabel(category: InspectionFinding['category']): string {
  switch (category) {
    case 'circular-dependency':
      return 'Circular'
    case 'dangling-dependency':
      return 'Dangling'
    case 'duplicate-dependency':
      return 'Duplicate'
    case 'self-dependency':
      return 'Self-link'
  }
}

export function InspectionPane() {
  const { project } = useWorkspaceState()

  const findings = useMemo(
    () =>
      inspectProject(
        project.tasks as Parameters<typeof inspectProject>[0],
        project.dependencies as Parameters<typeof inspectProject>[1],
      ),
    [project.tasks, project.dependencies],
  )

  if (findings.length === 0) {
    return (
      <div className={styles.pane} data-inspection="clean">
        <div className={styles.empty}>
          <span className={styles.emptyIcon} aria-hidden>
            ✓
          </span>
          <span>No issues found</span>
        </div>
      </div>
    )
  }

  const errorCount = findings.filter((f) => f.severity === 'error').length
  const warningCount = findings.filter((f) => f.severity === 'warning').length

  return (
    <div
      className={styles.pane}
      role="alert"
      aria-label={`Inspection results: ${errorCount} errors, ${warningCount} warnings`}
    >
      <div className={styles.header}>
        <h2 className={styles.title}>Inspections</h2>
        <div className={styles.counts}>
          {errorCount > 0 ? (
            <span className={`${styles.badge} ${styles.badgeError}`}>
              {errorCount} error{errorCount !== 1 ? 's' : ''}
            </span>
          ) : null}
          {warningCount > 0 ? (
            <span className={`${styles.badge} ${styles.badgeWarning}`}>
              {warningCount} warning{warningCount !== 1 ? 's' : ''}
            </span>
          ) : null}
        </div>
      </div>
      <ul className={styles.list}>
        {findings.map((finding) => (
          <li
            key={finding.key}
            className={`${styles.item} ${severityClass(finding.severity)}`}
          >
            <div className={styles.itemHeader}>
              <span
                className={`${styles.severityDot} ${severityClass(finding.severity)}`}
                aria-hidden
              />
              <span className={styles.category}>
                {categoryLabel(finding.category)}
              </span>
            </div>
            <p className={styles.message}>{finding.message}</p>
            {finding.cyclePath ? (
              <div className={styles.cyclePath}>
                <span className={styles.cycleLabel}>Cycle path:</span>
                <code className={styles.cycleCode}>
                  {finding.cyclePath.map((id, i) => (
                    <span key={id}>
                      {i > 0 ? (
                        <span className={styles.cycleArrow}> → </span>
                      ) : null}
                      {id}
                    </span>
                  ))}
                </code>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  )
}