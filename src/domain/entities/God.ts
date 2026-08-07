import type { GodId } from '../value-objects/Ids'

/**
 * Recognized divine domains of influence.
 * "project management" is included for the patron deity of Gantt charts.
 */
export type GodDomain =
  | 'sky'
  | 'sea'
  | 'wisdom'
  | 'craftsmanship'
  | 'project management'

export const godDomains: readonly GodDomain[] = [
  'sky',
  'sea',
  'wisdom',
  'craftsmanship',
  'project management',
] as const

export interface GodProps {
  id: GodId
  name: string
  domain: GodDomain
  /** 0 (wrathful) to 100 (supremely pleased). */
  benevolence: number
}

export class God {
  private constructor(private readonly props: GodProps) {}

  static create(props: GodProps): God {
    if (!props.name.trim()) {
      throw new Error('God name is required')
    }
    if (!godDomains.includes(props.domain)) {
      throw new Error(
        `Unknown domain "${props.domain}". Must be one of: ${godDomains.join(', ')}`,
      )
    }
    if (props.benevolence < 0 || props.benevolence > 100) {
      throw new Error('Benevolence must be between 0 and 100')
    }
    return new God({
      ...props,
      name: props.name.trim(),
    })
  }

  get id(): GodId {
    return this.props.id
  }

  get name(): string {
    return this.props.name
  }

  get domain(): GodDomain {
    return this.props.domain
  }

  get benevolence(): number {
    return this.props.benevolence
  }

  /** A pleased deity watches over your project. Threshold: 50. */
  get isPleased(): boolean {
    return this.props.benevolence >= 50
  }

  with(patch: Partial<GodProps>): God {
    return God.create({ ...this.props, ...patch })
  }

  toProps(): GodProps {
    return { ...this.props }
  }
}