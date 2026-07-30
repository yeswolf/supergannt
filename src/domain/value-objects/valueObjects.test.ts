import { describe, expect, it } from 'vitest'
import { Duration } from '../../domain/value-objects/Duration'
import { Money } from '../../domain/value-objects/Money'
import {
  asTaskId,
  asResourceId,
  asDependencyId,
  asAssignmentId,
  asCalendarId,
  asProjectId,
} from '../../domain/value-objects/Ids'

describe('Duration', () => {
  it('converts units via hours', () => {
    expect(Duration.of(2, 'w').toHours()).toBe(80)
    expect(Duration.of(16, 'h').toDays()).toBe(2)
    expect(Duration.of(1, 'mo').toHours()).toBe(160)
    expect(Duration.of(480, 'm').toHours()).toBe(8)
  })

  it('parses and formats with hour default', () => {
    expect(Duration.parse('3h').format()).toBe('3h')
    expect(Duration.parse('2w').toHours()).toBe(80)
    expect(Duration.parse('').toHours()).toBe(0)
    expect(Duration.parse('1.5').toHours()).toBe(1.5)
    expect(() => Duration.parse('nope')).toThrow(/Invalid duration/)
  })

  it('adds and compares', () => {
    const a = Duration.of(2, 'd')
    const b = Duration.of(16, 'h')
    expect(a.add(b).toHours()).toBe(32)
    expect(a.equals(b)).toBe(true)
  })

  it('allows signed lag amounts; workHours rejects negatives', () => {
    expect(Duration.of(-1).toHours()).toBe(-1)
    expect(() => Duration.workHours(-1)).toThrow(/Work duration/)
  })
})

describe('Money', () => {
  it('adds and multiplies same currency', () => {
    const total = Money.of(10, 'USD').add(Money.of(5, 'USD')).multiply(2)
    expect(total.amount).toBe(30)
    expect(total.format()).toContain('30')
  })

  it('rejects currency mismatch and non-finite', () => {
    expect(() => Money.of(1, 'USD').add(Money.of(1, 'EUR'))).toThrow(/Currency/)
    expect(() => Money.of(Number.NaN)).toThrow()
    expect(() => Money.of(1, '')).toThrow()
  })

  it('equals by amount and currency', () => {
    expect(Money.of(1).equals(Money.of(1))).toBe(true)
    expect(Money.of(1).equals(Money.of(2))).toBe(false)
  })
})

describe('Ids', () => {
  it('brands string ids', () => {
    expect(asTaskId('t')).toBe('t')
    expect(asResourceId('r')).toBe('r')
    expect(asDependencyId('d')).toBe('d')
    expect(asAssignmentId('a')).toBe('a')
    expect(asCalendarId('c')).toBe('c')
    expect(asProjectId('p')).toBe('p')
  })
})
