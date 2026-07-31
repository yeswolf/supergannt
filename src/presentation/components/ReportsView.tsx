import {
  computeEarnedValue,
  toResourceSheet,
} from '../../application/services/ReportingService'
import { useWorkspaceState } from '../state/WorkspaceContext'
import styles from './ReportsView.module.css'
import { ViewHeader } from './ViewHeader'

export function ReportsView() {
  const { project } = useWorkspaceState()
  const ev = computeEarnedValue(project)
  const resources = toResourceSheet(project)
  const criticalCount = project.tasks.filter((t) => t.critical && !t.summary).length
  const milestoneCount = project.tasks.filter((t) => t.milestone).length

  return (
    <div className={styles.panel}>
      <ViewHeader title="Reports" />

      <div className={styles.grid}>
        <article>
          <h3>Schedule</h3>
          <dl>
            <div>
              <dt>Tasks</dt>
              <dd>{project.tasks.length}</dd>
            </div>
            <div>
              <dt>Critical</dt>
              <dd>{criticalCount}</dd>
            </div>
            <div>
              <dt>Milestones</dt>
              <dd>{milestoneCount}</dd>
            </div>
            <div>
              <dt>Finish</dt>
              <dd>{project.finishDate.toISOString().slice(0, 10)}</dd>
            </div>
          </dl>
        </article>

        <article>
          <h3>Earned Value</h3>
          <dl>
            <div>
              <dt>PV</dt>
              <dd>{ev.plannedValue.toFixed(2)}</dd>
            </div>
            <div>
              <dt>EV</dt>
              <dd>{ev.earnedValue.toFixed(2)}</dd>
            </div>
            <div>
              <dt>AC</dt>
              <dd>{ev.actualCost.toFixed(2)}</dd>
            </div>
            <div>
              <dt>SPI / CPI</dt>
              <dd>
                {ev.spi.toFixed(2)} / {ev.cpi.toFixed(2)}
              </dd>
            </div>
          </dl>
        </article>

        <article>
          <h3>Cost</h3>
          <dl>
            <div>
              <dt>Total</dt>
              <dd>{project.totalCost().format()}</dd>
            </div>
            <div>
              <dt>SV</dt>
              <dd>{ev.scheduleVariance.toFixed(2)}</dd>
            </div>
            <div>
              <dt>CV</dt>
              <dd>{ev.costVariance.toFixed(2)}</dd>
            </div>
          </dl>
        </article>
      </div>

      <h3 className={styles.sub}>Resource Load</h3>
      <ul className={styles.list}>
        {resources.map((r) => (
          <li key={r.resourceId} className={r.overallocated ? styles.over : undefined}>
            <span className={styles.name}>{r.name}</span>
            <span className={styles.meta}>
              {r.assignedUnits}/{r.maxUnits} units · {r.workHours.toFixed(1)}h ·{' '}
              {r.cost.format()}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
