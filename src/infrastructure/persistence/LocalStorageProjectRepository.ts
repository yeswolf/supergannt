import type { ProjectRepository, AutoSnapshotMetadata } from '../../application/ports/ProjectRepository'
import type { Project } from '../../domain/entities/Project'
import { deserializeProject, serializeProject } from '../serialization/ProjectJsonSerializer'

const DRAFT_KEY = 'supergannt.draft.v1'
const AUTO_SNAPSHOT_KEY = 'supergannt.autosave.v1'
const AUTO_SNAPSHOT_META_KEY = 'supergannt.autosave.meta.v1'

/** Estimated localStorage quota (5 MB). */
const ESTIMATED_QUOTA = 5 * 1024 * 1024

/** Return a rough byte-size estimate for a UTF-16 string stored in localStorage. */
function byteSize(s: string): number {
  return s.length * 2
}

/** Return true if adding `extra` bytes would exceed 90 % of estimated quota. */
function isNearQuota(storage: Storage, extra: number): boolean {
  let used = 0
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i)
    if (key) used += byteSize(storage.getItem(key) ?? '')
  }
  return used + extra > ESTIMATED_QUOTA * 0.9
}

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
    // Skip if near quota — don't crash the app.
    if (isNearQuota(this.storage, byteSize(payload) + byteSize(JSON.stringify(metadata)))) {
      return
    }
    this.storage.setItem(AUTO_SNAPSHOT_KEY, payload)
    this.storage.setItem(AUTO_SNAPSHOT_META_KEY, JSON.stringify(metadata))
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
