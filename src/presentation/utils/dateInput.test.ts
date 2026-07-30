import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { toDateInputValue, fromDateInputValue } from './dateInput'
import { openPlanFile, resetOpenPlanFileForTests } from '../openPlanFile'
import type { AppServices, WorkspaceAction } from '../state/workspace'
import { createDemoProject } from '../../application/services/ProjectFactory'
import { UuidIdGenerator } from '../../infrastructure/ids/UuidIdGenerator'

describe('dateInput', () => {
  it('formats and parses local date values', () => {
    const d = new Date(2024, 2, 5, 15, 30)
    expect(toDateInputValue(d)).toBe('2024-03-05')
    const parsed = fromDateInputValue('2024-03-05')
    expect(parsed.getFullYear()).toBe(2024)
    expect(parsed.getMonth()).toBe(2)
    expect(parsed.getDate()).toBe(5)
    expect(parsed.getHours()).toBe(8)
  })
})

describe('openPlanFile', () => {
  beforeEach(() => {
    resetOpenPlanFileForTests()
    vi.restoreAllMocks()
  })

  afterEach(() => {
    resetOpenPlanFileForTests()
    vi.unstubAllGlobals()
  })

  it('opens text plans and clears busy state', async () => {
    const project = createDemoProject(new UuidIdGenerator())
    const actions: WorkspaceAction[] = []
    const dispatch = (a: WorkspaceAction) => {
      actions.push(a)
    }
    const services = {
      ids: new UuidIdGenerator(),
      files: {
        openFile: vi.fn().mockResolvedValue(project),
      },
    } as unknown as AppServices

    const file = new File(['<Project/>'], 'plan.xml', { type: 'application/xml' })
    await openPlanFile(file, services, dispatch)

    expect(services.files.openFile).toHaveBeenCalled()
    expect(actions.some((a) => a.type === 'setBusy' && a.message?.includes('Opening'))).toBe(
      true,
    )
    expect(actions.some((a) => a.type === 'setProject')).toBe(true)
    expect(actions.at(-1)).toEqual({ type: 'setBusy', message: null })
  })

  it('opens binary mpp via arrayBuffer', async () => {
    const project = createDemoProject(new UuidIdGenerator())
    const actions: WorkspaceAction[] = []
    const services = {
      ids: new UuidIdGenerator(),
      files: { openFile: vi.fn().mockResolvedValue(project) },
    } as unknown as AppServices
    const buf = new ArrayBuffer(8)
    const file = new File([buf], 'plan.mpp')
    Object.defineProperty(file, 'arrayBuffer', {
      value: async () => buf,
    })

    await openPlanFile(file, services, actions.push.bind(actions))
    expect(services.files.openFile).toHaveBeenCalledWith(buf, 'plan.mpp')
  })

  it('reports errors and ignores overlapping opens', async () => {
    const actions: WorkspaceAction[] = []
    const services = {
      ids: new UuidIdGenerator(),
      files: {
        openFile: vi.fn().mockRejectedValue(new Error('boom')),
      },
    } as unknown as AppServices
    const file = new File(['x'], 'bad.xml')

    const first = openPlanFile(file, services, (a) => actions.push(a))
    const second = openPlanFile(file, services, (a) => actions.push(a))
    await Promise.all([first, second])

    expect(services.files.openFile).toHaveBeenCalledTimes(1)
    expect(actions.some((a) => a.type === 'setStatus' && a.message === 'boom')).toBe(true)
  })

  it('handles non-Error failures', async () => {
    const actions: WorkspaceAction[] = []
    const services = {
      ids: new UuidIdGenerator(),
      files: { openFile: vi.fn().mockRejectedValue('nope') },
    } as unknown as AppServices
    await openPlanFile(new File(['x'], 'bad.xml'), services, (a) => actions.push(a))
    expect(actions.some((a) => a.type === 'setStatus' && a.message === 'Failed to open file')).toBe(
      true,
    )
  })
})
