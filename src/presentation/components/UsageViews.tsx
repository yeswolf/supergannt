import {
  buildResourceHistogram,
  buildResourceUsage,
  buildTaskUsage,
} from '../../application/services/ViewModels'
import { useWorkspaceState } from '../state/WorkspaceContext'
import styles from './DataTable.module.css'

function uniqueDates(rows: { cells: { date: string }[] }[]): string[] {
  const set = new Set<string>()
  for (const row of rows) for (const cell of row.cells) set.add(cell.date)
  return [...set].sort()
}

export function TaskUsageView() {
  const { project } = useWorkspaceState()
  const rows = buildTaskUsage(project)
  const dates = uniqueDates(rows)

  return (
    <div className={styles.panel}>
      <div className={styles.heading}>
        <h2>Task Usage</h2>
        <p>Work hours by task and day (hour-based slots).</p>
      </div>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>WBS</th>
              <th>Task</th>
              <th>Resource</th>
              <th>Total (h)</th>
              {dates.map((d) => (
                <th key={d}>{d.slice(5)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.taskId}-${row.resourceId ?? 'none'}`}>
                <td>{row.wbs}</td>
                <td>{row.taskName}</td>
                <td>{row.resourceName}</td>
                <td>{row.totalHours.toFixed(1)}</td>
                {dates.map((d) => {
                  const cell = row.cells.find((c) => c.date === d)
                  return <td key={d}>{cell ? cell.hours.toFixed(1) : ''}</td>
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const HISTOGRAM_HEIGHT_PX = 120

export function ResourceUsageView() {
  const { project } = useWorkspaceState()
  const rows = buildResourceUsage(project)
  const histogram = buildResourceHistogram(project)
  const dates = uniqueDates(rows)
  // Peak of load vs capacity in view; use px heights (%, against min-height, never resolved).
  const maxScale = Math.max(
    1,
    ...histogram.map((b) => Math.max(b.hours, b.capacity)),
  )

  return (
    <div className={styles.panel}>
      <div className={styles.heading}>
        <h2>Resource Usage</h2>
        <p>Assignment hours and load histogram (overallocation in red).</p>
      </div>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Resource</th>
              <th>Task</th>
              <th>Total (h)</th>
              {dates.map((d) => (
                <th key={d}>{d.slice(5)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={`${row.resourceId}-${row.taskId ?? i}`}
                className={row.overallocated ? styles.danger : undefined}
              >
                <td>{row.resourceName}</td>
                <td>{row.taskName}</td>
                <td>{row.totalHours.toFixed(1)}</td>
                {dates.map((d) => {
                  const cell = row.cells.find((c) => c.date === d)
                  return <td key={d}>{cell ? cell.hours.toFixed(1) : ''}</td>
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={styles.heading}>
        <h2>Histogram</h2>
      </div>
      <div className={styles.tableWrap}>
        <div className={styles.histogram}>
          {histogram.map((bucket) => (
            <div
              key={`${bucket.resourceId}-${bucket.date}`}
              className={bucket.overallocated ? styles.histOver : styles.histBar}
              title={`${bucket.resourceName} ${bucket.date}: ${bucket.hours.toFixed(1)}h / ${bucket.capacity}h`}
              style={{
                height: `${Math.max(2, (bucket.hours / maxScale) * HISTOGRAM_HEIGHT_PX)}px`,
              }}
            >
              <span>{bucket.hours.toFixed(0)}h</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
