/** ProjectLibre-style discrete Gantt timescale levels (Zoom In → Zoom Out). */
export type GanttScaleUnit = 'minute' | 'hour' | 'day' | 'week' | 'month' | 'quarter' | 'year'

export interface GanttScaleLevel {
  id: string
  label: string
  /** Column width hint for dhtmlx min_column_width */
  minColumnWidth: number
  scales: {
    unit: GanttScaleUnit
    step: number
    format: string | ((date: Date) => string)
  }[]
}

/**
 * Matches ProjectLibre Zoom In/Out progression:
 * Hours → Days → 3 Days → Week → Month → Quarter → Year
 */
export const GANTT_ZOOM_LEVELS: readonly GanttScaleLevel[] = [
  {
    id: 'hours',
    label: 'Hours',
    minColumnWidth: 36,
    scales: [
      { unit: 'day', step: 1, format: '%d %M' },
      { unit: 'hour', step: 1, format: '%H' },
    ],
  },
  {
    id: 'days',
    label: 'Days',
    minColumnWidth: 44,
    scales: [
      { unit: 'month', step: 1, format: '%F %Y' },
      { unit: 'day', step: 1, format: '%j' },
    ],
  },
  {
    id: 'threedays',
    label: '3 Days',
    minColumnWidth: 48,
    scales: [
      { unit: 'month', step: 1, format: '%F %Y' },
      { unit: 'day', step: 3, format: '%d' },
    ],
  },
  {
    id: 'week',
    label: 'Week',
    minColumnWidth: 56,
    scales: [
      { unit: 'month', step: 1, format: '%F %Y' },
      { unit: 'week', step: 1, format: 'Week %W' },
    ],
  },
  {
    id: 'month',
    label: 'Month',
    minColumnWidth: 64,
    scales: [
      { unit: 'year', step: 1, format: '%Y' },
      { unit: 'month', step: 1, format: '%M' },
    ],
  },
  {
    id: 'quarter',
    label: 'Quarter',
    minColumnWidth: 80,
    scales: [
      { unit: 'year', step: 1, format: '%Y' },
      {
        unit: 'quarter',
        step: 1,
        format: (date: Date) => `Q${Math.floor(date.getMonth() / 3) + 1}`,
      },
    ],
  },
  {
    id: 'year',
    label: 'Year',
    minColumnWidth: 100,
    scales: [{ unit: 'year', step: 1, format: '%Y' }],
  },
] as const

/** Default = Days (ProjectLibre mid-detail starting point). */
export const DEFAULT_GANTT_ZOOM_INDEX = 1

export function clampZoomIndex(index: number): number {
  return Math.max(0, Math.min(GANTT_ZOOM_LEVELS.length - 1, index))
}
