import { useWorkspaceState, useWorkspaceDispatch } from '../state/WorkspaceContext'
import styles from './RecoveryBanner.module.css'

/**
 * Non-blocking recovery banner shown at app open when an auto-saved state
 * exists that is newer than the last explicit save.
 */
export function RecoveryBanner() {
  const { autoSave, services } = useWorkspaceState()
  const dispatch = useWorkspaceDispatch()

  const snap = autoSave.recoverySnapshot
  if (!snap) return null

  const handleRestore = async () => {
    dispatch({ type: 'setBusy', message: 'Restoring auto-saved work…' })
    try {
      const restored = await services.files.loadAutoSnapshot()
      if (restored) {
        dispatch({ type: 'setProject', project: restored, message: 'Restored auto-saved work.' })
      } else {
        dispatch({ type: 'setStatus', message: 'Auto-save snapshot no longer available.' })
      }
    } catch {
      dispatch({ type: 'setStatus', message: 'Failed to restore auto-saved work.' })
    } finally {
      dispatch({ type: 'dismissRecoverySnapshot' })
      dispatch({ type: 'setBusy', message: null })
    }
  }

  const handleDiscard = async () => {
    try {
      await services.files.clearAutoSnapshot()
    } catch (err) {
      // If storage is inaccessible the snapshot stays on disk, but the
      // banner is gone — the user already made their choice.
      console.warn('Failed to clear auto-snapshot on discard:', (err as DOMException)?.name ?? err)
    }
    dispatch({ type: 'dismissRecoverySnapshot' })
  }

  const timestamp = new Date(snap.savedAt).toLocaleString()

  return (
    <div className={styles.banner} role="alert" aria-live="polite">
      <span className={styles.text}>
        Unsaved changes from {timestamp} were recovered. Restore them?
      </span>
      <div className={styles.actions}>
        <button type="button" className={styles.restoreBtn} onClick={handleRestore}>
          Restore
        </button>
        <button type="button" className={styles.discardBtn} onClick={handleDiscard}>
          Discard
        </button>
      </div>
    </div>
  )
}
