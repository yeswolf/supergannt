import {
  buildResourceHistogram,
  buildResourceUsage,
  buildTaskUsage,
} from '../../application/services/ViewModels'
import { useWorkspaceState } from '../state/WorkspaceContext'
import styles from './DataTable.module.css'
import { ColumnHeader, useResizableColumns } from './useResizableColumns'
import { ViewHeader } from './ViewHeader'

function uniqueDates(rows: { cells: { date: string }[] }[]): string[] {
  const set = new Set<string>()
  for (const row of rows) for (const cell of row.cells) set.add(cell.date)
  return [...set].sort()
}

export function TaskUsageView() {
  const { project } = useWorkspaceState()
  const rows = buildTaskUsage(project)
  const dates = uniqueDates(rows)
  const remeasureKey = `${rows.length}:${dates.length}`
  const { tableRef, colgroup, onResizeStart, onResizeAuto } =
    useResizableColumns(remeasureKey)

  const headers = ['WBS', 'Task', 'Resource', 'Total (h)', ...dates.map((d) => d.slice(5))]

  return (
    <div className={styles.panel}>
      <ViewHeader title="Task Usage" />
      <div className={styles.tableWrap}>
        <table ref={tableRef} className={styles.table}>
          {colgroup}
          <thead>
            <tr>
              {headers.map((label, i) => (
                <ColumnHeader
                  key={`${label}-${i}`}
                  index={i}
                  onResizeStart={onResizeStart}
                  onResizeAuto={onResizeAuto}
                >
                  {label}
                </ColumnHeader>
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
  const remeasureKey = `${rows.length}:${dates.length}`
  const { tableRef, colgroup, onResizeStart, onResizeAuto } =
    useResizableColumns(remeasureKey)
  // Peak of load vs capacity in view; use px heights (%, against min-height, never resolved).
  const maxScale = Math.max(
    1,
    ...histogram.map((b) => Math.max(b.hours, b.capacity)),
  )

  const headers = ['Resource', 'Task', 'Total (h)', ...dates.map((d) => d.slice(5))]

  return (
    <div className={styles.panel}>
      <ViewHeader title="Resource Usage" />
      <div className={styles.tableWrap}>
        <table ref={tableRef} className={styles.table}>
          {colgroup}
          <thead>
            <tr>
              {headers.map((label, i) => (
                <ColumnHeader
                  key={`${label}-${i}`}
                  index={i}
                  onResizeStart={onResizeStart}
                  onResizeAuto={onResizeAuto}
                >
                  {label}
                </ColumnHeader>
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

      <div className={styles.subHeading}>
        <h3>Histogram</h3>
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
