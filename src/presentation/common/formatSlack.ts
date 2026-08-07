/**
 * Format a slack/float value in hours for display (e.g. "4h 30m", "-2h", "0h").
 * Shared by the Gantt mapper and the Task Sheet view.
 */
export function formatSlackHours(hours: number | null): string {
  if (hours == null) return ''
  if (hours === 0) return '0h'
  if (Math.abs(hours) < 0.005) return '0h'
  const h = Math.floor(hours)
  const m = Math.round((hours - h) * 60)
  if (h === 0 && m === 0) return '0h'
  if (m === 0) return `${h}h`
  if (h === 0) return `${m}m`
  const sign = hours < 0 ? '-' : ''
  const absH = Math.abs(h)
  return `${sign}${absH}h ${m}m`
}
