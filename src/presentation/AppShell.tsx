import type { DragEvent } from 'react'
import { AppChrome } from './components/AppChrome'
import { GanttView } from './components/GanttView'
import { TaskSheetView } from './components/TaskSheetView'
import { ResourceView } from './components/ResourceView'
import { NetworkView } from './components/NetworkView'
import { ReportsView } from './components/ReportsView'
import { WbsView } from './components/WbsView'
import { RbsView } from './components/RbsView'
import { TaskUsageView, ResourceUsageView } from './components/UsageViews'
import { CalendarView } from './components/CalendarView'
import { ResourceCalendarView } from './components/ResourceCalendarView'
import { TaskInformationDialog } from './components/TaskInformationDialog'
import { AssignResourcesDialog } from './components/AssignResourcesDialog'
import { InspectionPane } from './components/InspectionPane'
import { openPlanFile } from './openPlanFile'
import { viewLabel } from './components/nav/views'
import { useWorkspaceDispatch, useWorkspaceState } from './state/WorkspaceContext'
import styles from './AppShell.module.css'

function isFileDrag(e: DragEvent): boolean {
  return Array.from(e.dataTransfer.types).includes('Files')
}

export function AppShell() {
  const { view, project, statusMessage, busyMessage, services } = useWorkspaceState()
  const dispatch = useWorkspaceDispatch()

  return (
    <div
      className={styles.app}
      aria-busy={busyMessage ? true : undefined}
      onDragOver={(e) => {
        if (!isFileDrag(e)) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
      }}
      onDrop={(e) => {
        if (!isFileDrag(e)) return
        e.preventDefault()
        if (busyMessage) return
        const file = e.dataTransfer.files?.[0]
        if (file) void openPlanFile(file, services, dispatch)
      }}
    >
      <AppChrome />
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
        {view === 'resourceCalendar' ? <ResourceCalendarView /> : null}
        {view === 'reports' ? <ReportsView /> : null}
      </main>
      <footer className={styles.statusBar} role="status">
        <span>
          {busyMessage ?? statusMessage ?? `${viewLabel(view)} · Ready`}
        </span>
        <div className={styles.statusMeta}>
          <span>
            Tasks <strong>{project.tasks.length}</strong>
          </span>
          <span>
            Resources <strong>{project.resources.length}</strong>
          </span>
          <span>
            View <strong>{viewLabel(view)}</strong>
          </span>
          {project.dirty ? <span>Unsaved changes</span> : <span>Saved</span>}
        </div>
      </footer>
      <InspectionPane />
      <TaskInformationDialog />
      <AssignResourcesDialog />
      {busyMessage ? (
        <div className={styles.busyOverlay} role="alertdialog" aria-live="assertive" aria-busy="true">
          <div className={styles.busyCard}>
            <div className={styles.busySpinner} aria-hidden />
            <p className={styles.busyTitle}>Opening plan</p>
            <p className={styles.busyDetail}>{busyMessage}</p>
          </div>
        </div>
      ) : null}
    </div>
  )
}
