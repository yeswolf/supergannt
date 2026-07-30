export type DurationUnit = 'm' | 'h' | 'd' | 'w' | 'mo'

const HOURS_PER_DAY = 8
const HOURS_PER_WEEK = 40
const HOURS_PER_MONTH = 160

/**
 * Working duration. Canonical unit is hours — the minimal schedule slot.
 * Negative amounts are allowed for dependency lag/lead (ProjectLibre).
 */
export class Duration {
  private constructor(
    readonly amount: number,
    readonly unit: DurationUnit,
  ) {
    if (!Number.isFinite(amount)) {
      throw new Error('Duration amount must be a finite number')
    }
  }

  static of(amount: number, unit: DurationUnit = 'h'): Duration {
    return new Duration(amount, unit)
  }

  static hours(amount: number): Duration {
    return new Duration(amount, 'h')
  }

  /** Task / work duration — rejects negatives. */
  static workHours(amount: number): Duration {
    if (amount < 0) {
      throw new Error('Work duration cannot be negative')
    }
    return new Duration(amount, 'h')
  }

  static zero(): Duration {
    return new Duration(0, 'h')
  }

  /** Canonical working hours (8h/day, 40h/week, 160h/month). */
  toHours(): number {
    switch (this.unit) {
      case 'm':
        return this.amount / 60
      case 'h':
        return this.amount
      case 'd':
        return this.amount * HOURS_PER_DAY
      case 'w':
        return this.amount * HOURS_PER_WEEK
      case 'mo':
        return this.amount * HOURS_PER_MONTH
    }
  }

  toDays(): number {
    return this.toHours() / HOURS_PER_DAY
  }

  add(other: Duration): Duration {
    return Duration.hours(this.toHours() + other.toHours())
  }

  equals(other: Duration): boolean {
    return Math.abs(this.toHours() - other.toHours()) < 1e-9
  }

  format(): string {
    const hours = this.toHours()
    if (hours === 0) return '0h'
    const sign = hours < 0 ? '-' : ''
    const abs = Math.abs(hours)
    if (this.unit === 'h' || this.unit === 'm') {
      return this.unit === 'm'
        ? `${sign}${Math.abs(this.amount)}m`
        : `${sign}${abs}h`
    }
    if (Number.isInteger(abs)) return `${sign}${abs}h`
    return `${sign}${Number(abs.toFixed(2))}h`
  }

  static parse(input: string): Duration {
    const trimmed = input.trim().toLowerCase()
    if (!trimmed) return Duration.zero()
    const match = /^(-?\d+(?:\.\d+)?)\s*(m|min|h|d|w|mo|mon|month|months)?$/.exec(
      trimmed,
    )
    if (!match) {
      throw new Error(`Invalid duration: ${input}`)
    }
    const amount = Number(match[1])
    const raw = match[2] ?? 'h'
    const unit: DurationUnit =
      raw === 'm' || raw === 'min'
        ? 'm'
        : raw === 'h'
          ? 'h'
          : raw === 'w'
            ? 'w'
            : raw === 'mo' || raw === 'mon' || raw === 'month' || raw === 'months'
              ? 'mo'
              : 'd'
    return Duration.of(amount, unit)
  }
}
