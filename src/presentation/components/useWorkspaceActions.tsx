import { useMemo, type ReactNode } from 'react'
import { useWorkspaceDispatch, useWorkspaceState } from '../state/WorkspaceContext'
import { IconAction } from './IconAction'

/** Selection-aware edit actions for the current view — rendered in ViewHeader. */
export function useWorkspaceActions(): ReactNode[] {
  const {
    view,
    selectedTaskId,
    selectedTaskIds,
    selectedResourceId,
  } = useWorkspaceState()
  const dispatch = useWorkspaceDispatch()

  const canLink = selectedTaskIds.length >= 2
  const canUnlink = selectedTaskIds.length >= 1

  return useMemo(() => {
    const actions: ReactNode[] = []
    const onResources =
      view === 'resources' || view === 'resourceCalendar' || view === 'rbs'

    if (onResources) {
      actions.push(
        <IconAction
          key="add-res"
          icon="addResource"
          label="Add resource"
          primary
          onClick={() => {
            dispatch({ type: 'addResource' })
            dispatch({ type: 'setView', view: 'resources' })
          }}
        />,
      )
      if (selectedResourceId || view === 'resources') {
        actions.push(
          <IconAction
            key="res-cal"
            icon="calendar"
            label="Resource calendar"
            onClick={() => dispatch({ type: 'setView', view: 'resourceCalendar' })}
          />,
        )
      }
      return actions
    }

    actions.push(
      <IconAction
        key="add-task"
        icon="plus"
        label="Add task"
        primary
        onClick={() =>
          dispatch({ type: 'addTask', afterTaskId: selectedTaskId ?? undefined })
        }
      />,
    )

    if (selectedTaskId) {
      actions.push(
        <IconAction
          key="info"
          icon="information"
          label="Task information"
          onClick={() => dispatch({ type: 'openTaskInfo' })}
        />,
        <IconAction
          key="assign"
          icon="resources"
          label="Assign resources"
          onClick={() => dispatch({ type: 'openAssignDialog' })}
        />,
        <IconAction
          key="indent"
          icon="indent"
          label="Indent"
          onClick={() => dispatch({ type: 'indentTask', taskId: selectedTaskId })}
        />,
        <IconAction
          key="outdent"
          icon="outdent"
          label="Outdent"
          onClick={() => dispatch({ type: 'outdentTask', taskId: selectedTaskId })}
        />,
        <IconAction
          key="link"
          icon="link"
          label="Link selected tasks (FS)"
          disabled={!canLink}
          onClick={() => dispatch({ type: 'linkSelection' })}
        />,
        <IconAction
          key="unlink"
          icon="unlink"
          label="Unlink selection"
          disabled={!canUnlink}
          onClick={() => dispatch({ type: 'unlinkSelection' })}
        />,
        <IconAction
          key="delete"
          icon="delete"
          label="Delete task"
          onClick={() => dispatch({ type: 'deleteTask', taskId: selectedTaskId })}
        />,
      )
    } else {
      actions.push(
        <IconAction
          key="milestone"
          icon="milestone"
          label="Add milestone"
          onClick={() =>
            dispatch({
              type: 'addMilestone',
              afterTaskId: selectedTaskId ?? undefined,
            })
          }
        />,
        <IconAction
          key="add-res"
          icon="addResource"
          label="Add resource"
          onClick={() => {
            dispatch({ type: 'addResource' })
            dispatch({ type: 'setView', view: 'resources' })
          }}
        />,
      )
    }

    return actions
  }, [
    canLink,
    canUnlink,
    dispatch,
    selectedResourceId,
    selectedTaskId,
    view,
  ])
}
