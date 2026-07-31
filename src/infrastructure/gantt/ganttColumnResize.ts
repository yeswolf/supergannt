const MIN_W = 48
const EDGE_PX = 7

type DragState = {
  index: number
  startX: number
  startW: number
}

function headCells(root: HTMLElement): HTMLElement[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>('.gantt_grid_scale .gantt_grid_head_cell'),
  )
}

function nearRightEdge(el: HTMLElement, clientX: number): boolean {
  const r = el.getBoundingClientRect()
  return clientX >= r.right - EDGE_PX && clientX <= r.right + 2
}

function columnIndex(root: HTMLElement, cell: HTMLElement): number {
  return headCells(root).indexOf(cell)
}

function setColumnWidth(
  gantt: {
    config: { columns?: { width?: number | string; min_width?: number }[] }
    getGridColumns?: () => { width?: number | string; min_width?: number }[]
    render?: () => void
  },
  index: number,
  width: number,
): void {
  const cols = gantt.getGridColumns?.() ?? gantt.config.columns ?? []
  const col = cols[index]
  if (!col) return
  const min = Math.max(MIN_W, Number(col.min_width) || MIN_W)
  col.width = Math.max(min, Math.round(width))
  // Keep config.columns in sync when getGridColumns returns live objects that
  // are the same refs — still assign config for safety.
  if (gantt.config.columns?.[index]) {
    gantt.config.columns[index]!.width = col.width
  }
  gantt.render?.()
}

/** Measure content width for one grid column (header + visible body cells). */
function measureColumnWidth(root: HTMLElement, index: number): number {
  const heads = headCells(root)
  const head = heads[index]
  let max = head ? Math.ceil(head.scrollWidth) : MIN_W
  const rows = root.querySelectorAll('.gantt_grid_data .gantt_row')
  rows.forEach((row) => {
    const cell = row.children[index] as HTMLElement | undefined
    if (cell) max = Math.max(max, Math.ceil(cell.scrollWidth))
  })
  return Math.max(MIN_W, max + 12)
}

/**
 * GPL/CE dhtmlx-gantt marks column `resize` as PRO — it is a no-op.
 * This installs drag handles on grid header right edges + double-click to fit.
 */
export function installGanttColumnResize(
  gantt: {
    config: {
      columns?: { width?: number | string; min_width?: number }[]
      keep_grid_width?: boolean
    }
    getGridColumns?: () => { width?: number | string; min_width?: number }[]
    render?: () => void
  },
  root: HTMLElement,
): () => void {
  gantt.config.keep_grid_width = false
  let drag: DragState | null = null

  const onMoveHover = (e: MouseEvent) => {
    if (drag) return
    const cell = (e.target as HTMLElement | null)?.closest?.(
      '.gantt_grid_head_cell',
    ) as HTMLElement | null
    if (!cell || !root.contains(cell)) {
      if (root.style.cursor === 'col-resize') root.style.cursor = ''
      return
    }
    root.style.cursor = nearRightEdge(cell, e.clientX) ? 'col-resize' : ''
  }

  const onDown = (e: MouseEvent) => {
    if (e.button !== 0) return
    const cell = (e.target as HTMLElement | null)?.closest?.(
      '.gantt_grid_head_cell',
    ) as HTMLElement | null
    if (!cell || !root.contains(cell)) return
    if (!nearRightEdge(cell, e.clientX)) return
    const index = columnIndex(root, cell)
    if (index < 0) return
    const cols = gantt.getGridColumns?.() ?? gantt.config.columns ?? []
    const col = cols[index]
    if (!col) return
    e.preventDefault()
    e.stopPropagation()
    const startW = Number(col.width) || cell.getBoundingClientRect().width
    drag = { index, startX: e.clientX, startW }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }

  const onMove = (e: MouseEvent) => {
    if (!drag) return
    const next = drag.startW + (e.clientX - drag.startX)
    setColumnWidth(gantt, drag.index, next)
  }

  const onUp = () => {
    if (!drag) return
    drag = null
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }

  const onDbl = (e: MouseEvent) => {
    const cell = (e.target as HTMLElement | null)?.closest?.(
      '.gantt_grid_head_cell',
    ) as HTMLElement | null
    if (!cell || !root.contains(cell)) return
    if (!nearRightEdge(cell, e.clientX)) return
    const index = columnIndex(root, cell)
    if (index < 0) return
    e.preventDefault()
    e.stopPropagation()
    setColumnWidth(gantt, index, measureColumnWidth(root, index))
  }

  root.addEventListener('mousemove', onMoveHover)
  root.addEventListener('mousedown', onDown, true)
  root.addEventListener('dblclick', onDbl, true)
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)

  return () => {
    root.removeEventListener('mousemove', onMoveHover)
    root.removeEventListener('mousedown', onDown, true)
    root.removeEventListener('dblclick', onDbl, true)
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
    onUp()
    root.style.cursor = ''
  }
}
