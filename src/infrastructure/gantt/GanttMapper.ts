import type { Project } from '../../domain/entities/Project'
import type { LinkType } from '../../domain/entities/Dependency'
import { formatPredecessors } from '../../application/services/PredecessorNotation'
import { formatTaskResourceNames } from '../../application/use-cases/ResourceUseCases'
import { formatSlackHours } from '../../presentation/common/formatSlack'
import {
  applyTaskFilter,
  type TaskFilterSortState,
} from '../../application/services/TaskFilterSortService'

export interface GanttTaskDto {
  id: string
  text: string
  start_date: string
  end_date: string
  duration: number
  progress: number
  parent: string | number
  open: boolean
  type: 'task' | 'project' | 'milestone'
  critical: boolean
  wbs: string
  resources: string
  /** 1-based row index (ProjectLibre ID column). */
  row: number
  percent: number
  cost: string
  predecessors: string
  totalSlack: string
  freeSlack: string
}

export interface GanttLinkDto {
  id: string
  source: string
  target: string
  type: string
}

const LINK_TO_DHTMLX: Record<LinkType, string> = {
  FS: '0',
  SS: '1',
  FF: '2',
  SF: '3',
}

export const DHTMLX_TO_LINK: Record<string, LinkType> = {
  '0': 'FS',
  '1': 'SS',
  '2': 'FF',
  '3': 'SF',
}

/**
 * dhtmlx maps start→finish drag to SF (source=start task, target=finish task).
 * Prefer FS with the finish-side task as predecessor (same endpoints, reverse roles).
 */
export function orientDraggedLink<T extends { source: unknown; target: unknown; type: unknown }>(
  link: T,
): T {
  if (String(link.type) !== '3') return link
  return {
    ...link,
    source: link.target,
    target: link.source,
    type: '0',
  }
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** Local datetime for dhtmlx hour-scale: YYYY-MM-DD HH:mm */
function formatGanttDateTime(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function toGanttData(project: Project): {
  data: GanttTaskDto[]
  links: GanttLinkDto[]
} {
  const data: GanttTaskDto[] = project.tasks.map((task, index) => {
    const hours = task.milestone ? 0 : Math.max(task.duration.toHours(), 1)
    const start = formatGanttDateTime(task.start)
    // Milestones are a point in time — same start/finish for diamond rendering.
    const end = task.milestone ? start : formatGanttDateTime(task.finish)
    return {
      id: task.id,
      text: task.name,
      start_date: start,
      end_date: end,
      duration: hours,
      progress: task.percentComplete / 100,
      parent: task.parentId ?? 0,
      open: !task.collapsed,
      type: task.milestone ? 'milestone' : task.summary ? 'project' : 'task',
      critical: task.critical,
      wbs: task.wbs,
      resources: formatTaskResourceNames(project, task.id),
      row: index + 1,
      percent: task.percentComplete,
      cost: task.cost.format(),
      predecessors: formatPredecessors(project, task.id),
      totalSlack: formatSlackHours(task.totalSlackHours),
      freeSlack: formatSlackHours(task.freeSlackHours),
    }
  })

  const links: GanttLinkDto[] = project.dependencies.map((dep) => ({
    id: dep.id,
    source: dep.predecessorId,
    target: dep.successorId,
    type: LINK_TO_DHTMLX[dep.type],
  }))

  return { data, links }
}

export type GanttTaskFilter = 'all' | 'critical' | 'milestones' | 'incomplete'

/** Keep matching tasks plus ancestor summaries so the tree stays coherent. */
export function filterGanttData(
  project: Project,
  filter: GanttTaskFilter,
): { data: GanttTaskDto[]; links: GanttLinkDto[] } {
  const full = toGanttData(project)
  if (filter === 'all') return full

  const byId = new Map(project.tasks.map((t) => [String(t.id), t]))
  const matches = (taskId: string): boolean => {
    const t = byId.get(taskId)
    if (!t) return false
    if (filter === 'critical') return t.critical
    if (filter === 'milestones') return t.milestone
    if (filter === 'incomplete') return !t.summary && t.percentComplete < 100
    return true
  }

  const keep = new Set<string>()
  for (const t of project.tasks) {
    if (!matches(String(t.id))) continue
    let cur = t as (typeof t) | undefined
    while (cur) {
      keep.add(String(cur.id))
      cur = cur.parentId ? byId.get(String(cur.parentId)) : undefined
    }
  }

  return {
    data: full.data.filter((d) => keep.has(String(d.id))),
    links: full.links.filter(
      (l) => keep.has(String(l.source)) && keep.has(String(l.target)),
    ),
  }
}

/** Filter Gantt data using TaskFilterSortState (workspace-level AutoFilter). */
export function filterGanttDataByState(
  project: Project,
  state: TaskFilterSortState,
): { data: GanttTaskDto[]; links: GanttLinkDto[] } {
  const filteredTasks = applyTaskFilter(project, state)
  const keep = new Set(filteredTasks.map((t) => String(t.id)))

  // Build Gantt DTOs only for the filtered tasks
  const data: GanttTaskDto[] = filteredTasks.map((task, index) => {
    const hours = task.milestone ? 0 : Math.max(task.duration.toHours(), 1)
    const start = formatGanttDateTime(task.start)
    const end = task.milestone ? start : formatGanttDateTime(task.finish)
    return {
      id: task.id,
      text: task.name,
      start_date: start,
      end_date: end,
      duration: hours,
      progress: task.percentComplete / 100,
      parent: 0, // Flat list when filtered — tree parent links would break with partial sets
      open: true,
      type: task.milestone ? 'milestone' : task.summary ? 'project' : 'task',
      critical: task.critical,
      wbs: task.wbs,
      resources: formatTaskResourceNames(project, task.id),
      row: index + 1,
      percent: task.percentComplete,
      cost: task.cost.format(),
      predecessors: formatPredecessors(project, task.id),
      totalSlack: formatSlackHours(task.totalSlackHours),
      freeSlack: formatSlackHours(task.freeSlackHours),
    }
  })

  const links: GanttLinkDto[] = project.dependencies
    .filter(
      (dep) =>
        keep.has(String(dep.predecessorId)) &&
        keep.has(String(dep.successorId)),
    )
    .map((dep) => ({
      id: dep.id,
      source: dep.predecessorId,
      target: dep.successorId,
      type: LINK_TO_DHTMLX[dep.type],
    }))

  return { data, links }
}
