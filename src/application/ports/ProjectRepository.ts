import type { Project } from '../../domain/entities/Project'

export interface ProjectRepository {
  saveDraft(project: Project): Promise<void>
  loadDraft(): Promise<Project | null>
  clearDraft(): Promise<void>
}
