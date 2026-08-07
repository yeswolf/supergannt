/**
 * Format a slack/float value in hours for display (e.g. "4h 30m", "-2h", "0h").
 * Shared by the Gantt mapper and the Task Sheet view.
 */
export function formatSlackHours(hours: number | null): string {
  if (hours == null) return ''
  if (Math.abs(hours) < 0.005) return '0h'
  const abs = Math.abs(hours)
  let h = Math.floor(abs)
  let m = Math.round((abs - h) * 60)
  if (m === 60) {
    h += 1
    m = 0
  }
  const sign = hours < 0 ? '-' : ''
  if (m === 0) return `${sign}${h}h`
  if (h === 0) return `${sign}${m}m`
  return `${sign}${h}h ${m}m`
}
