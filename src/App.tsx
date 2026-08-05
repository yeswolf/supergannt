import { WorkspaceProvider } from './presentation/state/WorkspaceContext'
import { ThemeProvider } from './presentation/theme/ThemeContext'
import { AppShell } from './presentation/AppShell'

export default function App() {
  return (
    <ThemeProvider>
      <WorkspaceProvider>
        <AppShell />
      </WorkspaceProvider>
    </ThemeProvider>
  )
}
// test trigger
