import { useSyncExternalStore } from 'react'
import {
  DEFAULT_TASK_COLUMNS,
  normalizeTaskColumns,
  type TaskColumnId,
} from './taskColumnDefs'

export const TASK_COLUMNS_STORAGE_KEY = 'supergantt.taskColumns'

type Listener = () => void

let columns: TaskColumnId[] = readStored()
const listeners = new Set<Listener>()

function readStored(): TaskColumnId[] {
  try {
    const raw = localStorage.getItem(TASK_COLUMNS_STORAGE_KEY)
    if (!raw) return [...DEFAULT_TASK_COLUMNS]
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return [...DEFAULT_TASK_COLUMNS]
    return normalizeTaskColumns(parsed.map(String))
  } catch {
    return [...DEFAULT_TASK_COLUMNS]
  }
}

function persist(next: TaskColumnId[]): void {
  try {
    localStorage.setItem(TASK_COLUMNS_STORAGE_KEY, JSON.stringify(next))
  } catch {
    /* ignore quota / private mode */
  }
}

function emit(): void {
  for (const l of listeners) l()
}

export function getTaskColumns(): readonly TaskColumnId[] {
  return columns
}

export function setTaskColumns(next: readonly string[]): void {
  const normalized = normalizeTaskColumns(next)
  if (
    normalized.length === columns.length &&
    normalized.every((id, i) => id === columns[i])
  ) {
    return
  }
  columns = normalized
  persist(columns)
  emit()
}

export function resetTaskColumns(): void {
  setTaskColumns([...DEFAULT_TASK_COLUMNS])
}

export function toggleTaskColumn(id: TaskColumnId): void {
  if (id === 'name') return
  if (columns.includes(id)) {
    setTaskColumns(columns.filter((c) => c !== id))
  } else {
    setTaskColumns([...columns, id])
  }
}

export function moveTaskColumn(id: TaskColumnId, delta: -1 | 1): void {
  const index = columns.indexOf(id)
  if (index < 0) return
  const target = index + delta
  if (target < 0 || target >= columns.length) return
  const next = [...columns]
  const [item] = next.splice(index, 1)
  next.splice(target, 0, item!)
  setTaskColumns(next)
}

export function subscribeTaskColumns(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Re-read from storage (tests / multi-tab). */
export function reloadTaskColumnsFromStorage(): void {
  columns = readStored()
  emit()
}

export function useTaskColumns(): {
  columns: readonly TaskColumnId[]
  setColumns: (next: readonly string[]) => void
  toggle: (id: TaskColumnId) => void
  move: (id: TaskColumnId, delta: -1 | 1) => void
  reset: () => void
} {
  const cols = useSyncExternalStore(
    subscribeTaskColumns,
    getTaskColumns,
    () => DEFAULT_TASK_COLUMNS,
  )
  return {
    columns: cols,
    setColumns: setTaskColumns,
    toggle: toggleTaskColumn,
    move: moveTaskColumn,
    reset: resetTaskColumns,
  }
}
