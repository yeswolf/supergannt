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

const NARROW_MQ = '(max-width: 820px)'

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

type GanttApi = typeof gantt & {
  render?: () => void
  setSizes?: () => void
  getScrollState?: () => { x: number; y: number }
  scrollTo?: (x: number | null, y: number | null) => void
  getTaskType?: (typeOrTask: unknown) => string
  config: typeof gantt.config & {
    types: { task: string; project: string; milestone: string }
    show_grid?: boolean
    touch?: boolean | string
    touch_drag?: number | boolean
    grid_width?: number
    order_branch?: boolean
    drag_move?: boolean
    drag_resize?: boolean
    scroll_size?: number
    preserve_scroll?: boolean
    drag_timeline?: null | { ignore?: string; useKey?: boolean | string }
  }
}

function applyZoomLevel(index: number): void {
  const level = GANTT_ZOOM_LEVELS[clampZoomIndex(index)]!
  gantt.config.min_column_width = level.minColumnWidth
  gantt.config.scales = level.scales.map((s) => ({
    unit: s.unit,
    step: s.step,
    format: s.format,
  }))
}

function isAndroidUa(): boolean {
  return typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent)
}

function applyGridLayout(opts: {
  narrow: boolean
  android: boolean
  showGrid: boolean
}): void {
  const api = gantt as GanttApi
  const { narrow, android, showGrid } = opts
  // Task tree stays visible on desktop/web; only Android can hide it for chart space.
  const gridOn = android ? showGrid : true

  api.config.show_grid = gridOn
  // Reorder-by-drag fights vertical swipe on phones.
  api.config.order_branch = !narrow && !android
  api.config.scroll_size = narrow || android ? 14 : 8
  api.config.preserve_scroll = true

  if (!gridOn) {
    delete api.config.grid_width
    return
  }

  if (narrow || android) {
    // Compact name-only tree so the chart still has room when the list is open.
    api.config.columns = [
      {
        name: 'text',
        label: 'Task name',
        tree: true,
        width: 200,
        min_width: 120,
        resize: true,
      },
    ]
    api.config.grid_width = 210
    return
  }

  api.config.columns = [
    { name: 'wbs', label: 'WBS', width: 72, min_width: 48, resize: true },
    {
      name: 'text',
      label: 'Task name',
      tree: true,
      width: 240,
      min_width: 120,
      resize: true,
    },
    {
      name: 'resources',
      label: 'Resources',
      width: 160,
      min_width: 80,
      resize: true,
      template: (task: { resources?: string }) => task.resources?.trim() ?? '',
    },
    {
      name: 'start_date',
      label: 'Start',
      align: 'center',
      width: 110,
      min_width: 90,
      resize: true,
    },
    {
      name: 'duration',
      label: 'Hours',
      align: 'center',
      width: 64,
      min_width: 48,
      resize: true,
    },
  ]
  // Explicit width — after scale render() dhtmlx can collapse the grid to 0
  // when grid_width is unset and keep_grid_width is false.
  api.config.grid_width = 646
}

/**
 * Extra pan/scroll on the timeline for touch — dhtmlx often eats swipes as
 * drag starts. One-finger pans when not on a task bar / link handle.
 */
function installTimelineTouchPan(root: HTMLElement): () => void {
  const api = gantt as GanttApi
  let tracking = false
  let startX = 0
  let startY = 0
  let originX = 0
  let originY = 0
  let moved = false

  const ignoreTarget = (t: EventTarget | null) => {
    const el = t as HTMLElement | null
    return Boolean(
      el?.closest?.(
        '.gantt_task_line, .gantt_link_control, .gantt_link_point, .gantt_grid, .gantt_grid_data, .gantt_drag_marker',
      ),
    )
  }

  const onStart = (e: TouchEvent) => {
    if (e.touches.length !== 1) return
    if (ignoreTarget(e.target)) return
    const touch = e.touches[0]!
    tracking = true
    moved = false
    startX = touch.clientX
    startY = touch.clientY
    const pos = api.getScrollState?.() ?? { x: 0, y: 0 }
    originX = pos.x
    originY = pos.y
  }

  const onMove = (e: TouchEvent) => {
    if (!tracking || e.touches.length !== 1) return
    const touch = e.touches[0]!
    const dx = touch.clientX - startX
    const dy = touch.clientY - startY
    if (!moved && Math.hypot(dx, dy) < 8) return
    moved = true
    e.preventDefault()
    api.scrollTo?.(Math.max(0, originX - dx), Math.max(0, originY - dy))
  }

  const onEnd = () => {
    tracking = false
    moved = false
  }

  root.addEventListener('touchstart', onStart, { passive: true })
  root.addEventListener('touchmove', onMove, { passive: false })
  root.addEventListener('touchend', onEnd)
  root.addEventListener('touchcancel', onEnd)

  return () => {
    root.removeEventListener('touchstart', onStart)
    root.removeEventListener('touchmove', onMove)
    root.removeEventListener('touchend', onEnd)
    root.removeEventListener('touchcancel', onEnd)
  }
}

function useNarrowViewport(): boolean {
  const [narrow, setNarrow] = useState(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return false
    }
    return window.matchMedia(NARROW_MQ).matches
  })
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia(NARROW_MQ)
    const onChange = () => setNarrow(mq.matches)
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return narrow
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
  const narrow = useNarrowViewport()
  const android = isAndroidUa()
  /** Android only: task grid hidden by default; toggled from the header. */
  const [showTaskGrid, setShowTaskGrid] = useState(false)
  const showTaskGridRef = useRef(showTaskGrid)
  showTaskGridRef.current = showTaskGrid
  const narrowRef = useRef(narrow)
  narrowRef.current = narrow
  const androidRef = useRef(android)
  androidRef.current = android

  const setZoom = useCallback((next: number) => {
    const clamped = clampZoomIndex(next)
    setZoomIndex(clamped)
    if (!readyRef.current) return
    // Re-apply grid after scale change — plain render() drops the task tree.
    applyZoomLevel(clamped)
    applyGridLayout({
      narrow: narrowRef.current,
      android: androidRef.current,
      showGrid: showTaskGridRef.current,
    })
    const api = gantt as GanttApi
    api.render?.()
    api.setSizes?.()
  }, [])

  const zoomIn = useCallback(() => setZoom(zoomIndexRef.current - 1), [setZoom])
  const zoomOut = useCallback(() => setZoom(zoomIndexRef.current + 1), [setZoom])

  const refreshLayout = useCallback(() => {
    if (!readyRef.current) return
    applyZoomLevel(zoomIndexRef.current)
    applyGridLayout({
      narrow: narrowRef.current,
      android: androidRef.current,
      showGrid: showTaskGridRef.current,
    })
    const api = gantt as GanttApi
    api.render?.()
    api.setSizes?.()
  }, [])

  useEffect(() => {
    refreshLayout()
  }, [narrow, showTaskGrid, refreshLayout])

  useEffect(() => {
    const root = containerRef.current
    if (!root) return

    const api = gantt as GanttApi

    try {
      gantt.plugins({ marker: true, drag_timeline: true })
    } catch {
      gantt.plugins({ marker: true })
    }

    gantt.config.date_format = '%Y-%m-%d %H:%i'
    gantt.config.xml_date = '%Y-%m-%d %H:%i'
    gantt.config.duration_unit = 'hour'
    gantt.config.duration_step = 1
    gantt.config.time_step = 60
    gantt.config.open_tree_initially = true
    gantt.config.work_time = true
    gantt.config.correct_work_time = true
    // Force mobile touch handlers (tablets often report as desktop UA).
    // Long-press before drag so a swipe can scroll/pan.
    api.config.touch = 'force'
    api.config.touch_drag = 750
    api.config.drag_timeline = {
      ignore: '.gantt_task_line, .gantt_task_link, .gantt_link_control',
      useKey: false,
    }
    // Touch rows; bars fill most of the row. Milestone diamonds clamped in CSS.
    gantt.config.row_height = 44
    gantt.config.bar_height = 34
    gantt.config.bar_height_padding = 5
    gantt.config.scale_height = 44
    gantt.config.min_task_grid_row_height = 40

    applyGridLayout({
      narrow: narrowRef.current,
      android: androidRef.current,
      showGrid: showTaskGridRef.current,
    })

    // GPL/CE stubs getTaskType() → always "task", which hides milestone diamonds.
    api.getTaskType = (typeOrTask: unknown) => {
      const raw =
        typeOrTask && typeof typeOrTask === 'object' && 'type' in typeOrTask
          ? String((typeOrTask as { type?: string }).type ?? '')
          : String(typeOrTask ?? '')
      if (raw === 'milestone' || raw === api.config.types.milestone) {
        return api.config.types.milestone
      }
      if (raw === 'project' || raw === api.config.types.project) {
        return api.config.types.project
      }
      return api.config.types.task
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
    const detachTouchPan = installTimelineTouchPan(root)

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
      detachTouchPan()
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
    applyGridLayout({
      narrow: narrowRef.current,
      android: androidRef.current,
      showGrid: showTaskGridRef.current,
    })
    const api = gantt as GanttApi
    api.render?.()
    api.setSizes?.()
    if (selectedTaskId && gantt.isTaskExists(selectedTaskId)) {
      gantt.selectTask(selectedTaskId)
    }
  }, [project, selectedTaskId, taskFilter])

  const level = GANTT_ZOOM_LEVELS[zoomIndex]!

  return (
    <div
      className={`${styles.wrap}${narrow ? ` ${styles.narrow}` : ''}${
        android ? ` ${styles.android}` : ''
      }${showTaskGrid ? ` ${styles.gridOpen}` : ''}`}
    >
      <ViewHeader
        title="Gantt Chart"
        leading={
          <>
            {android ? (
              <>
                <IconAction
                  icon="taskSheet"
                  label={showTaskGrid ? 'Hide task list' : 'Show task list'}
                  pressed={showTaskGrid}
                  onClick={() => setShowTaskGrid((v) => !v)}
                />
                <ViewHeaderSep />
              </>
            ) : null}
            <select
              className={styles.scaleSelect}
              aria-label="Timescale"
              value={level.id}
              onChange={(e) => {
                const idx = GANTT_ZOOM_LEVELS.findIndex((item) => item.id === e.target.value)
                if (idx >= 0) setZoom(idx)
              }}
            >
              {GANTT_ZOOM_LEVELS.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
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
      <div
        ref={containerRef}
        className={styles.chart}
        role="region"
        aria-label="Gantt chart"
      />
    </div>
  )
}
