import { useEffect, useRef, useCallback } from 'react'
import { useWorkspaceState, useWorkspaceDispatch } from '../state/WorkspaceContext'

const DEBOUNCE_MS = 2000
const MAX_INTERVAL_MS = 30000

/**
 * Auto-save hook.
 *
 * - Polls every ~500 ms while dirty.  Saves after 2 s of idle or 30 s since
 *   the last save if mutations are continuous.
 * - On the very first edit the 30 s branch fires immediately (lastSaveRef
 *   starts at 0, so Date.now() - 0 always exceeds MAX_INTERVAL_MS), giving
 *   a fast initial save instead of waiting a full debounce cycle.
 * - Skips saving if localStorage is near quota (sets quotaWarning).
 * - Clears the auto-snapshot when dirty goes false (explicit save / new file).
 */
export function useAutoSave() {
  const { project, autoSave, services } = useWorkspaceState()
  const dispatch = useWorkspaceDispatch()

  const lastMutationRef = useRef<number>(0)
  // Flag so the first edit triggers an immediate save on the next poll tick
  // instead of waiting a full debounce cycle.  This is separate from
  // lastSaveRef so the intent is explicit — it's not relying on epoch-0
  // arithmetic that looks like a bug to a future reader.
  const needsInitialSaveRef = useRef(true)
  const lastSaveRef = useRef<number>(0)
  const savingRef = useRef(false)
  // Keep a stable ref to the latest project so the interval closure stays fresh.
  const projectRef = useRef(project)
  projectRef.current = project

  // Update the mutation timestamp on every project change while dirty.
  // Tracking `autoSave.mutationCounter` (incremented by the reducer on every
  // project mutation) instead of `project` so the effect fires even if a
  // code path returns the same object reference (e.g. a no-op update).
  useEffect(() => {
    if (autoSave.dirty) {
      lastMutationRef.current = Date.now()
    }
  }, [autoSave.dirty, autoSave.mutationCounter])

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
      } else if (needsInitialSaveRef.current) {
        needsInitialSaveRef.current = false
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

}
