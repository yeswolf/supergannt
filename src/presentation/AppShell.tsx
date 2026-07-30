import { Toolbar } from './components/Toolbar'
import { GanttView } from './components/GanttView'
import { TaskSheetView } from './components/TaskSheetView'
import { ResourceView } from './components/ResourceView'
import { NetworkView } from './components/NetworkView'
import { ReportsView } from './components/ReportsView'
import { WbsView } from './components/WbsView'
import { RbsView } from './components/RbsView'
import { TaskUsageView, ResourceUsageView } from './components/UsageViews'
import { CalendarView } from './components/CalendarView'
import { TaskInformationDialog } from './components/TaskInformationDialog'
import { AssignResourcesDialog } from './components/AssignResourcesDialog'
import { useWorkspaceState } from './state/WorkspaceContext'
import styles from './AppShell.module.css'

const VIEW_LABELS: Record<string, string> = {
  gantt: 'Gantt Chart',
  tasks: 'Task Sheet',
  resources: 'Resource Sheet',
  network: 'Network Diagram',
  wbs: 'WBS',
  rbs: 'RBS',
  taskUsage: 'Task Usage',
  resourceUsage: 'Resource Usage',
  calendar: 'Calendar',
  reports: 'Reports',
}

export function AppShell() {
  const { view, project, statusMessage } = useWorkspaceState()

  return (
    <div className={styles.app}>
      <Toolbar />
      <main className={styles.main}>
        {view === 'gantt' ? <GanttView /> : null}
        {view === 'tasks' ? <TaskSheetView /> : null}
        {view === 'resources' ? <ResourceView /> : null}
        {view === 'network' ? <NetworkView /> : null}
        {view === 'wbs' ? <WbsView /> : null}
        {view === 'rbs' ? <RbsView /> : null}
        {view === 'taskUsage' ? <TaskUsageView /> : null}
        {view === 'resourceUsage' ? <ResourceUsageView /> : null}
        {view === 'calendar' ? <CalendarView /> : null}
        {view === 'reports' ? <ReportsView /> : null}
      </main>
      <footer className={styles.statusBar} role="status">
        <span>
          {statusMessage ?? `${VIEW_LABELS[view] ?? view} · Ready`}
        </span>
        <div className={styles.statusMeta}>
          <span>
            Tasks <strong>{project.tasks.length}</strong>
          </span>
          <span>
            Resources <strong>{project.resources.length}</strong>
          </span>
          <span>
            View <strong>{VIEW_LABELS[view] ?? view}</strong>
          </span>
          {project.dirty ? <span>Unsaved changes</span> : <span>Saved</span>}
        </div>
      </footer>
      <TaskInformationDialog />
      <AssignResourcesDialog />
    </div>
  )
}
