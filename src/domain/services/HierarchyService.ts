import type { Task } from '../entities/Task'
import type { TaskId } from '../value-objects/Ids'

/** Rebuild WBS codes and parent links from outline levels (ProjectLibre-style). */
export function rebuildHierarchy(tasks: readonly Task[]): Task[] {
  const stack: { id: TaskId; level: number; childIndex: number }[] = []
  const parentOf = new Map<TaskId, TaskId | null>()
  const wbsOf = new Map<TaskId, string>()
  const childCounts = new Map<TaskId, number>()

  for (const task of tasks) {
    while (stack.length > 0 && stack[stack.length - 1]!.level >= task.outlineLevel) {
      stack.pop()
    }

    const parent = stack.length > 0 ? stack[stack.length - 1]! : null
    parentOf.set(task.id, parent?.id ?? null)

    if (parent) {
      parent.childIndex += 1
      childCounts.set(parent.id, (childCounts.get(parent.id) ?? 0) + 1)
      const parentWbs = wbsOf.get(parent.id) ?? '1'
      wbsOf.set(task.id, `${parentWbs}.${parent.childIndex}`)
    } else {
      const rootIndex =
        [...wbsOf.values()].filter((w) => !w.includes('.')).length + 1
      wbsOf.set(task.id, String(rootIndex))
    }

    stack.push({ id: task.id, level: task.outlineLevel, childIndex: 0 })
  }

  return tasks.map((task) =>
    task.with({
      parentId: parentOf.get(task.id) ?? null,
      wbs: wbsOf.get(task.id) ?? '1',
      summary: (childCounts.get(task.id) ?? 0) > 0,
    }),
  )
}

export function indentTask(tasks: readonly Task[], taskId: TaskId): Task[] {
  const index = tasks.findIndex((t) => t.id === taskId)
  if (index <= 0) return [...tasks]
  const prev = tasks[index - 1]!
  const task = tasks[index]!
  const nextLevel = Math.min(task.outlineLevel + 1, prev.outlineLevel + 1)
  if (nextLevel === task.outlineLevel) return [...tasks]
  const updated = tasks.map((t, i) =>
    i === index ? t.with({ outlineLevel: nextLevel }) : t,
  )
  return rebuildHierarchy(updated)
}

export function outdentTask(tasks: readonly Task[], taskId: TaskId): Task[] {
  const index = tasks.findIndex((t) => t.id === taskId)
  if (index < 0) return [...tasks]
  const task = tasks[index]!
  if (task.outlineLevel === 0) return [...tasks]
  const updated = tasks.map((t, i) =>
    i === index ? t.with({ outlineLevel: task.outlineLevel - 1 }) : t,
  )
  return rebuildHierarchy(updated)
}
