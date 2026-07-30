import type { Project } from '../../domain/entities/Project'
import type { LinkType } from '../../domain/entities/Dependency'
import { formatTaskResourceNames } from '../../application/use-cases/ResourceUseCases'

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
  const data: GanttTaskDto[] = project.tasks.map((task) => {
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
