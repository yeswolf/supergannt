import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// Mock the workspace context so we control state and capture dispatches.
const mockDispatch = vi.fn()
let mockState: { project: any; autoSave: any; services: any }

vi.mock('../state/WorkspaceContext', () => ({
  useWorkspaceState: () => mockState,
  useWorkspaceDispatch: () => mockDispatch,
}))

import { useAutoSave } from './useAutoSave'

describe('useAutoSave', () => {
  let mockClearAutoSnapshot: ReturnType<typeof vi.fn>
  let mockSaveAutoSnapshot: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.useFakeTimers()
    mockDispatch.mockClear()
    mockClearAutoSnapshot = vi.fn().mockResolvedValue(undefined)
    mockSaveAutoSnapshot = vi.fn().mockResolvedValue(true)
    mockState = {
      project: { fileName: 'test.mpp' } as any,
      autoSave: { dirty: false, status: 'idle', quotaWarning: false, recoverySnapshot: null },
      services: {
        files: {
          saveAutoSnapshot: mockSaveAutoSnapshot,
          clearAutoSnapshot: mockClearAutoSnapshot,
        },
      },
    }
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // --- initial-mount skip ------------------------------------------------

  it('does NOT clear auto-snapshot on initial mount (dirty starts false)', () => {
    renderHook(() => useAutoSave())
    expect(mockClearAutoSnapshot).not.toHaveBeenCalled()
  })

  // --- debounce save -----------------------------------------------------

  it('saves after DEBOUNCE_MS of no mutations', async () => {
    const { rerender } = renderHook(() => useAutoSave())

    // Go dirty — kicks off the interval.
    mockState.autoSave = { ...mockState.autoSave, dirty: true }
    rerender()

    // Advance just past the debounce window (first poll tick at or after 2 s).
    await act(() => vi.advanceTimersByTimeAsync(2000))

    expect(mockSaveAutoSnapshot).toHaveBeenCalled()
    expect(mockDispatch).toHaveBeenCalledWith({ type: 'autoSaveSaving' })
  })

  // --- max-interval save -------------------------------------------------

  it('forces a save after MAX_INTERVAL_MS even with continuous mutations', async () => {
    const { rerender } = renderHook(() => useAutoSave())

    mockState.autoSave = { ...mockState.autoSave, dirty: true }
    rerender()

    // Simulate continuous mutations — bump the mutation ref every 1 s so
    // the debounce path never fires.  We must also bump `project` to a new
    // reference on each tick, otherwise `rerender()` won't re-trigger the
    // `useEffect([autoSave.dirty, project])` that updates `lastMutationRef`.
    for (let i = 0; i < 31; i++) {
      await act(() => vi.advanceTimersByTimeAsync(1000))
      mockState.project = { ...mockState.project }
      rerender()
    }

    // The max-interval branch should have fired by now (30 s).
    expect(mockSaveAutoSnapshot).toHaveBeenCalled()
  })

  // --- concurrent-save guard ---------------------------------------------

  it('does not start a second save while one is in progress', async () => {
    // Make saveAutoSnapshot hang so we can inspect concurrent behavior.
    let resolveSave: (value: boolean) => void
    mockSaveAutoSnapshot.mockReturnValue(
      new Promise<boolean>((r) => { resolveSave = r }),
    )

    const { rerender } = renderHook(() => useAutoSave())
    mockState.autoSave = { ...mockState.autoSave, dirty: true }
    rerender()

    // Trigger first save.
    await act(() => vi.advanceTimersByTimeAsync(2000))
    expect(mockSaveAutoSnapshot).toHaveBeenCalledTimes(1)

    // While first save is pending, advance far enough to trigger a second.
    await act(() => vi.advanceTimersByTimeAsync(20000))

    // Still only one call — savingRef guards re-entry.
    expect(mockSaveAutoSnapshot).toHaveBeenCalledTimes(1)

    // Resolve the first save so the test can clean up.
    await act(() => resolveSave!(true))
  })

  // --- clear on explicit save --------------------------------------------

  it('clears auto-snapshot when dirty transitions true → false', async () => {
    const { rerender } = renderHook(() => useAutoSave())

    // Go dirty (e.g. user edits a task).
    mockState.autoSave = { ...mockState.autoSave, dirty: true }
    rerender()

    // Then go clean (e.g. user explicitly saves).
    mockState.autoSave = { ...mockState.autoSave, dirty: false }
    rerender()

    expect(mockClearAutoSnapshot).toHaveBeenCalledTimes(1)
  })

  // --- quota warning propagation -----------------------------------------

  it('dispatches quotaWarning when saveAutoSnapshot returns false', async () => {
    mockSaveAutoSnapshot.mockResolvedValue(false)
    const { rerender } = renderHook(() => useAutoSave())
    mockState.autoSave = { ...mockState.autoSave, dirty: true }
    rerender()

    await act(() => vi.advanceTimersByTimeAsync(2000))

    expect(mockDispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'autoSaveSaved', quotaWarning: true }),
    )
  })

  // --- idle guard --------------------------------------------------------

  it('does not poll or save when dirty is false', async () => {
    renderHook(() => useAutoSave())

    await act(() => vi.advanceTimersByTimeAsync(10000))

    expect(mockSaveAutoSnapshot).not.toHaveBeenCalled()
    expect(mockDispatch).not.toHaveBeenCalled()
  })
})
