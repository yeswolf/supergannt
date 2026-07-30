import type { DependencyId, TaskId } from '../value-objects/Ids'
import { Duration } from '../value-objects/Duration'

export type LinkType = 'FS' | 'SS' | 'FF' | 'SF'

export interface DependencyProps {
  id: DependencyId
  predecessorId: TaskId
  successorId: TaskId
  type: LinkType
  lag: Duration
}

export class Dependency {
  private constructor(private readonly props: DependencyProps) {
    if (props.predecessorId === props.successorId) {
      throw new Error('A task cannot depend on itself')
    }
  }

  static create(props: DependencyProps): Dependency {
    return new Dependency(props)
  }

  get id(): DependencyId {
    return this.props.id
  }

  get predecessorId(): TaskId {
    return this.props.predecessorId
  }

  get successorId(): TaskId {
    return this.props.successorId
  }

  get type(): LinkType {
    return this.props.type
  }

  get lag(): Duration {
    return this.props.lag
  }

  with(patch: Partial<DependencyProps>): Dependency {
    return Dependency.create({ ...this.props, ...patch })
  }

  toProps(): DependencyProps {
    return { ...this.props }
  }
}
