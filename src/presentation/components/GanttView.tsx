import { useCallback, useEffect, useRef, useState } from 'react'
import gantt from 'dhtmlx-gantt'
import 'dhtmlx-gantt/codebase/dhtmlxgantt.css'
import {
  filterGanttData,
  DHTMLX_TO_LINK,
  type GanttTaskFilter,
} from '../../infrastructure/gantt/GanttMapper'
import {
  clampZoomIndex,
  DEFAULT_GANTT_ZOOM_INDEX,
  GANTT_ZOOM_LEVELS,
} from '../../infrastructure/gantt/GanttZoomLevels'
import { installGanttColumnResize } from '../../infrastructure/gantt/ganttColumnResize'
import { useWorkspaceDispatch, useWorkspaceState } from '../state/WorkspaceContext'
import { IconAction, IconActionGroup } from './IconAction'
import { ViewHeader, ViewHeaderSep } from './ViewHeader'
import styles from './GanttView.module.css'

const SCALE_GLYPH: Record<string, string> = {
  hours: 'H',
  days: 'D',
  threedays: '3D',
  week: 'W',
  month: 'M',
  quarter: 'Q',
  year: 'Y',
}

const FILTERS: {
  id: GanttTaskFilter
  label: string
  icon: 'allTasks' | 'critical' | 'milestone' | 'incomplete'
}[] = [
  { id: 'all', label: 'All tasks', icon: 'allTasks' },
  { id: 'critical', label: 'Critical', icon: 'critical' },
  { id: 'milestones', label: 'Milestones', icon: 'milestone' },
  { id: 'incomplete', label: 'Incomplete', icon: 'incomplete' },
]

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
  const [taskFilter, setTaskFilter] = useState<GanttTaskFilter>('all')

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
    // Force mobile touch handlers (tablets often report as desktop UA).
    // Long-press threshold so a swipe scrolls instead of starting a drag.
    gantt.config.touch = 'force'
    gantt.config.touch_drag = 500
    // Touch rows; bars fill most of the row. Milestone diamonds clamped in CSS.
    gantt.config.row_height = 44
    gantt.config.bar_height = 34
    gantt.config.bar_height_padding = 5
    gantt.config.scale_height = 44
    gantt.config.min_task_grid_row_height = 40

    const applyColumns = () => {
      const narrow = window.matchMedia('(max-width: 820px)').matches
      gantt.config.columns = [
        {
          name: 'wbs',
          label: 'WBS',
          width: 72,
          min_width: 48,
          resize: true,
          hide: narrow,
        },
        {
          name: 'text',
          label: 'Task name',
          tree: true,
          width: narrow ? 168 : 240,
          min_width: 96,
          resize: true,
        },
        {
          name: 'resources',
          label: 'Resources',
          width: 160,
          min_width: 80,
          resize: true,
          hide: narrow,
          template: (task: { resources?: string }) => task.resources?.trim() ?? '',
        },
        {
          name: 'start_date',
          label: 'Start',
          align: 'center',
          width: narrow ? 96 : 110,
          min_width: 80,
          resize: true,
        },
        {
          name: 'duration',
          label: 'Hours',
          align: 'center',
          width: 64,
          min_width: 48,
          resize: true,
          hide: narrow,
        },
      ]
      if (narrow) {
        gantt.config.grid_width = 280
      } else {
        delete (gantt.config as { grid_width?: number }).grid_width
      }
    }
    applyColumns()
    const mq = window.matchMedia('(max-width: 820px)')
    const onMq = () => {
      applyColumns()
      if (readyRef.current) {
        const api = gantt as typeof gantt & { render?: () => void; setSizes?: () => void }
        api.render?.()
        api.setSizes?.()
      }
    }
    mq.addEventListener('change', onMq)

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
    // CE build ignores columns[].resize (PRO). Install our own grid column drag-resize.
    const detachColResize = installGanttColumnResize(gantt, root)

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
    const onToolbarZoom = (e: Event) => {
      const detail = (e as CustomEvent<'in' | 'out'>).detail
      if (detail === 'in') zoomIn()
      else if (detail === 'out') zoomOut()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('supergantt:gantt-zoom', onToolbarZoom)
    root.addEventListener('wheel', onWheel, { passive: false })

    return () => {
      mq.removeEventListener('change', onMq)
      detachColResize()
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
    const { data, links } = filterGanttData(project, taskFilter)
    gantt.clearAll()
    gantt.parse({ data, links })
    applyZoomLevel(zoomIndexRef.current)
    if (selectedTaskId && gantt.isTaskExists(selectedTaskId)) {
      gantt.selectTask(selectedTaskId)
    }
  }, [project, selectedTaskId, taskFilter])

  const level = GANTT_ZOOM_LEVELS[zoomIndex]!

  return (
    <div className={styles.wrap}>
      <ViewHeader
        title="Gantt Chart"
        leading={
          <>
            <IconActionGroup label="Timescale">
              {GANTT_ZOOM_LEVELS.map((item, i) => (
                <IconAction
                  key={item.id}
                  label={item.label}
                  glyph={SCALE_GLYPH[item.id] ?? item.label.slice(0, 1)}
                  pressed={i === zoomIndex}
                  onClick={() => setZoom(i)}
                />
              ))}
            </IconActionGroup>
            <span className={styles.scaleLabel} aria-live="polite">
              {level.label}
            </span>
            <IconActionGroup label="Task filter">
              {FILTERS.map((f) => (
                <IconAction
                  key={f.id}
                  label={f.label}
                  icon={f.icon}
                  pressed={taskFilter === f.id}
                  onClick={() => setTaskFilter(f.id)}
                />
              ))}
            </IconActionGroup>
            <ViewHeaderSep />
          </>
        }
      />
      <div ref={containerRef} className={styles.chart} role="region" aria-label="Gantt chart" />
    </div>
  )
}
