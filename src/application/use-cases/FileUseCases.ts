import type { Project } from '../../domain/entities/Project'
import type { AutoSnapshotMetadata } from '../ports/ProjectRepository'
import type { ProjectFileCodec } from '../ports/ProjectFileCodec'
import type { ProjectRepository } from '../ports/ProjectRepository'
import { refreshProject } from '../services/ProjectRefresh'

export type ExportFormat = 'mspdi' | 'mpx' | 'mpp' | 'csv' | 'csv-tasks' | 'csv-resources'

function exportFileName(project: Project, format: ExportFormat, preferred?: string): string {
  const base = (preferred ?? project.fileName ?? project.name)
    .replace(/\.(mpp|mpt|xml|mspdi|mpx|csv)$/i, '')
    .trim() || project.name
  if (format === 'mpx') return `${base}.mpx`
  if (format === 'mpp') return `${base}.mpp`
  if (format === 'csv' || format === 'csv-tasks' || format === 'csv-resources') return `${base}.csv`
  return `${base}.xml`
}

export class FileUseCases {
  constructor(
    private readonly codecs: readonly ProjectFileCodec[],
    private readonly repository: ProjectRepository,
  ) {}

  private codecFor(fileName: string): ProjectFileCodec {
    const codec = this.codecs.find((c) => c.canHandle(fileName))
    if (!codec) {
      throw new Error(`Unsupported file type: ${fileName}`)
    }
    return codec
  }

  async openFile(content: string | ArrayBuffer, fileName: string): Promise<Project> {
    const codec = this.codecFor(fileName)
    const parsed = await codec.parse(content, fileName)
    const refreshed = refreshProject(parsed.with({ fileName, dirty: false }))
    await this.repository.saveDraft(refreshed)
    return refreshed
  }

  /**
   * Save formats:
   * - mspdi → .xml (MS Project / ProjectLibre interchange)
   * - mpx → .mpx
   * - mpp → binary .mpp (MS Project OLE, via template writer)
   * - csv-tasks → .csv (tasks export)
   * - csv-resources → .csv (resources export)
   * - csv → .csv (auto-detect: first codec found)
   */
  async saveFile(
    project: Project,
    preferredName?: string,
    format: ExportFormat = 'mspdi',
  ): Promise<{ project: Project; blob: Blob; fileName: string }> {
    const targetName = exportFileName(project, format, preferredName)
    const writer = this.codecForExport(targetName, format)
    const { content, mimeType } = await writer.serialize(project)
    const saved = project.with({ fileName: targetName }).markClean()
    await this.repository.saveDraft(saved)
    const blobParts: BlobPart[] =
      typeof content === 'string' ? [content] : [content.buffer.slice(content.byteOffset, content.byteOffset + content.byteLength) as ArrayBuffer]
    return {
      project: saved,
      blob: new Blob(blobParts, { type: mimeType }),
      fileName: targetName,
    }
  }

  private codecForExport(fileName: string, format: ExportFormat): ProjectFileCodec {
    const candidates = this.codecs.filter((c) => c.canHandle(fileName))
    if (candidates.length === 0) {
      throw new Error(`Unsupported file type: ${fileName}`)
    }
    // When multiple codecs claim the same extension, disambiguate by format.
    if (candidates.length > 1) {
      const match = candidates.find((c) => c.handlesExportFormat?.(format))
      if (match) return match
    }
    return candidates[0]!
  }

  async persistDraft(project: Project): Promise<void> {
    await this.repository.saveDraft(project)
  }

  async loadDraft(): Promise<Project | null> {
    const draft = await this.repository.loadDraft()
    return draft ? refreshProject(draft) : null
  }

  // --- Auto-save (crash recovery) ----------------------------------------

  async saveAutoSnapshot(project: Project, metadata: AutoSnapshotMetadata): Promise<boolean> {
    // The repository never throws — it cleans up metadata on any error and
    // logs non-quota failures.  We verify both keys were persisted to guard
    // against metadata-first partial writes (quota hit on payload).
    await this.repository.saveAutoSnapshot(project, metadata)
    const stored = await this.repository.getAutoSnapshotMetadata()
    if (stored == null || stored.savedAt !== metadata.savedAt) return false
    const snap = await this.repository.loadAutoSnapshot()
    return snap != null
  }

  async getAutoSnapshotMetadata(): Promise<AutoSnapshotMetadata | null> {
    return this.repository.getAutoSnapshotMetadata()
  }

  async loadAutoSnapshot(): Promise<Project | null> {
    const snap = await this.repository.loadAutoSnapshot()
    return snap ? refreshProject(snap) : null
  }

  async clearAutoSnapshot(): Promise<void> {
    await this.repository.clearAutoSnapshot()
  }
}
