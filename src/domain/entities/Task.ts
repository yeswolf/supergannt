import type { Duration } from '../value-objects/Duration'
import type { Money } from '../value-objects/Money'
import type { TaskId } from '../value-objects/Ids'
import { applyMilestoneRules } from '../services/MilestonePolicy'

export type TaskConstraintType =
  | 'asSoonAsPossible'
  | 'asLateAsPossible'
  | 'mustStartOn'
  | 'mustFinishOn'
  | 'startNoEarlierThan'
  | 'startNoLaterThan'
  | 'finishNoEarlierThan'
  | 'finishNoLaterThan'

export interface TaskBaseline {
  readonly start: Date | null
  readonly finish: Date | null
  readonly duration: Duration
  readonly cost: Money
}

export interface TaskProps {
  id: TaskId
  name: string
  outlineLevel: number
  wbs: string
  start: Date
  finish: Date
  duration: Duration
  percentComplete: number
  milestone: boolean
  summary: boolean
  critical: boolean
  notes: string
  priority: number
  constraintType: TaskConstraintType
  constraintDate: Date | null
  fixedCost: Money
  cost: Money
  workHours: number
  parentId: TaskId | null
  baseline: TaskBaseline | null
  collapsed: boolean
}

export class Task {
  private constructor(private readonly props: TaskProps) {}

  static create(props: TaskProps): Task {
    if (!props.name.trim()) {
      throw new Error('Task name is required')
    }
    if (props.percentComplete < 0 || props.percentComplete > 100) {
      throw new Error('Percent complete must be between 0 and 100')
    }
    if (props.outlineLevel < 0) {
      throw new Error('Outline level cannot be negative')
    }
    const normalized: TaskProps = {
      ...props,
      name: props.name.trim(),
      ...applyMilestoneRules(props),
    }
    if (
      normalized.finish.getTime() < normalized.start.getTime() &&
      !normalized.milestone
    ) {
      throw new Error('Finish date cannot be before start date')
    }
    return new Task(normalized)
  }

  get id(): TaskId {
    return this.props.id
  }

  get name(): string {
    return this.props.name
  }

  get outlineLevel(): number {
    return this.props.outlineLevel
  }

  get wbs(): string {
    return this.props.wbs
  }

  get start(): Date {
    return this.props.start
  }

  get finish(): Date {
    return this.props.finish
  }

  get duration(): Duration {
    return this.props.duration
  }

  get percentComplete(): number {
    return this.props.percentComplete
  }

  get milestone(): boolean {
    return this.props.milestone
  }

  get summary(): boolean {
    return this.props.summary
  }

  get critical(): boolean {
    return this.props.critical
  }

  get notes(): string {
    return this.props.notes
  }

  get priority(): number {
    return this.props.priority
  }

  get constraintType(): TaskConstraintType {
    return this.props.constraintType
  }

  get constraintDate(): Date | null {
    return this.props.constraintDate
  }

  get fixedCost(): Money {
    return this.props.fixedCost
  }

  get cost(): Money {
    return this.props.cost
  }

  get workHours(): number {
    return this.props.workHours
  }

  get parentId(): TaskId | null {
    return this.props.parentId
  }

  get baseline(): TaskBaseline | null {
    return this.props.baseline
  }

  get collapsed(): boolean {
    return this.props.collapsed
  }

  with(patch: Partial<TaskProps>): Task {
    return Task.create({ ...this.props, ...patch })
  }

  toProps(): TaskProps {
    return { ...this.props }
  }
}
