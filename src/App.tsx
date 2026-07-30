import { WorkspaceProvider } from './presentation/state/WorkspaceContext'
import { AppShell } from './presentation/AppShell'

export default function App() {
  return (
    <WorkspaceProvider>
      <AppShell />
    </WorkspaceProvider>
  )
}
