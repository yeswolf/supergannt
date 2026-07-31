import { useWorkspaceDispatch, useWorkspaceState } from '../state/WorkspaceContext'
import { toResourceSheet } from '../../application/services/ReportingService'
import { IconAction } from './IconAction'
import styles from './DataTable.module.css'
import { ColumnHeader, useResizableColumns } from './useResizableColumns'
import { ViewHeader } from './ViewHeader'

const HEADERS = [
  'Name',
  'Type',
  'Group',
  'Max Units',
  'Std Rate',
  'Calendar',
  'Assigned',
  'Work (h)',
  'Cost',
  '',
] as const

export function ResourceView() {
  const { project, selectedResourceId, selectedTaskId } = useWorkspaceState()
  const dispatch = useWorkspaceDispatch()
  const utilization = toResourceSheet(project)
  const { tableRef, colgroup, onResizeStart, onResizeAuto } = useResizableColumns(
    project.resources.length,
  )

  return (
    <div className={styles.panel}>
      <ViewHeader title="Resources" />
      <div className={styles.tableWrap}>
        <table ref={tableRef} className={styles.table}>
          {colgroup}
          <thead>
            <tr>
              {HEADERS.map((label, i) => (
                <ColumnHeader
                  key={label || 'actions'}
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
            {project.resources.map((resource) => {
              const util = utilization.find((u) => u.resourceId === resource.id)
              const calendarId = resource.calendarId ?? project.calendarId
              return (
                <tr
                  key={resource.id}
                  className={[
                    selectedResourceId === resource.id ? styles.selected : '',
                    util?.overallocated ? styles.danger : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() =>
                    dispatch({ type: 'selectResource', resourceId: resource.id })
                  }
                >
                  <td>
                    <input
                      value={resource.name}
                      aria-label="Resource name"
                      onChange={(e) =>
                        dispatch({
                          type: 'updateResource',
                          resourceId: resource.id,
                          patch: { name: e.target.value },
                        })
                      }
                    />
                  </td>
                  <td>
                    <select
                      value={resource.type}
                      aria-label="Resource type"
                      onChange={(e) =>
                        dispatch({
                          type: 'updateResource',
                          resourceId: resource.id,
                          patch: {
                            type: e.target.value as 'work' | 'material' | 'cost',
                          },
                        })
                      }
                    >
                      <option value="work">Work</option>
                      <option value="material">Material</option>
                      <option value="cost">Cost</option>
                    </select>
                  </td>
                  <td>
                    <input
                      value={resource.group}
                      aria-label="Resource group"
                      onChange={(e) =>
                        dispatch({
                          type: 'updateResource',
                          resourceId: resource.id,
                          patch: { group: e.target.value },
                        })
                      }
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      min={0}
                      step={0.1}
                      value={resource.maxUnits}
                      aria-label="Max units"
                      onChange={(e) =>
                        dispatch({
                          type: 'updateResource',
                          resourceId: resource.id,
                          patch: { maxUnits: Number(e.target.value) },
                        })
                      }
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={resource.standardRate.amount}
                      aria-label="Standard rate"
                      onChange={(e) =>
                        dispatch({
                          type: 'updateResource',
                          resourceId: resource.id,
                          patch: { standardRate: Number(e.target.value) },
                        })
                      }
                    />
                  </td>
                  <td>
                    <select
                      value={calendarId}
                      aria-label={`${resource.name} calendar`}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => {
                        const value = e.target.value
                        if (value === '__new__') {
                          dispatch({
                            type: 'ensureResourceCalendar',
                            resourceId: resource.id,
                          })
                          return
                        }
                        dispatch({
                          type: 'setResourceCalendar',
                          resourceId: resource.id,
                          calendarId: value,
                        })
                      }}
                    >
                      {project.calendars.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                          {c.id === project.calendarId ? ' (project)' : ''}
                        </option>
                      ))}
                      <option value="__new__">New calendar for resource…</option>
                    </select>
                  </td>
                  <td>{util?.assignedUnits.toFixed(1) ?? '0'}</td>
                  <td>{util?.workHours.toFixed(1) ?? '0'}</td>
                  <td>{util?.cost.format() ?? '—'}</td>
                  <td>
                    <div className={styles.rowActions}>
                      <IconAction
                        label="Assign to task"
                        icon="resources"
                        disabled={!selectedTaskId}
                        onClick={(e) => {
                          e.stopPropagation()
                          if (!selectedTaskId) return
                          dispatch({
                            type: 'assignResource',
                            taskId: selectedTaskId,
                            resourceId: resource.id,
                          })
                        }}
                      />
                      <IconAction
                        label="Delete"
                        icon="delete"
                        onClick={(e) => {
                          e.stopPropagation()
                          dispatch({ type: 'deleteResource', resourceId: resource.id })
                        }}
                      />
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
