import { useMemo, type ReactNode } from 'react'
import { useWorkspaceDispatch, useWorkspaceState } from '../state/WorkspaceContext'
import { PROJECT_SHORTCUT_HINTS } from '../projectShortcuts'
import { IconAction } from './IconAction'

/** Selection-aware edit actions for the current view — rendered in ViewHeader. */
export function useWorkspaceActions(): ReactNode[] {
  const {
    view,
    selectedTaskId,
    selectedTaskIds,
    selectedResourceId,
    undoStack,
    redoStack,
  } = useWorkspaceState()
  const dispatch = useWorkspaceDispatch()

  const canLink = selectedTaskIds.length >= 2
  const canUnlink = selectedTaskIds.length >= 1
  const canUndo = undoStack.length > 0
  const canRedo = redoStack.length > 0

  return useMemo(() => {
    const actions: ReactNode[] = []

    // Undo / Redo — always present, disabled when stack is empty.
    actions.push(
      <IconAction
        key="undo"
        glyph="↶"
        label="Undo"
        title={`Undo (${PROJECT_SHORTCUT_HINTS.undo})${canUndo ? ': ' + undoStack[undoStack.length - 1]!.label : ''}`}
        disabled={!canUndo}
        onClick={() => dispatch({ type: 'undo' })}
      />,
      <IconAction
        key="redo"
        glyph="↷"
        label="Redo"
        title={`Redo (${PROJECT_SHORTCUT_HINTS.redo})${canRedo ? ': ' + redoStack[redoStack.length - 1]!.label : ''}`}
        disabled={!canRedo}
        onClick={() => dispatch({ type: 'redo' })}
      />,
    )

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
        title={`Add task (${PROJECT_SHORTCUT_HINTS.addTask})`}
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
          title={`Task information (${PROJECT_SHORTCUT_HINTS.taskInfo})`}
          onClick={() => dispatch({ type: 'openTaskInfo' })}
        />,
        <IconAction
          key="assign"
          icon="resources"
          label="Assign resources"
          title={`Assign resources (${PROJECT_SHORTCUT_HINTS.assign})`}
          onClick={() => dispatch({ type: 'openAssignDialog' })}
        />,
        <IconAction
          key="indent"
          icon="indent"
          label="Indent"
          title={`Indent (${PROJECT_SHORTCUT_HINTS.indent})`}
          onClick={() => dispatch({ type: 'indentTask', taskId: selectedTaskId })}
        />,
        <IconAction
          key="outdent"
          icon="outdent"
          label="Outdent"
          title={`Outdent (${PROJECT_SHORTCUT_HINTS.outdent})`}
          onClick={() => dispatch({ type: 'outdentTask', taskId: selectedTaskId })}
        />,
        <IconAction
          key="link"
          icon="link"
          label="Link selected tasks (FS)"
          title={`Link selected tasks (${PROJECT_SHORTCUT_HINTS.link})`}
          disabled={canLink}
          onClick={() => dispatch({ type: 'linkSelection' })}
        />,
        <IconAction
          key="unlink"
          icon="unlink"
          label="Unlink selection"
          title={`Unlink selection (${PROJECT_SHORTCUT_HINTS.unlink})`}
          disabled={canUnlink}
          onClick={() => dispatch({ type: 'unlinkSelection' })}
        />,
        <IconAction
          key="delete"
          icon="delete"
          label="Delete task"
          title={`Delete task (${PROJECT_SHORTCUT_HINTS.deleteSelection})`}
          onClick={() => dispatch({ type: 'deleteSelection' })}
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
    canUndo,
    canRedo,
    dispatch,
    redoStack,
    selectedResourceId,
    selectedTaskId,
    undoStack,
    view,
  ])
}
