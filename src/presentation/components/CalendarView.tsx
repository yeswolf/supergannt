import { useMemo, useState } from 'react'
import * as CalendarUseCases from '../../application/use-cases/CalendarUseCases'
import { useWorkspaceDispatch, useWorkspaceState } from '../state/WorkspaceContext'
import styles from './CalendarView.module.css'

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

type Tab = 'calendar' | 'workWeek' | 'exceptions'

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
  const { project, services } = useWorkspaceState()
  const dispatch = useWorkspaceDispatch()
  const [selectedId, setSelectedId] = useState<string>(project.calendarId)
  const calendar =
    project.calendars.find((c) => c.id === selectedId) ?? project.getCalendar()
  const [tab, setTab] = useState<Tab>('calendar')
  const [cursor, setCursor] = useState(() => {
    const s = project.startDate
    return { year: s.getFullYear(), month: s.getMonth() }
  })
  const [holidayName, setHolidayName] = useState('Holiday')
  const [exceptionDate, setExceptionDate] = useState('')
  const [exceptionName, setExceptionName] = useState('Holiday')
  const [exceptionWorking, setExceptionWorking] = useState(false)

  const cells = useMemo(
    () => monthCells(cursor.year, cursor.month),
    [cursor.year, cursor.month],
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

  return (
    <div className={styles.panel}>
      <div className={styles.heading}>
        <h2>Change Working Time</h2>
        <p>
          Click any day to mark a holiday / non-working day, or to make a weekend
          working. Click again to clear the exception (ProjectLibre calendar).
        </p>
      </div>

      <div className={styles.toolbar}>
        <label>
          Calendar
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
          >
            {project.calendars.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.id === project.calendarId ? ' (project)' : ''}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() =>
            apply(
              CalendarUseCases.addCalendar(project, services.ids, 'Custom Calendar'),
              'Calendar added.',
            )
          }
        >
          Create New Calendar…
        </button>
        <button
          type="button"
          onClick={() =>
            apply(
              CalendarUseCases.setProjectCalendar(project, calendar.id),
              'Project calendar updated.',
            )
          }
        >
          Use for project
        </button>
        <label>
          Exception name
          <input
            value={holidayName}
            onChange={(e) => setHolidayName(e.target.value)}
            placeholder="Holiday"
          />
        </label>
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
              {MONTH_NAMES[cursor.month]} {cursor.year}
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
                  onClick={() => {
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
                        message:
                          error instanceof Error
                            ? error.message
                            : 'Calendar update failed.',
                      })
                    }
                  }}
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
            <button
              type="button"
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
            >
              Add exception
            </button>
          </div>
          <ul>
            {calendar.exceptions.map((ex) => (
              <li key={localKey(ex.date)}>
                <span>
                  {ex.date.toLocaleDateString()} — {ex.name} (
                  {ex.working ? 'working' : 'non-working'})
                </span>
                <button
                  type="button"
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
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
