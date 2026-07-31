import type { Project } from '../../domain/entities/Project'
import { IconAction } from './IconAction'
import styles from './TaskAssignmentsEditor.module.css'
import { ColumnHeader, useResizableColumns } from './useResizableColumns'

export interface TaskAssignmentDraft {
  assignmentId?: string
  resourceId: string
  units: number
}

interface Props {
  project: Project
  taskId: string
  drafts: TaskAssignmentDraft[]
  onChange: (drafts: TaskAssignmentDraft[]) => void
  /** When true, edits dispatch immediately via callbacks instead of draft-only. */
  live?: boolean
  onAssign?: (resourceId: string, units: number) => void
  onUnassign?: (assignmentId: string) => void
  onUnits?: (assignmentId: string, resourceId: string, units: number) => void
}

export function TaskAssignmentsEditor({
  project,
  taskId,
  drafts,
  onChange,
  live = false,
  onAssign,
  onUnassign,
  onUnits,
}: Props) {
  const assignedIds = new Set(drafts.map((d) => d.resourceId))
  const available = project.resources.filter((r) => !assignedIds.has(r.id))
  const { tableRef, colgroup, onResizeStart, onResizeAuto } = useResizableColumns(
    `${drafts.length}:${project.resources.length}`,
  )

  return (
    <div className={styles.wrap}>
      {project.resources.length === 0 ? (
        <p className={styles.empty}>No resources yet.</p>
      ) : null}
      <table ref={tableRef} className={styles.table}>
        {colgroup}
        <thead>
          <tr>
            <ColumnHeader
              index={0}
              onResizeStart={onResizeStart}
              onResizeAuto={onResizeAuto}
            >
              Resource Name
            </ColumnHeader>
            <ColumnHeader
              index={1}
              onResizeStart={onResizeStart}
              onResizeAuto={onResizeAuto}
            >
              Units
            </ColumnHeader>
            <ColumnHeader
              index={2}
              onResizeStart={onResizeStart}
              onResizeAuto={onResizeAuto}
            />
          </tr>
        </thead>
        <tbody>
          {drafts.map((row, i) => {
            const resource = project.resources.find((r) => r.id === row.resourceId)
            return (
              <tr key={`${row.resourceId}-${i}`}>
                <td>
                  <select
                    value={row.resourceId}
                    aria-label={`Assignment ${i + 1} resource`}
                    onChange={(e) => {
                      const resourceId = e.target.value
                      onChange(
                        drafts.map((d, j) => (j === i ? { ...d, resourceId } : d)),
                      )
                    }}
                  >
                    {project.resources.map((r) => (
                      <option
                        key={r.id}
                        value={r.id}
                        disabled={
                          assignedIds.has(r.id) && r.id !== row.resourceId
                        }
                      >
                        {r.name}
                      </option>
                    ))}
                  </select>
                  {!resource ? (
                    <span className={styles.warn}> (missing)</span>
                  ) : null}
                </td>
                <td>
                  <input
                    type="number"
                    min={0}
                    max={resource?.maxUnits ?? 10}
                    step={0.1}
                    value={row.units}
                    aria-label={`Assignment ${i + 1} units`}
                    onChange={(e) => {
                      const units = Number(e.target.value)
                      if (live && row.assignmentId && onUnits) {
                        onUnits(row.assignmentId, row.resourceId, units)
                        return
                      }
                      onChange(
                        drafts.map((d, j) => (j === i ? { ...d, units } : d)),
                      )
                    }}
                  />
                </td>
                <td>
                  <IconAction
                    label="Remove"
                    icon="delete"
                    onClick={() => {
                      if (live && row.assignmentId && onUnassign) {
                        onUnassign(row.assignmentId)
                        return
                      }
                      onChange(drafts.filter((_, j) => j !== i))
                    }}
                  />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <div className={styles.addRow}>
        <select
          id={`assign-add-${taskId}`}
          defaultValue=""
          aria-label="Add resource to task"
          onChange={(e) => {
            const resourceId = e.target.value
            if (!resourceId) return
            if (live && onAssign) {
              onAssign(resourceId, 1)
            } else {
              onChange([...drafts, { resourceId, units: 1 }])
            }
            e.target.value = ''
          }}
        >
          <option value="">Add resource…</option>
          {available.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}

export function draftsFromProject(
  project: Project,
  taskId: string,
): TaskAssignmentDraft[] {
  return project.assignments
    .filter((a) => a.taskId === taskId)
    .map((a) => ({
      assignmentId: a.id,
      resourceId: a.resourceId,
      units: a.units,
    }))
}
