# Undo/Redo command stack for all workspace mutations

## Overview

Implement a command-stack undo/redo system using the snapshot (memento) pattern. Before each domain mutation, the current `Project` is deep-cloned and pushed onto the undo stack. Undo restores the previous snapshot; redo replays a previously undone state.

## User story

As a PM editing a complex plan, I want to undo my last action (task edit, dependency change, resource assignment, calendar modification) and redo it if I change my mind again, so that I can explore changes confidently and recover from mistakes without losing work.

## Acceptance criteria

1. **Command stack:** All workspace mutations flow through an undoable command stack (snapshot approach).
2. **Supported actions:** Undo/Redo covers at minimum: task CRUD, task field edits (dates, duration, % complete, name, cost), dependency link/unlink, resource assignment/unassignment, calendar exceptions, baseline set/clear, indentation changes.
3. **Keyboard shortcuts:** Ctrl+Z (undo) and Ctrl+Y / Ctrl+Shift+Z (redo) work from all views.
4. **Toolbar integration:** Undo/Redo buttons appear in the toolbar, disabled when no history is available in that direction.
5. **Multi-step undo:** User can undo 10+ consecutive actions. Stack depth is at least 50.
6. **Stack reset on file open:** Opening a new or different plan clears the undo history.
7. **No regressions:** Existing tests pass; new tests cover undo/redo of core mutations.

## Technical notes

- `workspace.ts` (~570 lines) already holds all workspace state and action functions. The undo stack lives alongside the current state using state snapshots (memento pattern).
- Use `structuredClone` for deep-cloning `Project` objects.
- Ring buffer capped at 50 snapshots to avoid memory bloat.
- Only domain mutations that change `project` are captured; view/selection/UI-only actions (setView, selectTask, openTaskInfo, etc.) do not push snapshots.
- `setProject`, `newProject`, and `loadDemo` clear both undo and redo stacks (stack reset on file open).
- Keyboard shortcuts integrate into `matchProjectShortcut` in `projectShortcuts.ts`.
- Toolbar buttons added in `useWorkspaceActions.tsx`.
