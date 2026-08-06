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

  // 1. Detect circular dependencies
  const cycleResult = detectCircularDependencies(project.dependencies)
  if (cycleResult.hasCycle && cycleResult.cyclePath.length > 0) {
    issues.push({
      type: 'circular_dependency',
      message: formatCyclePath(cycleResult.cyclePath, taskMap),
      cyclePath: cycleResult.cyclePath,
    })
  }

  // 2. Check for orphan dependencies (task no longer exists)
  for (const dep of project.dependencies) {
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
  }

  // 3. Check for self-referencing dependencies
  for (const dep of project.dependencies) {
    if (dep.predecessorId === dep.successorId) {
      issues.push({
        type: 'self_dependency',
        message: `Self-referencing dependency: "${taskMap.get(dep.predecessorId) ?? dep.predecessorId}" depends on itself`,
        dependencyIds: [dep.id],
      })
    }
  }

  // 4. Check for duplicate dependencies (same predecessor → successor pair)
  const seen = new Map<string, string[]>() // key -> dependency IDs
  for (const dep of project.dependencies) {
    const key = `${dep.predecessorId}→${dep.successorId}`
    const existing = seen.get(key)
    if (existing) {
      existing.push(dep.id)
    } else {
      seen.set(key, [dep.id])
    }
  }
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
