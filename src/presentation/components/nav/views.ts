import type { AppView } from '../../state/workspace'
import type { RibbonIconName } from '../icons/RibbonIcons'

export type ViewDef = {
  id: AppView
  label: string
  short: string
  icon: RibbonIconName
  group: 'primary' | 'more'
}

/** Shared navigation destinations for desktop rail, mobile tabs, and command palette. */
export const APP_VIEWS: ViewDef[] = [
  { id: 'gantt', label: 'Gantt Chart', short: 'Gantt', icon: 'gantt', group: 'primary' },
  { id: 'tasks', label: 'Task Sheet', short: 'Tasks', icon: 'taskSheet', group: 'primary' },
  { id: 'resources', label: 'Resource Sheet', short: 'Resources', icon: 'resources', group: 'primary' },
  { id: 'network', label: 'Network Diagram', short: 'Network', icon: 'network', group: 'primary' },
  { id: 'wbs', label: 'WBS', short: 'WBS', icon: 'wbs', group: 'more' },
  { id: 'rbs', label: 'RBS', short: 'RBS', icon: 'rbs', group: 'more' },
  { id: 'taskUsage', label: 'Task Usage', short: 'Task use', icon: 'taskUsage', group: 'more' },
  { id: 'resourceUsage', label: 'Resource Usage', short: 'Res use', icon: 'resourceUsage', group: 'more' },
  { id: 'calendar', label: 'Working Time', short: 'Calendar', icon: 'workingTime', group: 'more' },
  {
    id: 'resourceCalendar',
    label: 'Resource Calendar',
    short: 'Res cal',
    icon: 'calendar',
    group: 'more',
  },
  { id: 'histogram', label: 'Resource Histogram', short: 'Histogram', icon: 'histogram', group: 'more' },
  { id: 'reports', label: 'Reports', short: 'Reports', icon: 'reports', group: 'more' },
]

export const PRIMARY_VIEWS = APP_VIEWS.filter((v) => v.group === 'primary')
export const MORE_VIEWS = APP_VIEWS.filter((v) => v.group === 'more')

export function viewLabel(id: AppView): string {
  return APP_VIEWS.find((v) => v.id === id)?.label ?? id
}
