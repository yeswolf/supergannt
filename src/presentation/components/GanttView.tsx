import { useCallback, useEffect, useRef, useState } from 'react'
import gantt from 'dhtmlx-gantt'
import 'dhtmlx-gantt/codebase/dhtmlxgantt.css'
import { toGanttData, DHTMLX_TO_LINK } from '../../infrastructure/gantt/GanttMapper'
import {
  clampZoomIndex,
  DEFAULT_GANTT_ZOOM_INDEX,
  GANTT_ZOOM_LEVELS,
} from '../../infrastructure/gantt/GanttZoomLevels'
import { useWorkspaceDispatch, useWorkspaceState } from '../state/WorkspaceContext'
import styles from './GanttView.module.css'

function applyZoomLevel(index: number): void {
  const level = GANTT_ZOOM_LEVELS[clampZoomIndex(index)]!
  gantt.config.min_column_width = level.minColumnWidth
  gantt.config.scales = level.scales.map((s) => ({
    unit: s.unit,
    step: s.step,
    format: s.format,
  }))
  const api = gantt as typeof gantt & { render?: () => void }
  api.render?.()
}

export function GanttView() {
  const { project, selectedTaskId } = useWorkspaceState()
  const dispatch = useWorkspaceDispatch()
  const containerRef = useRef<HTMLDivElement>(null)
  const readyRef = useRef(false)
  const [zoomIndex, setZoomIndex] = useState(DEFAULT_GANTT_ZOOM_INDEX)
  const zoomIndexRef = useRef(zoomIndex)
  zoomIndexRef.current = zoomIndex

  const setZoom = useCallback((next: number) => {
    const clamped = clampZoomIndex(next)
    setZoomIndex(clamped)
    if (readyRef.current) applyZoomLevel(clamped)
  }, [])

  const zoomIn = useCallback(() => setZoom(zoomIndexRef.current - 1), [setZoom])
  const zoomOut = useCallback(() => setZoom(zoomIndexRef.current + 1), [setZoom])

  useEffect(() => {
    const root = containerRef.current
    if (!root) return

    gantt.plugins({ marker: true })
    gantt.config.date_format = '%Y-%m-%d %H:%i'
    gantt.config.xml_date = '%Y-%m-%d %H:%i'
    gantt.config.duration_unit = 'hour'
    gantt.config.duration_step = 1
    gantt.config.time_step = 60
    gantt.config.order_branch = true
    gantt.config.open_tree_initially = true
    gantt.config.work_time = true
    gantt.config.correct_work_time = true
    gantt.config.row_height = 32
    gantt.config.scale_height = 56
    gantt.config.columns = [
      { name: 'wbs', label: 'WBS', width: 70, resize: true },
      { name: 'text', label: 'Task name', tree: true, width: 200, resize: true },
      {
        name: 'resources',
        label: 'Resources',
        width: 140,
        resize: true,
        template: (task: { resources?: string }) => task.resources?.trim() ?? '',
      },
      { name: 'start_date', label: 'Start', align: 'center', width: 110 },
      { name: 'duration', label: 'Hours', align: 'center', width: 56 },
    ]

    // GPL/CE stubs getTaskType() → always "task", which hides milestone diamonds.
    const ganttAny = gantt as typeof gantt & {
      getTaskType: (typeOrTask: unknown) => string
      config: typeof gantt.config & {
        types: { task: string; project: string; milestone: string }
      }
    }
    ganttAny.getTaskType = (typeOrTask: unknown) => {
      const raw =
        typeOrTask && typeof typeOrTask === 'object' && 'type' in typeOrTask
          ? String((typeOrTask as { type?: string }).type ?? '')
          : String(typeOrTask ?? '')
      if (raw === 'milestone' || raw === ganttAny.config.types.milestone) {
        return ganttAny.config.types.milestone
      }
      if (raw === 'project' || raw === ganttAny.config.types.project) {
        return ganttAny.config.types.project
      }
      return ganttAny.config.types.task
    }

    gantt.templates.task_class = (
      _start: Date,
      _end: Date,
      task: { type?: string; critical?: boolean },
    ) => {
      const classes: string[] = []
      if (task.type === 'milestone') classes.push('super-milestone')
      if (task.critical) classes.push('super-critical')
      return classes.join(' ')
    }

    applyZoomLevel(zoomIndexRef.current)
    gantt.init(root)
    readyRef.current = true

    const onSelect = gantt.attachEvent('onTaskSelected', (id: string) => {
      const additive =
        typeof window !== 'undefined' &&
        (window.event as MouseEvent | undefined)?.ctrlKey === true
      dispatch({
        type: 'selectTask',
        taskId: String(id),
        additive,
      })
      return true
    })
    const onDbl = gantt.attachEvent('onTaskDblClick', (id: string) => {
      dispatch({ type: 'openTaskInfo', taskId: String(id) })
      return false
    })
    const onDrag = gantt.attachEvent(
      'onAfterTaskDrag',
      (id: string, mode: string) => {
        const task = gantt.getTask(id)
        if (mode === 'resize' || mode === 'move') {
          const hours = Math.max(0, Number(task.duration) || 0)
          dispatch({
            type: 'updateTask',
            taskId: String(id),
            patch: {
              start: new Date(task.start_date),
              finish: new Date(task.end_date),
              durationHours: hours,
              percentComplete: Math.round(Number(task.progress) * 100),
            },
          })
        }
        return true
      },
    )
    const onLink = gantt.attachEvent('onAfterLinkAdd', (_id: string, item: {
      source: string
      target: string
      type: string
    }) => {
      dispatch({
        type: 'linkTasks',
        predecessorId: String(item.source),
        successorId: String(item.target),
        linkType: DHTMLX_TO_LINK[String(item.type)] ?? 'FS',
      })
      return true
    })
    const onLinkDelete = gantt.attachEvent('onAfterLinkDelete', (id: string) => {
      dispatch({ type: 'unlinkDependency', dependencyId: String(id) })
      return true
    })

    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      if (e.key === '=' || e.key === '+') {
        e.preventDefault()
        zoomIn()
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault()
        zoomOut()
      }
    }
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      e.preventDefault()
      if (e.deltaY < 0) zoomIn()
      else if (e.deltaY > 0) zoomOut()
    }

    window.addEventListener('keydown', onKey)
    root.addEventListener('wheel', onWheel, { passive: false })
    const onToolbarZoom = (e: Event) => {
      const detail = (e as CustomEvent<'in' | 'out'>).detail
      if (detail === 'in') zoomIn()
      else if (detail === 'out') zoomOut()
    }
    window.addEventListener('supergantt:gantt-zoom', onToolbarZoom)

    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('supergantt:gantt-zoom', onToolbarZoom)
      root.removeEventListener('wheel', onWheel)
      gantt.detachEvent(onSelect)
      gantt.detachEvent(onDbl)
      gantt.detachEvent(onDrag)
      gantt.detachEvent(onLink)
      gantt.detachEvent(onLinkDelete)
      gantt.clearAll()
      readyRef.current = false
    }
  }, [dispatch, zoomIn, zoomOut])

  useEffect(() => {
    if (!readyRef.current) return
    const { data, links } = toGanttData(project)
    gantt.clearAll()
    gantt.parse({ data, links })
    applyZoomLevel(zoomIndexRef.current)
    if (selectedTaskId && gantt.isTaskExists(selectedTaskId)) {
      gantt.selectTask(selectedTaskId)
    }
  }, [project, selectedTaskId])

  const level = GANTT_ZOOM_LEVELS[zoomIndex]!

  return (
    <div className={styles.wrap}>
      <div className={styles.viewBar} role="toolbar" aria-label="Gantt view controls">
        <div className={styles.viewGroup} role="group" aria-label="Zoom">
          <button
            type="button"
            title="Zoom In (Ctrl+=) — finer timescale"
            disabled={zoomIndex <= 0}
            onClick={zoomIn}
          >
            Zoom In
          </button>
          <button
            type="button"
            title="Zoom Out (Ctrl+-) — coarser timescale"
            disabled={zoomIndex >= GANTT_ZOOM_LEVELS.length - 1}
            onClick={zoomOut}
          >
            Zoom Out
          </button>
          <span className={styles.scaleLabel} aria-live="polite">
            Timescale: <strong>{level.label}</strong>
          </span>
        </div>
        <div className={styles.viewGroup} role="group" aria-label="Timescale">
          {GANTT_ZOOM_LEVELS.map((item, i) => (
            <button
              key={item.id}
              type="button"
              className={i === zoomIndex ? styles.scaleActive : undefined}
              title={`Set timescale to ${item.label}`}
              onClick={() => setZoom(i)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <p className={styles.hintInline}>
          Ctrl+wheel or Ctrl+/− · Double-click task to edit
        </p>
      </div>
      <div ref={containerRef} className={styles.chart} role="region" aria-label="Gantt chart" />
    </div>
  )
}
