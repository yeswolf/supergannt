import type { LinkType } from '../../domain/entities/Dependency'
import type { Project } from '../../domain/entities/Project'
import type { Task } from '../../domain/entities/Task'

export interface ParsedPredecessor {
  /** 1-based task row id (ProjectLibre style) or resolved task id */
  taskId: string
  type: LinkType
  lagHours: number
}

const TOKEN =
  /^\s*(\d+(?:\.\d+)*)\s*(FS|SS|FF|SF)?\s*([+-]\s*\d+(?:\.\d+)?\s*[hdw]?)?\s*$/i

/**
 * Format predecessors like ProjectLibre: `2FS+8h, 1.1SS`.
 * Uses 1-based row index (task order) which matches ProjectLibre ID column.
 */
export function formatPredecessors(project: Project, successorId: string): string {
  return project.dependencies
    .filter((d) => d.successorId === successorId)
    .map((d) => {
      const index = project.tasks.findIndex((t) => t.id === d.predecessorId)
      if (index < 0) return null
      const id = String(index + 1)
      const type = d.type === 'FS' ? '' : d.type
      const lag = d.lag.toHours()
      const lagPart =
        lag === 0 ? '' : lag > 0 ? `+${lag}h` : `${lag}h`
      return `${id}${type}${lagPart}`
    })
    .filter(Boolean)
    .join(',')
}

export function parsePredecessorToken(
  token: string,
  tasks: readonly Task[],
): ParsedPredecessor | null {
  const trimmed = token.trim()
  if (!trimmed) return null
  const match = TOKEN.exec(trimmed)
  if (!match) {
    throw new Error(`Invalid predecessor "${trimmed}". Use e.g. 2FS+8h or 1.2`)
  }
  const ref = match[1]!
  const type = (match[2]?.toUpperCase() as LinkType | undefined) ?? 'FS'
  const lagRaw = (match[3] ?? '').replace(/\s+/g, '')
  let lagHours = 0
  if (lagRaw) {
    const lagMatch = /^([+-]?\d+(?:\.\d+)?)([hdw])?$/i.exec(lagRaw)
    if (!lagMatch) throw new Error(`Invalid lag in "${trimmed}"`)
    const amount = Number(lagMatch[1])
    const unit = (lagMatch[2] ?? 'h').toLowerCase()
    lagHours =
      unit === 'd' ? amount * 8 : unit === 'w' ? amount * 40 : amount
  }

  // Prefer WBS match, then 1-based index
  const byWbs = tasks.find((t) => t.wbs === ref)
  if (byWbs) {
    return { taskId: byWbs.id, type, lagHours }
  }
  const index = Number(ref)
  if (!Number.isInteger(index) || index < 1 || index > tasks.length) {
    throw new Error(`Unknown predecessor task "${ref}"`)
  }
  const task = tasks[index - 1]!
  return { taskId: task.id, type, lagHours }
}

export function parsePredecessorsField(
  value: string,
  tasks: readonly Task[],
): ParsedPredecessor[] {
  if (!value.trim()) return []
  const parts = value.split(/[,;]/).map((p) => p.trim()).filter(Boolean)
  const parsed = parts.map((p) => parsePredecessorToken(p, tasks))
  return parsed.filter((p): p is ParsedPredecessor => p != null)
}
