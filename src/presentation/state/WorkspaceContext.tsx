import {
  createContext,
  useContext,
  useMemo,
  useReducer,
  type Dispatch,
  type ReactNode,
} from 'react'
import {
  createInitialState,
  undoableReducer,
  type WorkspaceAction,
  type WorkspaceState,
} from './workspace'

const WorkspaceStateContext = createContext<WorkspaceState | null>(null)
const WorkspaceDispatchContext = createContext<Dispatch<WorkspaceAction> | null>(
  null,
)

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(undoableReducer, undefined, createInitialState)
  const memoState = useMemo(() => state, [state])
  return (
    <WorkspaceStateContext.Provider value={memoState}>
      <WorkspaceDispatchContext.Provider value={dispatch}>
        {children}
      </WorkspaceDispatchContext.Provider>
    </WorkspaceStateContext.Provider>
  )
}

export function useWorkspaceState(): WorkspaceState {
  const ctx = useContext(WorkspaceStateContext)
  if (!ctx) throw new Error('WorkspaceProvider missing')
  return ctx
}

export function useWorkspaceDispatch(): Dispatch<WorkspaceAction> {
  const ctx = useContext(WorkspaceDispatchContext)
  if (!ctx) throw new Error('WorkspaceProvider missing')
  return ctx
}
