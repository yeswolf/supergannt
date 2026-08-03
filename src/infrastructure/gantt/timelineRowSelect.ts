/**
 * dhtmlx `locate()` returns null for clicks on `.gantt_task_row` (timeline
 * cells outside the bar), so those fire `onEmptyClick` instead of `onTaskClick`.
 * Resolve the row's task id so empty-row clicks can still select.
 */
export function taskIdFromTimelineEmptyClick(
  e: Event,
  opts: {
    taskAttribute?: string
    linkAttribute?: string
  } = {},
): string | null {
  const taskAttribute = opts.taskAttribute ?? 'data-task-id'
  const linkAttribute = opts.linkAttribute ?? 'data-link-id'
  const target = e.target
  if (!(target instanceof Element)) return null
  if (target.closest(`[${linkAttribute}]`)) return null
  const row = target.closest('.gantt_task_row')
  if (!row) return null
  const id = row.getAttribute(taskAttribute)
  return id ? String(id) : null
}
