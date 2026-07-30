import type { CalendarId } from '../value-objects/Ids'

export interface WorkDay {
  readonly dayOfWeek: number // 0=Sunday .. 6=Saturday
  readonly working: boolean
  readonly startHour: number
  readonly endHour: number
}

export interface CalendarException {
  readonly date: Date
  readonly working: boolean
  readonly name: string
  readonly startHour?: number
  readonly endHour?: number
}

export interface CalendarProps {
  id: CalendarId
  name: string
  isBase: boolean
  workDays: readonly WorkDay[]
  exceptions: readonly CalendarException[]
}

function localKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export class WorkCalendar {
  private constructor(private readonly props: CalendarProps) {}

  static create(props: CalendarProps): WorkCalendar {
    if (!props.name.trim()) {
      throw new Error('Calendar name is required')
    }
    if (props.workDays.length !== 7) {
      throw new Error('Calendar must define all 7 weekdays')
    }
    return new WorkCalendar(props)
  }

  static standard(id: CalendarId, name = 'Standard'): WorkCalendar {
    const workDays: WorkDay[] = Array.from({ length: 7 }, (_, dayOfWeek) => ({
      dayOfWeek,
      working: dayOfWeek >= 1 && dayOfWeek <= 5,
      startHour: 8,
      endHour: 17, // 8 working hours with 1h lunch ignored → treat as 8h block 8–16
    }))
    // Use 8–16 for exact 8h days
    const normalized = workDays.map((d) =>
      d.working ? { ...d, startHour: 8, endHour: 16 } : d,
    )
    return WorkCalendar.create({
      id,
      name,
      isBase: true,
      workDays: normalized,
      exceptions: [],
    })
  }

  get id(): CalendarId {
    return this.props.id
  }

  get name(): string {
    return this.props.name
  }

  get isBase(): boolean {
    return this.props.isBase
  }

  get workDays(): readonly WorkDay[] {
    return this.props.workDays
  }

  get exceptions(): readonly CalendarException[] {
    return this.props.exceptions
  }

  private dayConfig(date: Date): {
    working: boolean
    startHour: number
    endHour: number
  } {
    const key = localKey(date)
    const exception = this.props.exceptions.find((e) => localKey(e.date) === key)
    if (exception) {
      return {
        working: exception.working,
        startHour: exception.startHour ?? 8,
        endHour: exception.endHour ?? 16,
      }
    }
    const day = this.props.workDays[date.getDay()]!
    return {
      working: day.working,
      startHour: day.startHour,
      endHour: day.endHour,
    }
  }

  isWorkingDay(date: Date): boolean {
    return this.dayConfig(date).working
  }

  /** Working hours available on this calendar day (0 if non-working). */
  hoursOn(date: Date): number {
    const cfg = this.dayConfig(date)
    if (!cfg.working) return 0
    return Math.max(0, cfg.endHour - cfg.startHour)
  }

  /** Snap to start of working time on this or next working day. */
  snapToWorkStart(date: Date): Date {
    const cursor = new Date(date.getTime())
    for (let i = 0; i < 3660; i += 1) {
      const cfg = this.dayConfig(cursor)
      if (cfg.working) {
        const hour = cursor.getHours() + cursor.getMinutes() / 60
        if (hour < cfg.startHour) {
          cursor.setHours(cfg.startHour, 0, 0, 0)
          return cursor
        }
        if (hour < cfg.endHour) {
          return cursor
        }
      }
      cursor.setDate(cursor.getDate() + 1)
      cursor.setHours(0, 0, 0, 0)
    }
    return date
  }

  /**
   * Add working hours (minimal schedule unit). Negative hours move backward.
   */
  addWorkingHours(start: Date, hours: number): Date {
    if (hours === 0) return new Date(start.getTime())
    const direction = hours > 0 ? 1 : -1
    let remaining = Math.abs(hours)
    let cursor = this.snapToWorkStart(start)

    // When going backward, start from end of previous slot if needed
    if (direction < 0) {
      cursor = new Date(start.getTime())
    }

    let guard = 0
    while (remaining > 1e-9 && guard < 100_000) {
      guard += 1
      const cfg = this.dayConfig(cursor)
      if (!cfg.working) {
        cursor.setDate(cursor.getDate() + direction)
        if (direction > 0) cursor.setHours(cfg.startHour ?? 8, 0, 0, 0)
        else cursor.setHours(23, 59, 0, 0)
        cursor = direction > 0 ? this.snapToWorkStart(cursor) : cursor
        continue
      }

      if (direction > 0) {
        const hourNow = cursor.getHours() + cursor.getMinutes() / 60
        const startH = Math.max(hourNow, cfg.startHour)
        const available = cfg.endHour - startH
        if (available <= 0) {
          cursor.setDate(cursor.getDate() + 1)
          cursor.setHours(0, 0, 0, 0)
          cursor = this.snapToWorkStart(cursor)
          continue
        }
        if (remaining <= available) {
          const endH = startH + remaining
          const h = Math.floor(endH)
          const m = Math.round((endH - h) * 60)
          cursor.setHours(h, m, 0, 0)
          return cursor
        }
        remaining -= available
        cursor.setDate(cursor.getDate() + 1)
        cursor.setHours(0, 0, 0, 0)
        cursor = this.snapToWorkStart(cursor)
      } else {
        const hourNow = cursor.getHours() + cursor.getMinutes() / 60
        const endH = Math.min(hourNow, cfg.endHour)
        const available = endH - cfg.startHour
        if (available <= 0) {
          cursor.setDate(cursor.getDate() - 1)
          const prev = this.dayConfig(cursor)
          cursor.setHours(prev.endHour, 0, 0, 0)
          continue
        }
        if (remaining <= available) {
          const startH = endH - remaining
          const h = Math.floor(startH)
          const m = Math.round((startH - h) * 60)
          cursor.setHours(h, m, 0, 0)
          return cursor
        }
        remaining -= available
        cursor.setDate(cursor.getDate() - 1)
        const prev = this.dayConfig(cursor)
        cursor.setHours(prev.endHour, 0, 0, 0)
      }
    }
    return cursor
  }

  addWorkingDays(start: Date, days: number): Date {
    return this.addWorkingHours(start, days * 8)
  }

  workingDaysBetween(start: Date, finish: Date): number {
    return this.workingHoursBetween(start, finish) / 8
  }

  workingHoursBetween(start: Date, finish: Date): number {
    if (finish.getTime() <= start.getTime()) return 0
    let total = 0
    const cursor = new Date(start.getTime())
    let guard = 0
    while (cursor.getTime() < finish.getTime() && guard < 100_000) {
      guard += 1
      const cfg = this.dayConfig(cursor)
      if (!cfg.working) {
        cursor.setDate(cursor.getDate() + 1)
        cursor.setHours(cfg.startHour, 0, 0, 0)
        continue
      }
      const hourNow = cursor.getHours() + cursor.getMinutes() / 60
      const from = Math.max(hourNow, cfg.startHour)
      const dayEnd = new Date(cursor.getTime())
      dayEnd.setHours(cfg.endHour, 0, 0, 0)
      const until = Math.min(
        cfg.endHour,
        finish.getTime() < dayEnd.getTime()
          ? finish.getHours() + finish.getMinutes() / 60
          : cfg.endHour,
      )
      if (until > from) total += until - from
      cursor.setDate(cursor.getDate() + 1)
      cursor.setHours(cfg.startHour, 0, 0, 0)
    }
    return total
  }

  with(patch: Partial<CalendarProps>): WorkCalendar {
    return WorkCalendar.create({ ...this.props, ...patch })
  }

  toProps(): CalendarProps {
    return {
      ...this.props,
      workDays: [...this.props.workDays],
      exceptions: [...this.props.exceptions],
    }
  }
}
