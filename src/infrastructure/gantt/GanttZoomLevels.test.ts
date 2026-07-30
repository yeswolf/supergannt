import { describe, expect, it } from 'vitest'
import {
  clampZoomIndex,
  DEFAULT_GANTT_ZOOM_INDEX,
  GANTT_ZOOM_LEVELS,
} from './GanttZoomLevels'

describe('GanttZoomLevels', () => {
  it('matches ProjectLibre zoom progression', () => {
    expect(GANTT_ZOOM_LEVELS.map((l) => l.id)).toEqual([
      'hours',
      'days',
      'threedays',
      'week',
      'month',
      'quarter',
      'year',
    ])
    expect(GANTT_ZOOM_LEVELS[DEFAULT_GANTT_ZOOM_INDEX]!.id).toBe('days')
  })

  it('clamps zoom index for Zoom In/Out bounds', () => {
    expect(clampZoomIndex(-2)).toBe(0)
    expect(clampZoomIndex(99)).toBe(GANTT_ZOOM_LEVELS.length - 1)
    expect(clampZoomIndex(3)).toBe(3)
  })
})
