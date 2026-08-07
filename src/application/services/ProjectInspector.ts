import type { Project } from '../../domain/entities/Project'
import type { Dependency } from '../../domain/entities/Dependency'
import { detectCycles } from '../../domain/services/CycleDetector'

export type InspectionSeverity = 'error' | 'warning' | 'info'

export interface InspectionFinding {
  /** Unique stable key for dedup in UI lists. */
  key: string
  severity: InspectionSeverity
  message: string
  /** Extra detail lines shown on expand. */
  detail?: string
  /** Task IDs involved (for navigation/highlight). */
  taskIds: string[]
}

/**
 * Runs all structural inspections on a project and returns findings.
 * Called after every mutation to keep the inspection pane current.
 */
export function inspectProject(project: Project): InspectionFinding[] {
  const findings: InspectionFinding[] = []

  // ── Circular dependencies ────────────────────────────────────────────
  const cycles = detectCycles(project.dependencies)
  for (const cycle of cycles) {
    const taskNames = cycle.taskPath
      .map((id) => project.getTask(id)?.name ?? id)
      .join(' → ')
    findings.push({
      key: `cycle:${[...cycle.taskPath].sort().join(':')}`,
      severity: 'error',
      message: `Circular dependency: ${taskNames}`,
      detail: `Dependency chain: ${cycle.taskPath.join(' → ')}`,
      taskIds: cycle.taskPath,
    })
  }

  // ── Self-referencing dependencies ────────────────────────────────────
  for (const dep of project.dependencies) {
    if (dep.predecessorId === dep.successorId) {
      const task = project.getTask(dep.predecessorId)
      findings.push({
        key: `self-ref:${dep.id}`,
        severity: 'error',
        message: `Task "${task?.name ?? dep.predecessorId}" depends on itself`,
        taskIds: [dep.predecessorId],
      })
    }
  }

  // ── Summary tasks with dependencies ──────────────────────────────────
  for (const task of project.tasks) {
    if (!task.summary) continue
    const deps = project.dependencies.filter(
      (d) => d.predecessorId === task.id || d.successorId === task.id,
    )
    if (deps.length > 0) {
      const names = deps.map((d) => {
        const other =
          d.predecessorId === task.id ? d.successorId : d.predecessorId
        return project.getTask(other)?.name ?? other
      })
      findings.push({
        key: `summary-dep:${task.id}`,
        severity: 'warning',
        message: `Summary task "${task.name}" has dependencies with: ${names.join(', ')}`,
        detail:
          'Summary tasks should not have dependencies — link the child tasks instead.',
        taskIds: [task.id],
      })
    }
  }

  // ── Orphan tasks (no predecessors, no successors, non-summary) ──────
  for (const task of project.tasks) {
    if (task.summary || task.milestone) continue
    const hasPred = project.dependencies.some(
      (d) => d.successorId === task.id,
    )
    const hasSucc = project.dependencies.some(
      (d) => d.predecessorId === task.id,
    )
    if (!hasPred && !hasSucc) {
      findings.push({
        key: `orphan:${task.id}`,
        severity: 'info',
        message: `Task "${task.name}" has no dependencies`,
        detail:
          'Orphan tasks are not linked to any other task. Consider adding predecessors or successors.',
        taskIds: [task.id],
      })
    }
  }

  // ── Duplicate dependencies ───────────────────────────────────────────
  const seen = new Map<string, Dependency[]>()
  for (const dep of project.dependencies) {
    const sig = `${dep.predecessorId}→${dep.successorId}`
    const list = seen.get(sig) ?? []
    list.push(dep)
    seen.set(sig, list)
  }
  for (const [sig, deps] of seen) {
    if (deps.length > 1) {
      const pred = project.getTask(deps[0]!.predecessorId)
      const succ = project.getTask(deps[0]!.successorId)
      findings.push({
        key: `dup-dep:${sig}`,
        severity: 'warning',
        message: `Duplicate dependency: "${pred?.name ?? deps[0]!.predecessorId}" → "${succ?.name ?? deps[0]!.successorId}" (${deps.length} links)`,
        detail: `Dependency IDs: ${deps.map((d) => d.id).join(', ')}`,
        taskIds: [deps[0]!.predecessorId, deps[0]!.successorId],
      })
    }
  }

  return findings
}
