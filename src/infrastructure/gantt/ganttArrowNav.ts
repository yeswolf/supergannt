/**
 * Next/previous task in dhtmlx visible order (open tree, filtered rows).
 * Used for Gantt ↑/↓ keyboard navigation.
 */
export function adjacentVisibleTaskId(opts: {
  currentId: string | null
  direction: -1 | 1
  visibleCount: number
  taskIdAt: (index: number) => string | null | undefined
}): string | null {
  const { currentId, direction, visibleCount, taskIdAt } = opts
  if (visibleCount <= 0) return null

  const ids: string[] = []
  for (let i = 0; i < visibleCount; i += 1) {
    const id = taskIdAt(i)
    if (id != null && id !== '') ids.push(String(id))
  }
  if (ids.length === 0) return null

  if (!currentId) {
    return direction > 0 ? ids[0]! : ids[ids.length - 1]!
  }

  const idx = ids.indexOf(String(currentId))
  if (idx < 0) {
    return direction > 0 ? ids[0]! : ids[ids.length - 1]!
  }

  const next = idx + direction
  if (next < 0 || next >= ids.length) return ids[idx]!
  return ids[next]!
}
