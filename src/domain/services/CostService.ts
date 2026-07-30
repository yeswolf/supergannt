import type { Resource } from '../entities/Resource'
import type { Assignment } from '../entities/Assignment'
import type { Task } from '../entities/Task'
import { Money } from '../value-objects/Money'
import type { ResourceId } from '../value-objects/Ids'

export interface ResourceUtilization {
  resourceId: ResourceId
  name: string
  maxUnits: number
  assignedUnits: number
  workHours: number
  cost: Money
  overallocated: boolean
}

export function computeResourceUtilization(
  resources: readonly Resource[],
  assignments: readonly Assignment[],
  tasks: readonly Task[],
  currency: string,
): ResourceUtilization[] {
  const taskById = new Map(tasks.map((t) => [t.id, t]))
  return resources.map((resource) => {
    const mine = assignments.filter((a) => a.resourceId === resource.id)
    const assignedUnits = mine.reduce((s, a) => s + a.units, 0)
    const workHours = mine.reduce((s, a) => {
      if (a.workHours > 0) return s + a.workHours
      const task = taskById.get(a.taskId)
      return s + (task ? task.duration.toHours() * a.units : 0)
    }, 0)
    const labor = resource.standardRate.multiply(workHours)
    const usage = resource.costPerUse.multiply(mine.length)
    const cost = labor.add(usage)
    return {
      resourceId: resource.id,
      name: resource.name,
      maxUnits: resource.maxUnits,
      assignedUnits,
      workHours,
      cost: Money.of(cost.amount, currency),
      overallocated: assignedUnits > resource.maxUnits,
    }
  })
}

export function recalculateTaskCosts(
  tasks: readonly Task[],
  assignments: readonly Assignment[],
  resources: readonly Resource[],
  currency: string,
): Task[] {
  const resourceById = new Map(resources.map((r) => [r.id, r]))
  return tasks.map((task) => {
    const mine = assignments.filter((a) => a.taskId === task.id)
    const assignmentCost = mine.reduce((sum, a) => {
      const resource = resourceById.get(a.resourceId)
      if (!resource) return sum
      const hours = a.workHours > 0 ? a.workHours : task.duration.toHours() * a.units
      return sum + resource.standardRate.amount * hours + resource.costPerUse.amount
    }, 0)
    return task.with({
      cost: Money.of(task.fixedCost.amount + assignmentCost, currency),
    })
  })
}
