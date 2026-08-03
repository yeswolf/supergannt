import { useEffect, useRef, useState, type Dispatch, type KeyboardEvent, type SetStateAction } from 'react'
import type { LinkType } from '../../domain/entities/Dependency'
import type { Project } from '../../domain/entities/Project'
import type { Task, TaskConstraintType } from '../../domain/entities/Task'
import { asTaskId } from '../../domain/value-objects/Ids'
import { useWorkspaceDispatch, useWorkspaceState } from '../state/WorkspaceContext'
import { fromDateInputValue, toDateInputValue } from '../utils/dateInput'
import {
  TaskAssignmentsEditor,
  draftsFromProject,
  type TaskAssignmentDraft,
} from './TaskAssignmentsEditor'
import { IconAction, IconActions } from './IconAction'
import { ColumnHeader, useResizableColumns } from './useResizableColumns'
import styles from './TaskInformationDialog.module.css'

const LINK_TYPES: LinkType[] = ['FS', 'SS', 'FF', 'SF']

const CONSTRAINTS: { value: TaskConstraintType; label: string }[] = [
  { value: 'asSoonAsPossible', label: 'As Soon As Possible' },
  { value: 'asLateAsPossible', label: 'As Late As Possible' },
  { value: 'mustStartOn', label: 'Must Start On' },
  { value: 'mustFinishOn', label: 'Must Finish On' },
  { value: 'startNoEarlierThan', label: 'Start No Earlier Than' },
  { value: 'startNoLaterThan', label: 'Start No Later Than' },
  { value: 'finishNoEarlierThan', label: 'Finish No Earlier Than' },
  { value: 'finishNoLaterThan', label: 'Finish No Later Than' },
]

type Tab = 'general' | 'predecessors' | 'resources' | 'advanced'

interface DraftLink {
  predecessorId: string
  type: LinkType
  lagHours: number
}

export function TaskInformationDialog() {
  const { project, selectedTaskId, taskInfoOpen, taskInfoTab } = useWorkspaceState()
  const dispatch = useWorkspaceDispatch()
  const task = selectedTaskId ? project.getTask(asTaskId(selectedTaskId)) : null
  const [tab, setTab] = useState<Tab>('general')
  const [name, setName] = useState('')
  const [durationHours, setDurationHours] = useState(0)
  const [percentComplete, setPercentComplete] = useState(0)
  const [startDate, setStartDate] = useState('')
  const [finishDate, setFinishDate] = useState('')
  const [notes, setNotes] = useState('')
  const [constraintType, setConstraintType] =
    useState<TaskConstraintType>('asSoonAsPossible')
  const [constraintDate, setConstraintDate] = useState('')
  const [links, setLinks] = useState<DraftLink[]>([])
  const [assignments, setAssignments] = useState<TaskAssignmentDraft[]>([])
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!task || !taskInfoOpen) return
    setName(task.name)
    setDurationHours(task.duration.toHours())
    setPercentComplete(task.percentComplete)
    setStartDate(toDateInputValue(task.start))
    setFinishDate(toDateInputValue(task.finish))
    setNotes(task.notes)
    setConstraintType(task.constraintType)
    setConstraintDate(
      task.constraintDate ? toDateInputValue(task.constraintDate) : '',
    )
    setLinks(
      project.dependencies
        .filter((d) => d.successorId === task.id)
        .map((d) => ({
          predecessorId: d.predecessorId,
          type: d.type,
          lagHours: d.lag.toHours(),
        })),
    )
    setAssignments(draftsFromProject(project, task.id))
    setTab(taskInfoTab)
  }, [task, taskInfoOpen, project.dependencies, project.assignments, taskInfoTab])

  useEffect(() => {
    if (!taskInfoOpen || !task) return
    const prev = document.activeElement as HTMLElement | null
    const focusable = dialogRef.current?.querySelector<HTMLElement>(
      'input, select, textarea, button, [href], [tabindex]:not([tabindex="-1"])',
    )
    focusable?.focus()
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        dispatch({ type: 'closeTaskInfo' })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      prev?.focus?.()
    }
  }, [taskInfoOpen, task, dispatch])

  if (!taskInfoOpen || !task) return null

  const otherTasks = project.tasks.filter((t) => t.id !== task.id && !t.summary)

  const applyGeneral = () => {
    const start = startDate ? fromDateInputValue(startDate) : null
    const finish = finishDate ? fromDateInputValue(finishDate) : null
    const startChanged =
      start !== null && toDateInputValue(start) !== toDateInputValue(task.start)
    const finishChanged =
      finish !== null && toDateInputValue(finish) !== toDateInputValue(task.finish)
    const durationChanged = durationHours !== task.duration.toHours()

    const patch: {
      name: string
      percentComplete: number
      notes: string
      durationHours?: number
      start?: Date
      finish?: Date
    } = {
      name,
      percentComplete,
      notes,
    }

    if (durationChanged) {
      patch.durationHours = durationHours
      if (startChanged && start) patch.start = start
    } else if (startChanged || finishChanged) {
      if (start) patch.start = start
      if (finish) patch.finish = finish
    } else {
      patch.durationHours = durationHours
    }

    dispatch({
      type: 'updateTask',
      taskId: task.id,
      patch,
    })
  }

  const applyAdvanced = () => {
    dispatch({
      type: 'updateTask',
      taskId: task.id,
      patch: {
        constraintType,
        constraintDate: constraintDate
          ? fromDateInputValue(constraintDate)
          : null,
      },
    })
  }

  const applyPredecessors = () => {
    dispatch({
      type: 'setPredecessorLinks',
      taskId: task.id,
      links: links.filter((l) => l.predecessorId),
    })
  }

  const applyResources = () => {
    dispatch({
      type: 'setTaskAssignments',
      taskId: task.id,
      links: assignments.map((a) => ({
        resourceId: a.resourceId,
        units: a.units,
      })),
    })
  }

  const applyCurrentTab = () => {
    if (tab === 'general') applyGeneral()
    if (tab === 'predecessors') applyPredecessors()
    if (tab === 'resources') applyResources()
    if (tab === 'advanced') applyAdvanced()
  }

  /**
   * ProjectLibre Task Information OK applies every tab in one reducer pass.
   * Order: Advanced → Resources → General → Predecessors (FS clears soft pins last).
   */
  const confirmOk = () => {
    const start = startDate ? fromDateInputValue(startDate) : null
    const finish = finishDate ? fromDateInputValue(finishDate) : null
    const startChanged =
      start !== null && toDateInputValue(start) !== toDateInputValue(task.start)
    const finishChanged =
      finish !== null && toDateInputValue(finish) !== toDateInputValue(task.finish)
    const durationChanged = durationHours !== task.duration.toHours()

    const general: {
      name: string
      percentComplete: number
      notes: string
      durationHours?: number
      start?: Date
      finish?: Date
    } = {
      name,
      percentComplete,
      notes,
    }
    if (durationChanged) {
      general.durationHours = durationHours
      if (startChanged && start) general.start = start
    } else if (startChanged || finishChanged) {
      if (start) general.start = start
      if (finish) general.finish = finish
    } else {
      general.durationHours = durationHours
    }

    dispatch({
      type: 'applyTaskInformation',
      taskId: task.id,
      advanced: {
        constraintType,
        constraintDate: constraintDate
          ? fromDateInputValue(constraintDate)
          : null,
      },
      assignments: assignments.map((a) => ({
        resourceId: a.resourceId,
        units: a.units,
      })),
      general,
      predecessors: links.filter((l) => l.predecessorId),
    })
  }

  const onDialogKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'Enter' || e.nativeEvent.isComposing) return
    const target = e.target as HTMLElement
    const tag = target.tagName
    if (tag === 'TEXTAREA' || tag === 'BUTTON' || tag === 'INPUT' || tag === 'SELECT') return
    e.preventDefault()
    confirmOk()
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'general', label: 'General' },
    { id: 'predecessors', label: 'Predecessors' },
    { id: 'resources', label: 'Resources' },
    { id: 'advanced', label: 'Advanced' },
  ]

  return (
    <div
      className={styles.backdrop}
      role="presentation"
      onClick={() => dispatch({ type: 'closeTaskInfo' })}
    >
      <div
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-info-title"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onDialogKeyDown}
      >
        <header className={styles.header}>
          <h2 id="task-info-title">Task Information</h2>
          <IconAction
            label="Close"
            icon="cancel"
            tone="onDark"
            onClick={() => dispatch({ type: 'closeTaskInfo' })}
          />
        </header>

        <div className={styles.tabs} role="tablist" aria-label="Task information tabs">
          {tabs.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              role="tab"
              id={`task-tab-${id}`}
              aria-selected={tab === id}
              aria-controls={`task-panel-${id}`}
              className={tab === id ? styles.tabActive : undefined}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>

        <div
          className={styles.body}
          role="tabpanel"
          id={`task-panel-${tab}`}
          aria-labelledby={`task-tab-${tab}`}
        >
          {tab === 'general' ? (
            <div className={styles.form}>
              <label>
                Name
                <input value={name} onChange={(e) => setName(e.target.value)} />
              </label>
              <label>
                Duration (hours)
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  value={durationHours}
                  disabled={task.summary}
                  onChange={(e) => setDurationHours(Number(e.target.value))}
                />
              </label>
              <label>
                Start
                <input
                  type="date"
                  value={startDate}
                  disabled={task.summary}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </label>
              <label>
                Finish
                <input
                  type="date"
                  value={finishDate}
                  disabled={task.summary}
                  onChange={(e) => setFinishDate(e.target.value)}
                />
              </label>
              <label>
                Percent complete
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={percentComplete}
                  disabled={task.summary}
                  onChange={(e) => setPercentComplete(Number(e.target.value))}
                />
              </label>
              <label>
                Notes
                <textarea
                  rows={4}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </label>
              <p className={styles.meta}>WBS {task.wbs}</p>
            </div>
          ) : null}

          {tab === 'predecessors' ? (
            <PredecessorsTable
              links={links}
              setLinks={setLinks}
              project={project}
              otherTasks={otherTasks}
            />
          ) : null}

          {tab === 'resources' ? (
            <TaskAssignmentsEditor
              project={project}
              taskId={task.id}
              drafts={assignments}
              onChange={setAssignments}
            />
          ) : null}

          {tab === 'advanced' ? (
            <div className={styles.form}>
              <label>
                Constraint type
                <select
                  value={constraintType}
                  onChange={(e) =>
                    setConstraintType(e.target.value as TaskConstraintType)
                  }
                >
                  {CONSTRAINTS.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Constraint date
                <input
                  type="date"
                  value={constraintDate}
                  disabled={
                    constraintType === 'asSoonAsPossible' ||
                    constraintType === 'asLateAsPossible'
                  }
                  onChange={(e) => setConstraintDate(e.target.value)}
                />
              </label>
            </div>
          ) : null}
        </div>

        <footer className={styles.footer}>
          <IconActions>
            <IconAction label="OK" icon="ok" primary onClick={confirmOk} />
            <IconAction
              label="Cancel"
              icon="cancel"
              onClick={() => dispatch({ type: 'closeTaskInfo' })}
            />
            <IconAction label="Apply" icon="apply" onClick={applyCurrentTab} />
          </IconActions>
        </footer>
      </div>
    </div>
  )
}

function PredecessorsTable({
  links,
  setLinks,
  project,
  otherTasks,
}: {
  links: DraftLink[]
  setLinks: Dispatch<SetStateAction<DraftLink[]>>
  project: Project
  otherTasks: Task[]
}) {
  const { tableRef, colgroup, onResizeStart, onResizeAuto } = useResizableColumns(
    links.length,
  )
  const headers = ['ID', 'Task Name', 'Type', 'Lag (h)', ''] as const

  return (
    <div className={styles.predTab}>
      <table ref={tableRef} className={styles.predTable}>
        {colgroup}
        <thead>
          <tr>
            {headers.map((label, i) => (
              <ColumnHeader
                key={label || 'actions'}
                index={i}
                onResizeStart={onResizeStart}
                onResizeAuto={onResizeAuto}
              >
                {label}
              </ColumnHeader>
            ))}
          </tr>
        </thead>
        <tbody>
          {links.map((link, i) => {
            const pred = project.getTask(asTaskId(link.predecessorId))
            const predIndex = project.tasks.findIndex(
              (t) => t.id === link.predecessorId,
            )
            return (
              <tr key={`${link.predecessorId}-${i}`}>
                <td>{predIndex >= 0 ? predIndex + 1 : '—'}</td>
                <td>
                  <select
                    value={link.predecessorId}
                    aria-label={`Predecessor ${i + 1} task`}
                    onChange={(e) => {
                      const predecessorId = e.target.value
                      setLinks((prev) =>
                        prev.map((row, j) =>
                          j === i ? { ...row, predecessorId } : row,
                        ),
                      )
                    }}
                  >
                    {otherTasks.map((t) => {
                      const idx = project.tasks.findIndex((x) => x.id === t.id)
                      return (
                        <option key={t.id} value={t.id}>
                          {idx + 1} — {t.name}
                        </option>
                      )
                    })}
                  </select>
                  {!pred ? (
                    <span className={styles.warn}> (missing)</span>
                  ) : null}
                </td>
                <td>
                  <select
                    value={link.type}
                    aria-label={`Predecessor ${i + 1} type`}
                    onChange={(e) => {
                      const type = e.target.value as LinkType
                      setLinks((prev) =>
                        prev.map((row, j) =>
                          j === i ? { ...row, type } : row,
                        ),
                      )
                    }}
                  >
                    {LINK_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <input
                    type="number"
                    step={1}
                    value={link.lagHours}
                    aria-label={`Predecessor ${i + 1} lag hours`}
                    onChange={(e) => {
                      const lagHours = Number(e.target.value)
                      setLinks((prev) =>
                        prev.map((row, j) =>
                          j === i ? { ...row, lagHours } : row,
                        ),
                      )
                    }}
                  />
                </td>
                <td>
                  <IconAction
                    label="Remove"
                    icon="delete"
                    onClick={() =>
                      setLinks((prev) => prev.filter((_, j) => j !== i))
                    }
                  />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <IconAction
        label="Add predecessor"
        icon="add"
        disabled={otherTasks.length === 0}
        onClick={() => {
          const first = otherTasks[0]
          if (!first) return
          setLinks((prev) => [
            ...prev,
            { predecessorId: first.id, type: 'FS', lagHours: 0 },
          ])
        }}
      />
    </div>
  )
}

