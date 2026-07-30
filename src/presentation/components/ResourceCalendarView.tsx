import { useMemo, useState } from 'react'
import { useWorkspaceDispatch, useWorkspaceState } from '../state/WorkspaceContext'
import calStyles from './CalendarView.module.css'
import styles from './ResourceCalendarView.module.css'

const DAY_NAMES = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const DAY_NAMES_FULL = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
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
const MONTH_NAMES_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

type Scale = 'month' | 'year'

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
  const [scale, setScale] = useState<Scale>('month')
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

  const yearMonths = useMemo(
    () => Array.from({ length: 12 }, (_, month) => ({
      month,
      cells: monthCells(cursor.year, month),
    })),
    [cursor.year],
  )

  const assignmentDays = useMemo(() => {
    const map = new Map<string, { taskId: string; name: string }[]>()
    if (!resource) return map
    const assignedTaskIds = new Set(
      project.assignments
        .filter((a) => a.resourceId === resource.id)
        .map((a) => a.taskId),
    )
    const rangeStart =
      scale === 'year'
        ? new Date(cursor.year, 0, 1)
        : new Date(cursor.year, cursor.month, 1)
    const rangeEnd =
      scale === 'year'
        ? new Date(cursor.year, 11, 31, 23, 59, 59)
        : new Date(cursor.year, cursor.month + 1, 0, 23, 59, 59)

    for (const task of project.tasks) {
      if (!assignedTaskIds.has(task.id) || task.summary) continue
      if (task.finish < rangeStart || task.start > rangeEnd) continue
      const cursorDay = new Date(
        Math.max(task.start.getTime(), rangeStart.getTime()),
      )
      cursorDay.setHours(0, 0, 0, 0)
      const last = Math.min(task.finish.getTime(), rangeEnd.getTime())
      while (cursorDay.getTime() <= last) {
        if (dayOverlaps(task.start, task.finish, cursorDay)) {
          const key = localKey(cursorDay)
          const list = map.get(key) ?? []
          list.push({ taskId: task.id, name: task.name })
          map.set(key, list)
        }
        cursorDay.setDate(cursorDay.getDate() + 1)
      }
    }
    return map
  }, [
    cursor.month,
    cursor.year,
    project.assignments,
    project.tasks,
    resource,
    scale,
  ])

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

  const shiftCursor = (delta: number) => {
    setCursor((c) => {
      if (scale === 'year') {
        return { year: c.year + delta, month: c.month }
      }
      const m = c.month + delta
      if (m < 0) return { year: c.year - 1, month: 11 }
      if (m > 11) return { year: c.year + 1, month: 0 }
      return { year: c.year, month: m }
    })
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
          Availability for a resource (MS Project Resource Calendar). Switch Month /
          Year scale; working days come from the resource calendar, assigned tasks
          appear on overlapping days.
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
        <div className={styles.scaleGroup} role="group" aria-label="Calendar scale">
          <button
            type="button"
            className={scale === 'month' ? styles.scaleActive : styles.scaleBtn}
            aria-pressed={scale === 'month'}
            onClick={() => setScale('month')}
          >
            Month
          </button>
          <button
            type="button"
            className={scale === 'year' ? styles.scaleActive : styles.scaleBtn}
            aria-pressed={scale === 'year'}
            onClick={() => setScale('year')}
          >
            Year
          </button>
        </div>
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
            aria-label={scale === 'year' ? 'Previous year' : 'Previous month'}
            onClick={() => shiftCursor(-1)}
          >
            ‹
          </button>
          <h3>
            {scale === 'year'
              ? `${cursor.year} — ${resource.name}`
              : `${MONTH_NAMES[cursor.month]} ${cursor.year} — ${resource.name}`}
          </h3>
          <button
            type="button"
            aria-label={scale === 'year' ? 'Next year' : 'Next month'}
            onClick={() => shiftCursor(1)}
          >
            ›
          </button>
        </div>

        {scale === 'month' ? (
          <div
            className={calStyles.monthGrid}
            role="grid"
            aria-label="Resource calendar month"
          >
            {DAY_NAMES_FULL.map((d) => (
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
                    {(assignmentDays.get(localKey(date)) ?? []).slice(0, 3).map((t) => (
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
                    {(assignmentDays.get(localKey(date))?.length ?? 0) > 3 ? (
                      <li className={styles.more}>
                        +{assignmentDays.get(localKey(date))!.length - 3} more
                      </li>
                    ) : null}
                  </ul>
                </div>
              ) : (
                <div key={`pad-${i}`} className={calStyles.dayPad} />
              ),
            )}
          </div>
        ) : (
          <div className={styles.yearGrid} role="grid" aria-label="Resource calendar year">
            {yearMonths.map(({ month, cells: monthDays }) => {
              const assignedInMonth = monthDays.reduce((n, d) => {
                if (!d) return n
                return n + (assignmentDays.get(localKey(d))?.length ? 1 : 0)
              }, 0)
              return (
                <button
                  key={month}
                  type="button"
                  className={styles.yearMonth}
                  aria-label={`${MONTH_NAMES[month]} ${cursor.year}`}
                  onClick={() => {
                    setCursor((c) => ({ ...c, month }))
                    setScale('month')
                  }}
                >
                  <div className={styles.yearMonthTitle}>
                    <span>{MONTH_NAMES_SHORT[month]}</span>
                    {assignedInMonth > 0 ? (
                      <span className={styles.yearMonthBadge}>{assignedInMonth}d</span>
                    ) : null}
                  </div>
                  <div className={styles.yearMiniGrid}>
                    {DAY_NAMES.map((d, i) => (
                      <span key={`${d}-${i}`} className={styles.yearWeekday}>
                        {d}
                      </span>
                    ))}
                    {monthDays.map((date, i) =>
                      date ? (
                        <span
                          key={localKey(date)}
                          className={`${styles.yearDay} ${dayClass(date)} ${
                            (assignmentDays.get(localKey(date))?.length ?? 0) > 0
                              ? styles.yearDayBusy
                              : ''
                          }`}
                          title={
                            exceptionMap.get(localKey(date))?.name ??
                            (assignmentDays.get(localKey(date))
                              ?.map((t) => t.name)
                              .join(', ') ||
                              undefined)
                          }
                        >
                          {date.getDate()}
                        </span>
                      ) : (
                        <span key={`ypad-${month}-${i}`} className={styles.yearDayPad} />
                      ),
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        )}

        <div className={calStyles.legend}>
          <span className={calStyles.dayWorking}>Working</span>
          <span className={calStyles.dayOff}>Non-working</span>
          <span className={calStyles.dayHoliday}>Holiday / exception</span>
          <span className={calStyles.dayWorkingEx}>Working exception</span>
          {scale === 'year' ? (
            <span className={styles.yearDayBusyLegend}>Has assignment</span>
          ) : null}
        </div>
      </div>
    </div>
  )
}
