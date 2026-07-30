import { describe, expect, it } from 'vitest'
import { Duration } from '../value-objects/Duration'
import { Money } from '../value-objects/Money'

describe('Duration (hour canonical unit)', () => {
  it('uses hours as default and minimal unit', () => {
    expect(Duration.of(3).unit).toBe('h')
    expect(Duration.of(3).toHours()).toBe(3)
    expect(Duration.zero().format()).toBe('0h')
    expect(Duration.parse('4').toHours()).toBe(4)
    expect(Duration.parse('2d').toHours()).toBe(16)
    expect(Duration.hours(8).toDays()).toBe(1)
  })

  it('adds and compares in hours', () => {
    const a = Duration.hours(8)
    const b = Duration.of(1, 'd')
    expect(a.equals(b)).toBe(true)
    expect(a.add(Duration.hours(2)).toHours()).toBe(10)
  })

  it('allows signed lag/lead and rejects negative work duration', () => {
    expect(Duration.hours(-8).toHours()).toBe(-8)
    expect(Duration.hours(-8).format()).toBe('-8h')
    expect(Duration.parse('-1d').toHours()).toBe(-8)
    expect(() => Duration.workHours(-1)).toThrow(/Work duration/)
  })
})

describe('Money', () => {
  it('formats', () => {
    expect(Money.of(10, 'USD').format()).toContain('10')
  })
})
