import type { ResourceId } from '../value-objects/Ids'
import { Money } from '../value-objects/Money'

export type ResourceType = 'work' | 'material' | 'cost'

export interface ResourceProps {
  id: ResourceId
  name: string
  type: ResourceType
  email: string
  group: string
  maxUnits: number
  standardRate: Money
  overtimeRate: Money
  costPerUse: Money
  calendarId: string | null
  notes: string
}

export class Resource {
  private constructor(private readonly props: ResourceProps) {}

  static create(props: ResourceProps): Resource {
    if (!props.name.trim()) {
      throw new Error('Resource name is required')
    }
    if (props.maxUnits < 0) {
      throw new Error('Max units cannot be negative')
    }
    return new Resource({ ...props, name: props.name.trim() })
  }

  get id(): ResourceId {
    return this.props.id
  }

  get name(): string {
    return this.props.name
  }

  get type(): ResourceType {
    return this.props.type
  }

  get email(): string {
    return this.props.email
  }

  get group(): string {
    return this.props.group
  }

  get maxUnits(): number {
    return this.props.maxUnits
  }

  get standardRate(): Money {
    return this.props.standardRate
  }

  get overtimeRate(): Money {
    return this.props.overtimeRate
  }

  get costPerUse(): Money {
    return this.props.costPerUse
  }

  get calendarId(): string | null {
    return this.props.calendarId
  }

  get notes(): string {
    return this.props.notes
  }

  with(patch: Partial<ResourceProps>): Resource {
    return Resource.create({ ...this.props, ...patch })
  }

  toProps(): ResourceProps {
    return { ...this.props }
  }
}
