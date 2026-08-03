import {
  buildResourceHistogram,
  buildResourceUsage,
  buildTaskUsage,
} from '../../application/services/ViewModels'
import { useArrowRowNavigation } from '../hooks/useArrowRowNavigation'
import { useWorkspaceDispatch, useWorkspaceState } from '../state/WorkspaceContext'
import styles from './DataTable.module.css'
import { ColumnHeader, useResizableColumns } from './useResizableColumns'
import { ViewHeader } from './ViewHeader'

function uniqueDates(rows: { cells: { date: string }[] }[]): string[] {
  const set = new Set<string>()
  for (const row of rows) for (const cell of row.cells) set.add(cell.date)
  return [...set].sort()
}

function uniqueInOrder(ids: readonly string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const id of ids) {
    if (seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}

export function TaskUsageView() {
  const { project, selectedTaskId } = useWorkspaceState()
  const dispatch = useWorkspaceDispatch()
  const rows = buildTaskUsage(project)
  const dates = uniqueDates(rows)
  const taskIds = uniqueInOrder(rows.map((r) => r.taskId))
  const remeasureKey = `${rows.length}:${dates.length}`
  const { tableRef, colgroup, onResizeStart, onResizeAuto } =
    useResizableColumns(remeasureKey)

  useArrowRowNavigation({
    ids: taskIds,
    selectedId: selectedTaskId,
    onSelect: (taskId) => dispatch({ type: 'selectTask', taskId }),
  })

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
              <tr
                key={`${row.taskId}-${row.resourceId ?? 'none'}`}
                data-row-id={row.taskId}
                tabIndex={0}
                className={
                  selectedTaskId === row.taskId ? styles.selected : undefined
                }
                onClick={() =>
                  dispatch({ type: 'selectTask', taskId: row.taskId })
                }
              >
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
  const { project, selectedResourceId } = useWorkspaceState()
  const dispatch = useWorkspaceDispatch()
  const rows = buildResourceUsage(project)
  const histogram = buildResourceHistogram(project)
  const dates = uniqueDates(rows)
  const resourceIds = uniqueInOrder(rows.map((r) => r.resourceId))
  const remeasureKey = `${rows.length}:${dates.length}`
  const { tableRef, colgroup, onResizeStart, onResizeAuto } =
    useResizableColumns(remeasureKey)

  useArrowRowNavigation({
    ids: resourceIds,
    selectedId: selectedResourceId,
    onSelect: (resourceId) => dispatch({ type: 'selectResource', resourceId }),
  })
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
                data-row-id={row.resourceId}
                tabIndex={0}
                className={[
                  selectedResourceId === row.resourceId ? styles.selected : '',
                  row.overallocated ? styles.danger : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() =>
                  dispatch({ type: 'selectResource', resourceId: row.resourceId })
                }
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
