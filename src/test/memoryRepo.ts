import type { ProjectRepository, AutoSnapshotMetadata } from '../application/ports/ProjectRepository'
import type { Project } from '../domain/entities/Project'

/**
 * In-memory fake of ProjectRepository for tests.
 * Shared across test suites so interface changes only need one update.
 */
export class MemoryRepo implements ProjectRepository {
  draft: Project | null = null
  autoSnapshot: Project | null = null
  autoMeta: AutoSnapshotMetadata | null = null

  async saveDraft(project: Project) {
    this.draft = project
  }
  async loadDraft() {
    return this.draft
  }
  async clearDraft() {
    this.draft = null
  }
  async saveAutoSnapshot(project: Project, meta: AutoSnapshotMetadata) {
    this.autoSnapshot = project
    this.autoMeta = meta
  }
  async getAutoSnapshotMetadata() {
    return this.autoMeta
  }
  async loadAutoSnapshot() {
    return this.autoSnapshot
  }
  async clearAutoSnapshot() {
    this.autoSnapshot = null
    this.autoMeta = null
  }
}
