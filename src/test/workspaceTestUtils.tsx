import { type ReactElement, type ReactNode, useEffect } from 'react'
import { render, type RenderOptions } from '@testing-library/react'
import {
  WorkspaceProvider,
  useWorkspaceDispatch,
} from '../presentation/state/WorkspaceContext'
import type { WorkspaceAction } from '../presentation/state/workspace'
import { ThemeProvider } from '../presentation/theme/ThemeContext'

function Bootstrap({
  actions,
  children,
}: {
  actions?: WorkspaceAction[]
  children: ReactNode
}) {
  const dispatch = useWorkspaceDispatch()
  useEffect(() => {
    for (const action of actions ?? []) dispatch(action)
  }, [actions, dispatch])
  return <>{children}</>
}

export function renderWithWorkspace(
  ui: ReactElement,
  options?: {
    bootstrap?: WorkspaceAction[]
  } & Omit<RenderOptions, 'wrapper'>,
) {
  const { bootstrap, ...rest } = options ?? {}
  return render(ui, {
    wrapper: ({ children }) => (
      <ThemeProvider>
        <WorkspaceProvider>
          <Bootstrap actions={bootstrap}>{children}</Bootstrap>
        </WorkspaceProvider>
      </ThemeProvider>
    ),
    ...rest,
  })
}
