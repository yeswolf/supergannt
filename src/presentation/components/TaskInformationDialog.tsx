import { useEffect, useState } from 'react'
import type { LinkType } from '../../domain/entities/Dependency'
import type { TaskConstraintType } from '../../domain/entities/Task'
import { asTaskId } from '../../domain/value-objects/Ids'
import { useWorkspaceDispatch, useWorkspaceState } from '../state/WorkspaceContext'
import { fromDateInputValue, toDateInputValue } from '../utils/dateInput'
import {
  TaskAssignmentsEditor,
  draftsFromProject,
  type TaskAssignmentDraft,
} from './TaskAssignmentsEditor'
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
      links,
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

  return (
    <div
      className={styles.backdrop}
      role="presentation"
      onClick={() => dispatch({ type: 'closeTaskInfo' })}
    >
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-info-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className={styles.header}>
          <h2 id="task-info-title">Task Information</h2>
          <button
            type="button"
            className={styles.close}
            aria-label="Close"
            onClick={() => dispatch({ type: 'closeTaskInfo' })}
          >
            ×
          </button>
        </header>

        <nav className={styles.tabs} aria-label="Task information tabs">
          {(
            [
              ['general', 'General'],
              ['predecessors', 'Predecessors'],
              ['resources', 'Resources'],
              ['advanced', 'Advanced'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={tab === id ? styles.tabActive : undefined}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </nav>

        <div className={styles.body}>
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
            <div className={styles.predTab}>
              <p className={styles.hint}>
                Add predecessors with type and lag (hours), same as ProjectLibre Task
                Information → Predecessors.
              </p>
              <table className={styles.predTable}>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Task Name</th>
                    <th>Type</th>
                    <th>Lag (h)</th>
                    <th />
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
                          <button
                            type="button"
                            onClick={() =>
                              setLinks((prev) => prev.filter((_, j) => j !== i))
                            }
                          >
                            Remove
                          </button>
                        </td>
                        {!pred ? (
                          <td className={styles.warn}>Missing task</td>
                        ) : null}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <button
                type="button"
                disabled={otherTasks.length === 0}
                onClick={() => {
                  const first = otherTasks[0]
                  if (!first) return
                  setLinks((prev) => [
                    ...prev,
                    { predecessorId: first.id, type: 'FS', lagHours: 0 },
                  ])
                }}
              >
                Add predecessor
              </button>
            </div>
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
          <button
            type="button"
            onClick={() => {
              applyCurrentTab()
              dispatch({ type: 'closeTaskInfo' })
            }}
          >
            OK
          </button>
          <button type="button" onClick={() => dispatch({ type: 'closeTaskInfo' })}>
            Cancel
          </button>
          <button type="button" onClick={applyCurrentTab}>
            Apply
          </button>
        </footer>
      </div>
    </div>
  )
}
