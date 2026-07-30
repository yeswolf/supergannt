import { useMemo, useState } from 'react'
import { useWorkspaceDispatch, useWorkspaceState } from '../state/WorkspaceContext'
import calStyles from './CalendarView.module.css'
import styles from './ResourceCalendarView.module.css'

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

function localKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function monthCells(year: number, month: number): (Date | null)[] {
  const first = new Date(year, month, 1)
  const startPad = first.getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: (Date | null)[] = []
  for (let i = 0; i < startPad; i += 1) cells.push(null)
  for (let d = 1; d <= daysInMonth; d += 1) {
    cells.push(new Date(year, month, d))
  }
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

function dayOverlaps(taskStart: Date, taskFinish: Date, day: Date): boolean {
  const start = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime()
  const end = start + 24 * 3600_000 - 1
  return taskStart.getTime() <= end && taskFinish.getTime() >= start
}

export function ResourceCalendarView() {
  const { project, selectedResourceId } = useWorkspaceState()
  const dispatch = useWorkspaceDispatch()
  const [resourceId, setResourceId] = useState(
    () => selectedResourceId ?? project.resources[0]?.id ?? '',
  )
  const resource =
    project.resources.find((r) => r.id === resourceId) ?? project.resources[0]
  const [cursor, setCursor] = useState(() => {
    const s = project.startDate
    return { year: s.getFullYear(), month: s.getMonth() }
  })

  const calendar = resource
    ? project.getResourceCalendar(resource.id)
    : project.getCalendar()

  const cells = useMemo(
    () => monthCells(cursor.year, cursor.month),
    [cursor.year, cursor.month],
  )

  const assignmentsByDay = useMemo(() => {
    const map = new Map<string, { taskId: string; name: string }[]>()
    if (!resource) return map
    const assignedTaskIds = new Set(
      project.assignments
        .filter((a) => a.resourceId === resource.id)
        .map((a) => a.taskId),
    )
    for (const task of project.tasks) {
      if (!assignedTaskIds.has(task.id) || task.summary) continue
      for (const date of cells) {
        if (!date) continue
        if (!dayOverlaps(task.start, task.finish, date)) continue
        const key = localKey(date)
        const list = map.get(key) ?? []
        list.push({ taskId: task.id, name: task.name })
        map.set(key, list)
      }
    }
    return map
  }, [cells, project.assignments, project.tasks, resource])

  const exceptionMap = useMemo(() => {
    const map = new Map<string, (typeof calendar.exceptions)[number]>()
    for (const ex of calendar.exceptions) {
      map.set(localKey(ex.date), ex)
    }
    return map
  }, [calendar.exceptions])

  const dayClass = (date: Date): string => {
    const key = localKey(date)
    const ex = exceptionMap.get(key)
    const weekday = calendar.workDays[date.getDay()]!
    if (ex) {
      return ex.working ? calStyles.dayWorkingEx : calStyles.dayHoliday
    }
    return weekday.working ? calStyles.dayWorking : calStyles.dayOff
  }

  if (!resource) {
    return (
      <div className={calStyles.panel}>
        <div className={calStyles.heading}>
          <h2>Resource Calendar</h2>
          <p>Add a resource to view their working calendar.</p>
        </div>
      </div>
    )
  }

  return (
    <div className={calStyles.panel}>
      <div className={calStyles.heading}>
        <h2>Resource Calendar</h2>
        <p>
          Monthly availability for a resource (MS Project Resource Calendar). Working
          days come from the resource calendar; assigned tasks appear on overlapping
          days.
        </p>
      </div>

      <div className={calStyles.toolbar}>
        <label>
          Resource
          <select
            value={resource.id}
            aria-label="Resource calendar resource"
            onChange={(e) => {
              setResourceId(e.target.value)
              dispatch({ type: 'selectResource', resourceId: e.target.value })
            }}
          >
            {project.resources.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
        <span className={styles.meta}>
          Calendar: <strong>{calendar.name}</strong>
          {calendar.id === project.calendarId ? ' (project)' : ''}
        </span>
        <button
          type="button"
          onClick={() =>
            dispatch({ type: 'ensureResourceCalendar', resourceId: resource.id })
          }
        >
          New calendar for resource…
        </button>
        <button
          type="button"
          onClick={() => dispatch({ type: 'setView', view: 'calendar' })}
        >
          Change Working Time…
        </button>
      </div>

      <div className={calStyles.monthPanel}>
        <div className={calStyles.monthNav}>
          <button
            type="button"
            aria-label="Previous month"
            onClick={() =>
              setCursor((c) => {
                const m = c.month - 1
                return m < 0
                  ? { year: c.year - 1, month: 11 }
                  : { year: c.year, month: m }
              })
            }
          >
            ‹
          </button>
          <h3>
            {MONTH_NAMES[cursor.month]} {cursor.year} — {resource.name}
          </h3>
          <button
            type="button"
            aria-label="Next month"
            onClick={() =>
              setCursor((c) => {
                const m = c.month + 1
                return m > 11
                  ? { year: c.year + 1, month: 0 }
                  : { year: c.year, month: m }
              })
            }
          >
            ›
          </button>
        </div>

        <div className={calStyles.monthGrid} role="grid" aria-label="Resource calendar month">
          {DAY_NAMES.map((d) => (
            <div key={d} className={calStyles.weekdayHeader}>
              {d}
            </div>
          ))}
          {cells.map((date, i) =>
            date ? (
              <div
                key={localKey(date)}
                className={`${calStyles.dayCell} ${styles.dayCell} ${dayClass(date)}`}
              >
                <span className={calStyles.dayNum}>{date.getDate()}</span>
                {exceptionMap.get(localKey(date)) ? (
                  <span className={calStyles.dayLabel}>
                    {exceptionMap.get(localKey(date))!.name}
                  </span>
                ) : null}
                <ul className={styles.taskList}>
                  {(assignmentsByDay.get(localKey(date)) ?? []).slice(0, 3).map((t) => (
                    <li key={t.taskId}>
                      <button
                        type="button"
                        className={styles.taskChip}
                        title={t.name}
                        onClick={() =>
                          dispatch({ type: 'selectTask', taskId: t.taskId })
                        }
                      >
                        {t.name}
                      </button>
                    </li>
                  ))}
                  {(assignmentsByDay.get(localKey(date))?.length ?? 0) > 3 ? (
                    <li className={styles.more}>
                      +{(assignmentsByDay.get(localKey(date))!.length - 3)} more
                    </li>
                  ) : null}
                </ul>
              </div>
            ) : (
              <div key={`pad-${i}`} className={calStyles.dayPad} />
            ),
          )}
        </div>

        <div className={calStyles.legend}>
          <span className={calStyles.dayWorking}>Working</span>
          <span className={calStyles.dayOff}>Non-working</span>
          <span className={calStyles.dayHoliday}>Holiday / exception</span>
          <span className={calStyles.dayWorkingEx}>Working exception</span>
        </div>
      </div>
    </div>
  )
}
