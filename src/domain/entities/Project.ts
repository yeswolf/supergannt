import { Assignment } from './Assignment'
import { Dependency } from './Dependency'
import { Resource } from './Resource'
import { Task } from './Task'
import { WorkCalendar } from './WorkCalendar'
import type { CalendarId, ProjectId, TaskId } from '../value-objects/Ids'
import { Money } from '../value-objects/Money'

export interface ProjectProps {
  id: ProjectId
  name: string
  title: string
  manager: string
  startDate: Date
  finishDate: Date
  statusDate: Date | null
  currency: string
  calendarId: CalendarId
  tasks: Task[]
  resources: Resource[]
  dependencies: Dependency[]
  assignments: Assignment[]
  calendars: WorkCalendar[]
  dirty: boolean
  fileName: string | null
  /** Exact source .mpp bytes for binary-identical save when !dirty. Not persisted in drafts. */
  sourceMppBytes?: Uint8Array | null
}

export class Project {
  private constructor(private readonly props: ProjectProps) {}

  static create(props: ProjectProps): Project {
    if (!props.name.trim()) {
      throw new Error('Project name is required')
    }
    return new Project({ ...props, name: props.name.trim() })
  }

  get id(): ProjectId {
    return this.props.id
  }

  get name(): string {
    return this.props.name
  }

  get title(): string {
    return this.props.title
  }

  get manager(): string {
    return this.props.manager
  }

  get startDate(): Date {
    return this.props.startDate
  }

  get finishDate(): Date {
    return this.props.finishDate
  }

  get statusDate(): Date | null {
    return this.props.statusDate
  }

  get currency(): string {
    return this.props.currency
  }

  get calendarId(): CalendarId {
    return this.props.calendarId
  }

  get tasks(): readonly Task[] {
    return this.props.tasks
  }

  get resources(): readonly Resource[] {
    return this.props.resources
  }

  get dependencies(): readonly Dependency[] {
    return this.props.dependencies
  }

  get assignments(): readonly Assignment[] {
    return this.props.assignments
  }

  get calendars(): readonly WorkCalendar[] {
    return this.props.calendars
  }

  get dirty(): boolean {
    return this.props.dirty
  }

  get fileName(): string | null {
    return this.props.fileName
  }

  get sourceMppBytes(): Uint8Array | null {
    return this.props.sourceMppBytes ?? null
  }

  getTask(id: TaskId): Task | undefined {
    return this.props.tasks.find((t) => t.id === id)
  }

  getCalendar(): WorkCalendar {
    return this.getCalendarById(this.props.calendarId)
  }

  getCalendarById(calendarId: string): WorkCalendar {
    const calendar = this.props.calendars.find((c) => c.id === calendarId)
    if (!calendar) {
      throw new Error('Calendar not found')
    }
    return calendar
  }

  /** Resource calendar, or project calendar when unset / missing. */
  getResourceCalendar(resourceId: string): WorkCalendar {
    const resource = this.props.resources.find((r) => r.id === resourceId)
    if (!resource) {
      throw new Error('Resource not found')
    }
    const calendarId = resource.calendarId ?? this.props.calendarId
    const found = this.props.calendars.find((c) => c.id === calendarId)
    return found ?? this.getCalendar()
  }

  totalCost(): Money {
    return this.props.tasks.reduce(
      (sum, task) => sum.add(task.cost),
      Money.zero(this.props.currency),
    )
  }

  with(patch: Partial<ProjectProps>): Project {
    return Project.create({ ...this.props, ...patch })
  }

  markDirty(): Project {
    return this.with({ dirty: true })
  }

  markClean(): Project {
    return this.with({ dirty: false })
  }

  toProps(): ProjectProps {
    return {
      ...this.props,
      tasks: [...this.props.tasks],
      resources: [...this.props.resources],
      dependencies: [...this.props.dependencies],
      assignments: [...this.props.assignments],
      calendars: [...this.props.calendars],
    }
  }
}
