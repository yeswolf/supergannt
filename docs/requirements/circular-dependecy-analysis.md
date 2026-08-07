# Circular Dependency Analysis

## Overview

Implement on-the-go inspection for circular dependencies in the project plan. When the user edits task dependencies, the system detects circular reference chains and surfaces them in a dedicated inspection pane at the bottom of the screen. The pane also reports other useful plan inspections (orphan tasks, summary-task dependencies, etc.).

## User Story

As a project planner, I want to be immediately warned when I create a circular dependency, so I can fix it before it corrupts my schedule. I also want a persistent inspection panel that shows all structural issues in my plan, including circular chains with the exact task path highlighted.

## Acceptance Criteria

1. **Cycle detection service**: A domain service that detects all cycles in the dependency graph using DFS. Each cycle is returned as an ordered list of task IDs forming the loop, plus the dependency IDs involved.
2. **Prevention during linking**: `linkTasks` and `setPredecessors*` use cases detect when a new link would close a cycle and reject it with a clear error message naming the tasks involved.
3. **General project inspector**: A service that runs multiple inspections (circular deps, orphan tasks, summary-task predecessors, self-referencing dependencies) and returns structured findings with severity levels.
4. **Inspection pane UI**: A bottom-docked panel rendered in `AppShell` that lists all inspection findings. Each finding shows a severity icon, message, and details. Circular dependency findings highlight the exact task chain.
5. **Automatic re-inspection**: Inspection runs automatically after every dependency mutation (link, unlink, set-predecessors) and re-renders the pane.
6. **Unit tests**: Tests for the cycle detector with various graph shapes (no cycles, single cycle, multiple cycles, chain, diamond). Tests for integration with `DependencyUseCases`.
7. **Test data**: MSPDI XML testdata files containing projects with circular dependencies for integration/round-trip testing.

## Technical Notes

- Cycle detection uses recursive DFS with three-color marking (white/gray/black).
- The inspection pane uses the existing CSS module pattern (`*.module.css`).
- Inspection state lives in `WorkspaceState` as `inspections: InspectionFinding[]`.
- The `linkTasks` and `setPredecessorsFromNotation` / `setPredecessorLinks` functions add a cycle check before creating dependencies.
- Additional inspections included: orphan tasks (no predecessors or successors), summary tasks with dependencies, tasks depending on summary tasks, and duplicate dependencies.
