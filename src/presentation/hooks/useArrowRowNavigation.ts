import { useEffect, useRef } from 'react'
import { adjacentVisibleTaskId } from '../../infrastructure/gantt/ganttArrowNav'
import { isEditableKeyboardTarget } from '../projectShortcuts'

/**
 * ↑/↓ moves selection through an ordered id list (Task Sheet, Resources, WBS, …).
 * Skips when typing in fields or when Alt/Shift/Ctrl are held (indent chords, etc.).
 */
export function useArrowRowNavigation(opts: {
  ids: readonly string[]
  selectedId: string | null
  onSelect: (id: string) => void
  /** Scroll the selected row into view via `[data-row-id]`. */
  scroll?: boolean
}): void {
  const idsRef = useRef(opts.ids)
  idsRef.current = opts.ids
  const selectedRef = useRef(opts.selectedId)
  selectedRef.current = opts.selectedId
  const onSelectRef = useRef(opts.onSelect)
  onSelectRef.current = opts.onSelect
  const scroll = opts.scroll !== false

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
      if (e.altKey || e.shiftKey || e.ctrlKey || e.metaKey) return
      if (e.isComposing) return
      if (isEditableKeyboardTarget(e.target)) return

      const ids = idsRef.current
      if (ids.length === 0) return

      e.preventDefault()
      const nextId = adjacentVisibleTaskId({
        currentId: selectedRef.current,
        direction: e.key === 'ArrowDown' ? 1 : -1,
        visibleCount: ids.length,
        taskIdAt: (index) => ids[index] ?? null,
      })
      if (!nextId || nextId === selectedRef.current) return
      onSelectRef.current(nextId)
      if (scroll) {
        requestAnimationFrame(() => {
          document
            .querySelector(`[data-row-id="${CSS.escape(nextId)}"]`)
            ?.scrollIntoView({ block: 'nearest' })
        })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [scroll])
}
