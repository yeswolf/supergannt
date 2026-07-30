import { describe, expect, it } from 'vitest'
import { Duration } from '../../domain/value-objects/Duration'
import { applyMilestoneRules, isZeroEffort } from './MilestonePolicy'
import { Money } from '../../domain/value-objects/Money'
import { asTaskId } from '../../domain/value-objects/Ids'
import type { TaskProps } from '../entities/Task'

function baseProps(hours: number): TaskProps {
  const start = new Date(2026, 0, 5, 8)
  return {
    id: asTaskId('t1'),
    name: 'T',
    outlineLevel: 0,
    wbs: '1',
    start,
    finish: start,
    duration: Duration.hours(hours),
    percentComplete: 0,
    milestone: false,
    summary: false,
    critical: false,
    notes: '',
    priority: 500,
    constraintType: 'asSoonAsPossible',
    constraintDate: null,
    fixedCost: Money.zero(),
    cost: Money.zero(),
    workHours: hours,
    schedulingType: 'fixedUnits',
    effortDriven: true,
    parentId: null,
    baseline: null,
    collapsed: false,
  }
}

describe('MilestonePolicy (hour-based)', () => {
  it('treats 0 hours as milestone', () => {
    expect(isZeroEffort(Duration.hours(0))).toBe(true)
    expect(isZeroEffort(Duration.hours(1))).toBe(false)
    const rules = applyMilestoneRules(baseProps(0))
    expect(rules.milestone).toBe(true)
    expect(rules.duration?.toHours()).toBe(0)
  })

  it('raises sub-hour zero to 1h when forced not milestone', () => {
    const rules = applyMilestoneRules(baseProps(0), { forceNotMilestone: true })
    expect(rules.milestone).toBe(false)
    expect(rules.duration?.toHours()).toBe(1)
  })
})
