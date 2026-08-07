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
  const lastSaveRef = useRef<number>(0)
  const savingRef = useRef(false)
  // Keep a stable ref to the latest project so the interval closure stays fresh.
  const projectRef = useRef(project)
  projectRef.current = project

  // Update the mutation timestamp on every project change while dirty.
  useEffect(() => {
    if (autoSave.dirty) {
      lastMutationRef.current = Date.now()
    }
  })

  const doSave = useCallback(async () => {
    if (savingRef.current) return
    savingRef.current = true
    dispatch({ type: 'autoSaveSaving' })
    const now = new Date().toISOString()
    const saved = await services.files.saveAutoSnapshot(projectRef.current, {
      savedAt: now,
      fileName: projectRef.current.fileName,
    })
    lastSaveRef.current = Date.now()
    savingRef.current = false
    dispatch({ type: 'autoSaveSaved', quotaWarning: !saved })
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
