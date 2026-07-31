import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { asTaskId } from '../../domain/value-objects/Ids'
import { useWorkspaceDispatch, useWorkspaceState } from '../state/WorkspaceContext'
import {
  TaskAssignmentsEditor,
  draftsFromProject,
  type TaskAssignmentDraft,
} from './TaskAssignmentsEditor'
import { IconAction, IconActions } from './IconAction'
import styles from './TaskInformationDialog.module.css'

/** Quick assign dialog — available from any view via toolbar Assign. */
export function AssignResourcesDialog() {
  const { project, selectedTaskId, assignDialogOpen } = useWorkspaceState()
  const dispatch = useWorkspaceDispatch()
  const task = selectedTaskId ? project.getTask(asTaskId(selectedTaskId)) : null
  const [drafts, setDrafts] = useState<TaskAssignmentDraft[]>([])
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!task || !assignDialogOpen) return
    setDrafts(draftsFromProject(project, task.id))
  }, [task, assignDialogOpen, project.assignments])

  useEffect(() => {
    if (!assignDialogOpen || !task) return
    const prev = document.activeElement as HTMLElement | null
    const focusable = dialogRef.current?.querySelector<HTMLElement>(
      'select, input, button, [href], textarea, [tabindex]:not([tabindex="-1"])',
    )
    focusable?.focus()
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        dispatch({ type: 'closeAssignDialog' })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      prev?.focus?.()
    }
  }, [assignDialogOpen, task, dispatch])

  if (!assignDialogOpen || !task) return null

  const save = () => {
    dispatch({
      type: 'setTaskAssignments',
      taskId: task.id,
      links: drafts.map((d) => ({ resourceId: d.resourceId, units: d.units })),
    })
    dispatch({ type: 'closeAssignDialog' })
  }

  const onDialogKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'Enter' || e.nativeEvent.isComposing) return
    const target = e.target as HTMLElement
    const tag = target.tagName
    if (tag === 'TEXTAREA' || tag === 'BUTTON' || tag === 'INPUT' || tag === 'SELECT') return
    e.preventDefault()
    save()
  }

  return (
    <div
      className={styles.backdrop}
      role="presentation"
      onClick={() => dispatch({ type: 'closeAssignDialog' })}
    >
      <div
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="assign-title"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onDialogKeyDown}
      >
        <header className={styles.header}>
          <h2 id="assign-title">Assign Resources — {task.name}</h2>
          <IconAction
            label="Close"
            icon="cancel"
            tone="onDark"
            onClick={() => dispatch({ type: 'closeAssignDialog' })}
          />
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
          <IconActions>
            <IconAction label="OK" icon="ok" primary onClick={save} />
            <IconAction
              label="Cancel"
              icon="cancel"
              onClick={() => dispatch({ type: 'closeAssignDialog' })}
            />
          </IconActions>
        </footer>
      </div>
    </div>
  )
}
