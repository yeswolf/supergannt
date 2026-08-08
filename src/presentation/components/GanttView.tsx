import { useCallback, useEffect, useRef, useState } from 'react'
import gantt from 'dhtmlx-gantt'
import 'dhtmlx-gantt/codebase/dhtmlxgantt.css'
import * as DependencyUseCases from '../../application/use-cases/DependencyUseCases'
import {
  filterGanttData,
  filterGanttDataByState,
  DHTMLX_TO_LINK,
  orientDraggedLink,
  type GanttTaskFilter,
} from '../../infrastructure/gantt/GanttMapper'
import {
  clampZoomIndex,
  DEFAULT_GANTT_ZOOM_INDEX,
  GANTT_ZOOM_LEVELS,
} from '../../infrastructure/gantt/GanttZoomLevels'
import { installGanttColumnResize } from '../../infrastructure/gantt/ganttColumnResize'
import { adjacentVisibleTaskId } from '../../infrastructure/gantt/ganttArrowNav'
import { taskIdFromTimelineEmptyClick } from '../../infrastructure/gantt/timelineRowSelect'
import { isEditableKeyboardTarget } from '../projectShortcuts'
import { useWorkspaceDispatch, useWorkspaceState } from '../state/WorkspaceContext'
import { buildGanttTaskColumns } from '../taskColumns/buildGanttTaskColumns'
import { TaskColumnsDialog } from '../taskColumns/TaskColumnsDialog'
import { useTaskColumns } from '../taskColumns/taskColumnStore'
import type { TaskColumnId } from '../taskColumns/taskColumnDefs'
import { IconAction, IconActionGroup } from './IconAction'
import { ViewHeader, ViewHeaderSep } from './ViewHeader'
import { FilterBar } from './FilterBar'
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
  deleteLink?: (id: string) => void
  ext?: {
    inlineEditors?: {
      attachEvent?: (name: string, fn: (...args: unknown[]) => unknown) => string
      detachEvent?: (id: string) => void
    }
  }
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
  taskColumns: readonly TaskColumnId[]
}): void {
  const api = gantt as GanttApi
  const { narrow, android, showGrid, taskColumns } = opts
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
    const { columns, gridWidth } = buildGanttTaskColumns(['name'])
    api.config.columns = columns
    api.config.grid_width = Math.max(gridWidth, 210)
    return
  }

  const { columns, gridWidth } = buildGanttTaskColumns(taskColumns)
  api.config.columns = columns
  // Explicit width — after scale render() dhtmlx can collapse the grid to 0
  // when grid_width is unset and keep_grid_width is false.
  api.config.grid_width = gridWidth
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
  const { project, selectedTaskId, services, taskFilterSort } = useWorkspaceState()
  const dispatch = useWorkspaceDispatch()
  const { columns: taskColumns } = useTaskColumns()
  const [columnsOpen, setColumnsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const readyRef = useRef(false)
  /** Ignore dhtmlx link/task events while we clearAll+parse from React state. */
  const syncingFromProjectRef = useRef(false)
  const projectRef = useRef(project)
  projectRef.current = project
  const idsRef = useRef(services.ids)
  idsRef.current = services.ids
  const taskFilterRef = useRef<GanttTaskFilter>('all')
  const taskFilterSortRef = useRef(taskFilterSort)
  taskFilterSortRef.current = taskFilterSort
  /** Previous taskFilterSort snapshot — avoids clearAll+parse when the
   *  reducer spreads a new reference with identical filter/sort/group state. */
  const prevFilterSortRef = useRef<string>('')
  const [zoomIndex, setZoomIndex] = useState(DEFAULT_GANTT_ZOOM_INDEX)
  const zoomIndexRef = useRef(zoomIndex)
  zoomIndexRef.current = zoomIndex
  const [taskFilter, setTaskFilter] = useState<GanttTaskFilter>('all')
  taskFilterRef.current = taskFilter
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
  const selectedTaskIdRef = useRef(selectedTaskId)
  selectedTaskIdRef.current = selectedTaskId
  const taskColumnsRef = useRef(taskColumns)
  taskColumnsRef.current = taskColumns

  const applyProjectToGantt = useCallback(
    (nextProject: typeof project, selectedId: string | null) => {
      if (!readyRef.current) return
      // Use workspace-level AutoFilter when filters/sort/group are active
      const fss = taskFilterSortRef.current
      const hasWorkspaceFilters =
        fss.filters.length > 0 || fss.sort !== null || fss.groupBy !== 'none'
      const { data, links } = hasWorkspaceFilters
        ? filterGanttDataByState(nextProject, fss)
        : filterGanttData(nextProject, taskFilterRef.current)
      syncingFromProjectRef.current = true
      try {
        gantt.clearAll()
        gantt.parse({ data, links })
        applyZoomLevel(zoomIndexRef.current)
        applyGridLayout({
          narrow: narrowRef.current,
          android: androidRef.current,
          showGrid: showTaskGridRef.current,
          taskColumns: taskColumnsRef.current,
        })
        const api = gantt as GanttApi
        api.render?.()
        api.setSizes?.()
        if (selectedId && gantt.isTaskExists(selectedId)) {
          gantt.selectTask(selectedId)
        }
      } finally {
        // dhtmlx may flush link-delete/add in a microtask after clearAll/parse.
        Promise.resolve().then(() => {
          syncingFromProjectRef.current = false
        })
      }
    },
    [],
  )

  const applyProjectToGanttRef = useRef(applyProjectToGantt)
  applyProjectToGanttRef.current = applyProjectToGantt

  /** Click modifiers for onTaskSelected (ctrl/meta/shift multi-select). */
  const selectModifiersRef = useRef({ additive: false, fromClick: false })

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
      taskColumns: taskColumnsRef.current,
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
      taskColumns: taskColumnsRef.current,
    })
    const api = gantt as GanttApi
    api.render?.()
    api.setSizes?.()
  }, [])

  useEffect(() => {
    refreshLayout()
  }, [narrow, showTaskGrid, taskColumns, refreshLayout])

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
    // We own scheduling (ProjectLibre calendar + FS/SS/…). Do not let dhtmlx
    // "correct" bar dates after parse/link — that silently undoes successor shifts.
    gantt.config.work_time = false
    gantt.config.correct_work_time = false
    // Touch mode requires a long-press (touch_drag) before link/task drag.
    // Forcing it on desktop makes mouse linking look like "nothing happened".
    // Only force on Android / coarse pointers (tablets that report as desktop UA).
    const coarsePointer =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(pointer: coarse)').matches
    const forceTouch = androidRef.current || coarsePointer
    api.config.touch = forceTouch ? 'force' : true
    api.config.touch_drag = forceTouch ? 750 : true
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
      taskColumns: taskColumnsRef.current,
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
    // E2E / diagnostics: singleton already global-ish; expose for playwright.
    ;(window as unknown as { gantt?: typeof gantt }).gantt = gantt
    // CE build ignores columns[].resize (PRO). Install our own grid column drag-resize.
    const detachColResize = installGanttColumnResize(gantt, root)
    const detachTouchPan = installTimelineTouchPan(root)

    const onTaskClick = gantt.attachEvent(
      'onTaskClick',
      (id: string, e?: Event) => {
        const ev = e as MouseEvent | undefined
        const additive = Boolean(ev && (ev.ctrlKey || ev.metaKey || ev.shiftKey))
        selectModifiersRef.current = { additive, fromClick: true }
        // Always sync workspace selection (toolbar / Delete / Task Info). Do not
        // gate on syncingFromProjectRef — parse/select races would drop the click.
        dispatch({
          type: 'selectTask',
          taskId: String(id),
          additive,
        })
        return true
      },
    )
    // Clicks on the timeline row (outside the bar) are onEmptyClick in dhtmlx —
    // locate() intentionally returns null for .gantt_task_row. Select that task.
    const onEmptyClick = gantt.attachEvent('onEmptyClick', (e: Event) => {
      const id = taskIdFromTimelineEmptyClick(e, {
        taskAttribute: String(gantt.config.task_attribute ?? 'data-task-id'),
        linkAttribute: String(gantt.config.link_attribute ?? 'data-link-id'),
      })
      if (!id || !gantt.isTaskExists(id)) return
      const ev = e as MouseEvent
      const additive = Boolean(ev.ctrlKey || ev.metaKey || ev.shiftKey)
      selectModifiersRef.current = { additive, fromClick: true }
      dispatch({ type: 'selectTask', taskId: id, additive })
      try {
        gantt.selectTask(id)
      } catch {
        /* ignore */
      }
    })
    const onSelect = gantt.attachEvent('onTaskSelected', (id: string) => {
      if (syncingFromProjectRef.current) {
        selectModifiersRef.current = { additive: false, fromClick: false }
        return true
      }
      // Keyboard / API selection (no prior onTaskClick): treat as single select.
      if (!selectModifiersRef.current.fromClick) {
        dispatch({
          type: 'selectTask',
          taskId: String(id),
          additive: false,
        })
      }
      selectModifiersRef.current = { additive: false, fromClick: false }
      return true
    })
    const onDbl = gantt.attachEvent('onTaskDblClick', (id: string) => {
      dispatch({ type: 'openTaskInfo', taskId: String(id) })
      return false
    })
    const onDrag = gantt.attachEvent(
      'onAfterTaskDrag',
      (id: string, mode: string) => {
        if (syncingFromProjectRef.current) return true
        const task = gantt.getTask(id)
        if (mode === 'resize' || mode === 'move') {
          if (mode === 'move') {
            // Keep duration hours; finish + FS successors recompute in updateTask.
            dispatch({
              type: 'updateTask',
              taskId: String(id),
              patch: {
                start: new Date(task.start_date),
                percentComplete: Math.round(Number(task.progress) * 100),
              },
            })
          } else {
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
        }
        return true
      },
    )
    // start(A)→finish(B) is SF in dhtmlx; treat as FS with B predecessor of A.
    const onLinkCreated = gantt.attachEvent(
      'onLinkCreated',
      (link: { source: string; target: string; type: string | number }) => {
        const oriented = orientDraggedLink(link)
        link.source = String(oriented.source)
        link.target = String(oriented.target)
        link.type = oriented.type
        return true
      },
    )
    const onLink = gantt.attachEvent(
      'onAfterLinkAdd',
      (_id: string, item: { source: string; target: string; type: string | number }) => {
        if (syncingFromProjectRef.current) return true
        try {
          const oriented = orientDraggedLink(item)
          // Schedule immediately (don't wait for React effect) so bars move before
          // dhtmlx touch refreshData paints the old dates again.
          const next = DependencyUseCases.linkTasks(
            projectRef.current,
            idsRef.current,
            String(oriented.source),
            String(oriented.target),
            DHTMLX_TO_LINK[String(oriented.type)] ?? 'FS',
            0,
          )
          projectRef.current = next
          applyProjectToGanttRef.current(next, null)
          dispatch({
            type: 'setProject',
            project: next,
            message: 'Dependency created.',
          })
        } catch (error) {
          dispatch({
            type: 'setStatus',
            message: error instanceof Error ? error.message : 'Link failed.',
          })
          syncingFromProjectRef.current = true
          try {
            ;(gantt as GanttApi).deleteLink?.(_id)
          } catch {
            /* ignore */
          } finally {
            syncingFromProjectRef.current = false
          }
        }
        return true
      },
    )
    const onLinkDelete = gantt.attachEvent('onAfterLinkDelete', (id: string) => {
      if (syncingFromProjectRef.current) return true
      const depId = String(id)
      if (!projectRef.current.dependencies.some((d) => d.id === depId)) {
        return true
      }
      dispatch({ type: 'unlinkDependency', dependencyId: depId })
      return true
    })

    // Inline Predecessors cell → ProjectLibre notation via our scheduler.
    const inlineEditors = api.ext?.inlineEditors
    const onBeforeEdit = inlineEditors?.attachEvent?.(
      'onBeforeEditStart',
      (state: { id?: string; columnName?: string }) => {
        if (state.columnName !== 'predecessors') return true
        const task = gantt.getTask(String(state.id))
        if (!task || task.type === 'project') return false
        return true
      },
    )
    const onPredSave = inlineEditors?.attachEvent?.(
      'onSave',
      (state: { id?: string; columnName?: string }) => {
        if (syncingFromProjectRef.current) return true
        if (state.columnName !== 'predecessors') return true
        const task = gantt.getTask(String(state.id)) as {
          predecessors?: string
          type?: string
        }
        if (!task || task.type === 'project') return true
        const notation = String(task.predecessors ?? '')
        try {
          const next = DependencyUseCases.setPredecessorsFromNotation(
            projectRef.current,
            idsRef.current,
            String(state.id),
            notation,
          )
          projectRef.current = next
          applyProjectToGanttRef.current(next, selectedTaskIdRef.current)
          dispatch({
            type: 'setProject',
            project: next,
            message: 'Predecessors updated.',
          })
        } catch (error) {
          applyProjectToGanttRef.current(
            projectRef.current,
            selectedTaskIdRef.current,
          )
          dispatch({
            type: 'setStatus',
            message:
              error instanceof Error ? error.message : 'Invalid predecessors.',
          })
        }
        return true
      },
    )

    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === '=' || e.key === '+') {
          e.preventDefault()
          zoomIn()
        } else if (e.key === '-' || e.key === '_') {
          e.preventDefault()
          zoomOut()
        }
        return
      }

      // Plain ↑/↓: move selection through visible Gantt rows (ProjectLibre-style).
      if (
        (e.key === 'ArrowDown' || e.key === 'ArrowUp') &&
        !e.altKey &&
        !e.shiftKey &&
        !isEditableKeyboardTarget(e.target)
      ) {
        e.preventDefault()
        const api = gantt as GanttApi & {
          getVisibleTaskCount?: () => number
          getTaskByIndex?: (index: number) => { id?: string | number } | null
          showTask?: (id: string) => void
        }
        const count = api.getVisibleTaskCount?.() ?? 0
        const nextId = adjacentVisibleTaskId({
          currentId: selectedTaskIdRef.current,
          direction: e.key === 'ArrowDown' ? 1 : -1,
          visibleCount: count,
          taskIdAt: (index) => {
            const task = api.getTaskByIndex?.(index)
            return task?.id != null ? String(task.id) : null
          },
        })
        if (!nextId || !gantt.isTaskExists(nextId)) return
        selectModifiersRef.current = { additive: false, fromClick: true }
        dispatch({ type: 'selectTask', taskId: nextId, additive: false })
        try {
          gantt.selectTask(nextId)
          api.showTask?.(nextId)
        } catch {
          /* ignore */
        }
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
      gantt.detachEvent(onTaskClick)
      gantt.detachEvent(onEmptyClick)
      gantt.detachEvent(onDbl)
      gantt.detachEvent(onDrag)
      gantt.detachEvent(onLinkCreated)
      gantt.detachEvent(onLink)
      gantt.detachEvent(onLinkDelete)
      if (onBeforeEdit) inlineEditors?.detachEvent?.(onBeforeEdit)
      if (onPredSave) inlineEditors?.detachEvent?.(onPredSave)
      syncingFromProjectRef.current = true
      try {
        gantt.clearAll()
      } finally {
        syncingFromProjectRef.current = false
      }
      readyRef.current = false
    }
  }, [dispatch, zoomIn, zoomOut])

  // Data / filter changes: full reload. Selection-only updates use the effect below.
  useEffect(() => {
    if (!readyRef.current) return
    // Shallow-compare: skip rebuild when the reducer spreads a new reference
    // with identical filter/sort/group state (e.g. unrelated dispatch).
    // Fold the project identity into the snapshot — a project change must
    // always trigger a rebuild regardless of filter-sort state.
    const snapshot = `${project.tasks.length}:${JSON.stringify(taskFilterSort)}`
    if (snapshot === prevFilterSortRef.current) return
    prevFilterSortRef.current = snapshot
    applyProjectToGantt(project, selectedTaskIdRef.current)
  }, [project, taskFilter, taskFilterSort, applyProjectToGantt])

  useEffect(() => {
    if (!readyRef.current) return
    if (!selectedTaskId) {
      try {
        gantt.unselectTask()
      } catch {
        /* ignore */
      }
      return
    }
    if (!gantt.isTaskExists(selectedTaskId)) return
    if (String(gantt.getSelectedId()) === String(selectedTaskId)) return
    syncingFromProjectRef.current = true
    try {
      gantt.selectTask(selectedTaskId)
    } finally {
      Promise.resolve().then(() => {
        syncingFromProjectRef.current = false
      })
    }
  }, [selectedTaskId])

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
            <IconAction
              icon="columns"
              label="Task columns"
              title="Configure task columns"
              onClick={() => setColumnsOpen(true)}
            />
            <ViewHeaderSep />
          </>
        }
      />
      <FilterBar
        state={taskFilterSort}
        onSetFilter={(f) => dispatch({ type: 'setTaskFilter', filter: f })}
        onRemoveFilter={(id) => dispatch({ type: 'removeTaskFilter', filterId: id })}
        onClearFilters={() => dispatch({ type: 'clearTaskFilters' })}
        onSetSort={(s) => dispatch({ type: 'setTaskSort', sort: s })}
        onSetGroup={(g) => dispatch({ type: 'setTaskGroup', groupBy: g })}
      />
      <div
        ref={containerRef}
        className={styles.chart}
        role="region"
        aria-label="Gantt chart"
      />
      <TaskColumnsDialog open={columnsOpen} onClose={() => setColumnsOpen(false)} />
    </div>
  )
}
