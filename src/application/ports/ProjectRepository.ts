import type { Project } from '../../domain/entities/Project'

export interface AutoSnapshotMetadata {
  /** ISO timestamp of when the snapshot was saved. */
  savedAt: string
  /** File name / source the snapshot belongs to. */
  fileName: string | null
}

export interface ProjectRepository {
  saveDraft(project: Project): Promise<void>
  loadDraft(): Promise<Project | null>
  clearDraft(): Promise<void>

  /** Save an auto-recovery snapshot keyed per file. */
  saveAutoSnapshot(project: Project, metadata: AutoSnapshotMetadata): Promise<void>
  /** Read metadata about the current auto-snapshot, or null if none exists. */
  getAutoSnapshotMetadata(): Promise<AutoSnapshotMetadata | null>
  /** Load the auto-snapshot project, or null if none exists or deserialization fails. */
  loadAutoSnapshot(): Promise<Project | null>
  /** Remove the auto-snapshot from storage. */
  clearAutoSnapshot(): Promise<void>
}
