import { describe, expect, it } from 'vitest'
import { formatSlackHours } from './formatSlack'

describe('formatSlackHours', () => {
  it('returns empty string for null', () => {
    expect(formatSlackHours(null)).toBe('')
  })

  it('formats zero as 0h', () => {
    expect(formatSlackHours(0)).toBe('0h')
  })

  it('formats tiny near-zero values as 0h', () => {
    expect(formatSlackHours(0.004)).toBe('0h')
    expect(formatSlackHours(-0.004)).toBe('0h')
  })

  it('formats whole hours', () => {
    expect(formatSlackHours(5)).toBe('5h')
    expect(formatSlackHours(40)).toBe('40h')
  })

  it('formats fractional hours', () => {
    expect(formatSlackHours(4.5)).toBe('4h 30m')
    expect(formatSlackHours(2.25)).toBe('2h 15m')
  })

  it('formats minutes only for <1h', () => {
    expect(formatSlackHours(0.5)).toBe('30m')
    expect(formatSlackHours(0.75)).toBe('45m')
  })

  it('rounds to nearest minute', () => {
    expect(formatSlackHours(1.5083)).toBe('1h 30m') // 1h 30.5m → rounds to 31m
  })

  it('handles negative values correctly (Math.floor on abs)', () => {
    // -2.5 should be "-2h 30m", not "-3h 30m" from floor(-2.5) = -3
    expect(formatSlackHours(-2.5)).toBe('-2h 30m')
    expect(formatSlackHours(-2)).toBe('-2h')
    expect(formatSlackHours(-0.5)).toBe('-30m')
    expect(formatSlackHours(-4.25)).toBe('-4h 15m')
  })

  it('handles edge case: 59.99 minutes rounds up to next hour', () => {
    expect(formatSlackHours(0.999)).toBe('1h')
  })
})
