/** Local calendar date for `<input type="date">` (avoids UTC shift from toISOString). */
export function toDateInputValue(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Parse date input as local morning work start (08:00). */
export function fromDateInputValue(value: string): Date {
  return new Date(`${value}T08:00:00`)
}
