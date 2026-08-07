import type { ProjectRepository, AutoSnapshotMetadata } from '../../application/ports/ProjectRepository'
import type { Project } from '../../domain/entities/Project'
import { deserializeProject, serializeProject } from '../serialization/ProjectJsonSerializer'

const DRAFT_KEY = 'supergannt.draft.v1'
const AUTO_SNAPSHOT_KEY = 'supergannt.autosave.v1'
const AUTO_SNAPSHOT_META_KEY = 'supergannt.autosave.meta.v1'

export class LocalStorageProjectRepository implements ProjectRepository {
  constructor(private readonly storage: Storage = localStorage) {}

  // --- Draft (explicit save) -----------------------------------------------

  async saveDraft(project: Project): Promise<void> {
    this.storage.setItem(DRAFT_KEY, serializeProject(project))
  }

  async loadDraft(): Promise<Project | null> {
    const raw = this.storage.getItem(DRAFT_KEY)
    if (!raw) return null
    return deserializeProject(raw)
  }

  async clearDraft(): Promise<void> {
    this.storage.removeItem(DRAFT_KEY)
  }

  // --- Auto-snapshot (crash recovery) -------------------------------------

  async saveAutoSnapshot(project: Project, metadata: AutoSnapshotMetadata): Promise<void> {
    const payload = serializeProject(project)
    const metaJson = JSON.stringify(metadata)
    try {
      // Write metadata first so a partial failure (quota hit on payload)
      // doesn't leave an orphaned payload blob that can never be discovered.
      this.storage.setItem(AUTO_SNAPSHOT_META_KEY, metaJson)
      this.storage.setItem(AUTO_SNAPSHOT_KEY, payload)
    } catch (err: unknown) {
      // Clean up metadata on every error.  The write order is metadata-first,
      // so if the payload write fails metadata is already on disk — without
      // cleanup it becomes a ghost recovery prompt (banner renders, Restore
      // finds no snapshot).  QuotaExceededError is expected under heavy use;
      // SecurityError / TypeError mean storage is disabled or unavailable.
      // The caller (FileUseCases) verifies both keys were persisted and
      // returns false on any mismatch, which maps to a quotaWarning in the UI.
      this.storage.removeItem(AUTO_SNAPSHOT_META_KEY)
      if (!(err instanceof DOMException && err.name === 'QuotaExceededError')) {
        console.warn('Auto-snapshot failed (non-quota error):', err)
      }
    }
  }

  async getAutoSnapshotMetadata(): Promise<AutoSnapshotMetadata | null> {
    const raw = this.storage.getItem(AUTO_SNAPSHOT_META_KEY)
    if (!raw) return null
    try {
      return JSON.parse(raw) as AutoSnapshotMetadata
    } catch {
      return null
    }
  }

  async loadAutoSnapshot(): Promise<Project | null> {
    const raw = this.storage.getItem(AUTO_SNAPSHOT_KEY)
    if (!raw) return null
    try {
      return deserializeProject(raw)
    } catch {
      return null
    }
  }

  async clearAutoSnapshot(): Promise<void> {
    this.storage.removeItem(AUTO_SNAPSHOT_KEY)
    this.storage.removeItem(AUTO_SNAPSHOT_META_KEY)
  }
}
