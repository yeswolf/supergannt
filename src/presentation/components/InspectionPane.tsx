import { useState } from 'react'
import { useWorkspaceState } from '../state/WorkspaceContext'
import type { InspectionFinding } from '../../application/services/ProjectInspector'
import styles from './InspectionPane.module.css'

const SEVERITY_ICON: Record<InspectionFinding['severity'], string> = {
  error: '✕',
  warning: '⚠',
  info: 'ℹ',
}

function countBySeverity(
  findings: InspectionFinding[],
  severity: InspectionFinding['severity'],
): number {
  return findings.filter((f) => f.severity === severity).length
}

export function InspectionPane() {
  const { inspections } = useWorkspaceState()
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  if (inspections.length === 0) {
    return (
      <div className={styles.pane} aria-label="No project issues found">
        <span className={styles.emptyIcon}>✓</span>
        <span className={styles.emptyText}>No issues found</span>
      </div>
    )
  }

  const toggle = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const errorCount = countBySeverity(inspections, 'error')
  const warningCount = countBySeverity(inspections, 'warning')
  const infoCount = countBySeverity(inspections, 'info')

  return (
    <div className={styles.pane} role="log" aria-label="Project inspections">
      <div className={styles.header}>
        <span className={styles.title}>Inspections</span>
        <span className={styles.counts}>
          {errorCount > 0 && (
            <span className={styles.errorBadge}>{errorCount} error{errorCount !== 1 ? 's' : ''}</span>
          )}
          {warningCount > 0 && (
            <span className={styles.warningBadge}>
              {warningCount} warning{warningCount !== 1 ? 's' : ''}
            </span>
          )}
          {infoCount > 0 && (
            <span className={styles.infoBadge}>
              {infoCount} info
            </span>
          )}
        </span>
      </div>
      <ul className={styles.list} role="list">
        {inspections.map((finding) => (
          <li key={finding.key}>
            <button
              className={styles.item}
              onClick={() => toggle(finding.key)}
              aria-expanded={expanded.has(finding.key)}
              type="button"
            >
              <span
                className={`${styles.severity} ${styles[`sev_${finding.severity}`]}`}
                aria-label={finding.severity}
              >
                {SEVERITY_ICON[finding.severity]}
              </span>
              <span className={styles.message}>{finding.message}</span>
            </button>
            {expanded.has(finding.key) && finding.detail ? (
              <div className={styles.detail}>{finding.detail}</div>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  )
}
