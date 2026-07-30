import type { AppView } from '../state/workspace'

export type DesktopMenuCommand =
  | 'file.new.blank'
  | 'file.new.sample'
  | 'file.open'
  | 'file.save.mspdi'
  | 'file.save.mpp'
  | 'file.save.mpx'
  | 'file.exportPdf'
  | 'task.insert.task'
  | 'task.insert.milestone'
  | 'task.structure.indent'
  | 'task.structure.outdent'
  | 'task.structure.delete'
  | 'task.schedule.link'
  | 'task.schedule.unlink'
  | 'task.schedule.info'
  | 'task.assign.resources'
  | 'task.zoom.in'
  | 'task.zoom.out'
  | 'resource.insert.add'
  | 'resource.assign.toTask'
  | 'resource.view.resources'
  | 'resource.view.resourceUsage'
  | 'resource.view.rbs'
  | 'project.properties.calendar'
  | 'project.schedule.setBaseline'
  | 'project.schedule.clearBaseline'
  | 'project.reports.reports'
  | `view.set.${AppView}`

export type SuperGanttDesktopApi = {
  platform: string
  isDesktop: true
  onMenuCommand: (handler: (command: string) => void) => () => void
}

declare global {
  interface Window {
    superGanttDesktop?: SuperGanttDesktopApi
  }
}

export function getDesktopApi(): SuperGanttDesktopApi | undefined {
  return typeof window !== 'undefined' ? window.superGanttDesktop : undefined
}
