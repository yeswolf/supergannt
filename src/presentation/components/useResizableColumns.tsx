import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react'
import styles from './ColumnResize.module.css'

const MIN_COL_W = 48

function measureTableColumns(table: HTMLTableElement): number[] {
  const headerCells = table.tHead?.rows[0]?.cells
  if (!headerCells?.length) return []

  const prevLayout = table.style.tableLayout
  const prevWidth = table.style.width
  table.style.tableLayout = 'auto'
  table.style.width = 'max-content'
  table.removeAttribute('data-cols-ready')

  const controls = Array.from(
    table.querySelectorAll<HTMLElement>('input, select, button'),
  )
  const prev = controls.map((el) => ({
    el,
    width: el.style.width,
    minWidth: el.style.minWidth,
  }))
  for (const el of controls) {
    el.style.width = 'auto'
    el.style.minWidth = '0'
    if (el instanceof HTMLInputElement && (el.type === 'text' || el.type === '')) {
      const len = Math.max(el.value.length, el.placeholder?.length ?? 0, 4)
      el.style.width = `${len}ch`
    }
  }

  const widths: number[] = []
  for (let i = 0; i < headerCells.length; i += 1) {
    let max = headerCells[i]!.scrollWidth
    for (const body of Array.from(table.tBodies)) {
      for (const row of Array.from(body.rows)) {
        const cell = row.cells[i]
        if (cell) max = Math.max(max, cell.scrollWidth)
      }
    }
    widths.push(Math.max(MIN_COL_W, Math.ceil(max) + 8))
  }

  for (const p of prev) {
    p.el.style.width = p.width
    p.el.style.minWidth = p.minWidth
  }
  table.style.tableLayout = prevLayout
  table.style.width = prevWidth
  return widths
}

export function useResizableColumns(remeasureKey: unknown = 0) {
  const tableRef = useRef<HTMLTableElement>(null)
  const [widths, setWidths] = useState<number[] | null>(null)
  const dragRef = useRef<{ index: number; startX: number; startW: number } | null>(
    null,
  )

  const remeasure = useCallback(() => {
    const table = tableRef.current
    if (!table) return
    const next = measureTableColumns(table)
    if (next.length) {
      setWidths(next)
      table.setAttribute('data-cols-ready', '')
    }
  }, [])

  useLayoutEffect(() => {
    setWidths(null)
  }, [remeasureKey])

  useLayoutEffect(() => {
    const table = tableRef.current
    if (!table) return
    const colCount = table.tHead?.rows[0]?.cells.length ?? 0
    if (!colCount) return
    if (widths && widths.length === colCount) {
      table.setAttribute('data-cols-ready', '')
      return
    }
    remeasure()
  }, [remeasureKey, widths, remeasure])

  const onResizeStart = useCallback(
    (index: number, clientX: number) => {
      const table = tableRef.current
      if (!table) return
      const base = widths ?? measureTableColumns(table)
      if (!base[index]) return
      setWidths(base)
      table.setAttribute('data-cols-ready', '')
      dragRef.current = { index, startX: clientX, startW: base[index]! }

      const onMove = (e: MouseEvent) => {
        const drag = dragRef.current
        if (!drag) return
        const nextW = Math.max(MIN_COL_W, drag.startW + (e.clientX - drag.startX))
        setWidths((prev) => {
          if (!prev) return prev
          const copy = [...prev]
          copy[drag.index] = nextW
          return copy
        })
      }
      const onUp = () => {
        dragRef.current = null
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
    },
    [widths],
  )

  const onResizeAuto = useCallback(
    (index: number) => {
      const table = tableRef.current
      if (!table) return
      const measured = measureTableColumns(table)
      setWidths((prev) => {
        const base = prev ?? measured
        const copy = [...base]
        if (measured[index] != null) copy[index] = measured[index]!
        return copy
      })
      table.setAttribute('data-cols-ready', '')
    },
    [],
  )

  const colgroup =
    widths && widths.length > 0 ? (
      <colgroup>
        {widths.map((w, i) => (
          <col key={i} style={{ width: w, minWidth: w }} />
        ))}
      </colgroup>
    ) : null

  return {
    tableRef: tableRef as RefObject<HTMLTableElement>,
    colgroup,
    onResizeStart,
    onResizeAuto,
    remeasure,
  }
}

export function ColumnHeader({
  children,
  index,
  onResizeStart,
  onResizeAuto,
  resizable = true,
}: {
  children?: ReactNode
  index: number
  onResizeStart: (index: number, clientX: number) => void
  onResizeAuto?: (index: number) => void
  resizable?: boolean
}) {
  return (
    <th className={styles.th}>
      <span className={styles.label}>{children}</span>
      {resizable ? (
        <span
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize column"
          title="Drag to resize · Double-click to fit"
          className={styles.handle}
          onMouseDown={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onResizeStart(index, e.clientX)
          }}
          onDoubleClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onResizeAuto?.(index)
          }}
        />
      ) : null}
    </th>
  )
}
