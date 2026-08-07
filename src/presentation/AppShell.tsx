import type { DragEvent } from 'react'
import { useEffect } from 'react'
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
import { RecoveryBanner } from './components/RecoveryBanner'
import { useAutoSave } from './hooks/useAutoSave'
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

  // Activate auto-save polling.
  useAutoSave()

  // On mount, check for a crash-recovery snapshot. Only offer recovery
  // when the snapshot belongs to the currently-open file.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const meta = await services.files.getAutoSnapshotMetadata()
      if (cancelled || !meta) return
      // Guard against a stale snapshot from a different file (e.g. PlanA's
      // snapshot surfacing when PlanB is opened).
      if (meta.fileName && project.fileName && meta.fileName !== project.fileName) {
        return
      }
      dispatch({ type: 'setRecoverySnapshot', snapshot: meta })
    })()
    return () => { cancelled = true }
  }, [services.files, dispatch, project.fileName])

  const { autoSave } = useWorkspaceState()

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
      <RecoveryBanner />
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
          {autoSave.quotaWarning ? (
            <span title="Storage near quota — auto-save skipped">⚠ Storage full</span>
          ) : autoSave.status === 'saving' ? (
            <span>Saving…</span>
          ) : autoSave.status === 'saved' ? (
            <span>Auto-saved</span>
          ) : autoSave.dirty ? (
            <span>Unsaved changes</span>
          ) : (
            <span>Saved</span>
          )}
        </div>
      </footer>
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
