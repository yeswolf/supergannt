import { useEffect, useRef, useCallback } from 'react'
import { useWorkspaceState, useWorkspaceDispatch } from '../state/WorkspaceContext'

const DEBOUNCE_MS = 2000
const MAX_INTERVAL_MS = 30000

/**
 * Auto-save hook.
 *
 * - Polls every ~500 ms while dirty.  Saves after 2 s of idle or 30 s since
 *   the last save if mutations are continuous.
 * - Skips saving if localStorage is near quota (sets quotaWarning).
 * - Clears the auto-snapshot when dirty goes false (explicit save / new file).
 */
export function useAutoSave() {
  const { project, autoSave, services } = useWorkspaceState()
  const dispatch = useWorkspaceDispatch()

  const lastMutationRef = useRef<number>(0)
  // Initialized to 0 (epoch) so Date.now() - 0 instantly exceeds
  // MAX_INTERVAL_MS on the first poll tick — this gives a fast first
  // auto-save instead of waiting a full debounce cycle.
  const lastSaveRef = useRef<number>(0)
  const savingRef = useRef(false)
  // Keep a stable ref to the latest project so the interval closure stays fresh.
  const projectRef = useRef(project)
  projectRef.current = project

  // Update the mutation timestamp on every project change while dirty.
  // Tracking `project` (serialised) instead of just `autoSave.dirty` so the
  // effect fires on every edit — `dirty` only changes on the false→true
  // transition, so we'd otherwise hold a stale timestamp from the first
  // keystroke.
  useEffect(() => {
    if (autoSave.dirty) {
      lastMutationRef.current = Date.now()
    }
  }, [autoSave.dirty, project])

  // Reset the status indicator to idle when the user starts editing again
  // so the toolbar doesn't show "Auto-saved" while the dirty dot is lit.
  useEffect(() => {
    if (autoSave.dirty) {
      dispatch({ type: 'autoSaveIdle' })
    }
  }, [autoSave.dirty, dispatch])

  const doSave = useCallback(async () => {
    if (savingRef.current) return
    savingRef.current = true
    dispatch({ type: 'autoSaveSaving' })
    try {
      const now = new Date().toISOString()
      const saved = await services.files.saveAutoSnapshot(projectRef.current, {
        savedAt: now,
        fileName: projectRef.current.fileName,
      })
      lastSaveRef.current = Date.now()
      dispatch({ type: 'autoSaveSaved', quotaWarning: !saved })
    } finally {
      savingRef.current = false
    }
  }, [services, dispatch])

  // Run a polling interval while dirty.
  useEffect(() => {
    if (!autoSave.dirty) return

    const interval = setInterval(() => {
      if (savingRef.current) return
      const sinceMutation = Date.now() - lastMutationRef.current
      const sinceSave = Date.now() - lastSaveRef.current

      if (sinceMutation >= DEBOUNCE_MS) {
        void doSave()
      } else if (sinceSave >= MAX_INTERVAL_MS) {
        void doSave()
      }
    }, 500)

    return () => clearInterval(interval)
  }, [autoSave.dirty, doSave])

  // When dirty resets (explicit save / new file), clear auto-snapshot.
  // Skip the first mount — dirty starts false and we must not nuke a
  // crash-recovery snapshot before AppShell checks for it.
  const hasBeenDirtyRef = useRef(false)
  useEffect(() => {
    if (autoSave.dirty) {
      hasBeenDirtyRef.current = true
    } else if (hasBeenDirtyRef.current) {
      void services.files.clearAutoSnapshot()
    }
  }, [autoSave.dirty, services.files])

  return { autoSave }
}
