import { useEffect, useState } from 'react'
import { asTaskId } from '../../domain/value-objects/Ids'
import { useWorkspaceDispatch, useWorkspaceState } from '../state/WorkspaceContext'
import {
  TaskAssignmentsEditor,
  draftsFromProject,
  type TaskAssignmentDraft,
} from './TaskAssignmentsEditor'
import styles from './TaskInformationDialog.module.css'

/** Quick assign dialog — available from any view via toolbar Assign. */
export function AssignResourcesDialog() {
  const { project, selectedTaskId, assignDialogOpen } = useWorkspaceState()
  const dispatch = useWorkspaceDispatch()
  const task = selectedTaskId ? project.getTask(asTaskId(selectedTaskId)) : null
  const [drafts, setDrafts] = useState<TaskAssignmentDraft[]>([])

  useEffect(() => {
    if (!task || !assignDialogOpen) return
    setDrafts(draftsFromProject(project, task.id))
  }, [task, assignDialogOpen, project.assignments])

  if (!assignDialogOpen) return null

  if (!task) {
    return (
      <div
        className={styles.backdrop}
        role="presentation"
        onClick={() => dispatch({ type: 'closeAssignDialog' })}
      >
        <div
          className={styles.dialog}
          role="dialog"
          aria-modal="true"
          onClick={(e) => e.stopPropagation()}
        >
          <header className={styles.header}>
            <h2>Assign Resources</h2>
            <button
              type="button"
              className={styles.close}
              aria-label="Close"
              onClick={() => dispatch({ type: 'closeAssignDialog' })}
            >
              ×
            </button>
          </header>
          <div className={styles.body}>
            <p className={styles.hint}>Select a task first (Gantt, Task Sheet, etc.).</p>
          </div>
          <footer className={styles.footer}>
            <button type="button" onClick={() => dispatch({ type: 'closeAssignDialog' })}>
              Close
            </button>
          </footer>
        </div>
      </div>
    )
  }

  const save = () => {
    dispatch({
      type: 'setTaskAssignments',
      taskId: task.id,
      links: drafts.map((d) => ({ resourceId: d.resourceId, units: d.units })),
    })
    dispatch({ type: 'closeAssignDialog' })
  }

  return (
    <div
      className={styles.backdrop}
      role="presentation"
      onClick={() => dispatch({ type: 'closeAssignDialog' })}
    >
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="assign-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className={styles.header}>
          <h2 id="assign-title">Assign Resources — {task.name}</h2>
          <button
            type="button"
            className={styles.close}
            aria-label="Close"
            onClick={() => dispatch({ type: 'closeAssignDialog' })}
          >
            ×
          </button>
        </header>
        <div className={styles.body}>
          <TaskAssignmentsEditor
            project={project}
            taskId={task.id}
            drafts={drafts}
            onChange={setDrafts}
          />
        </div>
        <footer className={styles.footer}>
          <button type="button" onClick={save}>
            OK
          </button>
          <button type="button" onClick={() => dispatch({ type: 'closeAssignDialog' })}>
            Cancel
          </button>
        </footer>
      </div>
    </div>
  )
}
