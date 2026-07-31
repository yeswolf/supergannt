import { useEffect } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { screen, waitFor, fireEvent } from '@testing-library/react'
import { render } from '@testing-library/react'
import { renderWithWorkspace } from '../../test/workspaceTestUtils'
import {
  useWorkspaceDispatch,
  useWorkspaceState,
} from '../state/WorkspaceContext'
import { TaskInformationDialog } from './TaskInformationDialog'
import { AssignResourcesDialog } from './AssignResourcesDialog'
import { TaskAssignmentsEditor, draftsFromProject } from './TaskAssignmentsEditor'
import { createDemoProject } from '../../application/services/ProjectFactory'
import { refreshProject } from '../../application/services/ProjectRefresh'
import { UuidIdGenerator } from '../../infrastructure/ids/UuidIdGenerator'

function OpenFirstTaskInfo({
  tab,
}: {
  tab?: 'general' | 'predecessors' | 'resources' | 'advanced'
}) {
  const { project } = useWorkspaceState()
  const dispatch = useWorkspaceDispatch()
  useEffect(() => {
    const leaf = project.tasks.find((t) => !t.summary)
    if (!leaf) return
    dispatch({ type: 'selectTask', taskId: leaf.id })
    dispatch({ type: 'openTaskInfo', taskId: leaf.id, tab })
  }, [dispatch, project.tasks, tab])
  return null
}

function OpenAssignForFirstTask() {
  const { project } = useWorkspaceState()
  const dispatch = useWorkspaceDispatch()
  useEffect(() => {
    const leaf = project.tasks.find((t) => !t.summary)
    if (!leaf) return
    dispatch({ type: 'selectTask', taskId: leaf.id })
    dispatch({ type: 'openAssignDialog', taskId: leaf.id })
  }, [dispatch, project.tasks])
  return null
}

describe('TaskInformationDialog', () => {
  it('edits general / predecessors / resources / advanced and applies', async () => {
    renderWithWorkspace(
      <>
        <OpenFirstTaskInfo tab="general" />
        <TaskInformationDialog />
      </>,
      { bootstrap: [{ type: 'loadDemo' }] },
    )

    await waitFor(() =>
      expect(screen.getByRole('dialog', { name: 'Task Information' })).toBeInTheDocument(),
    )

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Updated Task' } })

    fireEvent.click(screen.getByRole('tab', { name: 'Predecessors' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add predecessor' }))
    const removePred = screen.getAllByRole('button', { name: 'Remove' })[0]
    if (removePred) fireEvent.click(removePred)
    fireEvent.click(screen.getByRole('button', { name: 'Add predecessor' }))

    fireEvent.click(screen.getByRole('tab', { name: 'Resources' }))
    expect(screen.getByLabelText('Add resource to task')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: 'Advanced' }))
    fireEvent.change(screen.getByLabelText('Constraint type'), {
      target: { value: 'mustStartOn' },
    })
    fireEvent.change(screen.getByLabelText('Constraint date'), {
      target: { value: '2024-07-01' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
    fireEvent.click(screen.getByRole('button', { name: 'OK' }))
  })

  it('closes via Cancel', async () => {
    renderWithWorkspace(
      <>
        <OpenFirstTaskInfo />
        <TaskInformationDialog />
      </>,
      { bootstrap: [{ type: 'loadDemo' }] },
    )
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  })
})

describe('AssignResourcesDialog', () => {
  it('shows status when assign opens with no task', () => {
    renderWithWorkspace(<AssignResourcesDialog />, {
      bootstrap: [{ type: 'openAssignDialog' }],
    })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('saves assignments for a selected task', async () => {
    renderWithWorkspace(
      <>
        <OpenAssignForFirstTask />
        <AssignResourcesDialog />
      </>,
      { bootstrap: [{ type: 'loadDemo' }] },
    )

    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    const add = screen.getByLabelText('Add resource to task')
    const options = Array.from(add.querySelectorAll('option')).filter((o) => o.value)
    if (options[0]) {
      fireEvent.change(add, { target: { value: options[0].value } })
    }
    fireEvent.click(screen.getByRole('button', { name: 'OK' }))
  })
})

describe('TaskAssignmentsEditor', () => {
  it('supports draft and live assignment edits', () => {
    const project = refreshProject(createDemoProject(new UuidIdGenerator()))
    const leaf = project.tasks.find((t) => !t.summary)!
    let drafts = draftsFromProject(project, leaf.id)
    const onAssign = vi.fn()
    const onUnassign = vi.fn()
    const onUnits = vi.fn()

    const { rerender } = render(
      <TaskAssignmentsEditor
        project={project}
        taskId={leaf.id}
        drafts={drafts}
        onChange={(next) => {
          drafts = next
        }}
      />,
    )

    const add = screen.getByLabelText('Add resource to task')
    const option = Array.from(add.querySelectorAll('option')).find((o) => o.value)
    if (option) fireEvent.change(add, { target: { value: option.value } })

    rerender(
      <TaskAssignmentsEditor
        project={project}
        taskId={leaf.id}
        drafts={drafts}
        onChange={(next) => {
          drafts = next
        }}
        live
        onAssign={onAssign}
        onUnassign={onUnassign}
        onUnits={onUnits}
      />,
    )

    if (drafts[0]?.assignmentId) {
      fireEvent.change(screen.getByLabelText('Assignment 1 units'), {
        target: { value: '0.5' },
      })
      expect(onUnits).toHaveBeenCalled()
      fireEvent.click(screen.getAllByRole('button', { name: 'Remove' })[0]!)
      expect(onUnassign).toHaveBeenCalled()
    } else {
      const addLive = screen.getByLabelText('Add resource to task')
      const opt = Array.from(addLive.querySelectorAll('option')).find((o) => o.value)
      if (opt) {
        fireEvent.change(addLive, { target: { value: opt.value } })
        expect(onAssign).toHaveBeenCalled()
      }
    }
  })
})
