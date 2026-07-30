import type { AssignmentId, ResourceId, TaskId } from '../value-objects/Ids'
import { Money } from '../value-objects/Money'

export interface AssignmentProps {
  id: AssignmentId
  taskId: TaskId
  resourceId: ResourceId
  units: number
  workHours: number
  cost: Money
}

export class Assignment {
  private constructor(private readonly props: AssignmentProps) {
    if (props.units < 0) {
      throw new Error('Assignment units cannot be negative')
    }
    if (props.workHours < 0) {
      throw new Error('Work hours cannot be negative')
    }
  }

  static create(props: AssignmentProps): Assignment {
    return new Assignment(props)
  }

  get id(): AssignmentId {
    return this.props.id
  }

  get taskId(): TaskId {
    return this.props.taskId
  }

  get resourceId(): ResourceId {
    return this.props.resourceId
  }

  get units(): number {
    return this.props.units
  }

  get workHours(): number {
    return this.props.workHours
  }

  get cost(): Money {
    return this.props.cost
  }

  with(patch: Partial<AssignmentProps>): Assignment {
    return Assignment.create({ ...this.props, ...patch })
  }

  toProps(): AssignmentProps {
    return { ...this.props }
  }
}
