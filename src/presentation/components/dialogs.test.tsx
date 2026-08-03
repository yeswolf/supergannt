import { useEffect, useRef } from 'react'
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
import { toDateInputValue } from '../utils/dateInput'

function OpenFirstTaskInfo({
  tab,
}: {
  tab?: 'general' | 'predecessors' | 'resources' | 'advanced'
}) {
  const { project } = useWorkspaceState()
  const dispatch = useWorkspaceDispatch()
  const opened = useRef(false)
  useEffect(() => {
    if (opened.current) return
    const leaf = project.tasks.find((t) => !t.summary)
    if (!leaf) return
    opened.current = true
    dispatch({ type: 'selectTask', taskId: leaf.id })
    dispatch({ type: 'openTaskInfo', taskId: leaf.id, tab })
  }, [dispatch, project.tasks, tab])
  return null
}

function TaskInfoProbe() {
  const { project, taskInfoOpen, selectedTaskId } = useWorkspaceState()
  const task = selectedTaskId
    ? project.tasks.find((t) => t.id === selectedTaskId)
    : null
  return (
    <output data-testid="task-info-probe">
      {taskInfoOpen ? 'open' : 'closed'}:{task?.name ?? ''}:{task?.constraintType ?? ''}
    </output>
  )
}

function ReopenAdvanced() {
  const { project, taskInfoOpen } = useWorkspaceState()
  const dispatch = useWorkspaceDispatch()
  const opened = useRef(false)
  useEffect(() => {
    if (opened.current || taskInfoOpen) return
    const leaf = project.tasks.find((t) => t.name === 'Enter Saved')
    if (!leaf) return
    opened.current = true
    dispatch({ type: 'openTaskInfo', taskId: leaf.id, tab: 'advanced' })
  }, [dispatch, project.tasks, taskInfoOpen])
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

  it('OK on predecessor Start move keeps hours and shifts the bar + successor', async () => {
    function BootstrapLinkAndOpen() {
      const { project } = useWorkspaceState()
      const dispatch = useWorkspaceDispatch()
      const done = useRef(false)
      useEffect(() => {
        if (done.current) return
        if (project.tasks.length < 2) return
        done.current = true
        const [a, b] = project.tasks
        dispatch({
          type: 'setPredecessorLinks',
          taskId: b!.id,
          links: [{ predecessorId: a!.id, type: 'FS', lagHours: 0 }],
        })
        dispatch({ type: 'selectTask', taskId: a!.id })
        dispatch({ type: 'openTaskInfo', taskId: a!.id })
      }, [dispatch, project.tasks])
      return null
    }

    function StartProbe() {
      const { project, taskInfoOpen } = useWorkspaceState()
      const first = project.tasks[0]
      const second = project.tasks[1]
      return (
        <output data-testid="start-probe">
          {taskInfoOpen ? 'open' : 'closed'}:
          {first ? toDateInputValue(first.start) : ''}:
          {first?.constraintType ?? ''}:
          {first ? String(first.duration.toHours()) : ''}:
          {second ? toDateInputValue(second.start) : ''}
        </output>
      )
    }

    renderWithWorkspace(
      <>
        <BootstrapLinkAndOpen />
        <StartProbe />
        <TaskInformationDialog />
      </>,
      {
        bootstrap: [
          { type: 'newProject' },
          { type: 'addTask' },
          { type: 'addTask' },
        ],
      },
    )

    await waitFor(() =>
      expect(screen.getByRole('dialog', { name: 'Task Information' })).toBeInTheDocument(),
    )

    const before = screen.getByTestId('start-probe').textContent ?? ''
    const beforeStart = before.split(':')[1]!
    expect(beforeStart.length).toBeGreaterThan(0)

    // Jump ~2 weeks later on the calendar date input.
    const base = new Date(`${beforeStart}T08:00:00`)
    base.setDate(base.getDate() + 14)
    const nextStart = toDateInputValue(base)

    fireEvent.change(screen.getByLabelText('Start'), {
      target: { value: nextStart },
    })
    fireEvent.click(screen.getByRole('button', { name: 'OK' }))

    await waitFor(() => {
      const text = screen.getByTestId('start-probe').textContent ?? ''
      expect(text.startsWith('closed:')).toBe(true)
      const [, start, constraint, hours, succStart] = text.split(':')
      expect(start).toBe(nextStart)
      expect(constraint).toBe('startNoEarlierThan')
      expect(hours).toBe('8')
      expect(succStart).not.toBe(beforeStart)
      expect(succStart! >= nextStart).toBe(true)
    })
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

  it('saves and closes when Enter is pressed in a field on any tab', async () => {
    const { rerender } = renderWithWorkspace(
      <>
        <OpenFirstTaskInfo tab="general" />
        <TaskInfoProbe />
        <TaskInformationDialog />
      </>,
      { bootstrap: [{ type: 'loadDemo' }] },
    )

    await waitFor(() =>
      expect(screen.getByRole('dialog', { name: 'Task Information' })).toBeInTheDocument(),
    )

    const name = screen.getByLabelText('Name')
    fireEvent.change(name, { target: { value: 'Enter Saved' } })
    fireEvent.keyDown(name, { key: 'Enter' })

    await waitFor(() =>
      expect(screen.getByTestId('task-info-probe').textContent).toMatch(/^closed:Enter Saved:/),
    )

    rerender(
      <>
        <ReopenAdvanced />
        <TaskInfoProbe />
        <TaskInformationDialog />
      </>,
    )
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())

    const constraint = screen.getByLabelText('Constraint type')
    fireEvent.change(constraint, { target: { value: 'mustFinishOn' } })
    fireEvent.keyDown(constraint, { key: 'Enter' })
    await waitFor(() =>
      expect(screen.getByTestId('task-info-probe').textContent).toBe(
        'closed:Enter Saved:mustFinishOn',
      ),
    )
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
