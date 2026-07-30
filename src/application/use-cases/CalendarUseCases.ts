import type { Project } from '../../domain/entities/Project'
import { WorkCalendar, type WorkDay } from '../../domain/entities/WorkCalendar'
import { asCalendarId } from '../../domain/value-objects/Ids'
import type { IdGenerator } from '../ports/IdGenerator'
import { refreshProject } from '../services/ProjectRefresh'

export function addCalendar(
  project: Project,
  ids: IdGenerator,
  name = 'New Calendar',
): Project {
  const calendar = WorkCalendar.standard(asCalendarId(ids.calendarId()), name).with({
    isBase: false,
  })
  return project
    .with({ calendars: [...project.calendars, calendar] })
    .markDirty()
}

export function setProjectCalendar(project: Project, calendarId: string): Project {
  if (!project.calendars.some((c) => c.id === calendarId)) {
    throw new Error('Calendar not found')
  }
  return refreshProject(
    project.with({ calendarId: asCalendarId(calendarId) }).markDirty(),
  )
}

export function updateWorkWeek(
  project: Project,
  calendarId: string,
  workDays: WorkDay[],
): Project {
  if (workDays.length !== 7) {
    throw new Error('Work week must include 7 days')
  }
  const calendars = project.calendars.map((c) =>
    c.id === calendarId ? c.with({ workDays }) : c,
  )
  return refreshProject(project.with({ calendars }).markDirty())
}

export function addCalendarException(
  project: Project,
  calendarId: string,
  input: {
    date: Date
    working: boolean
    name: string
    startHour?: number
    endHour?: number
  },
): Project {
  const calendars = project.calendars.map((c) => {
    if (c.id !== calendarId) return c
    const key = localKey(input.date)
    const exceptions = [
      ...c.exceptions.filter((e) => localKey(e.date) !== key),
      {
        date: input.date,
        working: input.working,
        name: input.name.trim() || 'Exception',
        startHour: input.startHour,
        endHour: input.endHour,
      },
    ]
    return c.with({ exceptions })
  })
  return refreshProject(project.with({ calendars }).markDirty())
}

/**
 * ProjectLibre Change Working Time: click a day to mark holiday / restore default.
 * - Working weekday → non-working holiday exception
 * - Weekend / non-working → optional working exception
 * - Existing exception → remove (back to work-week default)
 */
export function toggleCalendarDay(
  project: Project,
  calendarId: string,
  date: Date,
  holidayName = 'Holiday',
): Project {
  const calendar = project.calendars.find((c) => c.id === calendarId)
  if (!calendar) throw new Error('Calendar not found')
  const key = localKey(date)
  const existing = calendar.exceptions.find((e) => localKey(e.date) === key)
  if (existing) {
    return removeCalendarException(project, calendarId, date)
  }
  const weekday = calendar.workDays[date.getDay()]!
  if (weekday.working) {
    return addCalendarException(project, calendarId, {
      date,
      working: false,
      name: holidayName,
    })
  }
  return addCalendarException(project, calendarId, {
    date,
    working: true,
    name: 'Working day',
    startHour: 8,
    endHour: 16,
  })
}

export function removeCalendarException(
  project: Project,
  calendarId: string,
  date: Date,
): Project {
  const key = localKey(date)
  const calendars = project.calendars.map((c) => {
    if (c.id !== calendarId) return c
    return c.with({
      exceptions: c.exceptions.filter((e) => localKey(e.date) !== key),
    })
  })
  return refreshProject(project.with({ calendars }).markDirty())
}

export function renameCalendar(
  project: Project,
  calendarId: string,
  name: string,
): Project {
  const calendars = project.calendars.map((c) =>
    c.id === calendarId ? c.with({ name: name.trim() || c.name }) : c,
  )
  return project.with({ calendars }).markDirty()
}

function localKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
