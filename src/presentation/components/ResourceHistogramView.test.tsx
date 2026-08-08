import { describe, expect, it } from 'vitest'
import { screen, render } from '@testing-library/react'
import { createEmptyProject } from '../../application/services/ProjectFactory'
import { computeResourceHistogram } from '../../application/services/ReportingService'
import * as ResourceUseCases from '../../application/use-cases/ResourceUseCases'
import * as TaskUseCases from '../../application/use-cases/TaskUseCases'
import { refreshProject } from '../../application/services/ProjectRefresh'
import { ResourceHistogramView } from './ResourceHistogramView'
import { WorkspaceProvider } from '../state/WorkspaceContext'
import { useWorkspaceDispatch } from '../state/WorkspaceContext'
import { useEffect } from 'react'
import { ThemeProvider } from '../theme/ThemeContext'

class SeqIds {
  private n = 0
  private next(prefix: string) {
    this.n += 1
    return `${prefix}${this.n}`
  }
  projectId() { return this.next('p') }
  taskId() { return this.next('t') }
  resourceId() { return this.next('r') }
  dependencyId() { return this.next('d') }
  assignmentId() { return this.next('a') }
  calendarId() { return this.next('c') }
}

/** Bootstrap a specific project into the workspace for testing. */
function SetProject({ project }: { project: ReturnType<typeof createEmptyProject> }) {
  const dispatch = useWorkspaceDispatch()
  useEffect(() => {
    dispatch({ type: 'setProject', project, message: 'test' })
  }, [dispatch, project])
  return null
}

function renderHistogram(project: ReturnType<typeof createEmptyProject>) {
  return render(
    <ThemeProvider>
      <WorkspaceProvider>
        <SetProject project={project} />
        <ResourceHistogramView />
      </WorkspaceProvider>
    </ThemeProvider>,
  )
}

describe('ResourceHistogramView', () => {
  it('renders the heading and legend', () => {
    const ids = new SeqIds()
    const project = createEmptyProject(ids)
    renderHistogram(project)

    expect(screen.getByRole('heading', { name: 'Resource Histogram' })).toBeInTheDocument()
    expect(screen.getByText('Allocated')).toBeInTheDocument()
    expect(screen.getByText('Overallocated')).toBeInTheDocument()
    expect(screen.getByText('Capacity')).toBeInTheDocument()
  })

  it('renders overallocated bars with the overallocated style', () => {
    const ids = new SeqIds()
    let project = createEmptyProject(ids)
    project = ResourceUseCases.addResource(project, ids, { name: 'Dev' })
    const devId = project.resources[0]!.id

    // Two overlapping 40h tasks assigned to the same resource → overallocated
    project = TaskUseCases.addTask(project, ids, { name: 'Task A', durationHours: 40 })
    project = TaskUseCases.addTask(project, ids, { name: 'Task B', durationHours: 40 })
    const taskA = project.tasks[0]!.id
    const taskB = project.tasks[1]!.id
    project = ResourceUseCases.assignResource(project, ids, taskA, devId, 1)
    project = ResourceUseCases.assignResource(project, ids, taskB, devId, 1)
    project = refreshProject(project)

    // Verify the data is actually overallocated before testing the view
    const histogram = computeResourceHistogram(project, 'week')
    const overallocatedBuckets = histogram.filter(
      (b) => b.resourceId === devId && b.overallocated,
    )
    expect(overallocatedBuckets.length).toBeGreaterThan(0)

    renderHistogram(project)

    // The overallocated cell's inner bar div gets the barOverallocated CSS class.
    // With vitest css: true, CSS Modules class names are preserved as-is.
    const overallocatedBar = document.querySelector('[class*="barOverallocated"]')
    expect(overallocatedBar).toBeInTheDocument()
  })
})
