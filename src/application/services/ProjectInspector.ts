import type { Project } from '../../domain/entities/Project'
import {
  detectCircularDependencies,
  formatCyclePath,
} from '../../domain/services/CircularDependencyDetector'

export interface InspectionIssue {
  readonly type: 'circular_dependency' | 'orphan_dependency' | 'duplicate_dependency' | 'self_dependency'
  readonly message: string
  /** Affected dependency IDs (if applicable) */
  readonly dependencyIds?: readonly string[]
  /** The circular path (for circular_dependency) */
  readonly cyclePath?: readonly string[]
}

/**
 * Inspect a project for data integrity issues:
 * - Circular dependencies
 * - Orphan dependencies (referencing deleted tasks)
 * - Duplicate dependencies (same predecessor → successor pair)
 * - Self-referencing dependencies
 */
export function inspectProject(project: Project): readonly InspectionIssue[] {
  const issues: InspectionIssue[] = []
  const taskIds = new Set(project.tasks.map((t) => t.id))
  const taskMap = new Map(project.tasks.map((t) => [t.id, t.name]))

  // 1. Detect circular dependencies (excluding self-loops, which are
  //    reported separately as self_dependency to avoid double-reporting).
  const cycleResult = detectCircularDependencies(project.dependencies)
  if (cycleResult.hasCycle && cycleResult.cyclePath.length > 0) {
    // A self-loop produces a cycle path like ["A", "A"] — skip those here.
    const isSelfLoop =
      cycleResult.cyclePath.length === 2 &&
      cycleResult.cyclePath[0] === cycleResult.cyclePath[1]
    if (!isSelfLoop) {
      issues.push({
        type: 'circular_dependency',
        message: formatCyclePath(cycleResult.cyclePath, taskMap),
        cyclePath: cycleResult.cyclePath,
      })
    }
  }

  // 2–4. Single pass over dependencies: orphans, self-refs, and bucket duplicates.
  const seen = new Map<string, string[]>() // "pred→succ" key -> dependency IDs
  for (const dep of project.dependencies) {
    // Orphan check
    const predMissing = !taskIds.has(dep.predecessorId)
    const succMissing = !taskIds.has(dep.successorId)
    if (predMissing || succMissing) {
      const predName = predMissing ? `missing-task:${dep.predecessorId}` : taskMap.get(dep.predecessorId) ?? dep.predecessorId
      const succName = succMissing ? `missing-task:${dep.successorId}` : taskMap.get(dep.successorId) ?? dep.successorId
      issues.push({
        type: 'orphan_dependency',
        message: `Orphan dependency: "${predName}" → "${succName}" (task no longer exists)`,
        dependencyIds: [dep.id],
      })
    }

    // Self-reference check
    if (dep.predecessorId === dep.successorId) {
      issues.push({
        type: 'self_dependency',
        message: `Self-referencing dependency: "${taskMap.get(dep.predecessorId) ?? dep.predecessorId}" depends on itself`,
        dependencyIds: [dep.id],
      })
    }

    // Duplicate bucket
    const key = `${dep.predecessorId}→${dep.successorId}`
    const existing = seen.get(key)
    if (existing) {
      existing.push(dep.id)
    } else {
      seen.set(key, [dep.id])
    }
  }

  // Flush duplicate buckets
  for (const [key, depIds] of seen) {
    if (depIds.length > 1) {
      const [pred, succ] = key.split('→')
      const predName = taskMap.get(pred!) ?? pred!
      const succName = taskMap.get(succ!) ?? succ!
      issues.push({
        type: 'duplicate_dependency',
        message: `Duplicate dependency: "${predName}" → "${succName}" (${depIds.length} links)`,
        dependencyIds: depIds,
      })
    }
  }

  return issues
}
