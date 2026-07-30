import { useEffect, useRef, useState, type ReactNode } from 'react'
import { getDesktopApi } from '../desktop/desktopBridge'
import { openPlanFile } from '../openPlanFile'
import { useWorkspaceDispatch, useWorkspaceState } from '../state/WorkspaceContext'
import type { AppView } from '../state/workspace'
import { Icons, type RibbonIconName } from './icons/RibbonIcons'
import styles from './Toolbar.module.css'

type RibbonTab = 'file' | 'task' | 'resource' | 'project' | 'view'

const VIEWS: { id: AppView; label: string; icon: RibbonIconName }[] = [
  { id: 'gantt', label: 'Gantt Chart', icon: 'gantt' },
  { id: 'tasks', label: 'Task Sheet', icon: 'taskSheet' },
  { id: 'resources', label: 'Resource Sheet', icon: 'resources' },
  { id: 'network', label: 'Network Diagram', icon: 'network' },
  { id: 'wbs', label: 'WBS', icon: 'wbs' },
  { id: 'rbs', label: 'RBS', icon: 'rbs' },
  { id: 'taskUsage', label: 'Task Usage', icon: 'taskUsage' },
  { id: 'resourceUsage', label: 'Resource Usage', icon: 'resourceUsage' },
  { id: 'calendar', label: 'Calendar', icon: 'calendar' },
  { id: 'reports', label: 'Reports', icon: 'reports' },
]

const RIBBON_TABS: { id: RibbonTab; label: string }[] = [
  { id: 'file', label: 'File' },
  { id: 'task', label: 'Task' },
  { id: 'resource', label: 'Resource' },
  { id: 'project', label: 'Project' },
  { id: 'view', label: 'View' },
]

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  URL.revokeObjectURL(url)
}

function Cmd({
  label,
  icon,
  onClick,
  disabled,
  title,
  primary,
  large,
}: {
  label: string
  icon: RibbonIconName
  onClick: () => void
  disabled?: boolean
  title?: string
  primary?: boolean
  large?: boolean
}) {
  const Icon = Icons[icon]
  return (
    <button
      type="button"
      className={[
        primary ? styles.cmdPrimary : styles.cmd,
        large ? styles.cmdLarge : '',
      ]
        .filter(Boolean)
        .join(' ')}
      disabled={disabled}
      title={title ?? label}
      onClick={onClick}
    >
      <span className={styles.cmdIcon}>
        <Icon />
      </span>
      <span className={styles.cmdLabel}>{label}</span>
    </button>
  )
}

function Group({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <div className={styles.group} role="group" aria-label={label}>
      <div className={styles.groupBody}>{children}</div>
      <div className={styles.groupCaption}>{label}</div>
    </div>
  )
}

export function Toolbar() {
  const {
    project,
    view,
    selectedTaskId,
    selectedTaskIds,
    services,
    busyMessage,
  } = useWorkspaceState()
  const dispatch = useWorkspaceDispatch()
  const fileRef = useRef<HTMLInputElement>(null)
  const [ribbon, setRibbon] = useState<RibbonTab>('task')
  const canLink = selectedTaskIds.length >= 2
  const canUnlink = selectedTaskIds.length > 0 || Boolean(selectedTaskId)
  const isBusy = Boolean(busyMessage)

  const onOpen = (file: File) => {
    if (isBusy) return
    void openPlanFile(file, services, dispatch)
  }

  const onSave = async (format: 'mspdi' | 'mpx' | 'mpp' = 'mspdi') => {
    try {
      const result = await services.files.saveFile(project, undefined, format)
      downloadBlob(result.blob, result.fileName)
      dispatch({
        type: 'setProject',
        project: result.project,
        message: `Saved ${result.fileName}`,
      })
    } catch (error) {
      dispatch({
        type: 'setStatus',
        message: error instanceof Error ? error.message : 'Failed to save file',
      })
    }
  }

  const onExportPdf = async () => {
    try {
      const { exportProjectPdf } = await import('../../infrastructure/pdf/exportProjectPdf')
      const blob = await exportProjectPdf(project)
      downloadBlob(blob, `${project.name || 'project'}.pdf`)
      dispatch({ type: 'setStatus', message: `Exported ${project.name || 'project'}.pdf` })
    } catch (error) {
      dispatch({
        type: 'setStatus',
        message: error instanceof Error ? error.message : 'PDF export failed',
      })
    }
  }

  const menuHandlerRef = useRef<(command: string) => void>(() => {})
  menuHandlerRef.current = (command: string) => {
    const ganttZoom = (dir: 'in' | 'out') => {
      window.dispatchEvent(
        new CustomEvent('supergantt:gantt-zoom', { detail: dir }),
      )
    }

    switch (command) {
      case 'file.new.blank':
        dispatch({ type: 'newProject' })
        return
      case 'file.new.sample':
        dispatch({ type: 'loadDemo' })
        return
      case 'file.open':
        if (!isBusy) fileRef.current?.click()
        return
      case 'file.save.mspdi':
        void onSave('mspdi')
        return
      case 'file.save.mpp':
        void onSave('mpp')
        return
      case 'file.save.mpx':
        void onSave('mpx')
        return
      case 'file.exportPdf':
        void onExportPdf()
        return
      case 'task.insert.task':
        dispatch({ type: 'addTask', afterTaskId: selectedTaskId ?? undefined })
        return
      case 'task.insert.milestone':
        dispatch({
          type: 'addMilestone',
          afterTaskId: selectedTaskId ?? undefined,
        })
        return
      case 'task.structure.indent':
        if (selectedTaskId) dispatch({ type: 'indentTask', taskId: selectedTaskId })
        return
      case 'task.structure.outdent':
        if (selectedTaskId) dispatch({ type: 'outdentTask', taskId: selectedTaskId })
        return
      case 'task.structure.delete':
        if (selectedTaskId) dispatch({ type: 'deleteTask', taskId: selectedTaskId })
        return
      case 'task.schedule.link':
        if (canLink) dispatch({ type: 'linkSelection' })
        return
      case 'task.schedule.unlink':
        if (canUnlink) dispatch({ type: 'unlinkSelection' })
        return
      case 'task.schedule.info':
        if (selectedTaskId) dispatch({ type: 'openTaskInfo' })
        return
      case 'task.assign.resources':
      case 'resource.assign.toTask':
        if (selectedTaskId) dispatch({ type: 'openAssignDialog' })
        return
      case 'task.zoom.in':
        ganttZoom('in')
        return
      case 'task.zoom.out':
        ganttZoom('out')
        return
      case 'resource.insert.add':
        dispatch({ type: 'addResource' })
        dispatch({ type: 'setView', view: 'resources' })
        return
      case 'resource.view.resources':
        dispatch({ type: 'setView', view: 'resources' })
        return
      case 'resource.view.resourceUsage':
        dispatch({ type: 'setView', view: 'resourceUsage' })
        return
      case 'resource.view.rbs':
        dispatch({ type: 'setView', view: 'rbs' })
        return
      case 'project.properties.calendar':
        dispatch({ type: 'setView', view: 'calendar' })
        return
      case 'project.schedule.setBaseline':
        dispatch({ type: 'setBaseline' })
        return
      case 'project.schedule.clearBaseline':
        dispatch({ type: 'clearBaseline' })
        return
      case 'project.reports.reports':
        dispatch({ type: 'setView', view: 'reports' })
        return
      default: {
        if (command.startsWith('view.set.')) {
          const viewId = command.slice('view.set.'.length) as AppView
          dispatch({ type: 'setView', view: viewId })
        }
      }
    }
  }

  useEffect(() => {
    const desktop = getDesktopApi()
    if (!desktop?.onMenuCommand) return
    return desktop.onMenuCommand((command) => {
      menuHandlerRef.current(command)
    })
  }, [])

  return (
    <header className={styles.chrome}>
      <div className={styles.titleBar}>
        <div className={styles.brandMark} aria-hidden>
          <Icons.app />
        </div>
        <div className={styles.brand}>SuperGantt</div>
        <div className={styles.titleDivider} />
        <input
          className={styles.projectName}
          value={project.name}
          aria-label="Project name"
          onChange={(e) =>
            dispatch({ type: 'updateProjectInfo', patch: { name: e.target.value } })
          }
        />
        {project.dirty ? <span className={styles.dirty}>● Unsaved</span> : null}
      </div>

      <div className={styles.ribbon}>
        <nav className={styles.ribbonTabs} aria-label="Ribbon tabs">
          {RIBBON_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={ribbon === tab.id ? styles.ribbonTabActive : styles.ribbonTab}
              onClick={() => setRibbon(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        <div className={styles.ribbonBody}>
          {ribbon === 'file' ? (
            <>
              <Group label="New">
                <Cmd icon="blank" label="Blank" large onClick={() => dispatch({ type: 'newProject' })} />
                <Cmd icon="sample" label="Sample" large onClick={() => dispatch({ type: 'loadDemo' })} />
              </Group>
              <Group label="Open">
                <Cmd
                  icon="open"
                  label="Open…"
                  primary
                  large
                  disabled={isBusy}
                  onClick={() => fileRef.current?.click()}
                />
              </Group>
              <Group label="Save">
                <Cmd icon="saveXml" label="Save XML" primary large onClick={() => void onSave('mspdi')} />
                <Cmd icon="saveMpp" label="Save MPP" large onClick={() => void onSave('mpp')} />
                <Cmd icon="saveMpx" label="Save MPX" large onClick={() => void onSave('mpx')} />
                <Cmd icon="reports" label="Export PDF" large onClick={() => void onExportPdf()} />
              </Group>
            </>
          ) : null}

          {ribbon === 'task' ? (
            <>
              <Group label="Insert">
                <Cmd
                  icon="task"
                  label="Task"
                  primary
                  large
                  onClick={() =>
                    dispatch({ type: 'addTask', afterTaskId: selectedTaskId ?? undefined })
                  }
                />
                <Cmd
                  icon="milestone"
                  label="Milestone"
                  large
                  onClick={() =>
                    dispatch({
                      type: 'addMilestone',
                      afterTaskId: selectedTaskId ?? undefined,
                    })
                  }
                />
              </Group>
              <Group label="Structure">
                <Cmd
                  icon="indent"
                  label="Indent"
                  disabled={!selectedTaskId}
                  onClick={() =>
                    selectedTaskId &&
                    dispatch({ type: 'indentTask', taskId: selectedTaskId })
                  }
                />
                <Cmd
                  icon="outdent"
                  label="Outdent"
                  disabled={!selectedTaskId}
                  onClick={() =>
                    selectedTaskId &&
                    dispatch({ type: 'outdentTask', taskId: selectedTaskId })
                  }
                />
                <Cmd
                  icon="delete"
                  label="Delete"
                  disabled={!selectedTaskId}
                  onClick={() =>
                    selectedTaskId &&
                    dispatch({ type: 'deleteTask', taskId: selectedTaskId })
                  }
                />
              </Group>
              <Group label="Schedule">
                <Cmd
                  icon="link"
                  label="Link"
                  title="Link selected tasks (FS)"
                  disabled={!canLink}
                  onClick={() => dispatch({ type: 'linkSelection' })}
                />
                <Cmd
                  icon="unlink"
                  label="Unlink"
                  disabled={!canUnlink}
                  onClick={() => dispatch({ type: 'unlinkSelection' })}
                />
                <Cmd
                  icon="information"
                  label="Information"
                  large
                  disabled={!selectedTaskId}
                  onClick={() => dispatch({ type: 'openTaskInfo' })}
                />
              </Group>
              <Group label="Assign">
                <Cmd
                  icon="resources"
                  label="Resources"
                  large
                  disabled={!selectedTaskId}
                  onClick={() => dispatch({ type: 'openAssignDialog' })}
                />
              </Group>
              {view === 'gantt' ? (
                <Group label="Zoom">
                  <Cmd
                    icon="zoomIn"
                    label="Zoom In"
                    title="Finer timescale (Ctrl+=)"
                    onClick={() =>
                      window.dispatchEvent(
                        new CustomEvent('supergantt:gantt-zoom', { detail: 'in' }),
                      )
                    }
                  />
                  <Cmd
                    icon="zoomOut"
                    label="Zoom Out"
                    title="Coarser timescale (Ctrl+-)"
                    onClick={() =>
                      window.dispatchEvent(
                        new CustomEvent('supergantt:gantt-zoom', { detail: 'out' }),
                      )
                    }
                  />
                </Group>
              ) : null}
            </>
          ) : null}

          {ribbon === 'resource' ? (
            <>
              <Group label="Insert">
                <Cmd
                  icon="addResource"
                  label="Add Resource"
                  primary
                  large
                  onClick={() => {
                    dispatch({ type: 'addResource' })
                    dispatch({ type: 'setView', view: 'resources' })
                  }}
                />
              </Group>
              <Group label="Assign">
                <Cmd
                  icon="resources"
                  label="Assign to Task"
                  large
                  disabled={!selectedTaskId}
                  onClick={() => dispatch({ type: 'openAssignDialog' })}
                />
              </Group>
              <Group label="Views">
                <Cmd
                  icon="resources"
                  label="Resource Sheet"
                  onClick={() => dispatch({ type: 'setView', view: 'resources' })}
                />
                <Cmd
                  icon="resourceUsage"
                  label="Resource Usage"
                  onClick={() => dispatch({ type: 'setView', view: 'resourceUsage' })}
                />
                <Cmd
                  icon="rbs"
                  label="RBS"
                  onClick={() => dispatch({ type: 'setView', view: 'rbs' })}
                />
              </Group>
            </>
          ) : null}

          {ribbon === 'project' ? (
            <>
              <Group label="Properties">
                <Cmd
                  icon="calendar"
                  label="Calendar"
                  large
                  onClick={() => dispatch({ type: 'setView', view: 'calendar' })}
                />
              </Group>
              <Group label="Schedule">
                <Cmd icon="baseline" label="Set Baseline" large onClick={() => dispatch({ type: 'setBaseline' })} />
                <Cmd
                  icon="clearBaseline"
                  label="Clear Baseline"
                  large
                  onClick={() => dispatch({ type: 'clearBaseline' })}
                />
              </Group>
              <Group label="Reports">
                <Cmd
                  icon="reports"
                  label="Reports"
                  large
                  onClick={() => dispatch({ type: 'setView', view: 'reports' })}
                />
              </Group>
            </>
          ) : null}

          {ribbon === 'view' ? (
            <>
              <Group label="Task Views">
                {VIEWS.filter((v) =>
                  ['gantt', 'tasks', 'network', 'wbs', 'taskUsage', 'calendar'].includes(
                    v.id,
                  ),
                ).map((item) => (
                  <Cmd
                    key={item.id}
                    icon={item.icon}
                    label={item.label}
                    primary={view === item.id}
                    onClick={() => dispatch({ type: 'setView', view: item.id })}
                  />
                ))}
              </Group>
              <Group label="Resource Views">
                {VIEWS.filter((v) =>
                  ['resources', 'rbs', 'resourceUsage'].includes(v.id),
                ).map((item) => (
                  <Cmd
                    key={item.id}
                    icon={item.icon}
                    label={item.label}
                    primary={view === item.id}
                    onClick={() => dispatch({ type: 'setView', view: item.id })}
                  />
                ))}
              </Group>
              <Group label="Other">
                <Cmd
                  icon="reports"
                  label="Reports"
                  primary={view === 'reports'}
                  onClick={() => dispatch({ type: 'setView', view: 'reports' })}
                />
              </Group>
            </>
          ) : null}
        </div>
      </div>

      <div className={styles.viewStrip} aria-label="Quick views">
        {VIEWS.map((item) => {
          const Icon = Icons[item.icon]
          return (
            <button
              key={item.id}
              type="button"
              className={view === item.id ? styles.viewChipActive : styles.viewChip}
              onClick={() => {
                dispatch({ type: 'setView', view: item.id })
                if (
                  ['gantt', 'tasks', 'network', 'wbs', 'taskUsage', 'calendar'].includes(
                    item.id,
                  )
                ) {
                  setRibbon('task')
                } else if (
                  ['resources', 'rbs', 'resourceUsage'].includes(item.id)
                ) {
                  setRibbon('resource')
                } else if (item.id === 'reports') {
                  setRibbon('project')
                }
              }}
            >
              <span className={styles.viewChipIcon}>
                <Icon />
              </span>
              {item.label}
            </button>
          )
        })}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept=".xml,.mspdi,.mpp,.mpt,application/xml,text/xml,application/vnd.ms-project"
        className={styles.hidden}
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void onOpen(file)
          e.target.value = ''
        }}
      />
    </header>
  )
}
