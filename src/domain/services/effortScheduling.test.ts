import { describe, expect, it } from 'vitest'
import {
  detectAssignmentChangeKind,
  recalculateForAssignmentChange,
  recalculateForDurationChange,
  recalculateForWorkChange,
  totalAssignmentUnits,
} from './EffortScheduling'
import { Assignment } from '../entities/Assignment'
import { Money } from '../value-objects/Money'
import { asAssignmentId, asResourceId, asTaskId } from '../value-objects/Ids'

function slice(units: number, workHours = 0) {
  return { units, workHours }
}

function assignment(resourceId: string, units: number, workHours = 0) {
  return Assignment.create({
    id: asAssignmentId(`a-${resourceId}`),
    taskId: asTaskId('t1'),
    resourceId: asResourceId(resourceId),
    units,
    workHours,
    cost: Money.zero(),
  })
}

describe('EffortScheduling', () => {
  describe('detectAssignmentChangeKind', () => {
    it('classifies same resources as units and add/remove as membership', () => {
      const a = assignment('r1', 1)
      const b = assignment('r2', 1)
      expect(detectAssignmentChangeKind([a], [a.with({ units: 0.5 })])).toBe('units')
      expect(detectAssignmentChangeKind([a], [a, b])).toBe('membership')
      expect(detectAssignmentChangeKind([], [a])).toBe('membership')
      expect(detectAssignmentChangeKind([a], [])).toBe('membership')
    })
  })

  describe('units change (load)', () => {
    it('Fixed Units: holds work, recalculates duration', () => {
      // 40h duration @ 100% → work 40. Units → 50% → duration 80.
      const result = recalculateForAssignmentChange({
        schedulingType: 'fixedUnits',
        effortDriven: true,
        durationHours: 40,
        workHours: 40,
        previous: [slice(1, 40)],
        next: [slice(0.5)],
        kind: 'units',
      })
      expect(result.durationHours).toBe(80)
      expect(result.workHours).toBe(40)
    })

    it('Fixed Work: holds work, recalculates duration', () => {
      const result = recalculateForAssignmentChange({
        schedulingType: 'fixedWork',
        effortDriven: true,
        durationHours: 40,
        workHours: 40,
        previous: [slice(1, 40)],
        next: [slice(2)],
        kind: 'units',
      })
      expect(result.durationHours).toBe(20)
      expect(result.workHours).toBe(40)
    })

    it('Fixed Duration: holds duration, recalculates work', () => {
      const result = recalculateForAssignmentChange({
        schedulingType: 'fixedDuration',
        effortDriven: false,
        durationHours: 40,
        workHours: 40,
        previous: [slice(1, 40)],
        next: [slice(0.5)],
        kind: 'units',
      })
      expect(result.durationHours).toBe(40)
      expect(result.workHours).toBe(20)
    })
  })

  describe('first assignment', () => {
    it('does not change duration; sets work = duration × units', () => {
      const result = recalculateForAssignmentChange({
        schedulingType: 'fixedUnits',
        effortDriven: true,
        durationHours: 40,
        workHours: 40,
        previous: [],
        next: [slice(1)],
        kind: 'membership',
      })
      expect(result.durationHours).toBe(40)
      expect(result.workHours).toBe(40)
    })

    it('first assign at 200% doubles work, keeps duration', () => {
      const result = recalculateForAssignmentChange({
        schedulingType: 'fixedUnits',
        effortDriven: true,
        durationHours: 40,
        workHours: 40,
        previous: [],
        next: [slice(2)],
        kind: 'membership',
      })
      expect(result.durationHours).toBe(40)
      expect(result.workHours).toBe(80)
    })
  })

  describe('effort-driven membership', () => {
    it('Fixed Units + effort-driven: adding resource shortens duration', () => {
      const result = recalculateForAssignmentChange({
        schedulingType: 'fixedUnits',
        effortDriven: true,
        durationHours: 40,
        workHours: 40,
        previous: [slice(1, 40)],
        next: [slice(1, 40), slice(1)],
        kind: 'membership',
      })
      expect(result.durationHours).toBe(20)
      expect(result.workHours).toBe(40)
    })

    it('Fixed Units + not effort-driven: duration held, work grows', () => {
      const result = recalculateForAssignmentChange({
        schedulingType: 'fixedUnits',
        effortDriven: false,
        durationHours: 40,
        workHours: 40,
        previous: [slice(1, 40)],
        next: [slice(1), slice(1)],
        kind: 'membership',
      })
      expect(result.durationHours).toBe(40)
      expect(result.workHours).toBe(80)
    })

    it('Fixed Duration + effort-driven: holds duration and work', () => {
      const result = recalculateForAssignmentChange({
        schedulingType: 'fixedDuration',
        effortDriven: true,
        durationHours: 40,
        workHours: 40,
        previous: [slice(1, 40)],
        next: [slice(1), slice(1)],
        kind: 'membership',
      })
      expect(result.durationHours).toBe(40)
      expect(result.workHours).toBe(40)
    })

    it('removing a resource lengthens duration when effort-driven', () => {
      const result = recalculateForAssignmentChange({
        schedulingType: 'fixedUnits',
        effortDriven: true,
        durationHours: 20,
        workHours: 40,
        previous: [slice(1, 20), slice(1, 20)],
        next: [slice(1, 20)],
        kind: 'membership',
      })
      expect(result.durationHours).toBe(40)
      expect(result.workHours).toBe(40)
    })

    it('unassign all keeps duration and residual work', () => {
      const result = recalculateForAssignmentChange({
        schedulingType: 'fixedUnits',
        effortDriven: true,
        durationHours: 40,
        workHours: 40,
        previous: [slice(1, 40)],
        next: [],
        kind: 'membership',
      })
      expect(result.durationHours).toBe(40)
      expect(result.workHours).toBe(40)
    })
  })

  describe('duration / work edits', () => {
    it('Fixed Units + duration change recalculates work', () => {
      const result = recalculateForDurationChange({
        schedulingType: 'fixedUnits',
        workHours: 40,
        durationHours: 80,
        assignments: [slice(1, 40)],
      })
      expect(result.durationHours).toBe(80)
      expect(result.workHours).toBe(80)
    })

    it('Fixed Work + duration change recalculates units', () => {
      const result = recalculateForDurationChange({
        schedulingType: 'fixedWork',
        workHours: 40,
        durationHours: 20,
        assignments: [slice(1, 40)],
      })
      expect(result.durationHours).toBe(20)
      expect(result.workHours).toBe(40)
      expect(result.nextUnits).toEqual([2])
    })

    it('Fixed Units + work change recalculates duration', () => {
      const result = recalculateForWorkChange({
        schedulingType: 'fixedUnits',
        durationHours: 40,
        workHours: 80,
        assignments: [slice(1, 40)],
      })
      expect(result.durationHours).toBe(80)
      expect(result.workHours).toBe(80)
    })

    it('Fixed Duration + work change recalculates units', () => {
      const result = recalculateForWorkChange({
        schedulingType: 'fixedDuration',
        durationHours: 40,
        workHours: 80,
        assignments: [slice(1, 40)],
      })
      expect(result.durationHours).toBe(40)
      expect(result.workHours).toBe(80)
      expect(result.nextUnits).toEqual([2])
    })
  })

  it('sums assignment units', () => {
    expect(totalAssignmentUnits([slice(0.5), slice(1.5)])).toBe(2)
  })
})
