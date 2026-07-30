import type { Project } from '../../domain/entities/Project'
import { computeResourceUtilization } from '../../domain/services/CostService'

export interface NetworkNode {
  id: string
  name: string
  earlyStart: string
  earlyFinish: string
  critical: boolean
  milestone: boolean
}

export interface NetworkEdge {
  id: string
  from: string
  to: string
  type: string
}

export function toNetworkDiagram(project: Project): {
  nodes: NetworkNode[]
  edges: NetworkEdge[]
} {
  const nodes = project.tasks
    .filter((t) => !t.summary)
    .map((t) => ({
      id: t.id,
      name: t.name,
      earlyStart: t.start.toISOString().slice(0, 10),
      earlyFinish: t.finish.toISOString().slice(0, 10),
      critical: t.critical,
      milestone: t.milestone,
    }))

  const nodeIds = new Set(nodes.map((n) => n.id))
  const edges = project.dependencies
    .filter((d) => nodeIds.has(d.predecessorId) && nodeIds.has(d.successorId))
    .map((d) => ({
      id: d.id,
      from: d.predecessorId,
      to: d.successorId,
      type: d.type,
    }))

  return { nodes, edges }
}

export function toResourceSheet(project: Project) {
  return computeResourceUtilization(
    project.resources,
    project.assignments,
    project.tasks,
    project.currency,
  )
}

export interface EarnedValueSnapshot {
  plannedValue: number
  earnedValue: number
  actualCost: number
  scheduleVariance: number
  costVariance: number
  spi: number
  cpi: number
}

export function computeEarnedValue(project: Project): EarnedValueSnapshot {
  const tasks = project.tasks.filter((t) => !t.summary)
  const budget = tasks.reduce((s, t) => s + t.cost.amount, 0) || 1
  const plannedValue = tasks.reduce((s, t) => {
    const baselineCost = t.baseline?.cost.amount ?? t.cost.amount
    return s + baselineCost
  }, 0)
  const earnedValue = tasks.reduce(
    (s, t) => s + (t.baseline?.cost.amount ?? t.cost.amount) * (t.percentComplete / 100),
    0,
  )
  const actualCost = tasks.reduce(
    (s, t) => s + t.cost.amount * (t.percentComplete / 100),
    0,
  )
  return {
    plannedValue,
    earnedValue,
    actualCost,
    scheduleVariance: earnedValue - plannedValue,
    costVariance: earnedValue - actualCost,
    spi: plannedValue === 0 ? 1 : earnedValue / plannedValue,
    cpi: actualCost === 0 ? 1 : earnedValue / actualCost,
    // budget kept for potential reports
    ...(budget > 0 ? {} : {}),
  }
}
