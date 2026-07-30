import type { ProjectRepository } from '../../application/ports/ProjectRepository'
import type { Project } from '../../domain/entities/Project'
import { deserializeProject, serializeProject } from '../serialization/ProjectJsonSerializer'

const DRAFT_KEY = 'supergannt.draft.v1'

export class LocalStorageProjectRepository implements ProjectRepository {
  constructor(private readonly storage: Storage = localStorage) {}

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
}
