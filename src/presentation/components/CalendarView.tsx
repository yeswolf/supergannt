import { useEffect, useMemo, useState } from 'react'
import * as CalendarUseCases from '../../application/use-cases/CalendarUseCases'
import { useWorkspaceDispatch, useWorkspaceState } from '../state/WorkspaceContext'
import { IconAction, IconActionGroup, IconActions } from './IconAction'
import { ViewHeader, ViewHeaderSep } from './ViewHeader'
import styles from './CalendarView.module.css'

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DAY_NAMES_SHORT = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
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

type Tab = 'calendar' | 'workWeek' | 'exceptions'
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

export function CalendarView() {
  const { project, selectedResourceId, services } = useWorkspaceState()
  const dispatch = useWorkspaceDispatch()
  const [owner, setOwner] = useState<'project' | string>(
    () => selectedResourceId ?? 'project',
  )
  const selectedResource =
    owner === 'project' ? undefined : project.resources.find((r) => r.id === owner)
  const defaultCalId = selectedResource
    ? (selectedResource.calendarId ?? project.calendarId)
    : project.calendarId
  const [calendarId, setCalendarId] = useState(defaultCalId)
  const activeCalendarId = project.calendars.some((c) => c.id === calendarId)
    ? calendarId
    : defaultCalId
  const calendar =
    project.calendars.find((c) => c.id === activeCalendarId) ?? project.getCalendar()
  const [tab, setTab] = useState<Tab>('calendar')
  const [scale, setScale] = useState<Scale>('month')
  const [cursor, setCursor] = useState(() => {
    const s = project.startDate
    return { year: s.getFullYear(), month: s.getMonth() }
  })
  const [holidayName, setHolidayName] = useState('Holiday')
  const [exceptionDate, setExceptionDate] = useState('')
  const [exceptionName, setExceptionName] = useState('Holiday')
  const [exceptionWorking, setExceptionWorking] = useState(false)

  useEffect(() => {
    if (selectedResource?.calendarId) {
      setCalendarId(selectedResource.calendarId)
    }
  }, [selectedResource?.calendarId])

  const cells = useMemo(
    () => monthCells(cursor.year, cursor.month),
    [cursor.year, cursor.month],
  )

  const yearMonths = useMemo(
    () =>
      Array.from({ length: 12 }, (_, month) => ({
        month,
        cells: monthCells(cursor.year, month),
      })),
    [cursor.year],
  )

  const exceptionMap = useMemo(() => {
    const map = new Map<string, (typeof calendar.exceptions)[number]>()
    for (const ex of calendar.exceptions) {
      map.set(localKey(ex.date), ex)
    }
    return map
  }, [calendar.exceptions])

  const apply = (next: typeof project, message: string) => {
    dispatch({ type: 'setProject', project: next, message })
  }

  const dayClass = (date: Date): string => {
    const key = localKey(date)
    const ex = exceptionMap.get(key)
    const weekday = calendar.workDays[date.getDay()]!
    if (ex) {
      return ex.working ? styles.dayWorkingEx : styles.dayHoliday
    }
    return weekday.working ? styles.dayWorking : styles.dayOff
  }

  const onOwnerChange = (value: string) => {
    setOwner(value)
    if (value === 'project') {
      setCalendarId(project.calendarId)
      return
    }
    const resource = project.resources.find((r) => r.id === value)
    setCalendarId(resource?.calendarId ?? project.calendarId)
    dispatch({ type: 'selectResource', resourceId: value })
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

  const toggleDay = (date: Date) => {
    try {
      apply(
        CalendarUseCases.toggleCalendarDay(
          project,
          calendar.id,
          date,
          holidayName.trim() || 'Holiday',
        ),
        `Updated ${date.toLocaleDateString()}.`,
      )
    } catch (error) {
      dispatch({
        type: 'setStatus',
        message: error instanceof Error ? error.message : 'Calendar update failed.',
      })
    }
  }

  return (
    <div className={styles.panel}>
      <ViewHeader
        title="Working Time"
        leading={
          tab === 'calendar' ? (
            <>
              <IconActionGroup label="Calendar scale">
                <IconAction
                  label="Month"
                  icon="month"
                  pressed={scale === 'month'}
                  onClick={() => setScale('month')}
                />
                <IconAction
                  label="Year"
                  icon="year"
                  pressed={scale === 'year'}
                  onClick={() => setScale('year')}
                />
              </IconActionGroup>
              <ViewHeaderSep />
            </>
          ) : null
        }
        trailing={
          <IconActions>
            <IconAction
              label="Create New Calendar…"
              icon="newCalendar"
              onClick={() => {
                const before = project.calendars.length
                const next = CalendarUseCases.addCalendar(
                  project,
                  services.ids,
                  'Custom Calendar',
                )
                apply(next, 'Calendar added.')
                const created = next.calendars[before]
                if (created) setCalendarId(created.id)
              }}
            />
            {selectedResource ? (
              <IconAction
                label="New calendar for resource…"
                icon="addResource"
                onClick={() => {
                  dispatch({
                    type: 'ensureResourceCalendar',
                    resourceId: selectedResource.id,
                  })
                }}
              />
            ) : (
              <IconAction
                label="Use for project"
                icon="useProject"
                onClick={() =>
                  apply(
                    CalendarUseCases.setProjectCalendar(project, calendar.id),
                    'Project calendar updated.',
                  )
                }
              />
            )}
          </IconActions>
        }
      />

      <div className={styles.toolbar}>
        <div className={styles.toolbarStart}>
          <label>
            For
            <select
              value={owner}
              aria-label="Calendar applies to"
              onChange={(e) => onOwnerChange(e.target.value)}
            >
              <option value="project">Project</option>
              {project.resources.map((r) => (
                <option key={r.id} value={r.id}>
                  Resource: {r.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Calendar
            <select
              value={activeCalendarId}
              aria-label="Calendar"
              onChange={(e) => {
                const nextId = e.target.value
                setCalendarId(nextId)
                if (selectedResource) {
                  dispatch({
                    type: 'setResourceCalendar',
                    resourceId: selectedResource.id,
                    calendarId: nextId,
                  })
                }
              }}
            >
              {project.calendars.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.id === project.calendarId ? ' (project)' : ''}
                </option>
              ))}
            </select>
          </label>
          {tab === 'calendar' ? (
            <label>
              Exception name
              <input
                value={holidayName}
                onChange={(e) => setHolidayName(e.target.value)}
                placeholder="Holiday"
              />
            </label>
          ) : null}
        </div>
      </div>

      <nav className={styles.tabs} aria-label="Calendar editor tabs">
        {(
          [
            ['calendar', 'Calendar'],
            ['workWeek', 'Work Weeks'],
            ['exceptions', 'Exceptions'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={tab === id ? styles.tabActive : undefined}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === 'calendar' ? (
        <div className={styles.monthPanel}>
          <div className={styles.monthNav}>
            <IconAction
              label={scale === 'year' ? 'Previous year' : 'Previous month'}
              icon="prev"
              onClick={() => shiftCursor(-1)}
            />
            <h3>
              {scale === 'year'
                ? `${cursor.year}`
                : `${MONTH_NAMES[cursor.month]} ${cursor.year}`}
            </h3>
            <IconAction
              label={scale === 'year' ? 'Next year' : 'Next month'}
              icon="next"
              onClick={() => shiftCursor(1)}
            />
          </div>

          {scale === 'month' ? (
            <>
              <div className={styles.monthGrid} role="grid" aria-label="Working time month">
                {DAY_NAMES.map((d) => (
                  <div key={d} className={styles.weekdayHeader}>
                    {d}
                  </div>
                ))}
                {cells.map((date, i) =>
                  date ? (
                    <button
                      key={localKey(date)}
                      type="button"
                      className={`${styles.dayCell} ${dayClass(date)}`}
                      title={
                        exceptionMap.get(localKey(date))?.name ??
                        (calendar.workDays[date.getDay()]!.working
                          ? 'Working day — click for holiday'
                          : 'Non-working — click for working exception')
                      }
                      onClick={() => toggleDay(date)}
                    >
                      <span className={styles.dayNum}>{date.getDate()}</span>
                      {exceptionMap.get(localKey(date)) ? (
                        <span className={styles.dayLabel}>
                          {exceptionMap.get(localKey(date))!.name}
                        </span>
                      ) : null}
                    </button>
                  ) : (
                    <div key={`pad-${i}`} className={styles.dayPad} />
                  ),
                )}
              </div>
            </>
          ) : (
            <div className={styles.yearGrid} role="grid" aria-label="Working time year">
              {yearMonths.map(({ month, cells: monthDays }) => {
                const exceptionsInMonth = monthDays.reduce((n, d) => {
                  if (!d) return n
                  return n + (exceptionMap.has(localKey(d)) ? 1 : 0)
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
                      {exceptionsInMonth > 0 ? (
                        <span className={styles.yearMonthBadge}>{exceptionsInMonth}ex</span>
                      ) : null}
                    </div>
                    <div className={styles.yearMiniGrid}>
                      {DAY_NAMES_SHORT.map((d, i) => (
                        <span key={`${d}-${i}`} className={styles.yearWeekday}>
                          {d}
                        </span>
                      ))}
                      {monthDays.map((date, i) =>
                        date ? (
                          <span
                            key={localKey(date)}
                            className={`${styles.yearDay} ${dayClass(date)}`}
                            title={
                              exceptionMap.get(localKey(date))?.name ??
                              (calendar.workDays[date.getDay()]!.working
                                ? 'Working'
                                : 'Non-working')
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

          <div className={styles.legend}>
            <span className={styles.dayWorking}>Working</span>
            <span className={styles.dayOff}>Non-working</span>
            <span className={styles.dayHoliday}>Holiday / exception</span>
            <span className={styles.dayWorkingEx}>Working exception</span>
          </div>
        </div>
      ) : null}

      {tab === 'workWeek' ? (
        <div className={styles.week}>
          {calendar.workDays.map((day) => (
            <label key={day.dayOfWeek} className={styles.day}>
              <span>{DAY_NAMES[day.dayOfWeek]}</span>
              <input
                type="checkbox"
                checked={day.working}
                onChange={(e) => {
                  const workDays = calendar.workDays.map((d) =>
                    d.dayOfWeek === day.dayOfWeek
                      ? { ...d, working: e.target.checked }
                      : d,
                  )
                  apply(
                    CalendarUseCases.updateWorkWeek(project, calendar.id, [
                      ...workDays,
                    ]),
                    'Work week updated.',
                  )
                }}
              />
              <input
                type="number"
                min={0}
                max={23}
                value={day.startHour}
                aria-label={`${DAY_NAMES[day.dayOfWeek]} start hour`}
                disabled={!day.working}
                onChange={(e) => {
                  const workDays = calendar.workDays.map((d) =>
                    d.dayOfWeek === day.dayOfWeek
                      ? { ...d, startHour: Number(e.target.value) }
                      : d,
                  )
                  apply(
                    CalendarUseCases.updateWorkWeek(project, calendar.id, [
                      ...workDays,
                    ]),
                    'Work hours updated.',
                  )
                }}
              />
              <span>–</span>
              <input
                type="number"
                min={0}
                max={24}
                value={day.endHour}
                aria-label={`${DAY_NAMES[day.dayOfWeek]} end hour`}
                disabled={!day.working}
                onChange={(e) => {
                  const workDays = calendar.workDays.map((d) =>
                    d.dayOfWeek === day.dayOfWeek
                      ? { ...d, endHour: Number(e.target.value) }
                      : d,
                  )
                  apply(
                    CalendarUseCases.updateWorkWeek(project, calendar.id, [
                      ...workDays,
                    ]),
                    'Work hours updated.',
                  )
                }}
              />
              <em>{day.working ? `${day.endHour - day.startHour}h` : 'off'}</em>
            </label>
          ))}
        </div>
      ) : null}

      {tab === 'exceptions' ? (
        <div className={styles.exceptions}>
          <h3>Exceptions</h3>
          <div className={styles.exceptionForm}>
            <input
              type="date"
              value={exceptionDate}
              onChange={(e) => setExceptionDate(e.target.value)}
            />
            <input
              value={exceptionName}
              onChange={(e) => setExceptionName(e.target.value)}
              placeholder="Name"
            />
            <label>
              <input
                type="checkbox"
                checked={exceptionWorking}
                onChange={(e) => setExceptionWorking(e.target.checked)}
              />
              Working
            </label>
            <IconAction
              label="Add exception"
              icon="add"
              disabled={!exceptionDate}
              onClick={() => {
                const [y, m, d] = exceptionDate.split('-').map(Number)
                apply(
                  CalendarUseCases.addCalendarException(project, calendar.id, {
                    date: new Date(y!, m! - 1, d!),
                    working: exceptionWorking,
                    name: exceptionName,
                  }),
                  'Exception added.',
                )
              }}
            />
          </div>
          <ul>
            {calendar.exceptions.map((ex) => (
              <li key={localKey(ex.date)}>
                <span>
                  {ex.date.toLocaleDateString()} — {ex.name} (
                  {ex.working ? 'working' : 'non-working'})
                </span>
                <IconAction
                  label="Remove"
                  icon="delete"
                  onClick={() =>
                    apply(
                      CalendarUseCases.removeCalendarException(
                        project,
                        calendar.id,
                        ex.date,
                      ),
                      'Exception removed.',
                    )
                  }
                />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
